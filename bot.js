import { Telegraf, Markup } from "telegraf";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, updateDoc, serverTimestamp } from "firebase/firestore";
import http from "http";

// Render Free Tier Ping Server
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Bot Engine Active");
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Listening on ${PORT}`));

const firebaseConfig = {
  apiKey: "AIzaSyBjxk1DR009Is4w20gjqdNOXRNE1GKotdQ",
  authDomain: "nexly-5ecf5.firebaseapp.com",
  projectId: "nexly-5ecf5",
  storageBucket: "nexly-5ecf5.firebasestorage.app",
  messagingSenderId: "549446516653",
  appId: "1:549446516653:web:263db598b6b125d9d6ab24"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function startBot() {
  const settingsSnap = await getDoc(doc(db, "settings", "general"));
  let botToken = process.env.BOT_TOKEN;

  if (settingsSnap.exists() && settingsSnap.data().botToken) {
    botToken = settingsSnap.data().botToken;
  }

  if (!botToken) {
    console.log("No token configured. Retrying in 10s...");
    return setTimeout(startBot, 10000);
  }

  const bot = new Telegraf(botToken);

  async function getDynamicKeyboard(menuType = "main") {
    try {
      const layoutSnap = await getDoc(doc(db, "settings", "bot_layout"));
      if (layoutSnap.exists() && layoutSnap.data().buttons && layoutSnap.data().buttons[menuType]) {
        const btns = layoutSnap.data().buttons[menuType];
        const rows = {};
        btns.forEach(b => {
          if (b.active) {
            if (!rows[b.row]) rows[b.row] = [];
            rows[b.row].push(Markup.button.callback(b.label, b.action || `act_${b.id}`));
          }
        });
        return Object.values(rows);
      }
    } catch(e) {
      console.error("Keyboard Error:", e);
    }
    return [
      [Markup.button.callback("🛍 Products", "show_products")],
      [Markup.button.callback("👤 Profile", "show_profile"), Markup.button.callback("💳 Wallet", "show_wallet")]
    ];
  }

  // /start কমান্ড — কাস্টমার রেজিস্ট্রেশন ফিক্সড
  bot.command("start", async (ctx) => {
    try {
      const user = ctx.from;
      const userRef = doc(db, "customers", String(user.id));
      const userSnap = await getDoc(userRef);

      const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ") || "Telegram User";

      if (!userSnap.exists()) {
        await setDoc(userRef, {
          telegramId: String(user.id),
          name: fullName,
          username: user.username || "N/A",
          balance: 0.00,
          totalSpend: 0.00,
          purchases: 0,
          status: "active",
          joinedAt: serverTimestamp()
        });
        console.log(`New user registered: ${user.id}`);
      }
    } catch(err) {
      console.error("Customer Save Error:", err);
    }

    const sDoc = await getDoc(doc(db, "settings", "general"));
    const settings = sDoc.exists() ? sDoc.data() : {};
    
    if (settings.maintenance) {
      return ctx.reply(settings.maintMsg || "Maintenance Mode Active.");
    }

    const welcomeMsg = settings.startMsg || "Welcome to the Store.";
    const keyboard = await getDynamicKeyboard("main");
    await ctx.reply(welcomeMsg, Markup.inlineKeyboard(keyboard));
  });

  bot.action("show_products", async (ctx) => {
    try {
      const snap = await getDocs(collection(db, "products"));
      if (snap.empty) return ctx.reply("Out of Stock.");

      const buttons = [];
      snap.forEach(d => {
        const p = d.data();
        buttons.push([Markup.button.callback(`${p.name} —${p.price} USDT`, `buy_${d.id}`)]);
      });
      buttons.push([Markup.button.callback("‹ Back", "back_to_main")]);
      await ctx.editMessageText("Select a Product:", Markup.inlineKeyboard(buttons));
    } catch(e) {
      ctx.reply("Error loading catalog.");
    }
  });

  bot.action("back_to_main", async (ctx) => {
    const sDoc = await getDoc(doc(db, "settings", "general"));
    const settings = sDoc.exists() ? sDoc.data() : {};
    const keyboard = await getDynamicKeyboard("main");
    await ctx.editMessageText(settings.startMsg || "Main Menu:", Markup.inlineKeyboard(keyboard));
  });

  bot.action(/buy_(.+)/, async (ctx) => {
    const prodId = ctx.match[1];
    const stocksSnap = await getDocs(collection(db, "stocks"));
    let targetStockDoc = null;

    stocksSnap.forEach(sDoc => {
      const s = sDoc.data();
      if (s.productId === prodId && !s.isSold && !targetStockDoc) {
        targetStockDoc = sDoc;
      }
    });

    if (!targetStockDoc) {
      return ctx.reply("Sold Out!");
    }

    await updateDoc(doc(db, "stocks", targetStockDoc.id), {
      isSold: true,
      soldTo: ctx.from.id,
      soldAt: new Date()
    });

    try {
      const userRef = doc(db, "customers", String(ctx.from.id));
      const uSnap = await getDoc(userRef);
      if (uSnap.exists()) {
        const curPurchases = uSnap.data().purchases || 0;
        await updateDoc(userRef, { purchases: curPurchases + 1 });
      }
    } catch(e) {}

    const stockData = targetStockDoc.data();
    await ctx.reply(
      `Purchase Completed!\n\nProduct: ${stockData.productName || "Item"}\nAccess Key:\n\`${stockData.content}\``, 
      { parse_mode: "Markdown" }
    );
  });

  bot.action("show_wallet", (ctx) => ctx.reply("Wallet Balance: 0.00 USDT"));
  bot.action("show_profile", (ctx) => ctx.reply(`User ID: ${ctx.from.id}\nUsername: @${ctx.from.username || "N/A"}`));
  bot.action("show_support", async (ctx) => {
    const sDoc = await getDoc(doc(db, "settings", "general"));
    const settings = sDoc.exists() ? sDoc.data() : {};
    ctx.reply(settings.helpMsg || `Contact: ${settings.supportUsername || "@admin"}`);
  });
  bot.action("show_policy", (ctx) => ctx.reply("Store Policy: Instant delivery. All sales final."));
  bot.action("show_ref", (ctx) => ctx.reply(`Referral Link:\nhttps://t.me/${ctx.botInfo.username}?start=${ctx.from.id}`));

  bot.launch();
  console.log("Bot Engine Successfully Started!");
}

startBot();
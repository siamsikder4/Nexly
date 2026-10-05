import { Telegraf, Markup } from "telegraf";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, collection, getDocs, updateDoc } from "firebase/firestore";
import http from "http";

// Free Tier Web Service Ping Server
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

  // ডাইনামিক কিবোর্ড বিল্ডার (সরাসরি bot-buttons.html থেকে আনা হবে)
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
      console.error("Keyboard Layout Error:", e);
    }

    return [[Markup.button.callback("Products", "show_products")]];
  }

  // /start কমান্ড (টেক্সট ও বাটন পেজ থেকে ডাইনামিক আসবে)
  bot.command("start", async (ctx) => {
    const sDoc = await getDoc(doc(db, "settings", "general"));
    const settings = sDoc.exists() ? sDoc.data() : {};
    
    // মেইন্টেন্যান্স মোড চেক
    if (settings.maintenance) {
      const maintMsg = settings.maintMsg || "Maintenance Mode Active.";
      return ctx.reply(maintMsg);
    }

    const welcomeMsg = settings.startMsg || "Welcome to the Store.";
    const keyboard = await getDynamicKeyboard("main");

    await ctx.reply(welcomeMsg, Markup.inlineKeyboard(keyboard));
  });

  // প্রোডাক্ট ক্যাটালগ
  bot.action("show_products", async (ctx) => {
    try {
      const snap = await getDocs(collection(db, "products"));
      if (snap.empty) {
        return ctx.reply("Out of Stock.");
      }

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

  // ব্যাক টু মেইন মেনু
  bot.action("back_to_main", async (ctx) => {
    const sDoc = await getDoc(doc(db, "settings", "general"));
    const settings = sDoc.exists() ? sDoc.data() : {};
    const welcomeMsg = settings.startMsg || "Main Menu:";
    const keyboard = await getDynamicKeyboard("main");

    await ctx.editMessageText(welcomeMsg, Markup.inlineKeyboard(keyboard));
  });

  // অটোমেটিক স্টক ডেলিভারি
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

    const stockData = targetStockDoc.data();
    await ctx.reply(
      `Purchase Completed!\n\nProduct: ${stockData.productName || "Item"}\nAccess Key:\n\`${stockData.content}\``, 
      { parse_mode: "Markdown" }
    );
  });

  // ওয়ালেট ভিউ
  bot.action("show_wallet", async (ctx) => {
    const walletKeyboard = await getDynamicKeyboard("wallet");
    await ctx.reply("Wallet Balance: 0.00 USDT", Markup.inlineKeyboard(walletKeyboard));
  });

  // প্রোফাইল ভিউ
  bot.action("show_profile", (ctx) => {
    ctx.reply(`User ID: ${ctx.from.id}\nUsername: @${ctx.from.username || "N/A"}`);
  });

  // হেল্প ও পলিসি ভিউ (সরাসরি settings.html থেকে টেক্সট আনবে)
  bot.action("show_support", async (ctx) => {
    const sDoc = await getDoc(doc(db, "settings", "general"));
    const settings = sDoc.exists() ? sDoc.data() : {};
    const supportText = settings.helpMsg || `Contact: ${settings.supportUsername || "@admin"}`;
    ctx.reply(supportText);
  });

  bot.action("show_policy", (ctx) => {
    ctx.reply("Store Policy: Instant delivery upon payment confirmation. All sales are final.");
  });

  bot.action("show_ref", (ctx) => {
    ctx.reply(`Referral Link:\nhttps://t.me/${ctx.botInfo.username}?start=${ctx.from.id}`);
  });

  // জেনেরিক অ্যাকশন ফলব্যাক
  bot.action(/act_(.+)/, (ctx) => {
    ctx.answerCbQuery();
    ctx.reply("Processing request...");
  });

  bot.launch();
  console.log("Dynamic bot started without hardcoded text!");
}

startBot();
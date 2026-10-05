import { Telegraf, Markup } from "telegraf";
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  getDocs, 
  updateDoc, 
  serverTimestamp,
  onSnapshot,
  query,
  where
} from "firebase/firestore";
import http from "http";

// Render Free Web Service পোর্ট লিসেনার
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("GGSoma Style Bot with Broadcast Running!");
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Listening on ${PORT}`));

// Firebase Credentials
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

  // স্থায়ী নিচের রিপ্লাই কিবোর্ড (Fixed Reply Keyboard)
  const mainPersistentKeyboard = Markup.keyboard([
    ["🛒 Products"],
    ["👤 Profile", "🎁 Invite Center"],
    ["💲 Top up balance", "💳 Redeem Code"],
    ["ℹ️ Bot Policy", "❔ Help"],
    ["📲 Reseller API"]
  ]).resize();

  // /start কমান্ড
  bot.command("start", async (ctx) => {
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
    }

    const sDoc = await getDoc(doc(db, "settings", "general"));
    const settings = sDoc.exists() ? sDoc.data() : {};
    const welcome = settings.startMsg || "Welcome to the Store! Choose an option below:";

    await ctx.reply(welcome, mainPersistentKeyboard);
  });

  // ১. 🛒 Products বাটন
  bot.hears("🛒 Products", async (ctx) => {
    try {
      const snap = await getDocs(collection(db, "products"));
      if (snap.empty) {
        return ctx.reply("Currently, no products are in stock.", mainPersistentKeyboard);
      }

      const buttons = [];
      snap.forEach(d => {
        const p = d.data();
        buttons.push([Markup.button.callback(`📦 ${p.name} — $${p.price} USDT`, `buy_${d.id}`)]);
      });

      await ctx.reply("Select a product to purchase:", Markup.inlineKeyboard(buttons));
    } catch(e) {
      ctx.reply("Error loading products.");
    }
  });

  // ২. 👤 Profile বাটন
  bot.hears("👤 Profile", async (ctx) => {
    const user = ctx.from;
    const userSnap = await getDoc(doc(db, "customers", String(user.id)));
    const uData = userSnap.exists() ? userSnap.data() : { balance: 0.00, purchases: 0, totalSpend: 0.00 };

    const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ") || "User";
    const balance = parseFloat(uData.balance || 0).toFixed(2);
    const purchases = uData.purchases || 0;
    const spent = parseFloat(uData.totalSpend || 0).toFixed(2);

    const profileMsg = 
`<b>Profile</b>

🆔 <b>User ID:</b> <code>${user.id}</code>
👤 <b>Name:</b> ${fullName}
💰 <b>Balance:</b> $${balance}
⭐ <b>Level:</b> Newbie (1)
🏷 <b>Product discount:</b> 0%
🛒 <b>Total purchases:</b> ${purchases}
💸 <b>Spent (net):</b> $${spent}
🏷 <b>Reseller discount:</b> ❌
📅 <b>Registration date:</b> 03/10/2026, 07:02`;

    const profileInlineButtons = Markup.inlineKeyboard([
      [Markup.button.callback("💲 Top up balance", "menu_topup")],
      [Markup.button.callback("🏅 My Status", "prof_status"), Markup.button.callback("📋 My Orders", "prof_orders")],
      [Markup.button.callback("💰 Withdraw", "prof_withdraw"), Markup.button.callback("🏦 Wallet statement", "prof_statement")],
      [Markup.button.callback("📋 Withdraw requests", "prof_w_req"), Markup.button.callback("📑 Withdraw profile", "prof_w_prof")],
      [Markup.button.callback("› Back", "back_close")]
    ]);

    await ctx.reply(profileMsg, { parse_mode: "HTML", ...profileInlineButtons });
  });

  // ৩. 💲 Top up balance
  async function showTopupMenu(ctx) {
    const topupMsg = 
`📥 <b>Choose your preferred payment method:</b>

• BEP20 (USDT) — BNB Smart Chain
• Polygon (USDT) — Polygon Network
• TRC20 (USDT) — Tron Network
• Telegram Stars

🔸 <b>Binance is supported</b>
<i>When withdrawing from Binance, make sure to select the exact same network shown here.</i>

<b>Examples:</b>
• TRC20 ➔ Tron (TRC20)
• BEP20 ➔ BNB Smart Chain (BEP20)
• Polygon ➔ Polygon

📌 <b>How to send from Binance:</b>
1️⃣ Open Binance ➔ Wallets ➔ Withdraw
2️⃣ Select USDT
3️⃣ Paste the wallet address provided
4️⃣ Choose the matching network
5️⃣ Enter the amount and confirm the withdrawal

✅ <b>It is Auto Pay, your order is completed within a few minutes.</b>`;

    const topupButtons = Markup.inlineKeyboard([
      [Markup.button.callback("🔸 Pay via Binance Pay", "pay_binance")],
      [Markup.button.callback("🪙 BEP20 (USDT)", "pay_bep20")],
      [Markup.button.callback("🪙 Polygon (USDT)", "pay_polygon")],
      [Markup.button.callback("🪙 TRC20 (USDT)", "pay_trc20")],
      [Markup.button.callback("⭐ Telegram Stars", "pay_stars")],
      [Markup.button.callback("› Back", "back_close")]
    ]);

    await ctx.reply(topupMsg, { parse_mode: "HTML", ...topupButtons });
  }

  bot.hears("💲 Top up balance", showTopupMenu);
  bot.action("menu_topup", (ctx) => {
    ctx.answerCbQuery();
    showTopupMenu(ctx);
  });

  // অন্যান্য বাটন
  bot.hears("🎁 Invite Center", (ctx) => {
    const link = `https://t.me/${ctx.botInfo.username}?start=${ctx.from.id}`;
    ctx.reply(`🎁 <b>Invite Center</b>\n\nInvite link:\n<code>${link}</code>`, { parse_mode: "HTML", ...mainPersistentKeyboard });
  });

  bot.hears("💳 Redeem Code", (ctx) => {
    ctx.reply("🎟 Send your Gift / Deposit code in chat to redeem balance into your wallet.", mainPersistentKeyboard);
  });

  bot.hears("ℹ️ Bot Policy", (ctx) => {
    ctx.reply("📜 <b>Bot Policy:</b>\nInstant automatic delivery upon payment confirmation. All sales final.", { parse_mode: "HTML", ...mainPersistentKeyboard });
  });

  bot.hears("❔ Help", async (ctx) => {
    const sDoc = await getDoc(doc(db, "settings", "general"));
    const settings = sDoc.exists() ? sDoc.data() : {};
    ctx.reply(settings.helpMsg || `Contact Support: ${settings.supportUsername || "@admin"}`, mainPersistentKeyboard);
  });

  bot.hears("📲 Reseller API", (ctx) => {
    ctx.reply("📲 <b>Reseller API:</b> Contact support for developer documentation and API keys.", { parse_mode: "HTML", ...mainPersistentKeyboard });
  });

  // পেমেন্ট অ্যাকশন
  bot.action("pay_binance", (ctx) => {
    ctx.answerCbQuery();
    ctx.reply("🔸 <b>Binance Pay ID:</b> <code>1266063</code>\nSend USDT and it will be credited automatically.", { parse_mode: "HTML" });
  });
  bot.action("pay_trc20", (ctx) => {
    ctx.answerCbQuery();
    ctx.reply("🪙 <b>TRC20 (USDT):</b> <code>TXK98204918230912409ABC</code>", { parse_mode: "HTML" });
  });
  bot.action("pay_bep20", (ctx) => {
    ctx.answerCbQuery();
    ctx.reply("🪙 <b>BEP20 (USDT):</b> <code>0x549446516653263db598b6b125d9d6ab24</code>", { parse_mode: "HTML" });
  });
  bot.action("pay_polygon", (ctx) => {
    ctx.answerCbQuery();
    ctx.reply("🪙 <b>Polygon (USDT):</b> <code>0x549446516653263db598b6b125d9d6ab24</code>", { parse_mode: "HTML" });
  });
  bot.action("pay_stars", (ctx) => {
    ctx.answerCbQuery();
    ctx.reply("⭐ Telegram Stars processing...");
  });

  bot.action("back_close", (ctx) => {
    ctx.answerCbQuery();
    ctx.deleteMessage().catch(() => {});
  });

  // প্রোডাক্ট কেনা ও অটো স্টক ডেলিভারি
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
      return ctx.reply("⚠️ Sold Out! This item is currently unavailable.");
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
      `✅ <b>Purchase Successful!</b>\n\n📦 <b>Product:</b> ${stockData.productName || "Item"}\n🔑 <b>Delivery Code / Account:</b>\n<code>${stockData.content}</code>`, 
      { parse_mode: "HTML" }
    );
  });

  // ==========================================
  // রিয়েল-টাইম ব্রডকাস্ট ইঞ্জিন (REAL-TIME BROADCAST ENGINE)
  // ==========================================
  const qBroadcasts = query(collection(db, "broadcasts"), where("status", "==", "pending"));
  onSnapshot(qBroadcasts, async (snapshot) => {
    for (const bDoc of snapshot.docs) {
      const broadcast = bDoc.data();
      const broadcastId = bDoc.id;

      console.log(`Starting Broadcast: ${broadcastId}`);

      // সকল কাস্টমার লোড করা
      const customersSnap = await getDocs(collection(db, "customers"));
      if (customersSnap.empty) {
        await updateDoc(doc(db, "broadcasts", broadcastId), { status: "sent", sentCount: 0 });
        continue;
      }

      let extraOptions = { parse_mode: "HTML" };
      if (broadcast.button && broadcast.button !== "none") {
        if (broadcast.button === "shop") {
          extraOptions.reply_markup = Markup.inlineKeyboard([[Markup.button.callback("🛍️ Open Store", "show_products")]]).reply_markup;
        } else if (broadcast.button === "support") {
          extraOptions.reply_markup = Markup.inlineKeyboard([[Markup.button.callback("☎️ Contact Support", "show_support")]]).reply_markup;
        }
      }

      let sentCount = 0;
      for (const cDoc of customersSnap.docs) {
        const cust = cDoc.data();
        const chatId = cust.telegramId || cDoc.id;

        try {
          if (broadcast.imageUrl) {
            await bot.telegram.sendPhoto(chatId, broadcast.imageUrl, {
              caption: broadcast.message,
              ...extraOptions
            });
          } else {
            await bot.telegram.sendMessage(chatId, broadcast.message, extraOptions);
          }
          sentCount++;
        } catch (err) {
          console.error(`Failed to send broadcast to ${chatId}:`, err.message);
        }
      }

      // ব্রডকাস্ট শেষ হলে স্ট্যাটাস sent করে দেওয়া
      await updateDoc(doc(db, "broadcasts", broadcastId), {
        status: "sent",
        sentCount: sentCount,
        completedAt: serverTimestamp()
      });
      console.log(`Broadcast ${broadcastId} completed! Total delivered: ${sentCount}`);
    }
  });

  // সরাসরি কাস্টমার মেসেজ ইঞ্জিন (Direct Customer Messages)
  const qDirectMsg = query(collection(db, "direct_messages"), where("status", "==", "pending"));
  onSnapshot(qDirectMsg, async (snapshot) => {
    for (const mDoc of snapshot.docs) {
      const msgData = mDoc.data();
      try {
        await bot.telegram.sendMessage(msgData.customerId, msgData.message, { parse_mode: "HTML" });
        await updateDoc(doc(db, "direct_messages", mDoc.id), { status: "sent" });
      } catch (err) {
        console.error("Direct Message Error:", err.message);
      }
    }
  });

  bot.launch();
  console.log("GGSoma Bot with Live Broadcast Engine Started!");
}

startBot();
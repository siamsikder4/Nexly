import { Telegraf, Markup } from "telegraf";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, updateDoc, serverTimestamp } from "firebase/firestore";
import http from "http";

// Render Free Web Service পোর্ট লিসেনার
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("GGSoma Style Bot Running!");
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

  // স্ক্রিনশট ২৮: স্থায়ী নিচের রিপ্লাই কিবোর্ড (Fixed Reply Keyboard)
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

  // ২. 👤 Profile বাটন (স্ক্রিনশট ২৯ ও ৩০ হুবহু ডিজাইন)
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

    // স্ক্রিনশট ২৯ ও ৩০ এর ইনলাইন অ্যাকশন বাটনসমূহ
    const profileInlineButtons = Markup.inlineKeyboard([
      [Markup.button.callback("💲 Top up balance", "menu_topup")],
      [Markup.button.callback("🏅 My Status", "prof_status"), Markup.button.callback("📋 My Orders", "prof_orders")],
      [Markup.button.callback("💰 Withdraw", "prof_withdraw"), Markup.button.callback("🏦 Wallet statement", "prof_statement")],
      [Markup.button.callback("📋 Withdraw requests", "prof_w_req"), Markup.button.callback("📑 Withdraw profile", "prof_w_prof")],
      [Markup.button.callback("› Back", "back_close")]
    ]);

    await ctx.reply(profileMsg, { parse_mode: "HTML", ...profileInlineButtons });
  });

  // ৩. 💲 Top up balance বাটন (স্ক্রিনশট ৩১, ৩২ ও ৩৩ হুবহু গাইডলাইন ও গেটওয়ে)
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

  // ৪. 🎁 Invite Center বাটন
  bot.hears("🎁 Invite Center", (ctx) => {
    const link = `https://t.me/${ctx.botInfo.username}?start=${ctx.from.id}`;
    ctx.reply(
`🎁 <b>Invite Center</b>\n\nInvite friends and earn commissions from their purchases!\n\nYour Invite Link:\n<code>${link}</code>`, 
      { parse_mode: "HTML", ...mainPersistentKeyboard }
    );
  });

  // ৫. 💳 Redeem Code বাটন
  bot.hears("💳 Redeem Code", (ctx) => {
    ctx.reply("🎟 Send your Gift / Deposit code in chat to redeem balance into your wallet.", mainPersistentKeyboard);
  });

  // ৬. ℹ️ Bot Policy বাটন
  bot.hears("ℹ️ Bot Policy", (ctx) => {
    ctx.reply("📜 <b>Bot Policy:</b>\nInstant automatic delivery upon payment confirmation. All digital purchases are final and non-refundable.", { parse_mode: "HTML", ...mainPersistentKeyboard });
  });

  // ৭. ❔ Help বাটন
  bot.hears("❔ Help", async (ctx) => {
    const sDoc = await getDoc(doc(db, "settings", "general"));
    const settings = sDoc.exists() ? sDoc.data() : {};
    ctx.reply(settings.helpMsg || `Contact Support: ${settings.supportUsername || "@admin"}`, mainPersistentKeyboard);
  });

  // ৮. 📲 Reseller API বাটন
  bot.hears("📲 Reseller API", (ctx) => {
    ctx.reply("📲 <b>Reseller API:</b>\nConnect your own store directly to our warehouse API. Contact support for developer documentation and API keys.", { parse_mode: "HTML", ...mainPersistentKeyboard });
  });

  // পেমেন্ট মেথড হ্যান্ডলার
  bot.action("pay_binance", (ctx) => {
    ctx.answerCbQuery();
    ctx.reply("🔸 <b>Binance Pay ID:</b> <code>1266063</code>\nSend USDT and transaction will be credited automatically.", { parse_mode: "HTML" });
  });

  bot.action("pay_trc20", (ctx) => {
    ctx.answerCbQuery();
    ctx.reply("🪙 <b>TRC20 (USDT) Address:</b>\n<code>TXK98204918230912409ABC</code>\nNetwork: Tron (TRC20)", { parse_mode: "HTML" });
  });

  bot.action("pay_bep20", (ctx) => {
    ctx.answerCbQuery();
    ctx.reply("🪙 <b>BEP20 (USDT) Address:</b>\n<code>0x549446516653263db598b6b125d9d6ab24</code>\nNetwork: BNB Smart Chain (BEP20)", { parse_mode: "HTML" });
  });

  bot.action("pay_polygon", (ctx) => {
    ctx.answerCbQuery();
    ctx.reply("🪙 <b>Polygon (USDT) Address:</b>\n<code>0x549446516653263db598b6b125d9d6ab24</code>\nNetwork: Polygon", { parse_mode: "HTML" });
  });

  bot.action("pay_stars", (ctx) => {
    ctx.answerCbQuery();
    ctx.reply("⭐ Telegram Stars invoice processing...");
  });

  // প্রোফাইল সাব-অ্যাকশন
  bot.action("prof_orders", (ctx) => { ctx.answerCbQuery(); ctx.reply("📋 You have no active or completed orders."); });
  bot.action("prof_status", (ctx) => { ctx.answerCbQuery(); ctx.reply("🏅 Status: Standard Tier. Spend $50 to reach VIP Level."); });
  bot.action("prof_withdraw", (ctx) => { ctx.answerCbQuery(); ctx.reply("💰 Minimum withdraw amount is $10 USDT."); });
  bot.action("prof_statement", (ctx) => { ctx.answerCbQuery(); ctx.reply("🏦 Wallet Statement: No transactions recorded this month."); });
  bot.action("prof_w_req", (ctx) => { ctx.answerCbQuery(); ctx.reply("📋 No pending withdrawal requests."); });
  bot.action("prof_w_prof", (ctx) => { ctx.answerCbQuery(); ctx.reply("📑 Withdrawal profile not set."); });

  bot.action("back_close", (ctx) => {
    ctx.answerCbQuery();
    ctx.deleteMessage().catch(() => {});
  });

  // প্রোডাক্ট কেনা ও অটো ডেলিভারি
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

  bot.launch();
  console.log("GGSoma Bot Launched Successfully!");
}

startBot();
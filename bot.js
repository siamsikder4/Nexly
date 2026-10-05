import { Telegraf, Markup } from "telegraf";
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  getDocs, 
  addDoc,
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
  res.end("GGSoma Style Bot with Wallet Deduction Running!");
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

  // ==========================================
  // ১. 🛒 স্টাইলিশ প্রোডাক্ট ক্যাটালগ UI
  // ==========================================
  bot.hears("🛒 Products", async (ctx) => {
    try {
      const snap = await getDocs(collection(db, "products"));
      if (snap.empty) {
        return ctx.reply("❌ <b>Currently, no products are in stock.</b>", { parse_mode: "HTML", ...mainPersistentKeyboard });
      }

      // স্টক হিসাব করা
      const stocksSnap = await getDocs(collection(db, "stocks"));
      const stockCounts = {};
      stocksSnap.forEach(sDoc => {
        const s = sDoc.data();
        if (!s.isSold) {
          stockCounts[s.productId] = (stockCounts[s.productId] || 0) + 1;
        }
      });

      const buttons = [];
      snap.forEach(d => {
        const p = d.data();
        const availableStock = stockCounts[d.id] || 0;
        const stockBadge = availableStock > 0 ? `🟢 (${availableStock} In Stock)` : "🔴 (Out of Stock)";
        
        buttons.push([
          Markup.button.callback(`📦 ${p.name} — $${parseFloat(p.price).toFixed(2)} ${stockBadge}`, `view_prod_${d.id}`)
        ]);
      });

      const catalogHeader = 
`🛍 <b>DIGITAL PRODUCTS CATALOG</b>

Select an item to view details and purchase using your wallet balance:`;

      await ctx.reply(catalogHeader, {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard(buttons)
      });
    } catch(e) {
      console.error(e);
      ctx.reply("Error loading products.");
    }
  });

  // প্রোডাক্ট ডিটেইলস প্রিভিউ উইন্ডো
  bot.action(/view_prod_(.+)/, async (ctx) => {
    ctx.answerCbQuery();
    const prodId = ctx.match[1];
    const prodDoc = await getDoc(doc(db, "products", prodId));

    if (!prodDoc.exists()) {
      return ctx.reply("Product not found.");
    }

    const p = prodDoc.data();
    const stocksSnap = await getDocs(collection(db, "stocks"));
    let availableCount = 0;
    stocksSnap.forEach(sDoc => {
      const s = sDoc.data();
      if (s.productId === prodId && !s.isSold) availableCount++;
    });

    const userSnap = await getDoc(doc(db, "customers", String(ctx.from.id)));
    const userBalance = userSnap.exists() ? parseFloat(userSnap.data().balance || 0) : 0.00;

    const detailMsg = 
`📦 <b>Product:</b> <code>${p.name}</code>
🏷 <b>Category:</b> ${p.category || "General"}
💰 <b>Price:</b> <code>$${parseFloat(p.price).toFixed(2)} USDT</code>
📊 <b>Stock Available:</b> <b>${availableCount} Units</b>

💳 <b>Your Wallet Balance:</b> <code>$${userBalance.toFixed(2)} USDT</code>

⚡ <i>Instant delivery to your chat right after confirmation.</i>`;

    const detailButtons = [
      [Markup.button.callback(`💳 Buy Now ($${parseFloat(p.price).toFixed(2)})`, `confirm_buy_${prodId}`)],
      [Markup.button.callback("‹ Back to Products", "back_to_catalog")]
    ];

    await ctx.editMessageText(detailMsg, {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard(detailButtons)
    });
  });

  // ব্যাক টু ক্যাটালগ
  bot.action("back_to_catalog", async (ctx) => {
    ctx.answerCbQuery();
    const snap = await getDocs(collection(db, "products"));
    const stocksSnap = await getDocs(collection(db, "stocks"));
    const stockCounts = {};
    stocksSnap.forEach(sDoc => {
      const s = sDoc.data();
      if (!s.isSold) stockCounts[s.productId] = (stockCounts[s.productId] || 0) + 1;
    });

    const buttons = [];
    snap.forEach(d => {
      const p = d.data();
      const availableStock = stockCounts[d.id] || 0;
      const stockBadge = availableStock > 0 ? `🟢 (${availableStock} In Stock)` : "🔴 (Out of Stock)";
      buttons.push([Markup.button.callback(`📦 ${p.name} — $${parseFloat(p.price).toFixed(2)} ${stockBadge}`, `view_prod_${d.id}`)]);
    });

    await ctx.editMessageText("🛍 <b>DIGITAL PRODUCTS CATALOG</b>\n\nSelect an item to view details:", {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard(buttons)
    });
  });

  // ==========================================
  // ২. ওয়ালেট ব্যালেন্স চেক ও টাকা কাটার লজিক
  // ==========================================
  bot.action(/confirm_buy_(.+)/, async (ctx) => {
    ctx.answerCbQuery();
    const prodId = ctx.match[1];
    const userId = String(ctx.from.id);

    // ১. প্রোডাক্ট ও ইউজারের ডাটা আনা
    const prodDoc = await getDoc(doc(db, "products", prodId));
    if (!prodDoc.exists()) {
      return ctx.reply("❌ Product does not exist.");
    }
    const product = prodDoc.data();
    const price = parseFloat(product.price);

    const userRef = doc(db, "customers", userId);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.exists() ? userSnap.data() : { balance: 0.00 };
    const currentBalance = parseFloat(userData.balance || 0);

    // ২. ব্যালেন্স চেক: টাকা না থাকলে লাল নোটিশ ও কিছুই পাবে না
    if (currentBalance < price) {
      const needed = (price - currentBalance).toFixed(2);
      const insufficientMsg = 
`🚫 <b>INSUFFICIENT BALANCE!</b>

You do not have enough funds in your wallet to purchase this item.

💰 <b>Required Price:</b> $${price.toFixed(2)} USDT
💳 <b>Your Current Balance:</b> $${currentBalance.toFixed(2)} USDT
⚠️ <b>Shortage:</b> $${needed} USDT

<i>Please top up your balance using the button below before purchasing.</i>`;

      return ctx.reply(insufficientMsg, {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("💲 Top up balance", "menu_topup")],
          [Markup.button.callback("‹ Browse Other Products", "back_to_catalog")]
        ])
      });
    }

    // ৩. স্টক চেক
    const stocksSnap = await getDocs(collection(db, "stocks"));
    let targetStockDoc = null;
    stocksSnap.forEach(sDoc => {
      const s = sDoc.data();
      if (s.productId === prodId && !s.isSold && !targetStockDoc) {
        targetStockDoc = sDoc;
      }
    });

    if (!targetStockDoc) {
      return ctx.reply("⚠️ <b>Sold Out!</b> This item is currently out of stock.", {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([[Markup.button.callback("‹ Back to Products", "back_to_catalog")]])
      });
    }

    // ৪. ব্যালেন্স থেকে টাকা কেটে নেওয়া এবং পারচেজ কাউন্ট বৃদ্ধি করা
    const newBalance = currentBalance - price;
    const newTotalSpend = parseFloat(userData.totalSpend || 0) + price;
    const newPurchases = parseInt(userData.purchases || 0) + 1;

    await updateDoc(userRef, {
      balance: newBalance,
      totalSpend: newTotalSpend,
      purchases: newPurchases
    });

    // ৫. স্টক বিক্রিত চিহ্নিত করা
    await updateDoc(doc(db, "stocks", targetStockDoc.id), {
      isSold: true,
      soldTo: ctx.from.id,
      soldAt: new Date()
    });

    // ৬. অর্ডার হিস্ট্রিতে রেকর্ড যোগ করা
    await addDoc(collection(db, "orders"), {
      telegramId: userId,
      username: ctx.from.username || "N/A",
      productId: prodId,
      productName: product.name,
      price: price,
      status: "completed",
      trxId: `WALLET-DEDUCT-${Date.now().toString().slice(-6)}`,
      createdAt: serverTimestamp()
    });

    const stockData = targetStockDoc.data();

    // ৭. ডিজিটাল কোড ও ডেলিভারি মেসেজ পাঠানো
    const successReceipt = 
`✅ <b>PURCHASE SUCCESSFUL!</b>

📦 <b>Item:</b> <code>${product.name}</code>
💸 <b>Deducted:</b> <code>-$${price.toFixed(2)} USDT</code>
💰 <b>Remaining Balance:</b> <code>$${newBalance.toFixed(2)} USDT</code>

🔑 <b>YOUR DIGITAL ITEM:</b>
<code>${stockData.content}</code>

<i>Thank you for shopping with us! All sales are instant.</i>`;

    await ctx.reply(successReceipt, {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("👤 View Profile", "prof_view_inline")],
        [Markup.button.callback("🛒 Buy More Products", "back_to_catalog")]
      ])
    });
  });

  // ==========================================
  // ৩. প্রোফাইল ও টপ-আপ মেনু
  // ==========================================
  async function showUserProfile(ctx) {
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
  }

  bot.hears("👤 Profile", showUserProfile);
  bot.action("prof_view_inline", (ctx) => {
    ctx.answerCbQuery();
    showUserProfile(ctx);
  });

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

  // অন্যান্য মেনু
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

  // পেমেন্ট মেথড
  bot.action("pay_binance", (ctx) => { ctx.answerCbQuery(); ctx.reply("🔸 <b>Binance Pay ID:</b> <code>1266063</code>\nSend USDT and it will be credited automatically.", { parse_mode: "HTML" }); });
  bot.action("pay_trc20", (ctx) => { ctx.answerCbQuery(); ctx.reply("🪙 <b>TRC20 (USDT):</b> <code>TXK98204918230912409ABC</code>", { parse_mode: "HTML" }); });
  bot.action("pay_bep20", (ctx) => { ctx.answerCbQuery(); ctx.reply("🪙 <b>BEP20 (USDT):</b> <code>0x549446516653263db598b6b125d9d6ab24</code>", { parse_mode: "HTML" }); });
  bot.action("pay_polygon", (ctx) => { ctx.answerCbQuery(); ctx.reply("🪙 <b>Polygon (USDT):</b> <code>0x549446516653263db598b6b125d9d6ab24</code>", { parse_mode: "HTML" }); });
  bot.action("pay_stars", (ctx) => { ctx.answerCbQuery(); ctx.reply("⭐ Telegram Stars processing..."); });

  bot.action("prof_orders", async (ctx) => {
    ctx.answerCbQuery();
    const ordersSnap = await getDocs(collection(db, "orders"));
    let userOrders = [];
    ordersSnap.forEach(oDoc => {
      const o = oDoc.data();
      if (o.telegramId === String(ctx.from.id)) userOrders.push(o);
    });

    if (userOrders.length === 0) return ctx.reply("📋 You have no active or completed orders.");
    let msg = "📋 <b>Your Orders:</b>\n\n";
    userOrders.slice(-5).forEach(o => {
      msg += `• <b>${o.productName}</b> — $${o.price} USDT (Status: ${o.status})\n`;
    });
    ctx.reply(msg, { parse_mode: "HTML" });
  });

  bot.action("prof_status", (ctx) => { ctx.answerCbQuery(); ctx.reply("🏅 Status: Standard Tier. Spend $50 to reach VIP Level."); });
  bot.action("prof_withdraw", (ctx) => { ctx.answerCbQuery(); ctx.reply("💰 Minimum withdraw amount is $10 USDT."); });
  bot.action("prof_statement", (ctx) => { ctx.answerCbQuery(); ctx.reply("🏦 Wallet Statement: Check transactions in your merchant panel."); });
  bot.action("prof_w_req", (ctx) => { ctx.answerCbQuery(); ctx.reply("📋 No pending withdrawal requests."); });
  bot.action("prof_w_prof", (ctx) => { ctx.answerCbQuery(); ctx.reply("📑 Withdrawal profile not set."); });

  bot.action("back_close", (ctx) => {
    ctx.answerCbQuery();
    ctx.deleteMessage().catch(() => {});
  });

  // ==========================================
  // ৪. ব্রডকাস্ট ও ডিরেক্ট মেসেজ ইঞ্জিন
  // ==========================================
  const qBroadcasts = query(collection(db, "broadcasts"), where("status", "==", "pending"));
  onSnapshot(qBroadcasts, async (snapshot) => {
    for (const bDoc of snapshot.docs) {
      const broadcast = bDoc.data();
      const broadcastId = bDoc.id;
      const customersSnap = await getDocs(collection(db, "customers"));

      if (customersSnap.empty) {
        await updateDoc(doc(db, "broadcasts", broadcastId), { status: "sent", sentCount: 0 });
        continue;
      }

      let extraOptions = { parse_mode: "HTML" };
      if (broadcast.button === "shop") {
        extraOptions.reply_markup = Markup.inlineKeyboard([[Markup.button.callback("🛍️ Open Store", "back_to_catalog")]]).reply_markup;
      }

      let sentCount = 0;
      for (const cDoc of customersSnap.docs) {
        const cust = cDoc.data();
        const chatId = cust.telegramId || cDoc.id;
        try {
          if (broadcast.imageUrl) {
            await bot.telegram.sendPhoto(chatId, broadcast.imageUrl, { caption: broadcast.message, ...extraOptions });
          } else {
            await bot.telegram.sendMessage(chatId, broadcast.message, extraOptions);
          }
          sentCount++;
        } catch (err) {}
      }

      await updateDoc(doc(db, "broadcasts", broadcastId), {
        status: "sent",
        sentCount: sentCount,
        completedAt: serverTimestamp()
      });
    }
  });

  const qDirectMsg = query(collection(db, "direct_messages"), where("status", "==", "pending"));
  onSnapshot(qDirectMsg, async (snapshot) => {
    for (const mDoc of snapshot.docs) {
      const msgData = mDoc.data();
      try {
        await bot.telegram.sendMessage(msgData.customerId, msgData.message, { parse_mode: "HTML" });
        await updateDoc(doc(db, "direct_messages", mDoc.id), { status: "sent" });
      } catch (err) {}
    }
  });

  bot.launch();
  console.log("GGSoma Bot with Wallet Deduct & Store Engine Started!");
}

startBot();
import { Telegraf, Markup } from "telegraf";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, collection, getDocs, updateDoc } from "firebase/firestore";
import http from "http";

// Render-এর ফ্রি Web Service সচল রাখার সার্ভার
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Bot is running!");
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
    console.log("No token. Waiting...");
    return setTimeout(startBot, 10000);
  }

  const bot = new Telegraf(botToken);

  // ওয়েবসাইট থেকে কিবোর্ড বাটন ডাইনামিকালি তৈরি করার ফাংশন
  async function getDynamicKeyboard() {
    try {
      const layoutSnap = await getDoc(doc(db, "settings", "bot_layout"));
      if (layoutSnap.exists() && layoutSnap.data().buttons && layoutSnap.data().buttons.main) {
        const mainBtns = layoutSnap.data().buttons.main;
        const rows = {};
        mainBtns.forEach(b => {
          if (b.active) {
            if (!rows[b.row]) rows[b.row] = [];
            rows[b.row].push(Markup.button.callback(b.label, b.action || 'show_products'));
          }
        });
        return Object.values(rows);
      }
    } catch(e) {
      console.log("Layout fetch error:", e);
    }

    // ডিফল্ট লেআউট (যদি কোনো কনফিগ না পায়)
    return [
      [Markup.button.callback("🛍️ Products", "show_products")],
      [Markup.button.callback("👤 Profile", "show_profile"), Markup.button.callback("💳 Wallet", "show_wallet")],
      [Markup.button.callback("☎️ Help", "show_support"), Markup.button.callback("🎁 Referrals", "show_ref")],
      [Markup.button.callback("📜 Bot Policy", "show_policy")]
    ];
  }

  // /start কমান্ড
  bot.command("start", async (ctx) => {
    const sDoc = await getDoc(doc(db, "settings", "general"));
    const settings = sDoc.exists() ? sDoc.data() : {};
    const welcome = settings.startMsg || "👋 আমাদের ডিজিটাল স্টোরে স্বাগতম! নিচের অপশনগুলো থেকে বেছে নিন:";
    const keyboard = await getDynamicKeyboard();

    await ctx.reply(welcome, Markup.inlineKeyboard(keyboard));
  });

  // প্রোডাক্ট তালিকা
  bot.action("show_products", async (ctx) => {
    try {
      const snap = await getDocs(collection(db, "products"));
      if (snap.empty) return ctx.reply("বর্তমানে কোনো প্রোডাক্ট স্টকে নেই।");

      const buttons = [];
      snap.forEach(d => {
        const p = d.data();
        buttons.push([Markup.button.callback(`${p.name} —${p.price} USDT`, `buy_${d.id}`)]);
      });
      buttons.push([Markup.button.callback("‹ মূল মেনু", "back_to_main")]);

      await ctx.editMessageText("একটি ডিজিটাল প্রোডাক্ট বেছে নিন:", Markup.inlineKeyboard(buttons));
    } catch(e) {
      ctx.reply("ক্যাটালগ লোড করতে সমস্যা হয়েছে।");
    }
  });

  bot.action("back_to_main", async (ctx) => {
    const keyboard = await getDynamicKeyboard();
    await ctx.editMessageText("👋 আমাদের ডিজিটাল স্টোরে স্বাগতম!", Markup.inlineKeyboard(keyboard));
  });

  // স্বয়ংক্রিয় ডিজিটাল ডেলিভারি
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
      return ctx.reply("⚠️ দুঃখিত, এই প্রোডাক্টটির কোনো ডিজিটাল স্টক খালি নেই!");
    }

    await updateDoc(doc(db, "stocks", targetStockDoc.id), {
      isSold: true,
      soldTo: ctx.from.id,
      soldAt: new Date()
    });

    const stockData = targetStockDoc.data();
    await ctx.reply(`✅ *ক্রয় সফল হয়েছে!*\n\n📦 প্রোডাক্ট: *${stockData.productName || "Digital Item"}*\n🔑 ডেলিভারি কোড:\n\`${stockData.content}\``, { parse_mode: "Markdown" });
  });

  bot.action("show_wallet", (ctx) => ctx.reply("💳 আপনার ওয়ালেট ব্যালেন্স: 0.00 USDT"));
  bot.action("show_profile", (ctx) => ctx.reply(`👤 ইউজার আইডি: ${ctx.from.id}\nইউজারনেম: @${ctx.from.username || 'নেই'}`));
  bot.action("show_support", (ctx) => ctx.reply("☎️ সাপোর্টের জন্য এডমিনের সাথে যোগাযোগ করুন।"));
  bot.action("show_ref", (ctx) => ctx.reply(`🎁 আপনার রেফারেল লিঙ্ক:\nhttps://t.me/${ctx.botInfo.username}?start=${ctx.from.id}`));
  bot.action("show_policy", (ctx) => ctx.reply("📜 স্টোর পলিসি: ডিজিটাল প্রোডাক্ট কেনার সাথে সাথে ডেলিভারি কনফার্ম হয়। কোনো রিফান্ড প্রযোজ্য নয়।"));

  bot.launch();
  console.log("Dynamic keyboard bot running!");
}

startBot();
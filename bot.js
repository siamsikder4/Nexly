import { Telegraf, Markup } from "telegraf";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, collection, getDocs, updateDoc } from "firebase/firestore";
import http from "http";

// Render-এর ফ্রি Web Service সচল রাখার জন্য ডামি সার্ভার
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Bot is running perfectly on free tier!");
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

// আপনার Firebase Credentials
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
  console.log("Checking token from Firebase...");
  
  const settingsSnap = await getDoc(doc(db, "settings", "general"));
  let botToken = process.env.BOT_TOKEN;

  if (settingsSnap.exists() && settingsSnap.data().botToken) {
    botToken = settingsSnap.data().botToken;
  }

  if (!botToken) {
    console.error("Token not found. Waiting...");
    return setTimeout(startBot, 10000);
  }

  const bot = new Telegraf(botToken);

  // /start কমান্ড
  bot.command("start", async (ctx) => {
    const sDoc = await getDoc(doc(db, "settings", "general"));
    const settings = sDoc.exists() ? sDoc.data() : {};
    const welcome = settings.startMsg || "👋 আমাদের ডিজিটাল স্টোরে স্বাগতম! নিচের অপশনগুলো থেকে বেছে নিন:";

    await ctx.reply(welcome, Markup.inlineKeyboard([
      [Markup.button.callback("🛍️ ক্যাটালগ ও প্রোডাক্ট", "show_products")],
      [Markup.button.callback("💳 ওয়ালেট ব্যালেন্স", "show_wallet"), Markup.button.callback("☎ সাপোর্ট", "show_support")]
    ]));
  });

  // প্রোডাক্ট ক্যাটালগ
  bot.action("show_products", async (ctx) => {
    try {
      const snap = await getDocs(collection(db, "products"));
      if (snap.empty) {
        return ctx.reply("বর্তমানে কোনো প্রোডাক্ট স্টকে নেই।");
      }

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
    await ctx.editMessageText("👋 আমাদের ডিজিটাল স্টোরে স্বাগতম!", Markup.inlineKeyboard([
      [Markup.button.callback("🛍️ ক্যাটালগ ও প্রোডাক্ট", "show_products")],
      [Markup.button.callback("💳 ওয়ালেট ব্যালেন্স", "show_wallet"), Markup.button.callback("☎ সাপোর্ট", "show_support")]
    ]));
  });

  // প্রোডাক্ট ক্রয় ও অটোমেটিক ডেলিভারি
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
    await ctx.reply(`✅ *ক্রয় সফল হয়েছে!*\n\n📦 প্রোডাক্ট: *${stockData.productName || "Digital Item"}*\n🔑 আপনার ডিজিটাল কোড / অ্যাকাউন্ট:\n\`${stockData.content}\``, { parse_mode: "Markdown" });
  });

  bot.action("show_support", async (ctx) => {
    const sDoc = await getDoc(doc(db, "settings", "general"));
    const settings = sDoc.exists() ? sDoc.data() : {};
    const supportUser = settings.supportUsername || "@admin";
    await ctx.reply(`যেকোনো প্রয়োজনে যোগাযোগ করুন: ${supportUser}`);
  });

  bot.action("show_wallet", (ctx) => {
    ctx.reply("আপনার বর্তমান ওয়ালেট ব্যালেন্স: 0.00 USDT\nটপ-আপ করতে এডমিনের সাথে যোগাযোগ করুন।");
  });

  bot.launch();
  console.log("বট সফলভাবে চালু হয়েছে!");
}

startBot();
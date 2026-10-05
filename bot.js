import { Telegraf, Markup } from "telegraf";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Firebase Admin SDK ইনিশিয়ালাইজেশন
// (Render বা Railway-তে চালানোর সময় FIREBASE_SERVICE_ACCOUNT এনভায়রনমেন্ট ভেরিয়েবল দেবেন)
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function startBotEngine() {
  console.log("Firebase থেকে সেটিংস আনা হচ্ছে...");
  const settingsSnap = await db.collection("settings").doc("general").get();
  
  if (!settingsSnap.exists || !settingsSnap.data().botToken) {
    console.log("ওয়েবসাইটে এখনও কোনো Bot Token দেওয়া হয়নি। সেটিংস পেজে গিয়ে বট টোকেন সেভ করুন।");
    return setTimeout(startBotEngine, 10000); // ১০ সেকেন্ড পর পর চেক করবে
  }

  const settings = settingsSnap.data();
  const bot = new Telegraf(settings.botToken);

  // ১. /start কমান্ড
  bot.command("start", async (ctx) => {
    const welcome = settings.startMsg || "আমাদের ডিজিটাল স্টোরে স্বাগতম! নিচের বাটন চাপুন:";
    ctx.reply(welcome, Markup.inlineKeyboard([
      [Markup.button.callback("🛍️ সব প্রোডাক্ট দেখুন", "show_catalog")],
      [Markup.button.callback("💳 ওয়ালেট ব্যালেন্স", "show_wallet")],
      [Markup.button.callback("☎️️ সাপোর্ট", "show_support")]
    ]));
  });

  // ২. ক্যাটালগ ও প্রোডাক্ট শো করা (সরাসরি Firebase থেকে)
  bot.action("show_catalog", async (ctx) => {
    const prodSnap = await db.collection("products").get();
    if (prodSnap.empty) {
      return ctx.reply("বর্তমানে কোনো প্রোডাক্ট স্টকে নেই।");
    }

    const buttons = [];
    prodSnap.forEach(docSnap => {
      const p = docSnap.data();
      buttons.push([Markup.button.callback(`${p.name} — ৳${p.price || p.price} USDT`, `buy_${docSnap.id}`)]);
    });

    ctx.reply("একটি প্রোডাক্ট বেছে নিন:", Markup.inlineKeyboard(buttons));
  });

  // ৩. প্রোডাক্ট ক্রয় ও অটোমেটিক স্টক ডেলিভারি
  bot.action(/buy_(.+)/, async (ctx) => {
    const productId = ctx.match[1];
    
    // অবিক্রীত ১টি স্টক কোড খোঁজা
    const stockSnap = await db.collection("stocks")
      .where("productId", "==", productId)
      .where("isSold", "==", false)
      .limit(1)
      .get();

    if (stockSnap.empty) {
      return ctx.reply("দুঃখিত! এই প্রোডাক্টটির কোনো ডিজিটাল স্টক খালি নেই।");
    }

    const stockDoc = stockSnap.docs[0];
    const stockData = stockDoc.data();

    // স্টকটি বিক্রিত মার্ক করা
    await stockDoc.ref.update({
      isSold: true,
      soldTo: ctx.from.id,
      soldAt: new Date()
    });

    // ডিজিটাল কোড/অ্যাকাউন্ট সরাসরি টেলিগ্রামে পাঠিয়ে দেওয়া
    ctx.reply(`✅ *ক্রয় সফল হয়েছে!*\n\n📦 প্রোডাক্ট: ${stockData.productName}\n🔑 আপনার ডেলিভারি আইটেম:\n\`${stockData.content}\``, { parse_mode: "Markdown" });
  });

  // ৪. সাপোর্ট হ্যান্ডলার
  bot.action("show_support", (ctx) => {
    const help = settings.helpMsg || "সাহায্যের জন্য অ্যাডমিনের সাথে যোগাযোগ করুন।";
    ctx.reply(help);
  });

  bot.launch();
  console.log("বট সফলভাবে চালু হয়েছে এবং Firebase-এর সাথে কানেক্টেড!");
}

startBotEngine();
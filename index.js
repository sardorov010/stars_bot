import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import db, { dbHelpers } from "./database.js";
import { setupAdminHandlers } from "./admin.js";
import { ClickPayment } from "./payment.js";  // ✅ To'g'rilandi (payments emas!)
import AutoStarsDelivery from "./auto-delivery.js";  // 🆕 Avtomatik yuborish

dotenv.config();

const TOKEN = process.env.TOKEN;
const ADMIN_ID = parseInt(process.env.ADMIN_ID || "0");
const bot = new TelegramBot(TOKEN, { polling: true });

console.log("🤖 Bot ishga tushdi...");

// 🆕 AVTOMATIK DELIVERY TIZIMI
const autoDelivery = new AutoStarsDelivery(bot, ADMIN_ID);
autoDelivery.setupHandlers();  // Handler'larni o'rnatish

const CHANNELS = ["@AutoStarsNews"];
const STAR_PRICE_PER_ONE = 220;

const STAR_PACKAGES = {
  50: 11000, 75: 16500, 100: 22000, 150: 33000,
  250: 55000, 350: 77000, 500: 110000, 750: 165000,
  1000: 220000, 1500: 330000, 2500: 550000,
  5000: 1100000, 10000: 2200000
};

const PREMIUM_PACKAGES = {
  1: 47990, 3: 169990, 6: 209990, 12: 364990
};

const REFERRAL_BONUS = {
  stars: 5, premium: 10
};

const userState = {};

const clickPayment = new ClickPayment({
  serviceId: process.env.CLICK_SERVICE_ID,
  merchantId: process.env.CLICK_MERCHANT_ID,
  secretKey: process.env.CLICK_SECRET_KEY,
  merchantUserId: process.env.CLICK_MERCHANT_USER_ID
});

setupAdminHandlers(bot, ADMIN_ID);

async function checkSubscription(userId) {
  for (const channel of CHANNELS) {
    try {
      const member = await bot.getChatMember(channel, userId);
      if (member.status === "left" || member.status === "kicked") return false;
    } catch (error) {
      return false;
    }
  }
  return true;
}

function registerOrUpdateUser(message, refId = null) {
  const user = message.from;
  try {
    dbHelpers.upsertUser.run(
      user.id, user.username || null, user.first_name || null,
      user.last_name || null, refId
    );
  } catch (error) {
    console.error("User save error:", error.message);
  }
}

function processReferralBonus(userId, orderId, productType) {
  try {
    const user = dbHelpers.getUser.get(userId);
    if (!user || !user.ref_by) return;

    const bonusAmount = REFERRAL_BONUS[productType] || 0;
    if (bonusAmount === 0) return;

    const referrer = dbHelpers.getUser.get(user.ref_by);
    if (!referrer) return;

    const balanceBefore = referrer.balance;
    const balanceAfter = balanceBefore + bonusAmount;

    dbHelpers.updateBalance.run(bonusAmount, user.ref_by);
    dbHelpers.addBalanceHistory.run(
      user.ref_by, bonusAmount, balanceBefore, balanceAfter,
      'referral_bonus', `Referal bonus: ${productType}`, orderId
    );
    dbHelpers.addReferralBonus.run(user.ref_by, userId, orderId, bonusAmount, productType);

    bot.sendMessage(
      user.ref_by,
      `🎉 Tabriklaymiz!\n\n💰 Sizga +${bonusAmount} ⭐️ referal bonus qo'shildi!\n` +
      `👤 Do'stingiz ${productType === 'stars' ? 'Stars' : 'Premium'} sotib oldi\n\n` +
      `💳 Yangi balans: ${balanceAfter} ⭐️`
    ).catch(() => {});
  } catch (error) {
    console.error("Referal bonus error:", error.message);
  }
}

function createOrder(userId, productType, amount, price, recipientUsername = null) {
  try {
    const product = dbHelpers.getProduct.get(productType, amount);
    const result = dbHelpers.createOrder.run(
      userId, product?.product_id || null, productType,
      amount, price, recipientUsername, 'pending'
    );
    return result.lastInsertRowid;
  } catch (error) {
    console.error("Create order error:", error.message);
    return null;
  }
}

function getBotBalance() {
  try {
    const totalOrdered = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM orders WHERE status = 'completed' AND product_type = 'stars'"
    ).get().total;
    const totalSent = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM deliveries WHERE delivery_status = 'delivered' AND product_type = 'stars'"
    ).get().total;
    return Math.max(0, totalOrdered - totalSent);
  } catch (error) {
    return 10000;
  }
}

// 🆕 GLOBAL FUNKSIYA - server.js dan chaqiriladi
global.notifyAutoDelivery = async (orderId) => {
  try {
    await autoDelivery.processCompletedPayment(orderId);
  } catch (error) {
    console.error("Auto delivery notification error:", error);
  }
};

bot.onText(/\/start(.*)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  const refParam = match[1]?.trim();
  let refId = null;
  if (refParam && refParam.startsWith("ref_")) {
    const extractedId = parseInt(refParam.replace("ref_", ""));
    if (extractedId && extractedId !== userId) refId = extractedId;
  }

  registerOrUpdateUser(msg, refId);

  const isSubscribed = await checkSubscription(userId);
  if (!isSubscribed) {
    return bot.sendMessage(chatId, "⚠️ Botdan foydalanish uchun quyidagi kanalga obuna bo'ling 👇", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📢 Kanalga obuna bo'lish", url: "https://t.me/AutoStarsNews" }],
          [{ text: "✅ Tekshirish", callback_data: "CHECK_SUB" }]
        ]
      }
    });
  }

  bot.sendMessage(chatId,
    `${msg.chat.first_name} 👋 Assalomu alaykum!\n\n` +
    `🛒 Botimiz orqali arzonlashtirilgan «Stars va Premium»larni xarid qilishingiz mumkin\n\n` +
    `Quyidagi menyudan kerakli bo'limni tanlang 👇`, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "⭐️ Stars", callback_data: "buy_stars" },
            { text: "💎 Premium", callback_data: "premium" }
          ],
          [
            { text: "🎁 Tekin Stars", callback_data: "free_stars" },
            { text: "📊 Statistika", callback_data: "stats" }
          ]
        ]
      }
    }
  );
});

bot.on("callback_query", async (query) => {
  const userId = query.from.id;
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;

  if (data === "CHECK_SUB") {
    const isSubscribed = await checkSubscription(userId);
    if (!isSubscribed) {
      return bot.answerCallbackQuery(query.id, { text: "❌ Hali obuna bo'lmagansiz", show_alert: true });
    }
    await bot.answerCallbackQuery(query.id);
    return bot.sendMessage(chatId, "✅ Rahmat! /start ni qayta yuboring.");
  }

  if (data === "BACK_HOME") {
    delete userState[userId];
    await bot.answerCallbackQuery(query.id);
    return bot.editMessageText(
      `${query.from.first_name} 👋 Assalomu alaykum!\n\n` +
      `🛒 Botimiz orqali arzonlashtirilgan «Stars va Premium»larni xarid qilishingiz mumkin\n\n` +
      `Quyidagi menyudan kerakli bo'limni tanlang 👇`, {
        chat_id: chatId, message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "⭐️ Stars", callback_data: "buy_stars" },
              { text: "💎 Premium", callback_data: "premium" }
            ],
            [
              { text: "🎁 Tekin Stars", callback_data: "free_stars" },
              { text: "📊 Statistika", callback_data: "stats" }
            ]
          ]
        }
      }
    );
  }

  if (data === "stats") {
    await bot.answerCallbackQuery(query.id);
    const stats = dbHelpers.getUserStats.get(userId);
    return bot.editMessageText(
      `📊 <b>Sizning statistikangiz</b>\n\n` +
      `💳 Balans: ${stats?.balance || 0} ⭐️\n` +
      `🛒 Buyurtmalar: ${stats?.total_orders || 0} ta\n` +
      `💰 Sarflangan: ${(stats?.total_spent || 0).toLocaleString()} so'm\n` +
      `👥 Taklif qilganlar: ${stats?.total_referrals || 0} ta\n` +
      `🎁 Ishlab topilgan bonus: ${stats?.total_bonus_earned || 0} ⭐️`, {
        chat_id: chatId, message_id: messageId, parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "⬅️ Orqaga", callback_data: "BACK_HOME" }]] }
      }
    );
  }

  if (data === "free_stars") {
    await bot.answerCallbackQuery(query.id);
    const botInfo = await bot.getMe();
    const refLink = `https://t.me/${botInfo.username}?start=ref_${userId}`;
    const stats = dbHelpers.getUserStats.get(userId);
    const referrals = db.prepare(
      "SELECT user_id, username, first_name FROM users WHERE ref_by = ? ORDER BY created_at DESC LIMIT 10"
    ).all(userId);

    let refList = '';
    if (referrals.length > 0) {
      refList = '\n\n👥 <b>Sizning do\'stlaringiz:</b>\n';
      referrals.forEach((ref, i) => {
        const name = ref.username ? `@${ref.username}` : ref.first_name;
        const userLink = `<a href="tg://user?id=${ref.user_id}">${name}</a>`;
        refList += `${i + 1}. ${userLink}\n`;
      });
    }

    return bot.editMessageText(
      `👥 <b>Referal tizimi</b>\n\n` +
      `ℹ️ <b>U qanday ishlaydi?</b>\n🎁 Botga do'stingizni taklif qiling.\n` +
      `Agarda taklif qilgan do'stingiz botdan buyurtma uchun to'lovni amalga oshirsa sizga bonus beriladi:\n\n` +
      `▫️ Telegram Stars: <b>+${REFERRAL_BONUS.stars} ⭐️</b>\n` +
      `▫️ Telegram Premium: <b>+${REFERRAL_BONUS.premium} ⭐️</b>\n\n` +
      `💳 <b>Sizning balansingiz:</b> ${stats?.balance || 0} ⭐️\n` +
      `📊 <b>Taklif qilgan do'stlaringiz:</b> ${stats?.total_referrals || 0} ta\n\n` +
      `🔗 <b>Referal havolangiz:</b>\n<code>${refLink}</code>` + refList +
      `\n\n📤 Ushbu havolani do'stlaringizga yuboring`, {
        chat_id: chatId, message_id: messageId, parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔗 Do'stlarga ulashish", url: `https://t.me/share/url?url=${encodeURIComponent(refLink)}` }],
            [{ text: "⬅️ Orqaga", callback_data: "BACK_HOME" }]
          ]
        }
      }
    );
  }

  if (data === "buy_stars") {
    userState[userId] = { step: "WAIT_STARS" };
    await bot.answerCallbackQuery(query.id);
    
    const botBalance = getBotBalance();
    const maxStars = Math.min(10000, Math.floor(botBalance / 1.1));
    const availablePackages = Object.entries(STAR_PACKAGES)
      .filter(([stars]) => parseInt(stars) <= maxStars);

    const rows = [];
    for (let i = 0; i < availablePackages.length; i += 2) {
      const row = [];
      row.push({ text: `⭐️ ${availablePackages[i][0]} - ${availablePackages[i][1].toLocaleString()} so'm`, callback_data: `STARS_${availablePackages[i][0]}` });
      if (i + 1 < availablePackages.length) {
        row.push({ text: `⭐️ ${availablePackages[i + 1][0]} - ${availablePackages[i + 1][1].toLocaleString()} so'm`, callback_data: `STARS_${availablePackages[i + 1][0]}` });
      }
      rows.push(row);
    }
    rows.push([{ text: "⬅️ Orqaga", callback_data: "BACK_HOME" }]);
    
    return bot.editMessageText(
      `🌟 <b>Telegram Stars buyurtma</b>\n\n` +
      `✨ Siz qanchalik ko'p Stars olsangiz, shunchalik afzalliklarga ega bo'lasiz!\n\n` +
      `<blockquote>🔹 Minimal: 50\n🔹 Maksimal: ${maxStars.toLocaleString()} (bot balansi)</blockquote>\n\n` +
      `✅ Kerakli miqdorni tanlang 👇`, {
        chat_id: chatId, message_id: messageId, parse_mode: "HTML",
        reply_markup: { inline_keyboard: rows }
      }
    );
  }

  if (data.startsWith("STARS_")) {
    const stars = parseInt(data.split("_")[1]);
    const price = STAR_PACKAGES[stars] ?? stars * STAR_PRICE_PER_ONE;
    userState[userId] = { step: "WAIT_USERNAME", stars, productType: "stars" };
    await bot.answerCallbackQuery(query.id);

    return bot.editMessageText(
      `⭐️ Stars sotib olish\n\n` +
      `📊 Buyurtma ma'lumotlari:\n   ┗ 🎯 Miqdor: ${stars} ⭐️\n   ┗ 💰 Narxi: ${price.toLocaleString()}.00 so'm\n\n` +
      `👤 Kimga yuboramiz?\n📝 @username kiriting:`, {
        chat_id: chatId, message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [{ text: "👤 O'zimga", callback_data: `BUY_STARS_${stars}` }],
            [{ text: "⬅️ Orqaga", callback_data: "buy_stars" }]
          ]
        }
      }
    );
  }

  if (data.startsWith("BUY_STARS_")) {
    const stars = parseInt(data.split("_")[2]);
    const price = STAR_PACKAGES[stars] ?? stars * STAR_PRICE_PER_ONE;
    const username = `@${query.from.username || query.from.first_name}`;
    const orderId = createOrder(userId, "stars", stars, price, username);

    if (!orderId) {
      return bot.answerCallbackQuery(query.id, { text: "❌ Buyurtma yaratishda xato", show_alert: true });
    }

    processReferralBonus(userId, orderId, "stars");
    delete userState[userId];
    await bot.answerCallbackQuery(query.id);

    const clickUrl = clickPayment.generateInvoiceUrl(orderId, price);
    const paymeUrl = `https://checkout.paycom.uz/${process.env.PAYME_MERCHANT_ID}?amount=${price * 100}&account[order_id]=${orderId}`;

    return bot.editMessageText(
      `✅ <b>Buyurtma yaratildi!</b>\n\n` +
      `🆔 Buyurtma: #${orderId}\n⭐️ Stars: ${stars}\n💰 Narxi: ${price.toLocaleString()} so'm\n` +
      `👤 Kimga: ${username}\n\n💳 To'lov usulini tanlang:`, {
        chat_id: chatId, message_id: messageId, parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "💳 Click", url: clickUrl }],
            [{ text: "💳 Payme", url: paymeUrl }],
            [{ text: "⬅️ Orqaga", callback_data: "buy_stars" }]
          ]
        }
      }
    );
  }

  // ADMIN O'ZIGA STARS YUBORISH (To'lovsiz)
bot.onText(/\/admin_add_stars (\d+)/, async (msg, match) => {
  const userId = msg.from.id;
  
  if (userId !== ADMIN_ID) {
    return bot.sendMessage(msg.chat.id, "❌ Faqat admin");
  }
  
  const stars = parseInt(match[1]);
  const chatId = msg.chat.id;
  
  if (stars < 50 || stars > 10000) {
    return bot.sendMessage(chatId, "⚠️ 50-10000 orasida bo'lishi kerak");
  }
  
  try {
    // Buyurtma yaratish (to'lovsiz, admin uchun)
    const orderId = db.prepare(`
      INSERT INTO orders 
      (user_id, product_type, amount, price, recipient_username, status, completed_at)
      VALUES (?, 'stars', ?, 0, '@admin', 'completed', CURRENT_TIMESTAMP)
    `).run(ADMIN_ID, stars).lastInsertRowid;
    
    // Stars invoice yuborish
    const invoice = await bot.sendInvoice(
      chatId,
      `⭐️ ${stars} Stars - Admin Transfer`,
      `Bot balansiga ${stars} Stars qo'shish.\n\n` +
      `🔐 Bu admin transfer - to'lovsiz!\n` +
      `💡 Telegram Stars bilan tasdiqlang.`,
      `ADMIN_STARS_${orderId}_${Date.now()}`,
      "", // Provider token
      "XTR", // Telegram Stars
      [
        {
          label: `${stars} ⭐️ Stars`,
          amount: stars
        }
      ]
    );
    
    // Delivery record
    db.prepare(`
      INSERT INTO deliveries 
      (order_id, user_id, recipient_username, product_type, amount, delivery_status, delivery_method)
      VALUES (?, ?, '@admin', 'stars', ?, 'sent', 'admin_transfer')
    `).run(orderId, ADMIN_ID, stars);
    
    await bot.sendMessage(
      chatId,
      `✅ <b>Admin Stars Transfer</b>\n\n` +
      `⭐️ Miqdor: ${stars} Stars\n` +
      `🆔 Order: #${orderId}\n\n` +
      `📲 Yuqoridagi invoice'ni oching va "Pay XTR" bosing.\n\n` +
      `💡 Bu sizning shaxsiy Stars'ingizdan olinadi va bot balansiga qo'shiladi!`,
      { parse_mode: "HTML" }
    );
    
  } catch (error) {
    console.error("Admin transfer error:", error);
    bot.sendMessage(chatId, `❌ Xato: ${error.message}`);
  }
});

// Successful payment handler'ni yangilash kerak
// Agar mavjud bo'lsa, quyidagini qo'shing:
bot.on("successful_payment", async (msg) => {
  try {
    const payment = msg.successful_payment;
    const payload = payment.invoice_payload;

    // Order ID olish
    let orderId = null;
    
    // STARS_DELIVERY formatidan
    let match = payload.match(/STARS_DELIVERY_(\d+)_/);
    if (match) {
      orderId = parseInt(match[1]);
    }
    
    // ADMIN_STARS formatidan
    match = payload.match(/ADMIN_STARS_(\d+)_/);
    if (match) {
      orderId = parseInt(match[1]);
      
      // Admin transfer uchun maxsus
      db.prepare(`
        UPDATE deliveries 
        SET delivery_status = 'delivered', 
            delivered_at = CURRENT_TIMESTAMP
        WHERE order_id = ?
      `).run(orderId);
      
      const botBalance = getBotBalance();
      
      await bot.sendMessage(
        msg.chat.id,
        `🎉 <b>Admin Transfer Muvaffaqiyatli!</b>\n\n` +
        `✅ ${payment.total_amount} ⭐️ Stars bot balansiga qo'shildi!\n` +
        `🆔 Order: #${orderId}\n` +
        `💰 Yangi balans: ~${botBalance} ⭐️\n\n` +
        `🎯 Endi botdan Stars sotishingiz mumkin!`,
        { parse_mode: "HTML" }
      );
      
      return; // Admin transfer uchun tugadi
    }
    
    // Oddiy foydalanuvchi to'lovi (avvalgi kod)
    if (orderId) {
      db.prepare(`
        UPDATE deliveries 
        SET delivery_status = 'delivered', 
            delivered_at = CURRENT_TIMESTAMP
        WHERE order_id = ?
      `).run(orderId);

      await bot.sendMessage(
        msg.chat.id,
        `🎉 <b>MUVAFFAQIYATLI!</b>\n\n` +
        `✅ ${payment.total_amount} ⭐️ Stars qabul qilindi!\n` +
        `📦 Buyurtma: #${orderId}\n\n` +
        `🙏 Rahmat!\n📢 @AutoStarsNews`,
        { parse_mode: "HTML" }
      );
    }

  } catch (error) {
    console.error("Successful payment error:", error);
  }
});

console.log("✅ Admin Stars transfer buyrug'i yuklandi");

  if (data === "premium") {
    await bot.answerCallbackQuery(query.id);
    return bot.editMessageText(
      `<b>💎 Telegram Premium buyurtma</b>\n\n` +
      `📅 Qancha muddatlik Premium paket sotib olmoqchisiz?\n\n` +
      `💎 Mavjud paketlar:\n┗ 🕐 3 oylik: 169 990 so'm\n┗ 🕐 6 oylik: 209 990 so'm\n┗ 🕐 1 yillik: 364 990 so'm\n\n🎯 Tanlang:`, {
        chat_id: chatId, message_id: messageId, parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "💎 1 oylik - 47 990 so'm", callback_data: "PREMIUM_1" },
              { text: "💎 3 oylik - 169 990 so'm", callback_data: "PREMIUM_3" }
            ],
            [
              { text: "💎 6 oylik - 209 990 so'm", callback_data: "PREMIUM_6" },
              { text: "💎 1 yillik - 364 990 so'm", callback_data: "PREMIUM_12" }
            ],
            [{ text: "⬅️ Orqaga", callback_data: "BACK_HOME" }]
          ]
        }
      }
    );
  }

  if (data.startsWith("PREMIUM_")) {
    const months = parseInt(data.split("_")[1]);
    const price = PREMIUM_PACKAGES[months];

    if (months === 1) {
      await bot.answerCallbackQuery(query.id);
      return bot.editMessageText(
        `💎 Premium sotib olish\n\n` +
        `📊 Buyurtma ma'lumotlari:\n┗ 🎯 Miqdor: 1 oylik\n┗ 💰 Narxi: 47 990.00 so'm\n\n` +
        `<b>Hurmatli mijoz, 1 oylik Premium paket yo'qligi sababli uni to'g'ridan to'g'ri onlayn tarzida sotib olish mumkin emas. ` +
        `Bizning adminizga bog'lanib 1 oylik premium paketni xarid qilishingiz mumkin.</b>\n\n` +
        `<blockquote><b>Noqulayliklar uchun uzr so'raymiz.</b></blockquote>`, {
          chat_id: chatId, message_id: messageId, parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "📲 Admin bilan bog'lanish", url: "https://t.me/AutoStarsAdmin" }],
              [{ text: "⬅️ Orqaga", callback_data: "premium" }]
            ]
          }
        }
      );
    }

    userState[userId] = { step: "WAIT_PREMIUM_USERNAME", months, productType: "premium" };
    await bot.answerCallbackQuery(query.id);

    return bot.editMessageText(
      `💎 Premium sotib olish\n\n` +
      `📊 Buyurtma ma'lumotlari:\n┗ 🎯 Miqdor: ${months} oylik\n┗ 💰 Narxi: ${price.toLocaleString()}.00 so'm\n\n` +
      `👤 Kimga yuboramiz?\n📝 @username kiriting:`, {
        chat_id: chatId, message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [{ text: "👤 O'zimga", callback_data: `BUY_PREMIUM_${months}` }],
            [{ text: "⬅️ Orqaga", callback_data: "premium" }]
          ]
        }
      }
    );
  }

  if (data.startsWith("BUY_PREMIUM_")) {
    const months = parseInt(data.split("_")[2]);
    const price = PREMIUM_PACKAGES[months];
    const username = `@${query.from.username || query.from.first_name}`;
    const orderId = createOrder(userId, "premium", months, price, username);

    if (!orderId) {
      return bot.answerCallbackQuery(query.id, { text: "❌ Buyurtma yaratishda xato", show_alert: true });
    }

    processReferralBonus(userId, orderId, "premium");
    delete userState[userId];
    await bot.answerCallbackQuery(query.id);

    const clickUrl = clickPayment.generateInvoiceUrl(orderId, price);
    const paymeUrl = `https://checkout.paycom.uz/${process.env.PAYME_MERCHANT_ID}?amount=${price * 100}&account[order_id]=${orderId}`;

    return bot.editMessageText(
      `✅ <b>Buyurtma yaratildi!</b>\n\n` +
      `🆔 Buyurtma: #${orderId}\n💎 Premium: ${months} oylik\n💰 Narxi: ${price.toLocaleString()} so'm\n` +
      `👤 Kimga: ${username}\n\n💳 To'lov usulini tanlang:`, {
        chat_id: chatId, message_id: messageId, parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "💳 Click", url: clickUrl }],
            [{ text: "💳 Payme", url: paymeUrl }],
            [{ text: "⬅️ Orqaga", callback_data: "premium" }]
          ]
        }
      }
    );
  }
});

bot.on("message", async (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;

  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const state = userState[userId];
  if (!state) return;

  if (state.step === "WAIT_USERNAME" && state.productType === "stars") {
    const username = msg.text.trim();
    if (!username.startsWith("@")) {
      return bot.sendMessage(chatId, "⚠️ Username @ bilan boshlanishi kerak");
    }

    const stars = state.stars;
    const price = STAR_PACKAGES[stars] ?? stars * STAR_PRICE_PER_ONE;
    const orderId = createOrder(userId, "stars", stars, price, username);

    if (!orderId) {
      return bot.sendMessage(chatId, "❌ Buyurtma yaratishda xato");
    }

    processReferralBonus(userId, orderId, "stars");
    delete userState[userId];

    const clickUrl = clickPayment.generateInvoiceUrl(orderId, price);
    const paymeUrl = `https://checkout.paycom.uz/${process.env.PAYME_MERCHANT_ID}?amount=${price * 100}&account[order_id]=${orderId}`;

    return bot.sendMessage(chatId,
      `✅ <b>Buyurtma yaratildi!</b>\n\n` +
      `🆔 Buyurtma: #${orderId}\n⭐️ Stars: ${stars}\n💰 Narxi: ${price.toLocaleString()} so'm\n` +
      `👤 Kimga: ${username}\n\n💳 To'lov usulini tanlang:`, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "💳 Click", url: clickUrl }],
            [{ text: "💳 Payme", url: paymeUrl }]
          ]
        }
      }
    );
  }

  if (state.step === "WAIT_PREMIUM_USERNAME" && state.productType === "premium") {
    const username = msg.text.trim();
    if (!username.startsWith("@")) {
      return bot.sendMessage(chatId, "⚠️ Username @ bilan boshlanishi kerak");
    }

    const months = state.months;
    const price = PREMIUM_PACKAGES[months];
    const orderId = createOrder(userId, "premium", months, price, username);

    if (!orderId) {
      return bot.sendMessage(chatId, "❌ Buyurtma yaratishda xato");
    }

    processReferralBonus(userId, orderId, "premium");
    delete userState[userId];

    const clickUrl = clickPayment.generateInvoiceUrl(orderId, price);
    const paymeUrl = `https://checkout.paycom.uz/${process.env.PAYME_MERCHANT_ID}?amount=${price * 100}&account[order_id]=${orderId}`;

    return bot.sendMessage(chatId,
      `✅ <b>Buyurtma yaratildi!</b>\n\n` +
      `🆔 Buyurtma: #${orderId}\n💎 Premium: ${months} oylik\n💰 Narxi: ${price.toLocaleString()} so'm\n` +
      `👤 Kimga: ${username}\n\n💳 To'lov usulini tanlang:`, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "💳 Click", url: clickUrl }],
            [{ text: "💳 Payme", url: paymeUrl }]
          ]
        }
      }
    );
  }

  if (state.step === "WAIT_STARS") {
    const stars = parseInt(msg.text.trim());
    if (isNaN(stars)) {
      return bot.sendMessage(chatId, "⚠️ Iltimos, faqat raqam kiriting");
    }
    if (stars < 50) {
      return bot.sendMessage(chatId, "⚠️ Minimal 50 Stars");
    }

    const botBalance = getBotBalance();
    const maxStars = Math.min(10000, Math.floor(botBalance / 1.1));
    if (stars > maxStars) {
      return bot.sendMessage(chatId, `⚠️ Maksimal ${maxStars} Stars mavjud\n(Bot balansi yetarli emas)`);
    }

    const price = STAR_PACKAGES[stars] ?? stars * STAR_PRICE_PER_ONE;
    userState[userId] = { step: "WAIT_USERNAME", stars, productType: "stars" };

    return bot.sendMessage(chatId,
      `⭐️ Stars buyurtma\n\n` +
      `📊 Buyurtma ma'lumotlari:\n   ┗ 🎯 Miqdor: ${stars} ⭐️\n   ┗ 💰 Narxi: ${price.toLocaleString()}.00 so'm\n\n` +
      `👤 Kimga yuboramiz?\n📝 @username kiriting:`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "👤 O'zimga", callback_data: `BUY_STARS_${stars}` }],
            [{ text: "⬅️ Orqaga", callback_data: "buy_stars" }]
          ]
        }
      }
    );
  }
});

bot.on("polling_error", (error) => {
  if (error.response?.body?.description?.includes("query is too old")) {
    console.log("⚠️ Eski update'lar o'tkazib yuborildi");
    return;
  }
  console.error("❌ Polling xato:", error.message);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  process.exit(1);
});

console.log("✅ Bot to'liq ishga tushdi!");
console.log("🤖 Avtomatik Stars delivery faol!");


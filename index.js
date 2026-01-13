import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import db from "./database.js";
dotenv.config();

const Token = process.env.TOKEN
const bot = new TelegramBot(Token, { polling: true });

console.log("Bot is running...");

const CHANNELS = ["@AutoStarsNews"];


const STAR_PRICE_PER_ONE = 220;

const STAR_PACKAGES = {
  50: 11000,
  75: 16500,
  100: 22000,
  150: 33000,
  250: 55000,
  350: 77000,
  500: 110000,
  750: 165000,
  1000: 220000,
  1500: 330000,
  2500: 550000,
  5000: 1100000,
  10000: 2200000
};

const userState = {}


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


bot.onText(/\/start(.*)/, async (message, match) => {
  const chatId = message.chat.id;
  const userId = message.from.id;
  const username = message.from.username ? `@${message.from.username}` : null;

  // 🔹 REFERAL ID
  const refId = match[1]?.trim();
  const cleanRefId =
    refId && refId !== "" && refId !== String(userId)
      ? Number(refId)
      : null;

  // 🔹 USER BOR-YO‘QLIGINI TEKSHIRAMIZ
  const existingUser = db.prepare(
    "SELECT * FROM users WHERE user_id = ?"
  ).get(userId);

  if (!existingUser) {
    db.prepare(`
      INSERT INTO users (user_id, ref_by, balance)
      VALUES (?, ?, 0)
    `).run(userId, cleanRefId);
  }

  const isSubscribed = await checkSubscription(userId);

  if (!isSubscribed) {
    return bot.sendMessage(
      chatId,
      "❗️ Botdan foydalanish uchun quyidagi kanalga obuna bo‘ling 👇",
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "📢 Kanalga obuna bo‘lish", url: "https://t.me/AutoStarsNews" }
            ],
            [
              { text: "✅ Tekshirish", callback_data: "CHECK_SUB" }
            ]
          ]
        }
      }
    );
  }

  // 👉 shu yerda asosiy menyu yuboriladi



  bot.sendMessage(
    chatId,
    `${message.chat.first_name} 👋 Assalomu alaykum, botga xush kelibsiz!

🛒 Botimiz orqali arzonlashtirilgan «Stars va Premium» larni xarid qilishingiz mumkin

Quyidagi menyudan kerakli bo'limni tanlang 👇`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "⭐️ Stars ", callback_data: "buy_stars" },
            { text: "💎 Premium", callback_data: "premium" }
          ],
          [
            { text: "Tekin Stars Ishlash✅", callback_data: "free_stars" }
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
      return bot.answerCallbackQuery(query.id, {
        text: "❌ Hali obuna bo‘lmagansiz",
        show_alert: true
      });
    }
    await bot.answerCallbackQuery(query.id);
    return bot.sendMessage(chatId, "✅ Rahmat! Endi botdan foydalanish uchun /start buyrug'ini qayta yuboring.");
  }


  if (data === "BACK_HOME") {
    delete userState[userId];
    await bot.answerCallbackQuery(query.id);
    return bot.editMessageText(
      `${query.from.first_name} 👋 Assalomu alaykum!
  
🛒 Botimiz orqali arzonlashtirilgan «Stars va Premium» larni xarid qilishingiz mumkin
  
Quyidagi menyudan keraklisini tanlang 👇`,
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "⭐️ Stars", callback_data: "buy_stars" },
              { text: "💎 Premium", callback_data: "premium" }
            ],
            [
              { text: "Tekin Stars Ishlash✅", callback_data: "free_stars" }
            ]
          ]
        }
      }
    );
  }

  if (data === "free_stars") {
  await bot.answerCallbackQuery(query.id);

  const refLink = `https://t.me/AutoStarsBuyBot?start=ref_${userId}`;

  // 🔹 nechta referal borligini DB dan olamiz
  const totalRefs = db.prepare(
    "SELECT COUNT(*) AS count FROM users WHERE ref_by = ?"
  ).get(userId).count;

  return bot.editMessageText(
    `👥 <b>Referal tizimi</b>

⁉️ <b>U qanday ishlaydi?</b>
🎁 Botga do'stingizni taklif qiling.  
Agarda taklif qilgan do'stingiz botdan buyurtma uchun to'lovni amalga oshirsa sizga quyidagi miqdorda bonus beriladi

▫️ Telegram Stars: <b>+3 ⭐️</b>
▫️ Telegram Premium: <b>+7 ⭐️</b>

📊 <b>Taklif qilgan do'stlaringiz:</b> ${totalRefs} ta

🔗 <b>Referal havolangiz:</b>
<code>${refLink}</code>

📤 Ushbu havolani do‘stlaringizga yuboring`,
    {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🔗 Do‘stlarga ulashish",
              switch_inline_query: refLink
            }
          ],
          [
            { text: "⬅️ Orqaga", callback_data: "BACK_HOME" }
          ]
        ]
      }
    }
  );
}


  if (data === "buy_stars") {
    userState[userId] = { step: "WAIT_STARS" };
    await bot.answerCallbackQuery(query.id);
    return bot.editMessageText(
      `🌟 <b>Telegram Stars buyurtma</b>

✨ Siz qanchalik ko‘p Stars olsangiz,
shunchalik afzalliklarga ega bo‘lasiz!

<blockquote>🔹 Minimal: 50
🔹 Maksimal: 10000
</blockquote>

✅ Kerakli miqdorni tanlang 👇`,
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "⭐️ 50 - 11 000 so'm", callback_data: "STARS_50" },
              { text: "⭐️ 75 - 16 500 so'm", callback_data: "STARS_75" }
            ],
            [
              { text: "⭐️ 100 - 22 000 so'm", callback_data: "STARS_100" },
              { text: "⭐️ 150 - 33 000 so'm", callback_data: "STARS_150" }
            ],
            [
              { text: "⭐️ 250 - 55 000 so'm", callback_data: "STARS_250" },
              { text: "⭐️ 350 - 77 000 so'm", callback_data: "STARS_350" }
            ],
            [
              { text: "⭐️ 500 - 110 000 so'm", callback_data: "STARS_500" },
              { text: "⭐️ 750 - 165 000 so'm", callback_data: "STARS_750" }
            ],
            [
              { text: "⭐️ 1000 - 220 000 so'm", callback_data: "STARS_1000" },
              { text: "⭐️ 1500 - 330 000 so'm", callback_data: "STARS_1500" }
            ],
            [
              { text: "⭐️ 2500 - 550 000 so'm", callback_data: "STARS_2500" },
              { text: "⭐️ 5000 - 1 100 000 so'm", callback_data: "STARS_5000" }
            ],
            [
              { text: "⭐️ 10000 - 2 200 000 so'm", callback_data: "STARS_10000" }
            ],
            [
              { text: "⬅️ Orqaga", callback_data: "BACK_HOME" }
            ]
          ]
        }
      }
    );
  }


  if (data.startsWith("STARS_")) {
    const stars = parseInt(data.split("_")[1]);
    const price = STAR_PACKAGES[stars] ?? stars * STAR_PRICE_PER_ONE;

    userState[userId] = {
      step: "WAIT_USERNAME",
      stars
    }

    await bot.answerCallbackQuery(query.id);

    return bot.editMessageText(
      `⭐️ Stars sotib olish

📊 Buyurtma ma'lumotlari:
   └ 🎯 Miqdor:  ${stars} ⭐️
   └ 💰 Narxi: ${price.toLocaleString()}.00 so'm

👤 Kimga yuboramiz?
📝 @username kiriting:`,
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "👤 O'zimga", callback_data: `BUY_STARS_${stars}` }
            ],
            [
              { text: "⬅️ Orqaga", callback_data: "BACK_STARS_PAGE" }
            ]
          ]
        }
      }
    );
  }

  if (data === "BACK_STARS_PAGE") {
    await bot.answerCallbackQuery(query.id);

    userState[userId] = {
      step: "WAIT_STARS"
    };

    return bot.editMessageText(
      `🌟 <b>Telegram Stars buyurtma</b>
      
✨ Siz qanchalik ko‘p Stars olsangiz,
shunchalik afzalliklarga ega bo‘lasiz!

<blockquote>🔹 Minimal: 50
🔹 Maksimal: 10000
</blockquote>
      
✅ Kerakli miqdorni tanlang yoki raqamlar bilan kiriting 👇`,
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "⭐️ 50 - 11 000 so'm", callback_data: "STARS_50" },
              { text: "⭐️ 75 - 16 500 so'm", callback_data: "STARS_75" }
            ],
            [
              { text: "⭐️ 100 - 22 000 so'm", callback_data: "STARS_100" },
              { text: "⭐️ 150 - 33 000 so'm", callback_data: "STARS_150" }
            ],
            [
              { text: "⭐️ 250 - 55 000 so'm", callback_data: "STARS_250" },
              { text: "⭐️ 350 - 77 000 so'm", callback_data: "STARS_350" }
            ],
            [
              { text: "⭐️ 500 - 110 000 so'm", callback_data: "STARS_500" },
              { text: "⭐️ 750 - 165 000 so'm", callback_data: "STARS_750" }
            ],
            [
              { text: "⭐️ 1000 - 220 000 so'm", callback_data: "STARS_1000" },
              { text: "⭐️ 1500 - 330 000 so'm", callback_data: "STARS_1500" }
            ],
            [
              { text: "⭐️ 2500 - 550 000 so'm", callback_data: "STARS_2500" },
              { text: "⭐️ 5000 - 1 100 000 so'm", callback_data: "STARS_5000" }
            ],
            [
              { text: "⭐️ 10000 - 2 200 000 so'm", callback_data: "STARS_10000" }
            ],
            [
              { text: "⬅️ Orqaga", callback_data: "BACK_HOME" }
            ]

          ]
        }
      }
    )
  }


  if (data === "premium") {
    await bot.answerCallbackQuery(query.id);

    return bot.editMessageText(`<b> 💎 Telegram Premium buyurtma</b>
        
📅 Qancha muddatlik Premium paket sotib olmoqchisiz tanlang:
        
💎 Mavjud paketlar: 
└ 🕐 3 oylik: 169.990 so'm
└ 🕐 6 oylik: 209.990 so'm
└ 🕐 1 yillik: 364.990 so'm

🎯 Tanlang: `,
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "💎 1 oylik - 47 990 so'm", callback_data: "PREMIUM_1" },
              { text: "💎 3 oylik - 169 990 so'm", callback_data: "PREMIUM_3" },

            ],
            [
              { text: "💎 6 oylik - 209 990 so'm", callback_data: "PREMIUM_6" },
              { text: "💎 1 yillik - 364 990 so'm", callback_data: "PREMIUM_12" },
            ],
            [
              { text: "⬅️ Orqaga", callback_data: "BACK_HOME" }
            ]
          ]
        }
      }
    );
  }

  if (data === "PREMIUM_1") {
    await bot.answerCallbackQuery(query.id);


    return bot.editMessageText(`👑 Premium sotib olish

📊 Buyurtma ma'lumotlari:
└ 🎯 Miqdor:  1 oylik
└ 💰 Narxi: 47 990.00 so'm
        
<b>Hurmatli mijoz, 1 oylik Premium paket yo'qligi sababli uni to'g'ridan to'gri onlayn tarzida sotib olish mumkin emas. Shuning uchun, Bizning adminizga bo'glanib 1 oylik premium paketni xarid qilishingiz mumkin.</b>

<blockquote><b>Noqulayliklar uchun uzur soraymiz.</b></blockquote>`, {

      chat_id: chatId,
      message_id: messageId,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "📲 Admin bilan bog'lanish", url: "https://t.me/AutoStarsAdmin" }
          ],
          [
            { text: "⬅️ Orqaga", callback_data: "BACK_PREMIUM_PAGE" }
          ]
        ]

      }
    }
    )

  }

  if (data === "PREMIUM_3") {
    await bot.answerCallbackQuery(query.id);


    return bot.editMessageText(`👑 Premium sotib olish
        
📊 Buyurtma ma'lumotlari:
└ 🎯 Miqdor:  3 oylik
└ 💰 Narxi: 169 990.00 so'm
        
👤 Kimga yuboramiz?
📝 @username kiriting:`,
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard:
            [
              [
                { text: "👤 O'zimga", callback_data: "BUY_PREMIUM_3" }
              ],
              [
                { text: "⬅️ Orqaga", callback_data: "BACK_PREMIUM_PAGE" }
              ]

            ]
        }
      }
    )
  }

  if (data === "PREMIUM_6") {
    await bot.answerCallbackQuery(query.id);
    return bot.editMessageText(`👑 Premium sotib olish
        
📊 Buyurtma ma'lumotlari:
└ 🎯 Miqdor:  6 oylik
└ 💰 Narxi: 209 990.00 so'm
        
👤 Kimga yuboramiz?
📝 @username kiriting:`,
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard:
            [
              [
                { text: "👤 O'zimga", callback_data: "BUY_PREMIUM_6" }
              ],
              [
                { text: "⬅️ Orqaga", callback_data: "BACK_PREMIUM_PAGE" }
              ]

            ]
        }
      })

  }

  if (data === "PREMIUM_12") {
    await bot.answerCallbackQuery(query.id);
    return bot.editMessageText(`👑 Premium sotib olish
          
📊 Buyurtma ma'lumotlari:
└ 🎯 Miqdor:  1 Yillik
└ 💰 Narxi: 364 990.00 so'm
          
👤 Kimga yuboramiz?
📝 @username kiriting:`,
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard:
            [
              [
                { text: "👤 O'zimga", callback_data: "BUY_PREMIUM_12" }
              ],
              [
                { text: "⬅️ Orqaga", callback_data: "BACK_PREMIUM_PAGE" }
              ]

            ]
        }
      })



  }

  if (data === "BACK_PREMIUM_PAGE") {
    await bot.answerCallbackQuery(query.id);
    return bot.editMessageText(`<b> 💎 Telegram Premium buyurtma</b>
            
📅 Qancha muddatlik Premium paket sotib olmoqchisiz tanlang:

💎 Mavjud paketlar: 
└ 🕐 3 oylik: 169 990 so'm
└ 🕐 6 oylik: 209 990 so'm
└ 🕐 1 yillik: 364 990 so'm

🎯 Tanlang: `,
      {

        chat_id: chatId,
        message_id: messageId,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "💎 1 oylik - 47 990 so'm", callback_data: "PREMIUM_1" },
              { text: "💎 3 oylik - 169 990 so'm", callback_data: "PREMIUM_3" },

            ],
            [
              { text: "💎 6 oylik - 209 990 so'm", callback_data: "PREMIUM_6" },
              { text: "💎 1 yillik - 364 990 so'm", callback_data: "PREMIUM_12" },
            ],
            [
              { text: "⬅️ Orqaga", callback_data: "BACK_HOME" }
            ]
          ]
        }
      }


    )
  }




});






bot.on("message", async (message) => {
  if (!message.text) return;
  if (message.text.startsWith("/")) return;

  const userId = message.from.id;
  const chatId = message.chat.id;
  const messageId = message.message_id;

  const state = userState[userId];
  if (!state) return;


  if (state.step === "WAIT_STARS") {

    const stars = parseInt(message.text.trim());
    if (isNaN(stars)) return;

    if (stars < 50 || stars > 10000) {
      return bot.sendMessage(
        chatId,
        "❗ Stars miqdori 50–10000 oralig‘ida bo‘lishi kerak"
      );
    }

    const price = STAR_PACKAGES[stars] ?? stars * STAR_PRICE_PER_ONE;


    userState[userId] = {
      step: "WAIT_USERNAME",
      stars
    };



    return bot.sendMessage(
      chatId,
      `⭐️ Stars buyurtma

📊 Buyurtma ma'lumotlari:
└ 🎯 Miqdor: ${stars} ⭐️
└ 💰 Narxi: ${price.toLocaleString()}.00 so'm

👤 Kimga yuboramiz?
📝 @username kiriting:`,
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "👤 O'zimga", callback_data: `BUY_STARS_${stars}` }
            ],
            [
              { text: "⬅️ Orqaga", callback_data: "BACK_STARS_PAGE" }
            ]
          ]
        }
      }
    );
  }


  if (state.step === "WAIT_USERNAME") {
    const username = message.text.trim();

    if (!username.startsWith("@")) {
      return bot.sendMessage(
        chatId,
        "❗ Username @ bilan boshlanishi kerak"
      );
    }


    const stars = state.stars;
    const price = STAR_PACKAGES[stars] ?? stars * STAR_PRICE_PER_ONE;

    db.prepare(`    INSERT INTO orders (user_id, stars, status)
    VALUES (?, ?, 'paid')
  `).run(userId, stars);


    const user = db.prepare("SELECT ref_by FROM users WHERE user_id = ?").get(userId)

    if (user?.ref_by) {
      db.prepare(`
      UPDATE users
      SET balance = balance + 5
      WHERE user_id = ?
    `).run(user.ref_by);
    }

    delete userState[userId];

    return bot.sendMessage(
      chatId,
      `✅ Buyurtma qabul qilindi!
      
      👤 Foydalanuvchi: ${username}
      ⭐️ Stars: ${stars}
      💰 Narxi: ${price.toLocaleString()}.00 so'm
      
      🎁 Referal bonus hisoblandi
      💳 To‘lovni amalga oshiring 👇`
    );

  }


});



import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
dotenv.config();


const Token = process.env.TOKEN
const bot = new TelegramBot(Token, { polling: true });



console.log("Bot is running...");

const CHANNELS = ["@AutoStarsNews"];

async function checkSubscription(userId) {
  for (const channel of CHANNELS) {
    try {
      const member = await bot.getChatMember(channel, userId);
      if (member.status === "left" || member.status === "kicked") {
        return false;
      }
    } catch (e) {
      return false;
    }
  }
  return true;
}

bot.onText(/\/start/, async (message) => {
  const chatId = message.chat.id;
  const isSubscribed = await checkSubscription(message.from.id);

  if (!isSubscribed) {
    return bot.sendMessage(
      chatId,
      "❗ Botdan foydalanish uchun quyidagi kanalga obuna bo‘ling 👇",
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "📢 Kanalga obuna bo‘lish",
                url: "https://t.me/AutoStarsNews"
              }
            ],
            [
              {
                text: "✅ Tekshirish",
                callback_data: "CHECK_SUB"
              }
            ]
          ]
        }
      }
    );
  }

  bot.sendMessage(chatId, "Xush kelibsiz 👋");
});

bot.on("callback_query", async (q) => {
  if (q.data !== "CHECK_SUB") return;

  const chatId = q.message.chat.id;
  const userId = q.from.id;

  const isSubscribed = await checkSubscription(userId);

  if (!isSubscribed) {
    return bot.answerCallbackQuery(q.id, {
      text: "❌ Hali obuna bo‘lmagansiz",
      show_alert: true
    });
  }

  await bot.answerCallbackQuery(q.id);
  bot.sendMessage(chatId, "✅ Rahmat! Endi botdan foydalanishingiz mumkin 🎉");
});


bot.onText(/\/start/, (message) => {
  bot.sendMessage(
    message.chat.id,
    `${message.chat.first_name} 👋 Assalomu alaykum, botga xush kelibsiz!

🛒 Botimiz orqali arzonlashtirilgan «Stars va Premium» larni xarid qilishingiz mumkin

Quyidagi menyudan keraklisini tanlang 👇`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "⭐️ Stars ", callback_data: "buy_stars" },
            { text: "💎 Premium", callback_data: "premium" }
          ],
          [
            {
              text: "🔗 Do‘stlarga ulashish",
              url: "https://t.me/AutoStarsBuyBot"
            }
          ]
        ]

      }
    }
  );
});

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;

  // loadingni o‘chiradi
  await bot.answerCallbackQuery(query.id);

  if (data === "buy_stars") {
    bot.editMessageText(
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

  if (data === "BACK_HOME") {
    bot.editMessageText(
      `${query.from.first_name} 👋 Assalomu alaykum!

🛒 Botimiz orqali arzonlashtirilgan «Stars» larni xarid qilishingiz mumkin

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
              {
                text: "🔗 Do‘stlarga ulashish",
                url: "https://t.me/share/url?url=https://t.me/AutoStarsBuyBot?start=⭐️ Arzon Stars va Premium! Shu bot orqali sotib oling 👇"
              }

            ]
          ]
        }
      }
    );
  }
});



import TelegramBot from "node-telegram-bot-api";
import db from "./database.js";

// Admin funksiyalari
export function setupAdminHandlers(bot, ADMIN_ID) {
  
  // Broadcast state
  let broadcastState = {};
  
  // ==================== ADMIN MENYU ====================
  
  bot.onText(/\/admin/, async (msg) => {
    const userId = msg.from.id;
    const chatId = msg.chat.id;

    if (userId !== ADMIN_ID) {
      return bot.sendMessage(chatId, "❌ Sizda admin huquqi yo'q");
    }

    bot.sendMessage(
      chatId,
      `🔐 <b>Admin Panel</b>\n\n` +
      `📊 <b>Statistika:</b>\n` +
      `/stats - Umumiy statistika\n` +
      `/revenue - Daromad hisoboti\n` +
      `/top_users - Top foydalanuvchilar\n\n` +
      `📦 <b>Buyurtmalar:</b>\n` +
      `/orders_pending - Kutilayotgan\n` +
      `/orders_today - Bugungi\n` +
      `/orders_all - Barcha\n\n` +
      `👥 <b>Foydalanuvchilar:</b>\n` +
      `/users_stats - Statistika\n` +
      `/users_list - Ro'yxat\n\n` +
      `💰 <b>Balans:</b>\n` +
      `/bot_balance - Bot balansi\n` +
      `/add_bot_balance - Balans to'ldirish\n\n` +
      `📢 <b>Boshqalar:</b>\n` +
      `/broadcast - Xabar yuborish\n` +
      `/settings - Sozlamalar`,
      { parse_mode: "HTML" }
    );
  });

  // ==================== STATISTIKA ====================
  
  bot.onText(/\/stats/, async (msg) => {
    const userId = msg.from.id;
    const chatId = msg.chat.id;

    if (userId !== ADMIN_ID) return;

    try {
      const totalUsers = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
      const activeUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE is_active = 1").get().count;
      const totalOrders = db.prepare("SELECT COUNT(*) as count FROM orders").get().count;
      const completedOrders = db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'completed'").get().count;
      const pendingOrders = db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'").get().count;
      const totalRevenue = db.prepare("SELECT COALESCE(SUM(price), 0) as total FROM orders WHERE status = 'completed'").get().total;
      const todayRevenue = db.prepare("SELECT COALESCE(SUM(price), 0) as total FROM orders WHERE status = 'completed' AND DATE(created_at) = DATE('now')").get().total;
      const todayOrders = db.prepare("SELECT COUNT(*) as count FROM orders WHERE DATE(created_at) = DATE('now')").get().count;
      const todayUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE DATE(created_at) = DATE('now')").get().count;

      bot.sendMessage(
        chatId,
        `📊 <b>Umumiy Statistika</b>\n\n` +
        `👥 <b>Foydalanuvchilar:</b>\n` +
        `   ├ Jami: ${totalUsers}\n` +
        `   ├ Faol: ${activeUsers}\n` +
        `   └ Bugun: ${todayUsers}\n\n` +
        `📦 <b>Buyurtmalar:</b>\n` +
        `   ├ Jami: ${totalOrders}\n` +
        `   ├ Bajarilgan: ${completedOrders}\n` +
        `   ├ Kutilmoqda: ${pendingOrders}\n` +
        `   └ Bugun: ${todayOrders}\n\n` +
        `💰 <b>Daromad:</b>\n` +
        `   ├ Jami: ${totalRevenue.toLocaleString()} so'm\n` +
        `   └ Bugun: ${todayRevenue.toLocaleString()} so'm`,
        { parse_mode: "HTML" }
      );
    } catch (error) {
      bot.sendMessage(chatId, "❌ Statistika olishda xato: " + error.message);
    }
  });
  

  // Daromad hisoboti
  bot.onText(/\/revenue/, async (msg) => {
    const userId = msg.from.id;
    const chatId = msg.chat.id;

    if (userId !== ADMIN_ID) return;

    try {
      const today = db.prepare("SELECT COALESCE(SUM(price), 0) as total FROM orders WHERE status = 'completed' AND DATE(created_at) = DATE('now')").get().total;
      const yesterday = db.prepare("SELECT COALESCE(SUM(price), 0) as total FROM orders WHERE status = 'completed' AND DATE(created_at) = DATE('now', '-1 day')").get().total;
      const week = db.prepare("SELECT COALESCE(SUM(price), 0) as total FROM orders WHERE status = 'completed' AND created_at >= datetime('now', '-7 days')").get().total;
      const month = db.prepare("SELECT COALESCE(SUM(price), 0) as total FROM orders WHERE status = 'completed' AND created_at >= datetime('now', '-30 days')").get().total;
      const total = db.prepare("SELECT COALESCE(SUM(price), 0) as total FROM orders WHERE status = 'completed'").get().total;

      const starsRevenue = db.prepare("SELECT COALESCE(SUM(price), 0) as total FROM orders WHERE status = 'completed' AND product_type = 'stars'").get().total;
      const premiumRevenue = db.prepare("SELECT COALESCE(SUM(price), 0) as total FROM orders WHERE status = 'completed' AND product_type = 'premium'").get().total;

      bot.sendMessage(
        chatId,
        `💰 <b>Daromad Hisoboti</b>\n\n` +
        `📅 <b>Vaqt bo'yicha:</b>\n` +
        `   ├ Bugun: ${today.toLocaleString()} so'm\n` +
        `   ├ Kecha: ${yesterday.toLocaleString()} so'm\n` +
        `   ├ Hafta: ${week.toLocaleString()} so'm\n` +
        `   ├ Oy: ${month.toLocaleString()} so'm\n` +
        `   └ Jami: ${total.toLocaleString()} so'm\n\n` +
        `📦 <b>Mahsulot bo'yicha:</b>\n` +
        `   ├ ⭐️ Stars: ${starsRevenue.toLocaleString()} so'm\n` +
        `   └ 💎 Premium: ${premiumRevenue.toLocaleString()} so'm`,
        { parse_mode: "HTML" }
      );
    } catch (error) {
      bot.sendMessage(chatId, "❌ Xato: " + error.message);
    }
  });

  // Top foydalanuvchilar
  bot.onText(/\/top_users/, async (msg) => {
    const userId = msg.from.id;
    const chatId = msg.chat.id;

    if (userId !== ADMIN_ID) return;

    try {
      const topSpenders = db.prepare(`
        SELECT u.user_id, u.username, u.first_name, 
               COUNT(o.order_id) as order_count,
               COALESCE(SUM(o.price), 0) as total_spent
        FROM users u
        LEFT JOIN orders o ON u.user_id = o.user_id AND o.status = 'completed'
        GROUP BY u.user_id
        HAVING order_count > 0
        ORDER BY total_spent DESC
        LIMIT 10
      `).all();

      const topReferrers = db.prepare(`
        SELECT u.user_id, u.username, u.first_name,
               COUNT(r.user_id) as referral_count
        FROM users u
        LEFT JOIN users r ON r.ref_by = u.user_id
        GROUP BY u.user_id
        HAVING referral_count > 0
        ORDER BY referral_count DESC
        LIMIT 10
      `).all();

      let message = `🏆 <b>Top Foydalanuvchilar</b>\n\n`;
      
      message += `💰 <b>Eng ko'p xarajat qilganlar:</b>\n`;
      topSpenders.forEach((user, index) => {
        const username = user.username ? `@${user.username}` : user.first_name;
        const userLink = `<a href="tg://user?id=${user.user_id}">${username}</a>`;
        message += `${index + 1}. ${userLink}\n`;
        message += `   └ ${user.order_count} ta · ${user.total_spent.toLocaleString()} so'm\n`;
      });

      message += `\n👥 <b>Eng ko'p referal:</b>\n`;
      topReferrers.forEach((user, index) => {
        const username = user.username ? `@${user.username}` : user.first_name;
        const userLink = `<a href="tg://user?id=${user.user_id}">${username}</a>`;
        message += `${index + 1}. ${userLink}\n`;
        message += `   └ ${user.referral_count} ta do'st\n`;
      });

      bot.sendMessage(chatId, message, { parse_mode: "HTML" });
    } catch (error) {
      bot.sendMessage(chatId, "❌ Xato: " + error.message);
    }
  });

  // ==================== BUYURTMALAR ====================
  
  // Kutilayotgan buyurtmalar
  bot.onText(/\/orders_pending/, async (msg) => {
    const userId = msg.from.id;
    const chatId = msg.chat.id;

    if (userId !== ADMIN_ID) return;

    try {
      const orders = db.prepare(`
        SELECT o.*, u.username, u.first_name 
        FROM orders o 
        LEFT JOIN users u ON o.user_id = u.user_id 
        WHERE o.status = 'pending'
        ORDER BY o.created_at DESC 
        LIMIT 20
      `).all();

      if (orders.length === 0) {
        return bot.sendMessage(chatId, "✅ Kutilayotgan buyurtmalar yo'q");
      }

      let message = `⏳ <b>Kutilayotgan buyurtmalar (${orders.length}):</b>\n\n`;

      orders.forEach(order => {
        const username = order.username ? `@${order.username}` : order.first_name;
        const userLink = `<a href="tg://user?id=${order.user_id}">${username}</a>`;
        const icon = order.product_type === 'stars' ? '⭐️' : '💎';
        
        message += `🆔 <code>${order.order_id}</code> | ${userLink}\n`;
        message += `${icon} ${order.amount} - ${order.price.toLocaleString()} so'm\n`;
        message += `👤 ${order.recipient_username}\n`;
        message += `📅 ${new Date(order.created_at).toLocaleString('uz-UZ')}\n\n`;
      });

      // Inline tugmalar - bitta xabarda 10 tagacha
      const buttons = orders.slice(0, 10).map(o => [{
        text: `✅ Tasdiqlash #${o.order_id}`,
        callback_data: `ADMIN_APPROVE_${o.order_id}`
      }]);

      bot.sendMessage(chatId, message, { 
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: buttons
        }
      });
    } catch (error) {
      bot.sendMessage(chatId, "❌ Xato: " + error.message);
    }
  });

  // Bugungi buyurtmalar
  bot.onText(/\/orders_today/, async (msg) => {
    const userId = msg.from.id;
    const chatId = msg.chat.id;

    if (userId !== ADMIN_ID) return;

    try {
      const orders = db.prepare(`
        SELECT o.*, u.username, u.first_name 
        FROM orders o 
        LEFT JOIN users u ON o.user_id = u.user_id 
        WHERE DATE(o.created_at) = DATE('now')
        ORDER BY o.created_at DESC
      `).all();

      if (orders.length === 0) {
        return bot.sendMessage(chatId, "📅 Bugun buyurtmalar yo'q");
      }

      const completed = orders.filter(o => o.status === 'completed').length;
      const pending = orders.filter(o => o.status === 'pending').length;
      const revenue = orders.filter(o => o.status === 'completed').reduce((sum, o) => sum + o.price, 0);

      let message = `📅 <b>Bugungi buyurtmalar:</b>\n\n`;
      message += `📊 Jami: ${orders.length}\n`;
      message += `✅ Bajarilgan: ${completed}\n`;
      message += `⏳ Kutilmoqda: ${pending}\n`;
      message += `💰 Daromad: ${revenue.toLocaleString()} so'm\n\n`;
      message += `─────────────\n\n`;

      orders.slice(0, 20).forEach(order => {
        const username = order.username ? `@${order.username}` : order.first_name;
        const userLink = `<a href="tg://user?id=${order.user_id}">${username}</a>`;
        const icon = order.product_type === 'stars' ? '⭐️' : '💎';
        const statusIcon = order.status === 'completed' ? '✅' : '⏳';
        
        message += `${statusIcon} <code>#${order.order_id}</code> | ${userLink}\n`;
        message += `${icon} ${order.amount} - ${order.price.toLocaleString()} so'm\n\n`;
      });

      bot.sendMessage(chatId, message, { parse_mode: "HTML" });
    } catch (error) {
      bot.sendMessage(chatId, "❌ Xato: " + error.message);
    }
  });

  // ==================== FOYDALANUVCHILAR ====================
  
  bot.onText(/\/users_stats/, async (msg) => {
    const userId = msg.from.id;
    const chatId = msg.chat.id;

    if (userId !== ADMIN_ID) return;

    try {
      const totalUsers = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
      const todayUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE DATE(created_at) = DATE('now')").get().count;
      const weekUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE created_at >= datetime('now', '-7 days')").get().count;
      const monthUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE created_at >= datetime('now', '-30 days')").get().count;
      const activeUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE is_active = 1").get().count;

      bot.sendMessage(
        chatId,
        `👥 <b>Foydalanuvchilar Statistikasi</b>\n\n` +
        `📊 Jami: ${totalUsers}\n` +
        `✅ Faol: ${activeUsers}\n` +
        `📅 Bugun: ${todayUsers}\n` +
        `📆 Hafta: ${weekUsers}\n` +
        `📆 Oy: ${monthUsers}`,
        { parse_mode: "HTML" }
      );
    } catch (error) {
      bot.sendMessage(chatId, "❌ Xato: " + error.message);
    }
  });

  // ==================== BOT BALANSI ====================
  
  bot.onText(/\/bot_balance/, async (msg) => {
    const userId = msg.from.id;
    const chatId = msg.chat.id;

    if (userId !== ADMIN_ID) return;

    try {
      const totalOrdered = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM orders
        WHERE status = 'completed' AND product_type = 'stars'
      `).get().total;

      const totalSent = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM deliveries
        WHERE delivery_status = 'delivered' AND product_type = 'stars'
      `).get().total;

      const estimatedBalance = totalOrdered - totalSent;

      bot.sendMessage(
        chatId,
        `💰 <b>Bot Balansi</b>\n\n` +
        `📊 Jami sotilgan: ${totalOrdered} ⭐️\n` +
        `✅ Yuborilgan: ${totalSent} ⭐️\n` +
        `💳 Qoldiq (taxminiy): ${estimatedBalance} ⭐️\n\n` +
        `⚠️ <b>Muhim:</b>\n` +
        `Haqiqiy balansni @BotFather dan tekshiring!\n\n` +
        `💡 Balans to'ldirish: /add_bot_balance`,
        { parse_mode: "HTML" }
      );
    } catch (error) {
      bot.sendMessage(chatId, "❌ Xato: " + error.message);
    }
  });

  bot.onText(/\/add_bot_balance/, async (msg) => {
    const userId = msg.from.id;
    const chatId = msg.chat.id;

    if (userId !== ADMIN_ID) return;

    bot.sendMessage(
      chatId,
      `💳 <b>Bot Balansini To'ldirish</b>\n\n` +
      `<b>1️⃣ BotFather orqali:</b>\n` +
      `   • @BotFather ga o'ting\n` +
      `   • /mybots → Botingiz\n` +
      `   • Bot Settings → Payments\n` +
      `   • Balance → Add Stars\n\n` +
      `<b>2️⃣ Narxlar:</b>\n` +
      `   • 100 Stars ≈ 20,000 so'm\n` +
      `   • 500 Stars ≈ 100,000 so'm\n` +
      `   • 1000 Stars ≈ 200,000 so'm ⭐️\n` +
      `   • 5000 Stars ≈ 1,000,000 so'm\n\n` +
      `<b>3️⃣ Tavsiya:</b>\n` +
      `   Minimal 1000 Stars balans saqlang`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🤖 BotFather'ga O'tish", url: "https://t.me/BotFather" }]
          ]
        }
      }
    );
  });

  // ==================== BROADCAST ====================
  
  bot.onText(/\/broadcast/, (msg) => {
    const userId = msg.from.id;
    const chatId = msg.chat.id;

    if (userId !== ADMIN_ID) return;

    broadcastState[userId] = { active: true, step: 'waiting_message' };
    
    bot.sendMessage(
      chatId,
      `📢 <b>Xabar Yuborish</b>\n\n` +
      `Barcha foydalanuvchilarga yuborilishi kerak bo'lgan xabarni yozing.\n\n` +
      `Bekor qilish: /cancel`,
      { parse_mode: "HTML" }
    );
  });

  bot.onText(/\/cancel/, (msg) => {
    const userId = msg.from.id;
    const chatId = msg.chat.id;

    if (userId !== ADMIN_ID) return;

    delete broadcastState[userId];
    bot.sendMessage(chatId, "❌ Bekor qilindi");
  });

  // Broadcast xabarni yuborish
  bot.on("message", async (msg) => {
    const userId = msg.from.id;
    
    // Faqat admin va broadcast holatida
    if (userId !== ADMIN_ID || !broadcastState[userId]?.active) return;
    
    // Buyruq bo'lsa o'tkazib yuborish
    if (msg.text?.startsWith("/")) return;

    const chatId = msg.chat.id;
    delete broadcastState[userId];

    try {
      const users = db.prepare("SELECT user_id FROM users WHERE is_active = 1").all();
      
      let success = 0;
      let failed = 0;

      const statusMsg = await bot.sendMessage(
        chatId, 
        `📤 Xabar yuborilmoqda... 0/${users.length}`
      );

      for (const user of users) {
        try {
          // Text, photo, video va h.k. xabarlarni yuborish
          if (msg.text) {
            await bot.sendMessage(user.user_id, msg.text, {
              parse_mode: msg.entities ? "HTML" : undefined
            });
          } else if (msg.photo) {
            await bot.sendPhoto(user.user_id, msg.photo[msg.photo.length - 1].file_id, {
              caption: msg.caption
            });
          } else if (msg.video) {
            await bot.sendVideo(user.user_id, msg.video.file_id, {
              caption: msg.caption
            });
          }
          
          success++;
        } catch {
          failed++;
        }

        // Har 10 tadan keyin status yangilash
        if ((success + failed) % 10 === 0) {
          bot.editMessageText(
            `📤 Xabar yuborilmoqda... ${success + failed}/${users.length}`,
            { chat_id: chatId, message_id: statusMsg.message_id }
          ).catch(() => {});
        }
      }

      bot.editMessageText(
        `✅ <b>Xabar yuborildi!</b>\n\n` +
        `📊 Jami: ${users.length}\n` +
        `✅ Muvaffaqiyatli: ${success}\n` +
        `❌ Xato: ${failed}`,
        { 
          chat_id: chatId, 
          message_id: statusMsg.message_id,
          parse_mode: "HTML"
        }
      );

    } catch (error) {
      bot.sendMessage(chatId, "❌ Xato: " + error.message);
    }
  });

  // ==================== CALLBACK HANDLERS ====================
  
  // Buyurtmani tasdiqlash
  bot.on("callback_query", async (query) => {
    if (!query.data.startsWith("ADMIN_APPROVE_")) return;
    
    const userId = query.from.id;
    if (userId !== ADMIN_ID) return;

    const orderId = parseInt(query.data.replace("ADMIN_APPROVE_", ""));
    
    try {
      const order = db.prepare("SELECT * FROM orders WHERE order_id = ?").get(orderId);
      
      if (!order) {
        return bot.answerCallbackQuery(query.id, {
          text: "❌ Buyurtma topilmadi",
          show_alert: true
        });
      }

      if (order.status === "completed") {
        return bot.answerCallbackQuery(query.id, {
          text: "✅ Bu buyurtma allaqachon bajarilgan",
          show_alert: true
        });
      }

      // Buyurtmani tasdiqlash
      db.prepare("UPDATE orders SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE order_id = ?").run(orderId);

      // Delivery record
      db.prepare(`
        INSERT INTO deliveries (order_id, user_id, recipient_username, product_type, amount, delivery_status, delivery_method, delivered_at)
        VALUES (?, ?, ?, ?, ?, 'delivered', 'manual', CURRENT_TIMESTAMP)
      `).run(orderId, order.user_id, order.recipient_username, order.product_type, order.amount);

      // Foydalanuvchiga xabar yuborish
      bot.sendMessage(
        order.user_id,
        `✅ <b>Buyurtma bajarildi!</b>\n\n` +
        `🆔 Buyurtma: #${orderId}\n` +
        `📦 Mahsulot: ${order.product_type === 'stars' ? '⭐️' : '💎'} ${order.amount}\n` +
        `👤 Kimga: ${order.recipient_username}\n\n` +
        `🎉 Rahmat! Botimizdan foydalanganingiz uchun tashakkur!`,
        { parse_mode: "HTML" }
      ).catch(() => {});

      bot.answerCallbackQuery(query.id, {
        text: "✅ Buyurtma tasdiqlandi",
        show_alert: false
      });

      // Xabarni yangilash
      bot.editMessageText(
        `✅ Buyurtma #${orderId} admin tomonidan tasdiqlandi`,
        {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id
        }
      ).catch(() => {});

    } catch (error) {
      bot.answerCallbackQuery(query.id, {
        text: "❌ Xato: " + error.message,
        show_alert: true
      });
    }
  });
}
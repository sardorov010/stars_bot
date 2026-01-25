import TelegramBot from "node-telegram-bot-api";
import db from "./database.js";

/**
 * 🤖 AVTOMATIK STARS YUBORISH TIZIMI
 * Fayl nomi: auto-delivery.js
 */

class AutoStarsDelivery {
  constructor(bot, adminId) {
    this.bot = bot;
    this.adminId = adminId;
  }

  /**
   * 🎯 ASOSIY: Stars yuborish (Telegram Invoice orqali)
   */
  async sendStarsToUser(userId, amount, recipientUsername, orderId) {
    try {
      console.log(`🚀 Yuborish boshlandi: ${amount} Stars -> ${recipientUsername}`);

      // Stars invoice yaratish
      const invoice = await this.bot.sendInvoice(
        userId,
        `⭐️ ${amount} Telegram Stars`,
        `Sizning ${amount} Stars buyurtmangiz tayyor!\n\n` +
        `👤 Qabul qiluvchi: ${recipientUsername}\n` +
        `📦 Buyurtma: #${orderId}\n\n` +
        `💡 Quyidagi "Pay XTR" tugmasini bosing va Stars'ni qabul qiling!`,
        `STARS_DELIVERY_${orderId}_${Date.now()}`,
        "", // Provider token (Stars uchun bo'sh)
        "XTR", // Telegram Stars currency
        [
          {
            label: `${amount} ⭐️ Stars`,
            amount: amount
          }
        ]
      );

      console.log(`✅ Invoice yuborildi:`, invoice.message_id);

      // Delivery record
      db.prepare(`
        INSERT INTO deliveries 
        (order_id, user_id, recipient_username, product_type, amount, delivery_status, delivery_method)
        VALUES (?, ?, ?, 'stars', ?, 'sent', 'automatic_invoice')
      `).run(orderId, userId, recipientUsername, amount);

      return { success: true, method: 'invoice', invoice };

    } catch (error) {
      console.error("❌ Stars yuborishda xato:", error);
      
      db.prepare(`
        UPDATE deliveries 
        SET delivery_status = 'failed', error_message = ?
        WHERE order_id = ?
      `).run(error.message, orderId);

      throw error;
    }
  }

  /**
   * 💰 To'lov tasdiqlanganda
   */
  async processCompletedPayment(orderId) {
    try {
      console.log(`💳 To'lov tasdiqlandi: Order #${orderId}`);

      const order = db.prepare(`
        SELECT o.*, u.username, u.first_name 
        FROM orders o 
        LEFT JOIN users u ON o.user_id = u.user_id 
        WHERE o.order_id = ?
      `).get(orderId);

      if (!order) throw new Error("Buyurtma topilmadi");
      if (order.product_type !== 'stars') {
        console.log(`⏭️ Bu Premium, avtomatik yuborilmaydi`);
        return { success: false, reason: 'not_stars' };
      }

      await this.requestAdminApproval(order);
      return { success: true };

    } catch (error) {
      console.error("❌ Process payment xato:", error);
      
      await this.bot.sendMessage(
        this.adminId,
        `❌ <b>Avtomatik yuborishda xato!</b>\n\n` +
        `🆔 Order: #${orderId}\n` +
        `⚠️ Xato: ${error.message}\n\n` +
        `👨‍💼 /orders_pending ga o'ting`,
        { parse_mode: "HTML" }
      );

      throw error;
    }
  }

  /**
   * 👨‍💼 Admindan tasdiqlash so'rash
   */
  async requestAdminApproval(order) {
    const username = order.username ? `@${order.username}` : order.first_name;
    
    await this.bot.sendMessage(
      this.adminId,
      `💰 <b>YANGI TO'LOV!</b>\n\n` +
      `🆔 Buyurtma: #${order.order_id}\n` +
      `👤 User: <a href="tg://user?id=${order.user_id}">${username}</a>\n` +
      `⭐️ Stars: ${order.amount}\n` +
      `💵 Narxi: ${order.price.toLocaleString()} so'm\n` +
      `👥 Kimga: ${order.recipient_username}\n\n` +
      `❓ <b>Tasdiqlaysizmi?</b>\n` +
      `✅ Tasdiqlasangiz bot avtomatik Stars yuboradi!`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "✅ Tasdiqlash va Yuborish", callback_data: `AUTO_SEND_${order.order_id}` }],
            [
              { text: "❌ Rad etish", callback_data: `AUTO_CANCEL_${order.order_id}` },
              { text: "⏸ Keyinroq", callback_data: `AUTO_LATER_${order.order_id}` }
            ]
          ]
        }
      }
    );
  }

  /**
   * ✅ Admin tasdiqladi
   */
  async handleAdminApproval(orderId) {
    try {
      const order = db.prepare(`
        SELECT o.*, u.username, u.first_name 
        FROM orders o 
        LEFT JOIN users u ON o.user_id = u.user_id 
        WHERE o.order_id = ?
      `).get(orderId);

      if (!order) throw new Error("Buyurtma topilmadi");
      if (order.status !== 'completed') throw new Error("To'lov hali tasdiqlanmagan");

      const result = await this.sendStarsToUser(
        order.user_id,
        order.amount,
        order.recipient_username,
        orderId
      );

      if (result.success) {
        const username = order.username ? `@${order.username}` : order.first_name;
        
        await this.bot.sendMessage(
          order.user_id,
          `🎉 <b>TABRIKLAYMIZ!</b>\n\n` +
          `✅ To'lovingiz qabul qilindi!\n` +
          `⭐️ ${order.amount} Stars tayyor!\n\n` +
          `📲 <b>Yuqoridagi invoice ni oching</b> va "Pay XTR ${order.amount}" tugmasini bosing.\n\n` +
          `💡 Bu BEPUL - siz allaqachon to'lagansiz!\n` +
          `👤 Stars ${order.recipient_username} ga yuboriladi.\n\n` +
          `❓ Savollar: @AutoStarsAdmin`,
          { parse_mode: "HTML" }
        );

        await this.bot.sendMessage(
          this.adminId,
          `✅ <b>Yuborildi!</b>\n\n` +
          `🆔 Order: #${orderId}\n` +
          `⭐️ Stars: ${order.amount}\n` +
          `👤 User: ${username}`,
          { parse_mode: "HTML" }
        );

        return { success: true };
      }

    } catch (error) {
      console.error("❌ Approval xato:", error);
      
      await this.bot.sendMessage(
        this.adminId,
        `❌ <b>Yuborishda xato!</b>\n\n` +
        `🆔 Order: #${orderId}\n` +
        `⚠️ Xato: ${error.message}`,
        { parse_mode: "HTML" }
      );

      throw error;
    }
  }

  /**
   * ❌ Admin rad etdi
   */
  async handleAdminRejection(orderId) {
    try {
      db.prepare("UPDATE orders SET status = 'cancelled' WHERE order_id = ?").run(orderId);
      db.prepare("UPDATE deliveries SET delivery_status = 'cancelled', error_message = 'Admin rejected' WHERE order_id = ?").run(orderId);

      const order = db.prepare("SELECT * FROM orders WHERE order_id = ?").get(orderId);

      if (order) {
        await this.bot.sendMessage(
          order.user_id,
          `❌ <b>Buyurtma rad etildi</b>\n\n` +
          `🆔 Buyurtma: #${orderId}\n` +
          `💰 Summa: ${order.price.toLocaleString()} so'm\n\n` +
          `📞 Admin: @AutoStarsAdmin`,
          { parse_mode: "HTML" }
        );
      }

      return { success: true };
    } catch (error) {
      console.error("❌ Rejection xato:", error);
      throw error;
    }
  }

  /**
   * 🎛 Handler'larni o'rnatish
   */
  setupHandlers() {
    this.bot.on("callback_query", async (query) => {
      const data = query.data;
      const userId = query.from.id;

      if (userId !== this.adminId) return;

      if (data.startsWith("AUTO_SEND_")) {
        const orderId = parseInt(data.replace("AUTO_SEND_", ""));

        try {
          await this.bot.answerCallbackQuery(query.id, { text: "🚀 Yuborish...", show_alert: false });
          await this.handleAdminApproval(orderId);

          await this.bot.editMessageReplyMarkup(
            { inline_keyboard: [] },
            { chat_id: query.message.chat.id, message_id: query.message.message_id }
          );

          await this.bot.editMessageText(
            query.message.text + "\n\n✅ <b>YUBORILDI!</b>",
            { chat_id: query.message.chat.id, message_id: query.message.message_id, parse_mode: "HTML" }
          );

        } catch (error) {
          await this.bot.answerCallbackQuery(query.id, { text: `❌ ${error.message}`, show_alert: true });
        }
      }

      if (data.startsWith("AUTO_CANCEL_")) {
        const orderId = parseInt(data.replace("AUTO_CANCEL_", ""));

        try {
          await this.handleAdminRejection(orderId);
          await this.bot.answerCallbackQuery(query.id, { text: "❌ Rad etildi", show_alert: false });
          await this.bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: query.message.chat.id, message_id: query.message.message_id });
        } catch (error) {
          await this.bot.answerCallbackQuery(query.id, { text: `❌ ${error.message}`, show_alert: true });
        }
      }

      if (data.startsWith("AUTO_LATER_")) {
        await this.bot.answerCallbackQuery(query.id, { text: "⏸ Keyinroq", show_alert: false });
      }
    });

    this.bot.on("pre_checkout_query", async (query) => {
      try {
        await this.bot.answerPreCheckoutQuery(query.id, true);
      } catch (error) {
        console.error("Pre-checkout xato:", error);
        await this.bot.answerPreCheckoutQuery(query.id, false, { error_message: "Xatolik yuz berdi" });
      }
    });

    this.bot.on("successful_payment", async (msg) => {
      try {
        const payment = msg.successful_payment;
        const payload = payment.invoice_payload;

        const match = payload.match(/STARS_DELIVERY_(\d+)_/);
        if (!match) return;

        const orderId = parseInt(match[1]);

        db.prepare("UPDATE deliveries SET delivery_status = 'delivered', delivered_at = CURRENT_TIMESTAMP WHERE order_id = ?").run(orderId);

        await this.bot.sendMessage(
          msg.chat.id,
          `🎉 <b>MUVAFFAQIYATLI!</b>\n\n` +
          `✅ ${payment.total_amount} ⭐️ Stars qabul qilindi!\n` +
          `📦 Buyurtma: #${orderId}\n\n` +
          `🙏 Rahmat! Yana qaytib kelishingizni kutamiz!\n` +
          `📢 @AutoStarsNews`,
          { parse_mode: "HTML" }
        );

        await this.bot.sendMessage(
          this.adminId,
          `🎊 <b>Stars yetkazildi!</b>\n\n` +
          `🆔 Order: #${orderId}\n` +
          `⭐️ Stars: ${payment.total_amount}\n` +
          `✅ Delivered`,
          { parse_mode: "HTML" }
        );

      } catch (error) {
        console.error("Successful payment xato:", error);
      }
    });

    console.log("✅ Avtomatik delivery handler'lar o'rnatildi");
  }
}

export default AutoStarsDelivery;
import crypto from "crypto";
import db, { dbHelpers } from "./database.js";

// ==================== CLICK INTEGRATION ====================

class ClickPayment {
  constructor(config) {
    this.serviceId = config.serviceId;
    this.merchantId = config.merchantId;
    this.secretKey = config.secretKey;
    this.merchantUserId = config.merchantUserId;
  }

  // Click Invoice URL yaratish
  generateInvoiceUrl(orderId, amount, returnUrl = null) {
    const params = new URLSearchParams({
      service_id: this.serviceId,
      merchant_id: this.merchantId,
      amount: amount,
      transaction_param: orderId,
      merchant_user_id: this.merchantUserId,
      return_url: returnUrl || "https://t.me/AutoStarsBuyBot"
    });

    return `https://my.click.uz/services/pay?${params.toString()}`;
  }

  // Click imzo tekshirish
  verifySignature(params) {
    const signString = 
      params.click_trans_id +
      params.service_id +
      this.secretKey +
      params.merchant_trans_id +
      (params.merchant_prepare_id || "") +
      params.amount +
      params.action +
      params.sign_time;

    const hash = crypto
      .createHash("md5")
      .update(signString)
      .digest("hex");

    return hash === params.sign_string;
  }

  // Prepare so'rovini qayta ishlash
  async handlePrepare(params) {
    try {
      // Imzoni tekshirish
      if (!this.verifySignature(params)) {
        return {
          error: -1,
          error_note: "SIGN CHECK FAILED!"
        };
      }

      const orderId = parseInt(params.merchant_trans_id);
      
      // Buyurtmani tekshirish
      const order = db.prepare("SELECT * FROM orders WHERE order_id = ?").get(orderId);

      if (!order) {
        return {
          error: -5,
          error_note: "Order not found"
        };
      }

      if (order.status === "completed") {
        return {
          error: -4,
          error_note: "Already paid"
        };
      }

      // Summani tekshirish
      if (parseFloat(params.amount) !== order.price) {
        return {
          error: -2,
          error_note: "Incorrect amount"
        };
      }

      // Prepare qabul qilindi
      return {
        click_trans_id: params.click_trans_id,
        merchant_trans_id: orderId,
        merchant_prepare_id: Date.now(),
        error: 0,
        error_note: "Success"
      };

    } catch (error) {
      console.error("Click Prepare xato:", error);
      return {
        error: -8,
        error_note: "System error"
      };
    }
  }

  // Complete so'rovini qayta ishlash
  async handleComplete(params) {
    try {
      // Imzoni tekshirish
      if (!this.verifySignature(params)) {
        return {
          error: -1,
          error_note: "SIGN CHECK FAILED!"
        };
      }

      const orderId = parseInt(params.merchant_trans_id);
      
      // Buyurtmani tekshirish
      const order = db.prepare("SELECT * FROM orders WHERE order_id = ?").get(orderId);

      if (!order) {
        return {
          error: -5,
          error_note: "Order not found"
        };
      }

      if (params.error < 0) {
        // To'lov bekor qilindi
        dbHelpers.updateOrderStatus.run("cancelled", "cancelled", orderId);
        
        return {
          click_trans_id: params.click_trans_id,
          merchant_trans_id: orderId,
          merchant_confirm_id: Date.now(),
          error: 0,
          error_note: "Success"
        };
      }

      // To'lovni saqlash
      dbHelpers.createPayment.run(
        orderId,
        order.user_id,
        order.price,
        "click",
        params.click_trans_id,
        "completed"
      );

      // Buyurtma statusini yangilash
      dbHelpers.updateOrderStatus.run("completed", "completed", orderId);

      return {
        click_trans_id: params.click_trans_id,
        merchant_trans_id: orderId,
        merchant_confirm_id: Date.now(),
        error: 0,
        error_note: "Success"
      };

    } catch (error) {
      console.error("Click Complete xato:", error);
      return {
        error: -8,
        error_note: "System error"
      };
    }
  }
}

// ==================== PAYME INTEGRATION ====================

class PaymePayment {
  constructor(config) {
    this.merchantId = config.merchantId;
    this.secretKey = config.secretKey;
  }

  // Payme imzo tekshirish
  verifySignature(authorization) {
    const credentials = Buffer.from(authorization.replace("Basic ", ""), "base64").toString();
    const [username] = credentials.split(":");
    
    return username === `Paycom`;
  }

  // Base64 authorization tekshirish
  checkAuthorization(authorization) {
    try {
      const expectedAuth = Buffer.from(`Paycom:${this.secretKey}`).toString("base64");
      return authorization === `Basic ${expectedAuth}`;
    } catch {
      return false;
    }
  }

  // Payme so'rovlarini qayta ishlash
  async handleRequest(method, params, authorization) {
    try {
      // Authorization tekshirish
      if (!this.checkAuthorization(authorization)) {
        return {
          error: {
            code: -32504,
            message: "Insufficient privilege to perform this method"
          }
        };
      }

      switch (method) {
        case "CheckPerformTransaction":
          return await this.checkPerformTransaction(params);
        
        case "CreateTransaction":
          return await this.createTransaction(params);
        
        case "PerformTransaction":
          return await this.performTransaction(params);
        
        case "CancelTransaction":
          return await this.cancelTransaction(params);
        
        case "CheckTransaction":
          return await this.checkTransaction(params);
        
        case "GetStatement":
          return await this.getStatement(params);
        
        default:
          return {
            error: {
              code: -32601,
              message: "Method not found"
            }
          };
      }
    } catch (error) {
      console.error("Payme xato:", error);
      return {
        error: {
          code: -32400,
          message: "System error"
        }
      };
    }
  }

  // CheckPerformTransaction
  async checkPerformTransaction(params) {
    const orderId = params.account?.order_id;
    
    if (!orderId) {
      return {
        error: {
          code: -31050,
          message: "Order not found"
        }
      };
    }

    const order = db.prepare("SELECT * FROM orders WHERE order_id = ?").get(orderId);

    if (!order) {
      return {
        error: {
          code: -31050,
          message: "Order not found"
        }
      };
    }

    if (order.status === "completed") {
      return {
        error: {
          code: -31051,
          message: "Order already paid"
        }
      };
    }

    if (params.amount !== order.price * 100) { // Payme tiyin formatida
      return {
        error: {
          code: -31001,
          message: "Invalid amount"
        }
      };
    }

    return { result: { allow: true } };
  }

  // CreateTransaction
  async createTransaction(params) {
    const orderId = params.account?.order_id;
    const order = db.prepare("SELECT * FROM orders WHERE order_id = ?").get(orderId);

    if (!order) {
      return {
        error: {
          code: -31050,
          message: "Order not found"
        }
      };
    }

    // Transaction yaratish
    const transactionId = params.id;
    const createTime = Date.now();

    // Payme transaction'ni saqlash (payments jadvaliga)
    try {
      dbHelpers.createPayment.run(
        orderId,
        order.user_id,
        order.price,
        "payme",
        transactionId,
        "pending"
      );
    } catch (error) {
      // Agar transaction allaqachon mavjud bo'lsa
      const existingPayment = db.prepare(
        "SELECT * FROM payments WHERE telegram_payment_charge_id = ?"
      ).get(transactionId);

      if (existingPayment) {
        return {
          result: {
            create_time: createTime,
            transaction: existingPayment.payment_id,
            state: existingPayment.status === "completed" ? 2 : 1
          }
        };
      }
    }

    return {
      result: {
        create_time: createTime,
        transaction: transactionId,
        state: 1
      }
    };
  }

  // PerformTransaction
  async performTransaction(params) {
    const transactionId = params.id;
    
    const payment = db.prepare(
      "SELECT * FROM payments WHERE telegram_payment_charge_id = ?"
    ).get(transactionId);

    if (!payment) {
      return {
        error: {
          code: -31003,
          message: "Transaction not found"
        }
      };
    }

    // To'lovni tasdiqlash
    db.prepare(
      "UPDATE payments SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE payment_id = ?"
    ).run(payment.payment_id);

    // Buyurtmani yangilash
    dbHelpers.updateOrderStatus.run("completed", "completed", payment.order_id);

    return {
      result: {
        transaction: payment.payment_id,
        perform_time: Date.now(),
        state: 2
      }
    };
  }

  // CancelTransaction
  async cancelTransaction(params) {
    const transactionId = params.id;
    
    const payment = db.prepare(
      "SELECT * FROM payments WHERE telegram_payment_charge_id = ?"
    ).get(transactionId);

    if (!payment) {
      return {
        error: {
          code: -31003,
          message: "Transaction not found"
        }
      };
    }

    // To'lovni bekor qilish
    db.prepare(
      "UPDATE payments SET status = 'cancelled' WHERE payment_id = ?"
    ).run(payment.payment_id);

    dbHelpers.updateOrderStatus.run("cancelled", "cancelled", payment.order_id);

    return {
      result: {
        transaction: payment.payment_id,
        cancel_time: Date.now(),
        state: -1
      }
    };
  }

  // CheckTransaction
  async checkTransaction(params) {
    const transactionId = params.id;
    
    const payment = db.prepare(
      "SELECT * FROM payments WHERE telegram_payment_charge_id = ?"
    ).get(transactionId);

    if (!payment) {
      return {
        error: {
          code: -31003,
          message: "Transaction not found"
        }
      };
    }

    return {
      result: {
        create_time: new Date(payment.created_at).getTime(),
        perform_time: payment.completed_at ? new Date(payment.completed_at).getTime() : 0,
        transaction: payment.payment_id,
        state: payment.status === "completed" ? 2 : payment.status === "cancelled" ? -1 : 1
      }
    };
  }

  // GetStatement
  async getStatement(params) {
    const { from, to } = params;
    
    const transactions = db.prepare(`
      SELECT * FROM payments 
      WHERE payment_method = 'payme' 
      AND created_at BETWEEN datetime(?, 'unixepoch') AND datetime(?, 'unixepoch')
    `).all(from / 1000, to / 1000);

    return {
      result: {
        transactions: transactions.map(t => ({
          id: t.telegram_payment_charge_id,
          time: new Date(t.created_at).getTime(),
          amount: t.amount * 100,
          account: { order_id: t.order_id },
          create_time: new Date(t.created_at).getTime(),
          perform_time: t.completed_at ? new Date(t.completed_at).getTime() : 0,
          state: t.status === "completed" ? 2 : t.status === "cancelled" ? -1 : 1
        }))
      }
    };
  }
}

export { ClickPayment, PaymePayment };
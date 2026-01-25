import express from "express";
import dotenv from "dotenv";
import { ClickPayment, PaymePayment } from "./payment.js";  // ✅ To'g'rilandi
import db from "./database.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Click va Payme konfiguratsiya
const clickPayment = new ClickPayment({
  serviceId: process.env.CLICK_SERVICE_ID,
  merchantId: process.env.CLICK_MERCHANT_ID,
  secretKey: process.env.CLICK_SECRET_KEY,
  merchantUserId: process.env.CLICK_MERCHANT_USER_ID
});

const paymePayment = new PaymePayment({
  merchantId: process.env.PAYME_MERCHANT_ID,
  secretKey: process.env.PAYME_SECRET_KEY
});

// ==================== CLICK ENDPOINTS ====================

app.post("/api/click/prepare", async (req, res) => {
  console.log("📥 Click Prepare:", req.body);
  
  try {
    const result = await clickPayment.handlePrepare(req.body);
    console.log("📤 Click Prepare Response:", result);
    res.json(result);
  } catch (error) {
    console.error("Click Prepare Error:", error);
    res.json({ error: -8, error_note: "System error" });
  }
});

app.post("/api/click/complete", async (req, res) => {
  console.log("📥 Click Complete:", req.body);
  
  try {
    const result = await clickPayment.handleComplete(req.body);
    
    // 🆕 AVTOMATIK YUBORISH
    if (result.error === 0 && req.body.error >= 0) {
      const orderId = parseInt(req.body.merchant_trans_id);
      const order = db.prepare("SELECT * FROM orders WHERE order_id = ?").get(orderId);
      
      if (order && order.status === 'completed') {
        // Avtomatik yuborish funksiyasini chaqirish
        if (global.notifyAutoDelivery) {
          await global.notifyAutoDelivery(orderId);
          console.log(`🚀 Avtomatik yuborish boshlandi: Order #${orderId}`);
        }
      }
    }
    
    console.log("📤 Click Complete Response:", result);
    res.json(result);
  } catch (error) {
    console.error("Click Complete Error:", error);
    res.json({ error: -8, error_note: "System error" });
  }
});

// ==================== PAYME ENDPOINTS ====================

app.post("/api/payme", async (req, res) => {
  console.log("📥 Payme Request:", req.body);
  
  try {
    const { method, params, id } = req.body;
    const authorization = req.headers.authorization;
    
    const result = await paymePayment.handleRequest(method, params, authorization);
    
    // 🆕 AVTOMATIK YUBORISH
    if (method === "PerformTransaction" && !result.error) {
      const payment = db.prepare(
        "SELECT * FROM payments WHERE telegram_payment_charge_id = ?"
      ).get(params.id);

      if (payment) {
        const order = db.prepare("SELECT * FROM orders WHERE order_id = ?").get(payment.order_id);

        if (order && order.status === 'completed') {
          // Avtomatik yuborish
          if (global.notifyAutoDelivery) {
            await global.notifyAutoDelivery(payment.order_id);
            console.log(`🚀 Avtomatik yuborish boshlandi: Order #${payment.order_id}`);
          }
        }
      }
    }
    
    const response = {
      jsonrpc: "2.0",
      id: id,
      ...result
    };
    
    console.log("📤 Payme Response:", response);
    res.json(response);
  } catch (error) {
    console.error("Payme Error:", error);
    res.json({
      jsonrpc: "2.0",
      id: req.body.id,
      error: { code: -32400, message: "System error" }
    });
  }
});

// ==================== TEST & HEALTH ====================

app.get("/health", (req, res) => {
  res.json({ 
    status: "OK", 
    timestamp: new Date().toISOString(),
    features: {
      autoDelivery: "enabled",
      click: "enabled",
      payme: "enabled"
    }
  });
});

app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Auto Stars Bot - Payment Server</title>
      <style>
        body { 
          font-family: Arial; 
          max-width: 800px; 
          margin: 50px auto; 
          padding: 20px;
          background: #f5f5f5;
        }
        .container {
          background: white;
          padding: 30px;
          border-radius: 10px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 { color: #333; }
        .status { color: #28a745; font-weight: bold; }
        .feature { 
          background: #e7f3ff; 
          padding: 10px; 
          margin: 10px 0; 
          border-radius: 5px;
          border-left: 4px solid #007bff;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🤖 Auto Stars Bot</h1>
        <h2>Payment Server <span class="status">✅ RUNNING</span></h2>
        
        <div class="feature">
          <strong>🚀 Avtomatik Stars Yuborish</strong><br>
          To'lov tasdiqlangandan keyin bot avtomatik Stars yuboradi!
        </div>
        
        <h3>📡 Endpoints:</h3>
        <p><code>POST /api/click/prepare</code></p>
        <p><code>POST /api/click/complete</code></p>
        <p><code>POST /api/payme</code></p>
        <p><code>GET /health</code></p>
        
        <h3>⚙️ Configuration:</h3>
        <p>Port: <strong>${PORT}</strong></p>
        <p>Auto Delivery: <strong>✅ Enabled</strong></p>
      </div>
    </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`🚀 Payment server ${PORT} portda ishlamoqda`);
  console.log(`🤖 Avtomatik Stars yuborish faol!`);
  console.log(`📡 Click: http://localhost:${PORT}/api/click/*`);
  console.log(`📡 Payme: http://localhost:${PORT}/api/payme`);
});
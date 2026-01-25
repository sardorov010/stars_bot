import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database yaratish
const db = new Database(path.join(__dirname, "telegram_bot.db"));

// WAL mode - performance uchun
db.pragma("journal_mode = WAL");


// Database strukturasini yaratish
function initializeDatabase() {
  // 1. Foydalanuvchilar jadvali
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      user_id INTEGER PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      ref_by INTEGER,
      balance INTEGER DEFAULT 0,
      total_spent INTEGER DEFAULT 0,
      total_orders INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_active INTEGER DEFAULT 1,
      FOREIGN KEY (ref_by) REFERENCES users(user_id)
    )
  `);

  // 2. Mahsulotlar jadvali (Stars va Premium paketlar)
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      product_id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_type TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      amount INTEGER NOT NULL,
      price INTEGER NOT NULL,
      is_available INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 3. Buyurtmalar jadvali
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      order_id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      product_id INTEGER,
      product_type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      price INTEGER NOT NULL,
      recipient_username TEXT,
      status TEXT DEFAULT 'pending',
      payment_id TEXT UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(user_id),
      FOREIGN KEY (product_id) REFERENCES products(product_id)
    )
  `);

  // 4. To'lovlar jadvali
  db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      payment_id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      currency TEXT DEFAULT 'UZS',
      telegram_payment_charge_id TEXT UNIQUE,
      provider_payment_charge_id TEXT,
      payment_method TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (order_id) REFERENCES orders(order_id),
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    )
  `);

  // 5. Referal bonuslar tarixi
  db.exec(`
    CREATE TABLE IF NOT EXISTS referral_bonuses (
      bonus_id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      referred_user_id INTEGER NOT NULL,
      order_id INTEGER NOT NULL,
      bonus_amount INTEGER NOT NULL,
      bonus_type TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(user_id),
      FOREIGN KEY (referred_user_id) REFERENCES users(user_id),
      FOREIGN KEY (order_id) REFERENCES orders(order_id)
    )
  `);

  // 6. Balans tarixi
  db.exec(`
    CREATE TABLE IF NOT EXISTS balance_history (
      history_id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      balance_before INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      transaction_type TEXT NOT NULL,
      description TEXT,
      related_order_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(user_id),
      FOREIGN KEY (related_order_id) REFERENCES orders(order_id)
    )
  `);

  // 7. Yetkazib berish tarixi
  db.exec(`
    CREATE TABLE IF NOT EXISTS deliveries (
      delivery_id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      recipient_username TEXT NOT NULL,
      product_type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      delivery_status TEXT DEFAULT 'pending',
      delivery_method TEXT,
      delivered_at DATETIME,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(order_id),
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    )
  `);

  // 8. Admin amaliyotlar log
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_logs (
      log_id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      target_user_id INTEGER,
      target_order_id INTEGER,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (admin_id) REFERENCES users(user_id),
      FOREIGN KEY (target_user_id) REFERENCES users(user_id),
      FOREIGN KEY (target_order_id) REFERENCES orders(order_id)
    )
  `);

  // Indekslar - tezlikni oshirish uchun
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_ref_by ON users(ref_by);
    CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
    CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
    CREATE INDEX IF NOT EXISTS idx_referral_bonuses_user_id ON referral_bonuses(user_id);
    CREATE INDEX IF NOT EXISTS idx_balance_history_user_id ON balance_history(user_id);
    CREATE INDEX IF NOT EXISTS idx_deliveries_order_id ON deliveries(order_id);
  `);

  console.log("✅ Database strukturasi muvaffaqiyatli yaratildi!");
}

// Boshlang'ich mahsulotlarni qo'shish
function seedProducts() {
  const checkProducts = db.prepare("SELECT COUNT(*) as count FROM products").get();
  
  if (checkProducts.count > 0) {
    console.log("ℹ️ Mahsulotlar allaqachon mavjud");
    return;
  }

  const insertProduct = db.prepare(`
    INSERT INTO products (product_type, name, description, amount, price)
    VALUES (?, ?, ?, ?, ?)
  `);

  // Stars paketlar
  const starsPackages = [
    [50, 11000],
    [75, 16500],
    [100, 22000],
    [150, 33000],
    [250, 55000],
    [350, 77000],
    [500, 110000],
    [750, 165000],
    [1000, 220000],
    [1500, 330000],
    [2500, 550000],
    [5000, 1100000],
    [10000, 2200000]
  ];

  starsPackages.forEach(([amount, price]) => {
    insertProduct.run(
      'stars',
      `${amount} ⭐️ Stars`,
      `${amount} Telegram Stars paket`,
      amount,
      price
    );
  });

  // Premium paketlar
  const premiumPackages = [
    [1, 47990, "1 oylik Telegram Premium"],
    [3, 169990, "3 oylik Telegram Premium"],
    [6, 209990, "6 oylik Telegram Premium"],
    [12, 364990, "1 yillik Telegram Premium"]
  ];

  premiumPackages.forEach(([months, price, desc]) => {
    insertProduct.run(
      'premium',
      `${months} oylik Premium`,
      desc,
      months,
      price
    );
  });

  console.log("✅ Mahsulotlar muvaffaqiyatli qo'shildi!");
}

// AVVAL database ni yaratamiz
initializeDatabase();
seedProducts();

// KEYIN prepared statement'larni yaratamiz
const dbHelpers = {
  // Foydalanuvchi qo'shish/yangilash
  upsertUser: db.prepare(`
    INSERT INTO users (user_id, username, first_name, last_name, ref_by)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      username = excluded.username,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      updated_at = CURRENT_TIMESTAMP
  `),

  // Foydalanuvchini olish
  getUser: db.prepare("SELECT * FROM users WHERE user_id = ?"),

  // Buyurtma yaratish
  createOrder: db.prepare(`
    INSERT INTO orders (user_id, product_id, product_type, amount, price, recipient_username, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),

  // Buyurtmani yangilash
  updateOrderStatus: db.prepare(`
    UPDATE orders 
    SET status = ?, completed_at = CASE WHEN ? = 'completed' THEN CURRENT_TIMESTAMP ELSE completed_at END
    WHERE order_id = ?
  `),

  // Balansni yangilash
  updateBalance: db.prepare(`
    UPDATE users 
    SET balance = balance + ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `),

  // Balans tarixini qo'shish
  addBalanceHistory: db.prepare(`
    INSERT INTO balance_history (user_id, amount, balance_before, balance_after, transaction_type, description, related_order_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),

  // Referal bonus qo'shish
  addReferralBonus: db.prepare(`
    INSERT INTO referral_bonuses (user_id, referred_user_id, order_id, bonus_amount, bonus_type)
    VALUES (?, ?, ?, ?, ?)
  `),

  // Referal sonini olish
  getReferralCount: db.prepare(`
    SELECT COUNT(*) as count FROM users WHERE ref_by = ?
  `),

  // Foydalanuvchi statistikasi
  getUserStats: db.prepare(`
    SELECT 
      u.*,
      COUNT(DISTINCT o.order_id) as total_orders,
      COALESCE(SUM(o.price), 0) as total_spent,
      COUNT(DISTINCT r.user_id) as total_referrals,
      COALESCE(SUM(rb.bonus_amount), 0) as total_bonus_earned
    FROM users u
    LEFT JOIN orders o ON u.user_id = o.user_id AND o.status = 'completed'
    LEFT JOIN users r ON r.ref_by = u.user_id
    LEFT JOIN referral_bonuses rb ON rb.user_id = u.user_id
    WHERE u.user_id = ?
    GROUP BY u.user_id
  `),

  // Mahsulot olish
  getProduct: db.prepare(`
    SELECT * FROM products 
    WHERE product_type = ? AND amount = ? AND is_available = 1
  `),

  // Buyurtmalarni olish
  getUserOrders: db.prepare(`
    SELECT * FROM orders 
    WHERE user_id = ? 
    ORDER BY created_at DESC 
    LIMIT ?
  `),

  // To'lov yaratish
  createPayment: db.prepare(`
    INSERT INTO payments (order_id, user_id, amount, payment_method, telegram_payment_charge_id, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
};

export default db;
export { dbHelpers };
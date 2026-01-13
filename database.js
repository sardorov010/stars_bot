import Database from "better-sqlite3";

// 📦 database fayl ochiladi (yo‘q bo‘lsa o‘zi yaratadi)
const db = new Database("bot.db");

// ================= USERS =================
db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    username TEXT,
    balance INTEGER DEFAULT 0,
    ref_by INTEGER,
    is_verified INTEGER DEFAULT 0
  )
`).run();

// ================= ORDERS =================
db.prepare(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    stars INTEGER,
    status TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

export default db;


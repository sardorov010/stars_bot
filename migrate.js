import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database(path.join(__dirname, "telegram_bot.db"));

console.log("🔄 Database migration boshlandi...");

try {
  // telegram_charge_id ustunini qo'shish
  db.exec(`
    ALTER TABLE deliveries 
    ADD COLUMN telegram_charge_id TEXT;
  `);
  console.log("✅ telegram_charge_id ustuni qo'shildi");
} catch (error) {
  if (error.message.includes("duplicate column")) {
    console.log("ℹ️ telegram_charge_id allaqachon mavjud");
  } else {
    console.error("❌ Xato:", error.message);
  }
}

try {
  // Index yaratish
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_deliveries_telegram_charge_id 
    ON deliveries(telegram_charge_id);
  `);
  console.log("✅ Index yaratildi");
} catch (error) {
  console.error("❌ Index xato:", error.message);
}

// Schema tekshirish
const schema = db.prepare("PRAGMA table_info(deliveries)").all();
console.log("\n📋 Deliveries jadvali:");
schema.forEach(col => {
  console.log(`  - ${col.name} (${col.type})`);
});

db.close();
console.log("\n✅ Migration tugadi!");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const dir = path.join(__dirname, "..", "data");
fs.mkdirSync(dir, { recursive: true });
const db = new Database(path.join(dir, "optoline.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
CREATE TABLE IF NOT EXISTS products (
 id INTEGER PRIMARY KEY AUTOINCREMENT, sku TEXT, name TEXT NOT NULL, category TEXT NOT NULL,
 price REAL NOT NULL, image TEXT NOT NULL, description TEXT DEFAULT '',
 featured INTEGER DEFAULT 0, in_stock INTEGER DEFAULT 1, stock_quantity INTEGER DEFAULT 50,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS orders (
 id INTEGER PRIMARY KEY AUTOINCREMENT, customer_name TEXT NOT NULL, email TEXT,
 phone TEXT NOT NULL, address TEXT NOT NULL, city TEXT, payment_method TEXT,
 items TEXT NOT NULL, total REAL NOT NULL, status TEXT DEFAULT 'Pending',
 prescription_file TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS chat_messages (
 id INTEGER PRIMARY KEY AUTOINCREMENT, visitor_id TEXT NOT NULL,
 sender TEXT NOT NULL CHECK(sender IN ('visitor','owner')),
 message TEXT NOT NULL, is_read INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_chat_visitor ON chat_messages(visitor_id,id);
CREATE TABLE IF NOT EXISTS sessions (
 sid TEXT PRIMARY KEY, sess TEXT NOT NULL, expired INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired);
`);
function hasColumn(table, column) {
 return db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === column);
}
for (const [column, definition] of [
 ["sku","TEXT"],["stock_quantity","INTEGER DEFAULT 50"],["created_at","TEXT"],["updated_at","TEXT"]
]) if (!hasColumn("products",column)) db.exec(`ALTER TABLE products ADD COLUMN ${column} ${definition}`);
const count = db.prepare("SELECT COUNT(*) n FROM products").get().n;
if (!count) {
 const insert = db.prepare(`INSERT INTO products (sku,name,category,price,image,description,featured,in_stock,stock_quantity) VALUES (@sku,@name,@category,@price,@image,@description,@featured,1,@stock_quantity)`);
 const products = [
  {sku:"OPT-EYE-001",name:"The Everyday Optical",category:"Eyeglasses",price:5490,image:"/images/frame.svg",description:"Lightweight everyday frame with a timeless silhouette.",featured:1,stock_quantity:30},
  {sku:"OPT-EYE-002",name:"Studio Acetate",category:"Eyeglasses",price:6990,image:"/images/frame.svg",description:"A refined acetate frame for a confident everyday look.",featured:1,stock_quantity:24},
  {sku:"OPT-SUN-001",name:"Forma Classic",category:"Sunglasses",price:7990,image:"/images/sunglasses.svg",description:"Classic sun protection with a modern profile.",featured:1,stock_quantity:18},
  {sku:"OPT-SUN-002",name:"Aero Polarized",category:"Sunglasses",price:9990,image:"/images/sunglasses.svg",description:"Polarized style designed for bright days.",featured:0,stock_quantity:12},
  {sku:"OPT-LEN-001",name:"Clear Daily Lenses",category:"Contact Lenses",price:2490,image:"/images/lenses.svg",description:"Daily disposable lenses. Prescription suitability must be confirmed.",featured:1,stock_quantity:40},
  {sku:"OPT-KID-001",name:"Junior Flex",category:"Kids Eyewear",price:3990,image:"/images/frame.svg",description:"Comfort-first frame designed for active younger wearers.",featured:0,stock_quantity:15}
 ];
 db.transaction(rows => rows.forEach(p => insert.run(p)))(products);
}
module.exports = db;

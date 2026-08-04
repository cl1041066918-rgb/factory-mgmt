import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Render 部署时优先使用 DATA_DIR 环境变量，但必须确保目录可写
// Render 免费实例没有持久磁盘，每次重启数据会清空
function getDataDir() {
  if (process.env.DATA_DIR) {
    try {
      fs.mkdirSync(process.env.DATA_DIR, { recursive: true });
      // 测试是否可写
      fs.accessSync(process.env.DATA_DIR, fs.constants.W_OK);
      return process.env.DATA_DIR;
    } catch (e) {
      console.warn(`DATA_DIR (${process.env.DATA_DIR}) not writable, falling back: ${e.message}`);
    }
  }
  // 默认用项目下的 data 目录（Render 上 process.cwd() 是 /opt/render/project/src）
  const defaultDir = process.env.RENDER 
    ? path.join(process.cwd(), 'data') 
    : path.join(__dirname, '..', 'data');
  try {
    fs.mkdirSync(defaultDir, { recursive: true });
    return defaultDir;
  } catch (e) {
    console.warn(`Default data dir failed, using /tmp: ${e.message}`);
    return '/tmp';
  }
}
const dataDir = getDataDir();
const dbPath = path.join(dataDir, 'factory.db');

let db;

export function initDB() {
  // Ensure data directory exists (synchronous)
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  createTables();
  seedData();
  return db;
}

function createTables() {
  // 用户表
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','production','service','shipping')),
      status TEXT DEFAULT 'active' CHECK(status IN ('active','inactive')),
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);

  // SKU表
  db.exec(`
    CREATE TABLE IF NOT EXISTS skus (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      spec TEXT,
      unit TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('finished','material','packaging')),
      default_price REAL DEFAULT 0,
      min_stock INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active' CHECK(status IN ('active','inactive')),
      remark TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);

  // 客户档案
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      contact TEXT,
      phone TEXT,
      address TEXT,
      platform TEXT,
      remark TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);

  // 供应商档案
  db.exec(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      contact TEXT,
      phone TEXT,
      category TEXT,
      remark TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);

  // 二维码表
  db.exec(`
    CREATE TABLE IF NOT EXISTS qr_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku_id INTEGER NOT NULL,
      code TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (sku_id) REFERENCES skus(id)
    );
  `);

  // 销售账单
  db.exec(`
    CREATE TABLE IF NOT EXISTS sales_bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_no TEXT UNIQUE NOT NULL,
      bill_type TEXT NOT NULL CHECK(bill_type IN ('bulk','retail')),
      customer_id INTEGER,
      customer_name TEXT NOT NULL,
      platform TEXT NOT NULL,
      order_date TEXT NOT NULL,
      total_amount REAL NOT NULL DEFAULT 0,
      creator_id INTEGER NOT NULL,
      creator_name TEXT NOT NULL,
      related_order_id INTEGER,
      remark TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);

  // 销售账单明细
  db.exec(`
    CREATE TABLE IF NOT EXISTS sales_bill_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id INTEGER NOT NULL,
      sku_id INTEGER,
      sku_code TEXT NOT NULL,
      product_name TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY (bill_id) REFERENCES sales_bills(id) ON DELETE CASCADE
    );
  `);

  // 采购账单
  db.exec(`
    CREATE TABLE IF NOT EXISTS purchase_bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_no TEXT UNIQUE NOT NULL,
      supplier_id INTEGER,
      supplier_name TEXT NOT NULL,
      order_date TEXT NOT NULL,
      expected_date TEXT,
      total_amount REAL NOT NULL DEFAULT 0,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','partial','completed')),
      creator_id INTEGER NOT NULL,
      creator_name TEXT NOT NULL,
      remark TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);

  // 采购账单明细
  db.exec(`
    CREATE TABLE IF NOT EXISTS purchase_bill_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id INTEGER NOT NULL,
      sku_id INTEGER,
      sku_code TEXT NOT NULL,
      material_name TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      subtotal REAL NOT NULL,
      arrived_quantity REAL DEFAULT 0,
      FOREIGN KEY (bill_id) REFERENCES purchase_bills(id) ON DELETE CASCADE
    );
  `);

  // 食堂采买账单
  db.exec(`
    CREATE TABLE IF NOT EXISTS canteen_bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_no TEXT UNIQUE NOT NULL,
      buy_date TEXT NOT NULL,
      total_amount REAL NOT NULL DEFAULT 0,
      buyer TEXT,
      creator_id INTEGER NOT NULL,
      creator_name TEXT NOT NULL,
      remark TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);

  // 食堂采买明细
  db.exec(`
    CREATE TABLE IF NOT EXISTS canteen_bill_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit TEXT NOT NULL,
      unit_price REAL NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY (bill_id) REFERENCES canteen_bills(id) ON DELETE CASCADE
    );
  `);

  // 订单表
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT UNIQUE NOT NULL,
      order_type TEXT NOT NULL CHECK(order_type IN ('online','offline')),
      platform TEXT NOT NULL,
      platform_order_no TEXT,
      customer_id INTEGER,
      customer_name TEXT NOT NULL,
      contact TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT NOT NULL,
      total_amount REAL NOT NULL DEFAULT 0,
      order_time TEXT NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','shipped','completed','cancelled','returning')),
      tracking_no TEXT,
      express_company TEXT,
      ship_time TEXT,
      shipper_id INTEGER,
      shipper_name TEXT,
      creator_id INTEGER NOT NULL,
      creator_name TEXT NOT NULL,
      remark TEXT,
      cancel_reason TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);

  // 订单明细
  db.exec(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      sku_id INTEGER,
      sku_code TEXT NOT NULL,
      product_name TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );
  `);

  // 库存表 (warehouse_type: finished, material, packaging)
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku_id INTEGER NOT NULL,
      warehouse_type TEXT NOT NULL CHECK(warehouse_type IN ('finished','material','packaging')),
      quantity REAL NOT NULL DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(sku_id, warehouse_type),
      FOREIGN KEY (sku_id) REFERENCES skus(id)
    );
  `);

  // 出入库记录表
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku_id INTEGER NOT NULL,
      sku_code TEXT NOT NULL,
      product_name TEXT NOT NULL,
      warehouse_type TEXT NOT NULL,
      operation_type TEXT NOT NULL CHECK(operation_type IN ('in','out','adjust')),
      quantity REAL NOT NULL,
      operator_id INTEGER NOT NULL,
      operator_name TEXT NOT NULL,
      related_bill_no TEXT,
      remark TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (sku_id) REFERENCES skus(id)
    );
  `);

  // 操作日志表
  db.exec(`
    CREATE TABLE IF NOT EXISTS operation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      user_name TEXT NOT NULL,
      operation_type TEXT NOT NULL,
      target TEXT,
      before_value TEXT,
      after_value TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);
}

function seedData() {
  // 检查是否已有用户
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count > 0) return;

  // 只创建4个系统账号，不插入任何示例业务数据
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  db.prepare(`
    INSERT INTO users (username, password, name, role, status)
    VALUES (?, ?, ?, ?, ?)
  `).run('admin', hashedPassword, '系统管理员', 'admin', 'active');

  const prodPassword = bcrypt.hashSync('prod123', 10);
  db.prepare(`
    INSERT INTO users (username, password, name, role, status)
    VALUES (?, ?, ?, ?, ?)
  `).run('production', prodPassword, '生产主管', 'production', 'active');

  const servicePassword = bcrypt.hashSync('service123', 10);
  db.prepare(`
    INSERT INTO users (username, password, name, role, status)
    VALUES (?, ?, ?, ?, ?)
  `).run('service', servicePassword, '客服小王', 'service', 'active');

  const shipPassword = bcrypt.hashSync('ship123', 10);
  db.prepare(`
    INSERT INTO users (username, password, name, role, status)
    VALUES (?, ?, ?, ?, ?)
  `).run('shipping', shipPassword, '发货员', 'shipping', 'active');

  // SKU库、客户档案、供应商档案、库存、出入库记录全部为空
  // 用户登录后自行创建业务数据
}

export function getDB() {
  if (!db) {
    db = initDB();
  }
  return db;
}

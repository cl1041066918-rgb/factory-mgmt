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

  // 创建默认管理员账号
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  db.prepare(`
    INSERT INTO users (username, password, name, role, status)
    VALUES (?, ?, ?, ?, ?)
  `).run('admin', hashedPassword, '系统管理员', 'admin', 'active');

  // 创建示例生产主管
  const prodPassword = bcrypt.hashSync('prod123', 10);
  db.prepare(`
    INSERT INTO users (username, password, name, role, status)
    VALUES (?, ?, ?, ?, ?)
  `).run('production', prodPassword, '生产主管', 'production', 'active');

  // 创建示例客服
  const servicePassword = bcrypt.hashSync('service123', 10);
  db.prepare(`
    INSERT INTO users (username, password, name, role, status)
    VALUES (?, ?, ?, ?, ?)
  `).run('service', servicePassword, '客服小王', 'service', 'active');

  // 创建示例发货员
  const shipPassword = bcrypt.hashSync('ship123', 10);
  db.prepare(`
    INSERT INTO users (username, password, name, role, status)
    VALUES (?, ?, ?, ?, ?)
  `).run('shipping', shipPassword, '发货员', 'shipping', 'active');

  // 示例SKU数据
  const sampleSkus = [
    ['CP-001', '500W电机', '500W/12V', '台', 'finished', 120, 50, 'active', '主力产品'],
    ['CP-002', '800W电机', '800W/24V', '台', 'finished', 180, 30, 'active', ''],
    ['CP-003', '1000W电机', '1000W/220V', '台', 'finished', 250, 20, 'active', ''],
    ['CL-001', '硅钢片', '0.5mm', '公斤', 'material', 8, 500, 'active', ''],
    ['CL-002', '铜线', '1.5mm', '公斤', 'material', 65, 100, 'active', ''],
    ['CL-003', '轴承', '6204', '个', 'material', 15, 200, 'active', ''],
    ['CL-004', '铝壳', '标准款', '个', 'material', 25, 100, 'active', ''],
    ['BC-001', '纸箱-大', '500*400*300mm', '个', 'packaging', 3.5, 500, 'active', ''],
    ['BC-002', '纸箱-小', '300*200*200mm', '个', 'packaging', 2, 800, 'active', ''],
    ['BC-003', '泡沫垫', '通用型', '个', 'packaging', 0.8, 1000, 'active', ''],
    ['BC-004', '胶带', '48mm*100m', '卷', 'packaging', 5, 100, 'active', ''],
  ];

  const insertSku = db.prepare(`
    INSERT INTO skus (code, name, spec, unit, category, default_price, min_stock, status, remark)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const sku of sampleSkus) {
    insertSku.run(...sku);
  }

  // 为每个SKU生成二维码记录
  const skus = db.prepare('SELECT id, code FROM skus').all();
  const insertQr = db.prepare('INSERT INTO qr_codes (sku_id, code) VALUES (?, ?)');
  for (const sku of skus) {
    insertQr.run(sku.id, sku.code);
  }

  // 初始化库存
  const insertInv = db.prepare(`
    INSERT INTO inventory (sku_id, warehouse_type, quantity) VALUES (?, ?, ?)
  `);
  insertInv.run(1, 'finished', 120);
  insertInv.run(2, 'finished', 65);
  insertInv.run(3, 'finished', 28);
  insertInv.run(4, 'material', 1500);
  insertInv.run(5, 'material', 320);
  insertInv.run(6, 'material', 580);
  insertInv.run(7, 'material', 210);
  insertInv.run(8, 'packaging', 1200);
  insertInv.run(9, 'packaging', 2000);
  insertInv.run(10, 'packaging', 3500);
  insertInv.run(11, 'packaging', 250);

  // 示例客户
  const insertCustomer = db.prepare(`
    INSERT INTO customers (code, name, contact, phone, address, platform, remark)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertCustomer.run('KH-001', '深圳华达机电有限公司', '张经理', '13800138001', '深圳市宝安区西乡街道XX路XX号', '1688', '大客户');
  insertCustomer.run('KH-002', '广州利通机械厂', '李工', '13800138002', '广州市番禺区XX工业区', '线下', '');
  insertCustomer.run('KH-003', '东莞长安电子科技', '王总', '13800138003', '东莞市长安镇XX路', '淘宝', '');

  // 示例供应商
  const insertSupplier = db.prepare(`
    INSERT INTO suppliers (code, name, contact, phone, category, remark)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertSupplier.run('GYS-001', '宁波硅钢材料厂', '陈经理', '13900139001', '硅钢片', '');
  insertSupplier.run('GYS-002', '上海铜业有限公司', '刘经理', '13900139002', '铜线', '');
  insertSupplier.run('GYS-003', '温州包装材料厂', '赵经理', '13900139003', '纸箱/泡沫', '');
}

export function getDB() {
  if (!db) {
    db = initDB();
  }
  return db;
}

import express from 'express';
import { getDB } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { logOperation } from '../middleware/logger.js';

const router = express.Router();

function generateBillNo(db, prefix = 'XS') {
  const today = new Date();
  const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  const fullPrefix = `${prefix}-${dateStr}-`;
  const count = db.prepare("SELECT COUNT(*) as count FROM sales_bills WHERE bill_no LIKE ?").get(`${fullPrefix}%`).count;
  return `${fullPrefix}${String(count + 1).padStart(3, '0')}`;
}

// 销售账单列表
router.get('/', authMiddleware, (req, res) => {
  const db = getDB();
  const { keyword, billType, platform, startDate, endDate, page = 1, pageSize = 50 } = req.query;
  let sql = `SELECT * FROM sales_bills WHERE 1=1`;
  const params = [];
  
  // 客服只能看自己录入的
  if (req.user.role === 'service') {
    sql += ' AND creator_id = ?';
    params.push(req.user.id);
  } else if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '无权限查看销售账单' });
  }
  
  if (keyword) {
    sql += ' AND (bill_no LIKE ? OR customer_name LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  if (billType) {
    sql += ' AND bill_type = ?';
    params.push(billType);
  }
  if (platform) {
    sql += ' AND platform = ?';
    params.push(platform);
  }
  if (startDate) {
    sql += ' AND date(order_date) >= ?';
    params.push(startDate);
  }
  if (endDate) {
    sql += ' AND date(order_date) <= ?';
    params.push(endDate);
  }
  sql += ' ORDER BY order_date DESC, id DESC';
  
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
  const total = db.prepare(countSql).get(...params).total;
  sql += ' LIMIT ? OFFSET ?';
  params.push(parseInt(pageSize), offset);
  
  res.json({ list: db.prepare(sql).all(...params), total });
});

// 账单详情
router.get('/:id', authMiddleware, (req, res) => {
  const db = getDB();
  const bill = db.prepare('SELECT * FROM sales_bills WHERE id = ?').get(req.params.id);
  if (!bill) return res.status(404).json({ error: '账单不存在' });
  const items = db.prepare('SELECT * FROM sales_bill_items WHERE bill_id = ?').all(req.params.id);
  res.json({ ...bill, items });
});

// 新增销售账单
router.post('/', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'service') {
    return res.status(403).json({ error: '无权限创建销售账单' });
  }
  const { bill_type, customer_id, customer_name, platform, order_date, items, related_order_id, remark } = req.body;
  if (!bill_type || !customer_name || !platform || !order_date || !items || items.length === 0) {
    return res.status(400).json({ error: '请填写完整的账单信息' });
  }
  for (const item of items) {
    if (!item.quantity || item.quantity <= 0) return res.status(400).json({ error: '数量必须大于0' });
    if (item.unit_price < 0) return res.status(400).json({ error: '单价不能为负' });
  }
  const db = getDB();
  const billNo = generateBillNo(db);
  const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  
  const doTransaction = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO sales_bills (bill_no, bill_type, customer_id, customer_name, platform, order_date, total_amount, creator_id, creator_name, related_order_id, remark)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(billNo, bill_type, customer_id || null, customer_name, platform, order_date, totalAmount, req.user.id, req.user.name, related_order_id || null, remark || null);
    
    const billId = result.lastInsertRowid;
    for (const item of items) {
      db.prepare(`
        INSERT INTO sales_bill_items (bill_id, sku_id, sku_code, product_name, quantity, unit_price, subtotal)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(billId, item.sku_id || null, item.sku_code, item.product_name, item.quantity, item.unit_price, item.quantity * item.unit_price);
    }
    return billId;
  });
  const billId = doTransaction();
  logOperation(req.user.id, req.user.name, 'create', `销售账单:${billNo}`, null, req.body);
  res.json({ id: billId, bill_no: billNo, message: '销售账单创建成功' });
});

// 编辑销售账单
router.put('/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const db = getDB();
  const bill = db.prepare('SELECT * FROM sales_bills WHERE id = ?').get(id);
  if (!bill) return res.status(404).json({ error: '账单不存在' });
  if (req.user.role !== 'admin' && (req.user.role !== 'service' || bill.creator_id !== req.user.id)) {
    return res.status(403).json({ error: '无权限编辑此账单' });
  }
  const { bill_type, customer_id, customer_name, platform, order_date, items, related_order_id, remark } = req.body;
  const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  
  const doTransaction = db.transaction(() => {
    db.prepare(`
      UPDATE sales_bills SET bill_type = ?, customer_id = ?, customer_name = ?, platform = ?, order_date = ?, total_amount = ?, related_order_id = ?, remark = ?, updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(bill_type, customer_id || null, customer_name, platform, order_date, totalAmount, related_order_id || null, remark || null, id);
    
    db.prepare('DELETE FROM sales_bill_items WHERE bill_id = ?').run(id);
    for (const item of items) {
      db.prepare(`
        INSERT INTO sales_bill_items (bill_id, sku_id, sku_code, product_name, quantity, unit_price, subtotal)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, item.sku_id || null, item.sku_code, item.product_name, item.quantity, item.unit_price, item.quantity * item.unit_price);
    }
  });
  doTransaction();
  logOperation(req.user.id, req.user.name, 'update', `销售账单:${bill.bill_no}`, bill, req.body);
  res.json({ message: '销售账单更新成功' });
});

// 删除销售账单
router.delete('/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const db = getDB();
  const bill = db.prepare('SELECT * FROM sales_bills WHERE id = ?').get(id);
  if (!bill) return res.status(404).json({ error: '账单不存在' });
  if (req.user.role !== 'admin' && (req.user.role !== 'service' || bill.creator_id !== req.user.id)) {
    return res.status(403).json({ error: '无权限删除此账单' });
  }
  db.prepare('DELETE FROM sales_bills WHERE id = ?').run(id);
  db.prepare('DELETE FROM sales_bill_items WHERE bill_id = ?').run(id);
  logOperation(req.user.id, req.user.name, 'delete', `销售账单:${bill.bill_no}`, bill, null);
  res.json({ message: '销售账单删除成功' });
});

// 销售统计
router.get('/stats/summary', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'service') {
    return res.status(403).json({ error: '无权限查看统计' });
  }
  const db = getDB();
  const { startDate, endDate } = req.query;
  let dateFilter = '';
  const params = [];
  if (startDate) { dateFilter += ' AND date(order_date) >= ?'; params.push(startDate); }
  if (endDate) { dateFilter += ' AND date(order_date) <= ?'; params.push(endDate); }
  
  // 客服只统计自己的
  let creatorFilter = '';
  if (req.user.role === 'service') {
    creatorFilter = ' AND creator_id = ?';
    params.push(req.user.id);
  }
  
  // 总额
  const total = db.prepare(`SELECT COALESCE(SUM(total_amount), 0) as total, COUNT(*) as count FROM sales_bills WHERE 1=1 ${dateFilter} ${creatorFilter}`).get(...params);
  
  // 按平台统计
  const byPlatform = db.prepare(`SELECT platform, COALESCE(SUM(total_amount), 0) as total, COUNT(*) as count FROM sales_bills WHERE 1=1 ${dateFilter} ${creatorFilter} GROUP BY platform ORDER BY total DESC`).all(...params);
  
  // 按客户统计
  const byCustomer = db.prepare(`SELECT customer_name, COALESCE(SUM(total_amount), 0) as total, COUNT(*) as count FROM sales_bills WHERE 1=1 ${dateFilter} ${creatorFilter} GROUP BY customer_name ORDER BY total DESC LIMIT 20`).all(...params);
  
  // 按产品统计
  const byProduct = db.prepare(`
    SELECT si.sku_code, si.product_name, SUM(si.quantity) as total_qty, SUM(si.subtotal) as total_amount
    FROM sales_bill_items si
    JOIN sales_bills sb ON si.bill_id = sb.id
    WHERE 1=1 ${dateFilter.replace('order_date', 'sb.order_date')} ${creatorFilter}
    GROUP BY si.sku_code
    ORDER BY total_qty DESC
    LIMIT 20
  `).all(...params);
  
  // 按日统计
  const byDay = db.prepare(`SELECT date(order_date) as date, COALESCE(SUM(total_amount), 0) as total, COUNT(*) as count FROM sales_bills WHERE 1=1 ${dateFilter} ${creatorFilter} GROUP BY date(order_date) ORDER BY date DESC LIMIT 30`).all(...params);
  
  res.json({ total, byPlatform, byCustomer, byProduct, byDay });
});

export default router;

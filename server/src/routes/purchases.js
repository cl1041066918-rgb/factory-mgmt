import express from 'express';
import { getDB } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { logOperation } from '../middleware/logger.js';

const router = express.Router();

function generateBillNo(db) {
  const today = new Date();
  const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  const prefix = `CG-${dateStr}-`;
  const count = db.prepare("SELECT COUNT(*) as count FROM purchase_bills WHERE bill_no LIKE ?").get(`${prefix}%`).count;
  return `${prefix}${String(count + 1).padStart(3, '0')}`;
}

// 采购账单列表
router.get('/', authMiddleware, (req, res) => {
  const db = getDB();
  const { keyword, status, startDate, endDate, page = 1, pageSize = 50 } = req.query;
  let sql = `SELECT * FROM purchase_bills WHERE 1=1`;
  const params = [];
  
  // 生产线管理者只能看自己录入的
  if (req.user.role === 'production') {
    sql += ' AND creator_id = ?';
    params.push(req.user.id);
  } else if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '无权限查看采购账单' });
  }
  
  if (keyword) {
    sql += ' AND (bill_no LIKE ? OR supplier_name LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (startDate) { sql += ' AND date(order_date) >= ?'; params.push(startDate); }
  if (endDate) { sql += ' AND date(order_date) <= ?'; params.push(endDate); }
  sql += ' ORDER BY order_date DESC, id DESC';
  
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
  const total = db.prepare(countSql).get(...params).total;
  sql += ' LIMIT ? OFFSET ?';
  params.push(parseInt(pageSize), offset);
  
  res.json({ list: db.prepare(sql).all(...params), total });
});

// 采购账单详情
router.get('/:id', authMiddleware, (req, res) => {
  const db = getDB();
  const bill = db.prepare('SELECT * FROM purchase_bills WHERE id = ?').get(req.params.id);
  if (!bill) return res.status(404).json({ error: '采购单不存在' });
  const items = db.prepare('SELECT * FROM purchase_bill_items WHERE bill_id = ?').all(req.params.id);
  res.json({ ...bill, items });
});

// 待到货采购单（供入库时选择关联）
router.get('/pending/all', authMiddleware, (req, res) => {
  const db = getDB();
  const list = db.prepare("SELECT id, bill_no, supplier_name, order_date, status FROM purchase_bills WHERE status IN ('pending','partial') ORDER BY order_date DESC").all();
  res.json(list);
});

// 新增采购单
router.post('/', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'production') {
    return res.status(403).json({ error: '无权限创建采购单' });
  }
  const { supplier_id, supplier_name, order_date, expected_date, items, remark } = req.body;
  if (!supplier_name || !order_date || !items || items.length === 0) {
    return res.status(400).json({ error: '请填写完整的采购单信息' });
  }
  for (const item of items) {
    if (!item.quantity || item.quantity <= 0) return res.status(400).json({ error: '采购数量必须大于0' });
    if (item.unit_price < 0) return res.status(400).json({ error: '单价不能为负' });
  }
  const db = getDB();
  const billNo = generateBillNo(db);
  const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  
  const doTransaction = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO purchase_bills (bill_no, supplier_id, supplier_name, order_date, expected_date, total_amount, status, creator_id, creator_name, remark)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `).run(billNo, supplier_id || null, supplier_name, order_date, expected_date || null, totalAmount, req.user.id, req.user.name, remark || null);
    
    const billId = result.lastInsertRowid;
    for (const item of items) {
      db.prepare(`
        INSERT INTO purchase_bill_items (bill_id, sku_id, sku_code, material_name, quantity, unit_price, subtotal, arrived_quantity)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0)
      `).run(billId, item.sku_id || null, item.sku_code, item.material_name, item.quantity, item.unit_price, item.quantity * item.unit_price);
    }
    return billId;
  });
  const billId = doTransaction();
  logOperation(req.user.id, req.user.name, 'create', `采购单:${billNo}`, null, req.body);
  res.json({ id: billId, bill_no: billNo, message: '采购单创建成功' });
});

// 编辑采购单
router.put('/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const db = getDB();
  const bill = db.prepare('SELECT * FROM purchase_bills WHERE id = ?').get(id);
  if (!bill) return res.status(404).json({ error: '采购单不存在' });
  if (req.user.role !== 'admin' && (req.user.role !== 'production' || bill.creator_id !== req.user.id)) {
    return res.status(403).json({ error: '无权限编辑此采购单' });
  }
  if (bill.status === 'completed') {
    return res.status(400).json({ error: '已完成的采购单不能修改明细' });
  }
  const { supplier_id, supplier_name, order_date, expected_date, items, remark } = req.body;
  const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  
  const doTransaction = db.transaction(() => {
    db.prepare(`
      UPDATE purchase_bills SET supplier_id = ?, supplier_name = ?, order_date = ?, expected_date = ?, total_amount = ?, remark = ?, updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(supplier_id || null, supplier_name, order_date, expected_date || null, totalAmount, remark || null, id);
    
    // 保留已到货数量
    db.prepare('DELETE FROM purchase_bill_items WHERE bill_id = ? AND arrived_quantity = 0').run(id);
    for (const item of items) {
      db.prepare(`
        INSERT INTO purchase_bill_items (bill_id, sku_id, sku_code, material_name, quantity, unit_price, subtotal, arrived_quantity)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0)
      `).run(id, item.sku_id || null, item.sku_code, item.material_name, item.quantity, item.unit_price, item.quantity * item.unit_price);
    }
  });
  doTransaction();
  logOperation(req.user.id, req.user.name, 'update', `采购单:${bill.bill_no}`, bill, req.body);
  res.json({ message: '采购单更新成功' });
});

// 删除采购单
router.delete('/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const db = getDB();
  const bill = db.prepare('SELECT * FROM purchase_bills WHERE id = ?').get(id);
  if (!bill) return res.status(404).json({ error: '采购单不存在' });
  if (req.user.role !== 'admin' && (req.user.role !== 'production' || bill.creator_id !== req.user.id)) {
    return res.status(403).json({ error: '无权限删除此采购单' });
  }
  if (bill.status !== 'pending') {
    return res.status(400).json({ error: '已有到货记录的采购单不能删除' });
  }
  db.prepare('DELETE FROM purchase_bills WHERE id = ?').run(id);
  db.prepare('DELETE FROM purchase_bill_items WHERE bill_id = ?').run(id);
  logOperation(req.user.id, req.user.name, 'delete', `采购单:${bill.bill_no}`, bill, null);
  res.json({ message: '采购单删除成功' });
});

// 采购统计
router.get('/stats/summary', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'production') {
    return res.status(403).json({ error: '无权限查看统计' });
  }
  const db = getDB();
  const { startDate, endDate } = req.query;
  let dateFilter = '';
  const params = [];
  if (startDate) { dateFilter += ' AND date(order_date) >= ?'; params.push(startDate); }
  if (endDate) { dateFilter += ' AND date(order_date) <= ?'; params.push(endDate); }
  let creatorFilter = '';
  if (req.user.role === 'production') { creatorFilter = ' AND creator_id = ?'; params.push(req.user.id); }
  
  const total = db.prepare(`SELECT COALESCE(SUM(total_amount), 0) as total, COUNT(*) as count FROM purchase_bills WHERE 1=1 ${dateFilter} ${creatorFilter}`).get(...params);
  const bySupplier = db.prepare(`SELECT supplier_name, COALESCE(SUM(total_amount), 0) as total, COUNT(*) as count FROM purchase_bills WHERE 1=1 ${dateFilter} ${creatorFilter} GROUP BY supplier_name ORDER BY total DESC LIMIT 20`).all(...params);
  const byMaterial = db.prepare(`
    SELECT pi.sku_code, pi.material_name, SUM(pi.quantity) as total_qty, SUM(pi.subtotal) as total_amount
    FROM purchase_bill_items pi
    JOIN purchase_bills pb ON pi.bill_id = pb.id
    WHERE 1=1 ${dateFilter.replace('order_date', 'pb.order_date')} ${creatorFilter}
    GROUP BY pi.sku_code
    ORDER BY total_qty DESC
    LIMIT 20
  `).all(...params);
  const pending = db.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total FROM purchase_bills WHERE status IN ('pending','partial')`).get();
  
  res.json({ total, bySupplier, byMaterial, pending });
});

export default router;

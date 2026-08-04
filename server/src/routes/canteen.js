import express from 'express';
import { getDB } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { logOperation } from '../middleware/logger.js';

const router = express.Router();

function generateBillNo(db) {
  const today = new Date();
  const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  const prefix = `ST-${dateStr}-`;
  // 用 MAX(NNN) + 1 而不是 COUNT + 1，避免删除中间记录后 UNIQUE 冲突
  const row = db.prepare(
    "SELECT bill_no FROM canteen_bills WHERE bill_no LIKE ? ORDER BY bill_no DESC LIMIT 1"
  ).get(`${prefix}%`);
  let next = 1;
  if (row && row.bill_no) {
    const m = row.bill_no.match(/-(\d+)$/);
    if (m) next = parseInt(m[1], 10) + 1;
  }
  return `${prefix}${String(next).padStart(3, '0')}`;
}

router.get('/', authMiddleware, (req, res) => {
  const db = getDB();
  const { keyword, startDate, endDate, page = 1, pageSize = 50 } = req.query;
  let sql = `SELECT * FROM canteen_bills WHERE 1=1`;
  const params = [];
  
  if (req.user.role === 'production') {
    sql += ' AND creator_id = ?';
    params.push(req.user.id);
  } else if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '无权限查看食堂账单' });
  }
  
  if (keyword) {
    sql += ' AND (bill_no LIKE ? OR buyer LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  if (startDate) { sql += ' AND date(buy_date) >= ?'; params.push(startDate); }
  if (endDate) { sql += ' AND date(buy_date) <= ?'; params.push(endDate); }
  sql += ' ORDER BY buy_date DESC, id DESC';
  
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
  const total = db.prepare(countSql).get(...params).total;
  sql += ' LIMIT ? OFFSET ?';
  params.push(parseInt(pageSize), offset);
  
  res.json({ list: db.prepare(sql).all(...params), total });
});

router.get('/:id', authMiddleware, (req, res) => {
  const db = getDB();
  const bill = db.prepare('SELECT * FROM canteen_bills WHERE id = ?').get(req.params.id);
  if (!bill) return res.status(404).json({ error: '账单不存在' });
  const items = db.prepare('SELECT * FROM canteen_bill_items WHERE bill_id = ?').all(req.params.id);
  res.json({ ...bill, items });
});

router.post('/', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'production') {
    return res.status(403).json({ error: '无权限创建食堂账单' });
  }
  const { buy_date, items, buyer, remark } = req.body;
  if (!buy_date || !items || items.length === 0) {
    return res.status(400).json({ error: '请填写采买日期和食材明细' });
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
      INSERT INTO canteen_bills (bill_no, buy_date, total_amount, buyer, creator_id, creator_name, remark)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(billNo, buy_date, totalAmount, buyer || null, req.user.id, req.user.name, remark || null);
    
    const billId = result.lastInsertRowid;
    for (const item of items) {
      db.prepare(`
        INSERT INTO canteen_bill_items (bill_id, name, quantity, unit, unit_price, subtotal)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(billId, item.name, item.quantity, item.unit, item.unit_price, item.quantity * item.unit_price);
    }
    return billId;
  });
  const billId = doTransaction();
  logOperation(req.user.id, req.user.name, 'create', `食堂账单:${billNo}`, null, req.body);
  res.json({ id: billId, bill_no: billNo, message: '食堂账单创建成功' });
});

router.put('/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const db = getDB();
  const bill = db.prepare('SELECT * FROM canteen_bills WHERE id = ?').get(id);
  if (!bill) return res.status(404).json({ error: '账单不存在' });
  if (req.user.role !== 'admin' && (req.user.role !== 'production' || bill.creator_id !== req.user.id)) {
    return res.status(403).json({ error: '无权限编辑此账单' });
  }
  const { buy_date, items, buyer, remark } = req.body;
  const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  
  const doTransaction = db.transaction(() => {
    db.prepare('UPDATE canteen_bills SET buy_date = ?, total_amount = ?, buyer = ?, remark = ? WHERE id = ?')
      .run(buy_date, totalAmount, buyer || null, remark || null, id);
    db.prepare('DELETE FROM canteen_bill_items WHERE bill_id = ?').run(id);
    for (const item of items) {
      db.prepare('INSERT INTO canteen_bill_items (bill_id, name, quantity, unit, unit_price, subtotal) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, item.name, item.quantity, item.unit, item.unit_price, item.quantity * item.unit_price);
    }
  });
  doTransaction();
  logOperation(req.user.id, req.user.name, 'update', `食堂账单:${bill.bill_no}`, bill, req.body);
  res.json({ message: '食堂账单更新成功' });
});

router.delete('/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const db = getDB();
  const bill = db.prepare('SELECT * FROM canteen_bills WHERE id = ?').get(id);
  if (!bill) return res.status(404).json({ error: '账单不存在' });
  if (req.user.role !== 'admin' && (req.user.role !== 'production' || bill.creator_id !== req.user.id)) {
    return res.status(403).json({ error: '无权限删除此账单' });
  }
  db.prepare('DELETE FROM canteen_bills WHERE id = ?').run(id);
  db.prepare('DELETE FROM canteen_bill_items WHERE bill_id = ?').run(id);
  logOperation(req.user.id, req.user.name, 'delete', `食堂账单:${bill.bill_no}`, bill, null);
  res.json({ message: '食堂账单删除成功' });
});

// 食堂月度统计
router.get('/stats/monthly', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'production') {
    return res.status(403).json({ error: '无权限查看统计' });
  }
  const db = getDB();
  let creatorFilter = '';
  const params = [];
  if (req.user.role === 'production') { creatorFilter = ' AND creator_id = ?'; params.push(req.user.id); }
  
  const monthly = db.prepare(`
    SELECT strftime('%Y-%m', buy_date) as month, COALESCE(SUM(total_amount), 0) as total, COUNT(*) as count
    FROM canteen_bills WHERE 1=1 ${creatorFilter}
    GROUP BY month ORDER BY month DESC LIMIT 12
  `).all(...params);
  res.json(monthly);
});

export default router;

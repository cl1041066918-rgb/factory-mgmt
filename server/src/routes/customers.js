import express from 'express';
import { getDB } from '../db.js';
import { authMiddleware, requirePermission } from '../middleware/auth.js';
import { logOperation } from '../middleware/logger.js';

const router = express.Router();

// 客户列表
router.get('/', authMiddleware, (req, res) => {
  const db = getDB();
  const { keyword, platform, page = 1, pageSize = 50 } = req.query;
  let sql = 'SELECT * FROM customers WHERE 1=1';
  const params = [];
  if (keyword) {
    sql += ' AND (code LIKE ? OR name LIKE ? OR contact LIKE ? OR phone LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (platform) {
    sql += ' AND platform = ?';
    params.push(platform);
  }
  sql += ' ORDER BY id DESC';
  
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
  const total = db.prepare(countSql).get(...params).total;
  sql += ' LIMIT ? OFFSET ?';
  params.push(parseInt(pageSize), offset);
  
  res.json({ list: db.prepare(sql).all(...params), total });
});

// 所有客户（下拉选择用）
router.get('/all', authMiddleware, (req, res) => {
  const db = getDB();
  const customers = db.prepare('SELECT id, code, name, contact, phone, address, platform FROM customers ORDER BY name ASC').all();
  res.json(customers);
});

// 新增
router.post('/', authMiddleware, requirePermission('customer.manage'), (req, res) => {
  const { code, name, contact, phone, address, platform, remark } = req.body;
  if (!code || !name) {
    return res.status(400).json({ error: '客户编号和名称为必填' });
  }
  const db = getDB();
  const existing = db.prepare('SELECT id FROM customers WHERE code = ?').get(code);
  if (existing) {
    return res.status(400).json({ error: '客户编号已存在' });
  }
  const result = db.prepare('INSERT INTO customers (code, name, contact, phone, address, platform, remark) VALUES (?, ?, ?, ?, ?, ?, ?)').run(code, name, contact, phone, address, platform, remark);
  logOperation(req.user.id, req.user.name, 'create', `客户:${code}`, null, req.body);
  res.json({ id: result.lastInsertRowid, message: '客户创建成功' });
});

// 编辑
router.put('/:id', authMiddleware, requirePermission('customer.manage'), (req, res) => {
  const { id } = req.params;
  const { code, name, contact, phone, address, platform, remark } = req.body;
  const db = getDB();
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  if (!customer) return res.status(404).json({ error: '客户不存在' });
  db.prepare('UPDATE customers SET code = ?, name = ?, contact = ?, phone = ?, address = ?, platform = ?, remark = ? WHERE id = ?').run(code, name, contact, phone, address, platform, remark, id);
  logOperation(req.user.id, req.user.name, 'update', `客户:${code}`, customer, req.body);
  res.json({ message: '客户更新成功' });
});

// 删除
router.delete('/:id', authMiddleware, requirePermission('customer.manage'), (req, res) => {
  const { id } = req.params;
  const db = getDB();
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  if (!customer) return res.status(404).json({ error: '客户不存在' });
  // 检查是否有关联订单
  const orderCount = db.prepare('SELECT COUNT(*) as count FROM orders WHERE customer_id = ?').get(id);
  if (orderCount.count > 0) {
    return res.status(400).json({ error: '该客户有关联订单，不能删除' });
  }
  db.prepare('DELETE FROM customers WHERE id = ?').run(id);
  logOperation(req.user.id, req.user.name, 'delete', `客户:${customer.code}`, customer, null);
  res.json({ message: '客户删除成功' });
});

export default router;

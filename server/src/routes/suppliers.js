import express from 'express';
import { getDB } from '../db.js';
import { authMiddleware, requirePermission } from '../middleware/auth.js';
import { logOperation } from '../middleware/logger.js';

const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  const db = getDB();
  const { keyword, page = 1, pageSize = 50 } = req.query;
  let sql = 'SELECT * FROM suppliers WHERE 1=1';
  const params = [];
  if (keyword) {
    sql += ' AND (code LIKE ? OR name LIKE ? OR contact LIKE ? OR phone LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  sql += ' ORDER BY id DESC';
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
  const total = db.prepare(countSql).get(...params).total;
  sql += ' LIMIT ? OFFSET ?';
  params.push(parseInt(pageSize), offset);
  res.json({ list: db.prepare(sql).all(...params), total });
});

router.get('/all', authMiddleware, (req, res) => {
  const db = getDB();
  res.json(db.prepare('SELECT id, code, name, contact, phone, category FROM suppliers ORDER BY name ASC').all());
});

router.post('/', authMiddleware, requirePermission('supplier.manage'), (req, res) => {
  const { code, name, contact, phone, category, remark } = req.body;
  if (!code || !name) return res.status(400).json({ error: '供应商编号和名称为必填' });
  const db = getDB();
  const existing = db.prepare('SELECT id FROM suppliers WHERE code = ?').get(code);
  if (existing) return res.status(400).json({ error: '供应商编号已存在' });
  const result = db.prepare('INSERT INTO suppliers (code, name, contact, phone, category, remark) VALUES (?, ?, ?, ?, ?, ?)').run(code, name, contact, phone, category, remark);
  logOperation(req.user.id, req.user.name, 'create', `供应商:${code}`, null, req.body);
  res.json({ id: result.lastInsertRowid, message: '供应商创建成功' });
});

router.put('/:id', authMiddleware, requirePermission('supplier.manage'), (req, res) => {
  const { id } = req.params;
  const { code, name, contact, phone, category, remark } = req.body;
  const db = getDB();
  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id);
  if (!supplier) return res.status(404).json({ error: '供应商不存在' });
  db.prepare('UPDATE suppliers SET code = ?, name = ?, contact = ?, phone = ?, category = ?, remark = ? WHERE id = ?').run(code, name, contact, phone, category, remark, id);
  logOperation(req.user.id, req.user.name, 'update', `供应商:${code}`, supplier, req.body);
  res.json({ message: '供应商更新成功' });
});

router.delete('/:id', authMiddleware, requirePermission('supplier.manage'), (req, res) => {
  const { id } = req.params;
  const db = getDB();
  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id);
  if (!supplier) return res.status(404).json({ error: '供应商不存在' });
  const purchaseCount = db.prepare('SELECT COUNT(*) as count FROM purchase_bills WHERE supplier_id = ?').get(id);
  if (purchaseCount.count > 0) {
    return res.status(400).json({ error: '该供应商有关联采购单，不能删除' });
  }
  db.prepare('DELETE FROM suppliers WHERE id = ?').run(id);
  logOperation(req.user.id, req.user.name, 'delete', `供应商:${supplier.code}`, supplier, null);
  res.json({ message: '供应商删除成功' });
});

export default router;

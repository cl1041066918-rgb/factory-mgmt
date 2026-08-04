import express from 'express';
import { getDB } from '../db.js';
import { authMiddleware, requirePermission } from '../middleware/auth.js';

const router = express.Router();

// 操作日志列表
router.get('/', authMiddleware, requirePermission('log.view'), (req, res) => {
  const db = getDB();
  const { keyword, operationType, userId, startDate, endDate, page = 1, pageSize = 50 } = req.query;
  let sql = `SELECT l.*, u.username FROM operation_logs l LEFT JOIN users u ON l.user_id = u.id WHERE 1=1`;
  const params = [];
  if (keyword) {
    sql += ' AND (l.target LIKE ? OR l.user_name LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  if (operationType) {
    sql += ' AND l.operation_type = ?';
    params.push(operationType);
  }
  if (userId) {
    sql += ' AND l.user_id = ?';
    params.push(userId);
  }
  if (startDate) { sql += ' AND date(l.created_at) >= ?'; params.push(startDate); }
  if (endDate) { sql += ' AND date(l.created_at) <= ?'; params.push(endDate); }
  sql += ' ORDER BY l.id DESC';
  
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  const countSql = sql.replace(/SELECT l\.\*.*FROM/, 'SELECT COUNT(*) as total FROM');
  const total = db.prepare(countSql).get(...params).total;
  sql += ' LIMIT ? OFFSET ?';
  params.push(parseInt(pageSize), offset);
  
  res.json({ list: db.prepare(sql).all(...params), total });
});

export default router;

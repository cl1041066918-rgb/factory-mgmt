import express from 'express';
import bcrypt from 'bcryptjs';
import { getDB } from '../db.js';
import { authMiddleware, requirePermission } from '../middleware/auth.js';
import { logOperation, logMiddleware } from '../middleware/logger.js';

const router = express.Router();

// 获取用户列表
router.get('/', authMiddleware, requirePermission('user.manage'), (req, res) => {
  const db = getDB();
  const { keyword, role, status } = req.query;
  let sql = 'SELECT id, username, name, role, status, created_at FROM users WHERE 1=1';
  const params = [];
  if (keyword) {
    sql += ' AND (username LIKE ? OR name LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  if (role) {
    sql += ' AND role = ?';
    params.push(role);
  }
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  sql += ' ORDER BY id ASC';
  const users = db.prepare(sql).all(...params);
  res.json(users);
});

// 新增用户
router.post('/', authMiddleware, requirePermission('user.manage'), logMiddleware('create', 'user'), (req, res) => {
  const { username, password, name, role } = req.body;
  if (!username || !password || !name || !role) {
    return res.status(400).json({ error: '请填写完整的用户信息' });
  }
  const db = getDB();
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(400).json({ error: '用户名已存在' });
  }
  const hashedPassword = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (username, password, name, role, status) VALUES (?, ?, ?, ?, ?)').run(username, hashedPassword, name, role, 'active');
  logOperation(req.user.id, req.user.name, 'create', `用户:${username}`, null, { username, name, role });
  res.json({ id: result.lastInsertRowid, message: '用户创建成功' });
});

// 编辑用户
router.put('/:id', authMiddleware, requirePermission('user.manage'), logMiddleware('update', 'user'), (req, res) => {
  const { id } = req.params;
  const { name, role, status, password } = req.body;
  const db = getDB();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }
  if (password) {
    const hashedPassword = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET name = ?, role = ?, status = ?, password = ? WHERE id = ?').run(name, role, status, hashedPassword, id);
  } else {
    db.prepare('UPDATE users SET name = ?, role = ?, status = ? WHERE id = ?').run(name, role, status, id);
  }
  logOperation(req.user.id, req.user.name, 'update', `用户:${user.username}`, { name: user.name, role: user.role }, { name, role, status });
  res.json({ message: '用户更新成功' });
});

// 删除用户
router.delete('/:id', authMiddleware, requirePermission('user.manage'), logMiddleware('delete', 'user'), (req, res) => {
  const { id } = req.params;
  const db = getDB();
  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ error: '不能删除当前登录的账号' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }
  if (user.username === 'admin') {
    return res.status(400).json({ error: '不能删除超级管理员账号' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  logOperation(req.user.id, req.user.name, 'delete', `用户:${user.username}`, { username: user.username, name: user.name }, null);
  res.json({ message: '用户删除成功' });
});

export default router;

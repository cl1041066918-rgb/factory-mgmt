import express from 'express';
import bcrypt from 'bcryptjs';
import { getDB } from '../db.js';
import { generateToken, authMiddleware, getMenuPermissions } from '../middleware/auth.js';

const router = express.Router();

// 登录
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }
  const db = getDB();
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND status = ?').get(username, 'active');
  if (!user) {
    return res.status(401).json({ error: '用户名不存在或账号已停用' });
  }
  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: '密码错误' });
  }
  const token = generateToken(user);
  const permissions = getMenuPermissions(user.role);
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      permissions,
    }
  });
});

// 获取当前用户信息
router.get('/me', authMiddleware, (req, res) => {
  const permissions = getMenuPermissions(req.user.role);
  res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      name: req.user.name,
      role: req.user.role,
      permissions,
    }
  });
});

// 修改密码
router.post('/change-password', authMiddleware, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: '请填写原密码和新密码' });
  }
  const db = getDB();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(oldPassword, user.password)) {
    return res.status(400).json({ error: '原密码错误' });
  }
  const hashedPassword = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, req.user.id);
  res.json({ message: '密码修改成功' });
});

export default router;

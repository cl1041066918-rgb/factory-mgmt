import express from 'express';
import { getDB } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { logOperation } from '../middleware/logger.js';

const router = express.Router();

// 生成订单号
function generateOrderNo(db) {
  const today = new Date();
  const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  const prefix = `DD-${dateStr}-`;
  const count = db.prepare("SELECT COUNT(*) as count FROM orders WHERE order_no LIKE ?").get(`${prefix}%`).count;
  return `${prefix}${String(count + 1).padStart(3, '0')}`;
}

// 订单列表
router.get('/', authMiddleware, (req, res) => {
  const db = getDB();
  const { keyword, status, platform, orderType, startDate, endDate, page = 1, pageSize = 50 } = req.query;
  let sql = `SELECT * FROM orders WHERE 1=1`;
  const params = [];
  
  // 发货部门只看待发货
  if (req.user.role === 'shipping') {
    sql += ' AND status = ?';
    params.push('pending');
  }
  
  if (keyword) {
    sql += ' AND (order_no LIKE ? OR customer_name LIKE ? OR contact LIKE ? OR phone LIKE ? OR platform_order_no LIKE ? OR tracking_no LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (platform) {
    sql += ' AND platform = ?';
    params.push(platform);
  }
  if (orderType) {
    sql += ' AND order_type = ?';
    params.push(orderType);
  }
  if (startDate) {
    sql += ' AND date(order_time) >= ?';
    params.push(startDate);
  }
  if (endDate) {
    sql += ' AND date(order_time) <= ?';
    params.push(endDate);
  }
  sql += ' ORDER BY order_time DESC';
  
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
  const total = db.prepare(countSql).get(...params).total;
  sql += ' LIMIT ? OFFSET ?';
  params.push(parseInt(pageSize), offset);
  
  res.json({ list: db.prepare(sql).all(...params), total });
});

// 订单详情
router.get('/:id', authMiddleware, (req, res) => {
  const db = getDB();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(req.params.id);
  res.json({ ...order, items });
});

// 新增订单
router.post('/', authMiddleware, (req, res) => {
  // 权限：客服和管理员
  if (req.user.role !== 'admin' && req.user.role !== 'service') {
    return res.status(403).json({ error: '无权限创建订单' });
  }
  const { order_type, platform, platform_order_no, customer_id, customer_name, contact, phone, address, items, order_time, remark } = req.body;
  if (!order_type || !platform || !customer_name || !contact || !phone || !address || !items || items.length === 0) {
    return res.status(400).json({ error: '请填写完整的订单信息' });
  }
  // 数量校验
  for (const item of items) {
    if (!item.quantity || item.quantity <= 0) {
      return res.status(400).json({ error: '产品数量必须大于0' });
    }
    if (item.unit_price < 0) {
      return res.status(400).json({ error: '单价不能为负数' });
    }
  }
  // 平台订单号唯一性校验
  if (platform_order_no) {
    const db = getDB();
    const existing = db.prepare('SELECT id FROM orders WHERE platform_order_no = ?').get(platform_order_no);
    if (existing) {
      return res.status(400).json({ error: '该平台订单号已存在，不能重复录入' });
    }
  }
  
  const db = getDB();
  const orderNo = generateOrderNo(db);
  const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  
  const doTransaction = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO orders (order_no, order_type, platform, platform_order_no, customer_id, customer_name, contact, phone, address, total_amount, order_time, status, creator_id, creator_name, remark)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `).run(orderNo, order_type, platform, platform_order_no || null, customer_id || null, customer_name, contact, phone, address, totalAmount, order_time || new Date().toISOString().replace('T', ' ').substring(0, 19), req.user.id, req.user.name, remark || null);
    
    const orderId = result.lastInsertRowid;
    for (const item of items) {
      db.prepare(`
        INSERT INTO order_items (order_id, sku_id, sku_code, product_name, quantity, unit_price, subtotal)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(orderId, item.sku_id || null, item.sku_code, item.product_name, item.quantity, item.unit_price, item.quantity * item.unit_price);
    }
    return orderId;
  });
  const orderId = doTransaction();
  logOperation(req.user.id, req.user.name, 'create', `订单:${orderNo}`, null, req.body);
  res.json({ id: orderId, order_no: orderNo, message: '订单创建成功' });
});

// 编辑订单
router.put('/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const db = getDB();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  
  // 权限：客服只能编辑自己录入的，管理员可以编辑所有
  if (req.user.role !== 'admin' && (req.user.role !== 'service' || order.creator_id !== req.user.id)) {
    return res.status(403).json({ error: '无权限编辑此订单' });
  }
  // 已发货的订单不能修改产品明细
  if (order.status === 'shipped' && req.body.items) {
    return res.status(400).json({ error: '已发货的订单不能修改产品明细' });
  }
  
  const { order_type, platform, platform_order_no, customer_id, customer_name, contact, phone, address, items, order_time, remark } = req.body;
  const totalAmount = items ? items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0) : order.total_amount;
  
  const doTransaction = db.transaction(() => {
    db.prepare(`
      UPDATE orders SET order_type = ?, platform = ?, platform_order_no = ?, customer_id = ?, customer_name = ?, contact = ?, phone = ?, address = ?, total_amount = ?, order_time = ?, remark = ?, updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(order_type, platform, platform_order_no || null, customer_id || null, customer_name, contact, phone, address, totalAmount, order_time, remark || null, id);
    
    if (items && items.length > 0) {
      db.prepare('DELETE FROM order_items WHERE order_id = ?').run(id);
      for (const item of items) {
        db.prepare(`
          INSERT INTO order_items (order_id, sku_id, sku_code, product_name, quantity, unit_price, subtotal)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(id, item.sku_id || null, item.sku_code, item.product_name, item.quantity, item.unit_price, item.quantity * item.unit_price);
      }
    }
  });
  doTransaction();
  logOperation(req.user.id, req.user.name, 'update', `订单:${order.order_no}`, order, req.body);
  res.json({ message: '订单更新成功' });
});

// 修改订单状态
router.put('/:id/status', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { status, cancel_reason } = req.body;
  const validStatuses = ['pending', 'shipped', 'completed', 'cancelled', 'returning'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: '无效的订单状态' });
  }
  const db = getDB();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  
  // 权限检查
  if (req.user.role !== 'admin' && req.user.role !== 'service') {
    return res.status(403).json({ error: '无权限修改订单状态' });
  }
  
  const updates = { status, updated_at: new Date().toISOString().replace('T', ' ').substring(0, 19) };
  if (status === 'cancelled') {
    updates.cancel_reason = cancel_reason || '未说明';
  }
  
  db.prepare(`UPDATE orders SET status = ?, cancel_reason = ?, updated_at = ? WHERE id = ?`)
    .run(updates.status, updates.cancel_reason || null, updates.updated_at, id);
  
  logOperation(req.user.id, req.user.name, 'status_change', `订单:${order.order_no}`, { status: order.status }, { status, cancel_reason });
  res.json({ message: '订单状态已更新' });
});

// 标记发货
router.post('/:id/ship', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { tracking_no, express_company } = req.body;
  if (!tracking_no) {
    return res.status(400).json({ error: '请填写快递单号' });
  }
  const db = getDB();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  if (order.status !== 'pending') {
    return res.status(400).json({ error: `当前订单状态为${order.status}，不能发货` });
  }
  
  // 权限：发货部门和管理员
  if (req.user.role !== 'admin' && req.user.role !== 'shipping') {
    return res.status(403).json({ error: '无发货权限' });
  }
  
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  db.prepare(`
    UPDATE orders SET status = 'shipped', tracking_no = ?, express_company = ?, ship_time = ?, shipper_id = ?, shipper_name = ?, updated_at = ?
    WHERE id = ?
  `).run(tracking_no, express_company || null, now, req.user.id, req.user.name, now, id);
  
  logOperation(req.user.id, req.user.name, 'ship', `订单发货:${order.order_no}`, { status: order.status }, { status: 'shipped', tracking_no, express_company });
  res.json({ message: '发货成功', ship_time: now });
});

// 删除订单
router.delete('/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const db = getDB();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  // 权限：客服只能删自己录入的，管理员可以删所有
  if (req.user.role !== 'admin' && (req.user.role !== 'service' || order.creator_id !== req.user.id)) {
    return res.status(403).json({ error: '无权限删除此订单' });
  }
  db.prepare('DELETE FROM orders WHERE id = ?').run(id);
  db.prepare('DELETE FROM order_items WHERE order_id = ?').run(id);
  logOperation(req.user.id, req.user.name, 'delete', `订单:${order.order_no}`, order, null);
  res.json({ message: '订单删除成功' });
});

export default router;

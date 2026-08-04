import express from 'express';
import { getDB } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// 首页数据看板
router.get('/dashboard', authMiddleware, (req, res) => {
  const db = getDB();
  const role = req.user.role;
  const result = {};

  // 各角色看到的数据不同
  if (role === 'admin') {
    // 管理员看到全部
    result.orderStats = {
      pending: db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'").get().count,
      shipped: db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'shipped'").get().count,
      completed: db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'completed'").get().count,
      cancelled: db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'cancelled'").get().count,
      returning: db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'returning'").get().count,
    };
    result.salesToday = db.prepare("SELECT COALESCE(SUM(total_amount), 0) as total, COUNT(*) as count FROM sales_bills WHERE date(order_date) = date('now','localtime')").get();
    result.purchaseToday = db.prepare("SELECT COALESCE(SUM(total_amount), 0) as total, COUNT(*) as count FROM purchase_bills WHERE date(order_date) = date('now','localtime')").get();
    result.canteenThisMonth = db.prepare("SELECT COALESCE(SUM(total_amount), 0) as total FROM canteen_bills WHERE strftime('%Y-%m', buy_date) = strftime('%Y-%m', 'now','localtime')").get();
    result.lowStockCount = db.prepare(`
      SELECT COUNT(*) as count FROM skus s
      LEFT JOIN inventory i ON s.id = i.sku_id
      WHERE s.min_stock > 0 AND s.status = 'active' AND COALESCE(i.quantity, 0) <= s.min_stock
    `).get().count;
    result.totalSkus = db.prepare("SELECT COUNT(*) as count FROM skus WHERE status = 'active'").get().count;
    result.totalCustomers = db.prepare("SELECT COUNT(*) as count FROM customers").get().count;
    result.totalSuppliers = db.prepare("SELECT COUNT(*) as count FROM suppliers").get().count;
    result.pendingPurchases = db.prepare("SELECT COUNT(*) as count FROM purchase_bills WHERE status IN ('pending','partial')").get().count;
    result.recentOrders = db.prepare("SELECT order_no, customer_name, platform, status, total_amount, order_time FROM orders ORDER BY id DESC LIMIT 5").all();
    result.inventoryValue = db.prepare(`
      SELECT s.category, COALESCE(SUM(i.quantity * s.default_price), 0) as value, COALESCE(SUM(i.quantity), 0) as total_qty
      FROM skus s LEFT JOIN inventory i ON s.id = i.sku_id
      GROUP BY s.category
    `).all();
  } else if (role === 'service') {
    result.orderStats = {
      pending: db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'").get().count,
      shipped: db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'shipped'").get().count,
      completed: db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'completed'").get().count,
      cancelled: db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'cancelled'").get().count,
      returning: db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'returning'").get().count,
    };
    result.mySalesToday = db.prepare("SELECT COALESCE(SUM(total_amount), 0) as total, COUNT(*) as count FROM sales_bills WHERE creator_id = ? AND date(order_date) = date('now','localtime')", ).get(req.user.id);
    result.myOrdersToday = db.prepare("SELECT COUNT(*) as count FROM orders WHERE creator_id = ? AND date(order_time) = date('now','localtime')").get(req.user.id).count;
    result.recentOrders = db.prepare("SELECT order_no, customer_name, platform, status, total_amount, order_time FROM orders WHERE creator_id = ? ORDER BY id DESC LIMIT 5").all(req.user.id);
  } else if (role === 'shipping') {
    result.pendingOrders = db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'").get().count;
    result.shippedToday = db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'shipped' AND date(ship_time) = date('now','localtime')").get().count;
    result.pendingOrderList = db.prepare("SELECT order_no, customer_name, contact, phone, address, total_amount, order_time FROM orders WHERE status = 'pending' ORDER BY order_time ASC LIMIT 10").all();
  } else if (role === 'production') {
    result.pendingPurchases = db.prepare("SELECT COUNT(*) as count FROM purchase_bills WHERE creator_id = ? AND status IN ('pending','partial')").get(req.user.id).count;
    result.myPurchasesToday = db.prepare("SELECT COALESCE(SUM(total_amount), 0) as total, COUNT(*) as count FROM purchase_bills WHERE creator_id = ? AND date(order_date) = date('now','localtime')").get(req.user.id);
    result.canteenThisMonth = db.prepare("SELECT COALESCE(SUM(total_amount), 0) as total FROM canteen_bills WHERE creator_id = ? AND strftime('%Y-%m', buy_date) = strftime('%Y-%m', 'now','localtime')").get(req.user.id);
    result.materialLowStock = db.prepare(`
      SELECT COUNT(*) as count FROM skus s
      LEFT JOIN inventory i ON s.id = i.sku_id AND i.warehouse_type = 'material'
      WHERE s.category = 'material' AND s.min_stock > 0 AND s.status = 'active' AND COALESCE(i.quantity, 0) <= s.min_stock
    `).get().count;
  }

  res.json(result);
});

export default router;

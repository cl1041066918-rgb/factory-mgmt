import express from 'express';
import { getDB } from '../db.js';
import { authMiddleware, requirePermission } from '../middleware/auth.js';
import { logOperation } from '../middleware/logger.js';

const router = express.Router();

// 库存列表
router.get('/:warehouseType', authMiddleware, (req, res) => {
  const { warehouseType } = req.params;
  if (!['finished', 'material', 'packaging'].includes(warehouseType)) {
    return res.status(400).json({ error: '无效的仓库类型' });
  }
  const db = getDB();
  const { keyword, lowStock, page = 1, pageSize = 50 } = req.query;
  let sql = `
    SELECT s.id, s.code, s.name, s.spec, s.unit, s.category, s.default_price, s.min_stock, s.status,
           COALESCE(i.quantity, 0) as quantity,
           i.updated_at,
           (SELECT created_at FROM inventory_records WHERE sku_id = s.id ORDER BY id DESC LIMIT 1) as last_record_time
    FROM skus s
    LEFT JOIN inventory i ON s.id = i.sku_id AND i.warehouse_type = ?
    WHERE s.category = ?
  `;
  const params = [warehouseType, 
    warehouseType === 'finished' ? 'finished' : 
    warehouseType === 'material' ? 'material' : 'packaging'
  ];
  if (keyword) {
    sql += ' AND (s.code LIKE ? OR s.name LIKE ? OR s.spec LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (lowStock === 'true') {
    sql += ' AND COALESCE(i.quantity, 0) <= s.min_stock AND s.min_stock > 0';
  }
  sql += ' ORDER BY s.code ASC';
  
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  const countSql = sql.replace(/SELECT s\.id.*FROM/s, 'SELECT COUNT(*) as total FROM');
  const total = db.prepare(countSql).get(...params).total;
  sql += ' LIMIT ? OFFSET ?';
  params.push(parseInt(pageSize), offset);
  
  const list = db.prepare(sql).all(...params);
  res.json({ list, total, page: parseInt(page), pageSize: parseInt(pageSize) });
});

// 出入库记录列表
router.get('/:warehouseType/records', authMiddleware, (req, res) => {
  const { warehouseType } = req.params;
  const db = getDB();
  const { keyword, operationType, operatorId, startDate, endDate, page = 1, pageSize = 50 } = req.query;
  let sql = `
    SELECT r.*, u.username as operator_username
    FROM inventory_records r
    LEFT JOIN users u ON r.operator_id = u.id
    WHERE r.warehouse_type = ?
  `;
  const params = [warehouseType];
  if (keyword) {
    sql += ' AND (r.sku_code LIKE ? OR r.product_name LIKE ? OR r.related_bill_no LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (operationType) {
    sql += ' AND r.operation_type = ?';
    params.push(operationType);
  }
  if (operatorId) {
    sql += ' AND r.operator_id = ?';
    params.push(operatorId);
  }
  if (startDate) {
    sql += ' AND date(r.created_at) >= ?';
    params.push(startDate);
  }
  if (endDate) {
    sql += ' AND date(r.created_at) <= ?';
    params.push(endDate);
  }
  sql += ' ORDER BY r.id DESC';
  
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  const countSql = sql.replace(/SELECT r\.\*.*?FROM/s, 'SELECT COUNT(*) as total FROM');
  const total = db.prepare(countSql).get(...params).total;
  sql += ' LIMIT ? OFFSET ?';
  params.push(parseInt(pageSize), offset);
  
  res.json({ list: db.prepare(sql).all(...params), total });
});

// 扫码入库
router.post('/:warehouseType/in', authMiddleware, (req, res) => {
  const { warehouseType } = req.params;
  if (!['finished', 'material', 'packaging'].includes(warehouseType)) {
    return res.status(400).json({ error: '无效的仓库类型' });
  }
  const { skuId, quantity, relatedBillNo, remark } = req.body;
  if (!skuId || !quantity || quantity <= 0) {
    return res.status(400).json({ error: 'SKU和数量不能为空，数量必须大于0' });
  }
  const db = getDB();
  const sku = db.prepare('SELECT * FROM skus WHERE id = ?').get(skuId);
  if (!sku) return res.status(404).json({ error: 'SKU不存在' });
  
  // 权限检查
  const perm = `inventory.${warehouseType}.in`;
  const permissions = req.user.role === 'admin' ? ['*'] : 
    req.user.role === 'production' ? (warehouseType === 'material' ? ['inventory.material.in'] : (warehouseType === 'finished' ? ['inventory.finished.in'] : [])) : [];
  if (req.user.role !== 'admin' && !permissions.includes(perm)) {
    return res.status(403).json({ error: '无入库权限' });
  }
  
  const doTransaction = db.transaction(() => {
    // 更新库存
    const existing = db.prepare('SELECT * FROM inventory WHERE sku_id = ? AND warehouse_type = ?').get(skuId, warehouseType);
    if (existing) {
      db.prepare(`UPDATE inventory SET quantity = quantity + ?, updated_at = datetime('now','localtime') WHERE sku_id = ? AND warehouse_type = ?`).run(quantity, skuId, warehouseType);
    } else {
      db.prepare('INSERT INTO inventory (sku_id, warehouse_type, quantity) VALUES (?, ?, ?)').run(skuId, warehouseType, quantity);
    }
    // 记录入库记录
    db.prepare(`
      INSERT INTO inventory_records (sku_id, sku_code, product_name, warehouse_type, operation_type, quantity, operator_id, operator_name, related_bill_no, remark)
      VALUES (?, ?, ?, ?, 'in', ?, ?, ?, ?, ?)
    `).run(skuId, sku.code, sku.name, warehouseType, quantity, req.user.id, req.user.name, relatedBillNo || null, remark || null);
    
    // 如果关联了采购单，更新采购单的到货数量和状态
    if (relatedBillNo && relatedBillNo.startsWith('CG-') && warehouseType === 'material') {
      const purchaseBill = db.prepare('SELECT id FROM purchase_bills WHERE bill_no = ?').get(relatedBillNo);
      if (purchaseBill) {
        // 找到采购单中对应的SKU明细
        const item = db.prepare('SELECT * FROM purchase_bill_items WHERE bill_id = ? AND sku_id = ?').get(purchaseBill.id, skuId);
        if (item) {
          const newArrived = item.arrived_quantity + quantity;
          db.prepare('UPDATE purchase_bill_items SET arrived_quantity = ? WHERE id = ?').run(newArrived, item.id);
          // 更新采购单状态
          const allItems = db.prepare('SELECT * FROM purchase_bill_items WHERE bill_id = ?').all(purchaseBill.id);
          const allArrived = allItems.every(i => i.arrived_quantity >= i.quantity);
          const anyArrived = allItems.some(i => i.arrived_quantity > 0);
          const newStatus = allArrived ? 'completed' : (anyArrived ? 'partial' : 'pending');
          db.prepare(`UPDATE purchase_bills SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?`).run(newStatus, purchaseBill.id);
        }
      }
    }
  });
  doTransaction();
  
  logOperation(req.user.id, req.user.name, 'inventory_in', `${warehouseType}仓入库:${sku.code}`, null, { quantity, relatedBillNo });
  res.json({ message: '入库成功', sku_code: sku.code, quantity });
});

// 扫码出库
router.post('/:warehouseType/out', authMiddleware, (req, res) => {
  const { warehouseType } = req.params;
  if (!['finished', 'material', 'packaging'].includes(warehouseType)) {
    return res.status(400).json({ error: '无效的仓库类型' });
  }
  const { skuId, quantity, relatedBillNo, remark } = req.body;
  if (!skuId || !quantity || quantity <= 0) {
    return res.status(400).json({ error: 'SKU和数量不能为空，数量必须大于0' });
  }
  const db = getDB();
  const sku = db.prepare('SELECT * FROM skus WHERE id = ?').get(skuId);
  if (!sku) return res.status(404).json({ error: 'SKU不存在' });
  
  // 检查库存
  const inv = db.prepare('SELECT * FROM inventory WHERE sku_id = ? AND warehouse_type = ?').get(skuId, warehouseType);
  const currentQty = inv ? inv.quantity : 0;
  if (quantity > currentQty) {
    return res.status(400).json({ error: `库存不足！当前库存：${currentQty}，出库数量：${quantity}` });
  }
  
  // 权限检查
  const perm = `inventory.${warehouseType}.out`;
  let hasPerm = false;
  if (req.user.role === 'admin') hasPerm = true;
  else if (req.user.role === 'production' && warehouseType === 'material') hasPerm = true;
  else if (req.user.role === 'shipping' && (warehouseType === 'finished' || warehouseType === 'packaging')) hasPerm = true;
  if (!hasPerm) return res.status(403).json({ error: '无出库权限' });
  
  const doTransaction = db.transaction(() => {
    db.prepare(`UPDATE inventory SET quantity = quantity - ?, updated_at = datetime('now','localtime') WHERE sku_id = ? AND warehouse_type = ?`).run(quantity, skuId, warehouseType);
    db.prepare(`
      INSERT INTO inventory_records (sku_id, sku_code, product_name, warehouse_type, operation_type, quantity, operator_id, operator_name, related_bill_no, remark)
      VALUES (?, ?, ?, ?, 'out', ?, ?, ?, ?, ?)
    `).run(skuId, sku.code, sku.name, warehouseType, quantity, req.user.id, req.user.name, relatedBillNo || null, remark || null);
  });
  doTransaction();
  
  logOperation(req.user.id, req.user.name, 'inventory_out', `${warehouseType}仓出库:${sku.code}`, null, { quantity, relatedBillNo });
  res.json({ message: '出库成功', sku_code: sku.code, quantity });
});

// 库存调整（仅管理员）
router.post('/:warehouseType/adjust', authMiddleware, requirePermission('inventory.adjust'), (req, res) => {
  const { warehouseType } = req.params;
  const { skuId, actualQuantity, remark } = req.body;
  if (!skuId || actualQuantity === undefined || actualQuantity < 0) {
    return res.status(400).json({ error: 'SKU和实际数量不能为空，数量不能为负' });
  }
  const db = getDB();
  const sku = db.prepare('SELECT * FROM skus WHERE id = ?').get(skuId);
  if (!sku) return res.status(404).json({ error: 'SKU不存在' });
  
  const inv = db.prepare('SELECT * FROM inventory WHERE sku_id = ? AND warehouse_type = ?').get(skuId, warehouseType);
  const currentQty = inv ? inv.quantity : 0;
  const diff = actualQuantity - currentQty;
  
  const doTransaction = db.transaction(() => {
    if (inv) {
      db.prepare(`UPDATE inventory SET quantity = ?, updated_at = datetime('now','localtime') WHERE sku_id = ? AND warehouse_type = ?`).run(actualQuantity, skuId, warehouseType);
    } else {
      db.prepare('INSERT INTO inventory (sku_id, warehouse_type, quantity) VALUES (?, ?, ?)').run(skuId, warehouseType, actualQuantity);
    }
    db.prepare(`
      INSERT INTO inventory_records (sku_id, sku_code, product_name, warehouse_type, operation_type, quantity, operator_id, operator_name, remark)
      VALUES (?, ?, ?, ?, 'adjust', ?, ?, ?, ?)
    `).run(skuId, sku.code, sku.name, warehouseType, diff, req.user.id, req.user.name, `库存调整：${currentQty} → ${actualQuantity}，原因：${remark || '未说明'}`);
  });
  doTransaction();
  
  logOperation(req.user.id, req.user.name, 'inventory_adjust', `${warehouseType}仓调整:${sku.code}`, { before: currentQty }, { after: actualQuantity, remark });
  res.json({ message: '库存调整成功', before: currentQty, after: actualQuantity });
});

// 低库存预警
router.get('/alert/low-stock', authMiddleware, (req, res) => {
  const db = getDB();
  const list = db.prepare(`
    SELECT s.id, s.code, s.name, s.spec, s.unit, s.category, s.min_stock,
           COALESCE(i.quantity, 0) as quantity, i.warehouse_type
    FROM skus s
    LEFT JOIN inventory i ON s.id = i.sku_id
    WHERE s.min_stock > 0 AND s.status = 'active'
      AND COALESCE(i.quantity, 0) <= s.min_stock
    ORDER BY s.category, s.code
  `).all();
  res.json(list);
});

export default router;

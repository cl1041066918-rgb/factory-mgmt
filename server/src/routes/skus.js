import express from 'express';
import { getDB } from '../db.js';
import { authMiddleware, requirePermission } from '../middleware/auth.js';
import { logOperation } from '../middleware/logger.js';

const router = express.Router();

// 获取SKU列表
router.get('/', authMiddleware, (req, res) => {
  const db = getDB();
  const { keyword, category, status, page = 1, pageSize = 50 } = req.query;
  let sql = `SELECT s.*, 
    COALESCE(i.quantity, 0) as stock_quantity,
    i.warehouse_type
    FROM skus s
    LEFT JOIN inventory i ON s.id = i.sku_id AND (
      (s.category = 'finished' AND i.warehouse_type = 'finished') OR
      (s.category = 'material' AND i.warehouse_type = 'material') OR
      (s.category = 'packaging' AND i.warehouse_type = 'packaging')
    )
    WHERE 1=1`;
  const params = [];
  if (keyword) {
    sql += ' AND (s.code LIKE ? OR s.name LIKE ? OR s.spec LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (category) {
    sql += ' AND s.category = ?';
    params.push(category);
  }
  if (status) {
    sql += ' AND s.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY s.code ASC';
  
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  const countSql = sql.replace(/SELECT s\.\*.*?FROM/s, 'SELECT COUNT(*) as total FROM');
  const total = db.prepare(countSql).get(...params).total;
  
  sql += ` LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), offset);
  const skus = db.prepare(sql).all(...params);
  
  res.json({ list: skus, total, page: parseInt(page), pageSize: parseInt(pageSize) });
});

// 获取所有启用的SKU（供下拉选择）
router.get('/all', authMiddleware, (req, res) => {
  const db = getDB();
  const { category } = req.query;
  let sql = 'SELECT id, code, name, spec, unit, category, default_price FROM skus WHERE status = ?';
  const params = ['active'];
  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }
  sql += ' ORDER BY code ASC';
  const skus = db.prepare(sql).all(...params);
  res.json(skus);
});

// 根据编码获取SKU
router.get('/code/:code', authMiddleware, (req, res) => {
  const db = getDB();
  const sku = db.prepare(`
    SELECT s.*, COALESCE(i.quantity, 0) as stock_quantity
    FROM skus s
    LEFT JOIN inventory i ON s.id = i.sku_id AND (
      (s.category = 'finished' AND i.warehouse_type = 'finished') OR
      (s.category = 'material' AND i.warehouse_type = 'material') OR
      (s.category = 'packaging' AND i.warehouse_type = 'packaging')
    )
    WHERE s.code = ?
  `).get(req.params.code);
  if (!sku) {
    return res.status(404).json({ error: '无效的二维码，SKU不存在' });
  }
  res.json(sku);
});

// 新增SKU
router.post('/', authMiddleware, requirePermission('sku.manage'), (req, res) => {
  const { code, name, spec, unit, category, default_price, min_stock, status, remark } = req.body;
  if (!code || !name || !unit || !category) {
    return res.status(400).json({ error: 'SKU编码、名称、单位、分类为必填' });
  }
  const db = getDB();
  const existing = db.prepare('SELECT id FROM skus WHERE code = ?').get(code);
  if (existing) {
    return res.status(400).json({ error: 'SKU编码已存在' });
  }
  const result = db.prepare(`
    INSERT INTO skus (code, name, spec, unit, category, default_price, min_stock, status, remark)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(code, name, spec || '', unit, category, default_price || 0, min_stock || 0, status || 'active', remark || '');
  
  // 自动生成二维码记录
  db.prepare('INSERT INTO qr_codes (sku_id, code) VALUES (?, ?)').run(result.lastInsertRowid, code);
  
  logOperation(req.user.id, req.user.name, 'create', `SKU:${code}`, null, req.body);
  res.json({ id: result.lastInsertRowid, message: 'SKU创建成功' });
});

// 编辑SKU
router.put('/:id', authMiddleware, requirePermission('sku.manage'), (req, res) => {
  const { id } = req.params;
  const { code, name, spec, unit, category, default_price, min_stock, status, remark } = req.body;
  const db = getDB();
  const sku = db.prepare('SELECT * FROM skus WHERE id = ?').get(id);
  if (!sku) {
    return res.status(404).json({ error: 'SKU不存在' });
  }
  db.prepare(`
    UPDATE skus SET code = ?, name = ?, spec = ?, unit = ?, category = ?, default_price = ?, min_stock = ?, status = ?, remark = ?, updated_at = datetime('now','localtime')
    WHERE id = ?
  `).run(code, name, spec || '', unit, category, default_price || 0, min_stock || 0, status, remark || '', id);
  
  logOperation(req.user.id, req.user.name, 'update', `SKU:${code}`, sku, req.body);
  res.json({ message: 'SKU更新成功' });
});

// 删除SKU（有库存或历史记录的不能删，只能停用）
router.delete('/:id', authMiddleware, requirePermission('sku.manage'), (req, res) => {
  const { id } = req.params;
  const db = getDB();
  const sku = db.prepare('SELECT * FROM skus WHERE id = ?').get(id);
  if (!sku) {
    return res.status(404).json({ error: 'SKU不存在' });
  }
  // 检查是否有库存记录
  const invCount = db.prepare('SELECT COALESCE(SUM(quantity), 0) as total FROM inventory WHERE sku_id = ?').get(id);
  if (invCount.total > 0) {
    return res.status(400).json({ error: '该SKU有库存记录，不能删除，只能停用' });
  }
  // 检查是否有出入库记录
  const recordCount = db.prepare('SELECT COUNT(*) as count FROM inventory_records WHERE sku_id = ?').get(id);
  if (recordCount.count > 0) {
    return res.status(400).json({ error: '该SKU有出入库记录，不能删除，只能停用' });
  }
  db.prepare('DELETE FROM skus WHERE id = ?').run(id);
  db.prepare('DELETE FROM qr_codes WHERE sku_id = ?').run(id);
  logOperation(req.user.id, req.user.name, 'delete', `SKU:${sku.code}`, sku, null);
  res.json({ message: 'SKU删除成功' });
});

// 管理员专用：批量清空SKU（绕过库存/历史校验）
// 仅用于重新初始化SKU编码等管理场景，会同时清空对应的二维码记录
router.post('/wipe-all', authMiddleware, requirePermission('sku.manage'), (req, res) => {
  const db = getDB();
  const result = db.transaction(() => {
    // 先记下当前所有 SKU 编码以便日志
    const before = db.prepare('SELECT code FROM skus').all().map(r => r.code);
    const qrDel = db.prepare('DELETE FROM qr_codes').run();
    const skuDel = db.prepare('DELETE FROM skus').run();
    return { sku_deleted: skuDel.changes, qr_deleted: qrDel.changes, codes: before };
  })();
  logOperation(req.user.id, req.user.name, 'wipe', 'SKU:全部', null, { sku_deleted: result.sku_deleted, qr_deleted: result.qr_deleted });
  res.json({ message: `已清空 ${result.sku_deleted} 条SKU`, sku_deleted: result.sku_deleted, qr_deleted: result.qr_deleted });
});

// 批量导入SKU
router.post('/import', authMiddleware, requirePermission('sku.manage'), (req, res) => {
  const { items } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: '导入数据不能为空' });
  }
  const db = getDB();
  const insertSku = db.prepare(`
    INSERT OR IGNORE INTO skus (code, name, spec, unit, category, default_price, min_stock, status, remark)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertQr = db.prepare('INSERT OR IGNORE INTO qr_codes (sku_id, code) VALUES (?, ?)');
  
  let success = 0, failed = 0;
  const insertMany = db.transaction(() => {
    for (const item of items) {
      try {
        if (!item.code || !item.name || !item.unit || !item.category) {
          failed++;
          continue;
        }
        const result = insertSku.run(item.code, item.name, item.spec || '', item.unit, item.category, item.default_price || 0, item.min_stock || 0, item.status || 'active', item.remark || '');
        if (result.changes > 0) {
          insertQr.run(result.lastInsertRowid, item.code);
          success++;
        } else {
          failed++;
        }
      } catch (err) {
        failed++;
      }
    }
  });
  insertMany();
  logOperation(req.user.id, req.user.name, 'import', `SKU批量导入`, null, { success, failed });
  res.json({ message: `导入完成：成功${success}条，失败${failed}条`, success, failed });
});

export default router;

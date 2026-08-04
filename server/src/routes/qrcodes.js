import express from 'express';
import { getDB } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// 获取二维码列表
router.get('/', authMiddleware, (req, res) => {
  const db = getDB();
  const { keyword } = req.query;
  let sql = `
    SELECT q.id, q.code, q.sku_id, s.name as sku_name, s.spec, s.unit, s.category,
           q.created_at
    FROM qr_codes q
    JOIN skus s ON q.sku_id = s.id
  `;
  const params = [];
  if (keyword) {
    sql += ' WHERE q.code LIKE ? OR s.name LIKE ?';
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  sql += ' ORDER BY q.id DESC';
  res.json(db.prepare(sql).all(...params));
});

// 批量生成二维码（如果还没生成的话）
router.post('/generate', authMiddleware, (req, res) => {
  const { skuIds } = req.body;
  const db = getDB();
  let generated = 0;
  for (const skuId of skuIds) {
    const sku = db.prepare('SELECT * FROM skus WHERE id = ?').get(skuId);
    if (sku) {
      const existing = db.prepare('SELECT id FROM qr_codes WHERE sku_id = ?').get(skuId);
      if (!existing) {
        db.prepare('INSERT INTO qr_codes (sku_id, code) VALUES (?, ?)').run(skuId, sku.code);
        generated++;
      }
    }
  }
  res.json({ message: `生成完成，新增${generated}个二维码`, generated });
});

export default router;

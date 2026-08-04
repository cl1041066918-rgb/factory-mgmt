import express from 'express';
import cors from 'cors';
import https from 'https';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initDB } from './db.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import skuRoutes from './routes/skus.js';
import customerRoutes from './routes/customers.js';
import supplierRoutes from './routes/suppliers.js';
import qrcodeRoutes from './routes/qrcodes.js';
import inventoryRoutes from './routes/inventory.js';
import orderRoutes from './routes/orders.js';
import salesRoutes from './routes/sales.js';
import purchaseRoutes from './routes/purchases.js';
import canteenRoutes from './routes/canteen.js';
import statsRoutes from './routes/stats.js';
import logRoutes from './routes/logs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 初始化数据库
initDB();

const app = express();
const PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// API路由
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/skus', skuRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/qrcodes', qrcodeRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/canteen', canteenRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/logs', logRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 静态文件服务（前端构建产物）
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA 回退：所有非API请求返回 index.html
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: '接口不存在' });
    }
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// HTTP 服务（电脑端使用）
http.createServer(app).listen(PORT, '0.0.0.0', () => {
  console.log(`[HTTP] 工厂管理系统: http://localhost:${PORT}`);
});

// HTTPS 服务（手机端扫码需要）
const certDir = path.join(__dirname, '..', 'data', 'certs');
const keyPath = path.join(certDir, 'key.pem');
const certPath = path.join(certDir, 'cert.pem');

if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  const httpsOptions = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };
  https.createServer(httpsOptions, app).listen(HTTPS_PORT, '0.0.0.0', () => {
    console.log(`[HTTPS] 工厂管理系统(手机扫码): https://192.168.124.3:${HTTPS_PORT}`);
  });
} else {
  console.log('[HTTPS] 未找到证书，跳过 HTTPS 服务');
}

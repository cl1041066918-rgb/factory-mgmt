import { getDB } from '../db.js';

// 操作日志记录函数
export function logOperation(userId, userName, operationType, target, beforeValue = null, afterValue = null) {
  try {
    const db = getDB();
    db.prepare(`
      INSERT INTO operation_logs (user_id, user_name, operation_type, target, before_value, after_value)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, userName, operationType, target, 
      beforeValue ? JSON.stringify(beforeValue) : null,
      afterValue ? JSON.stringify(afterValue) : null
    );
  } catch (err) {
    console.error('记录操作日志失败:', err.message);
  }
}

// 日志记录中间件
export function logMiddleware(operationType, target) {
  return (req, res, next) => {
    const oldSend = res.send;
    res.send = function(data) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        if (req.user) {
          logOperation(
            req.user.id,
            req.user.name,
            operationType,
            target || `${req.method} ${req.originalUrl}`,
            req.method !== 'GET' ? req.body : null,
            null
          );
        }
      }
      oldSend.apply(res, arguments);
    };
    next();
  };
}

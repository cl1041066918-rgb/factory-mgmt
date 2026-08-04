import jwt from 'jsonwebtoken';

const SECRET_KEY = 'factory-mgmt-secret-key-2026';

// 角色权限映射
export const ROLE_PERMISSIONS = {
  admin: ['*'], // 全部权限
  production: [
    'purchase.view', 'purchase.create', 'purchase.edit.own',
    'canteen.view', 'canteen.create', 'canteen.edit.own',
    'inventory.finished.view', 'inventory.finished.in',
    'inventory.material.view', 'inventory.material.in', 'inventory.material.out',
    'inventory.material.records',
  ],
  service: [
    'sales.view', 'sales.create', 'sales.edit.own', 'sales.stats',
    'order.view', 'order.create', 'order.edit', 'order.status', 'order.stats',
    'inventory.finished.view',
    'inventory.packaging.view',
  ],
  shipping: [
    'order.view.pending', 'order.ship',
    'inventory.finished.view', 'inventory.finished.out',
    'inventory.packaging.view', 'inventory.packaging.out',
  ],
};

export function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, name: user.name, role: user.role },
    SECRET_KEY,
    { expiresIn: '24h' }
  );
}

export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录或登录已过期' });
  }
  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: '未登录' });
    }
    const permissions = ROLE_PERMISSIONS[req.user.role] || [];
    if (permissions.includes('*') || permissions.includes(permission)) {
      next();
    } else {
      return res.status(403).json({ error: '无操作权限' });
    }
  };
}

// 获取当前用户菜单权限
export function getMenuPermissions(role) {
  return ROLE_PERMISSIONS[role] || [];
}

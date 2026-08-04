import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import useAuthStore from './store/auth';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Skus from './pages/Skus';
import Customers from './pages/Customers';
import Suppliers from './pages/Suppliers';
import QrCodes from './pages/QrCodes';
import SalesBills from './pages/SalesBills';
import PurchaseBills from './pages/PurchaseBills';
import CanteenBills from './pages/CanteenBills';
import Orders from './pages/Orders';
import Inventory from './pages/Inventory';
import Users from './pages/Users';
import ChangePassword from './pages/ChangePassword';
import OperationLogs from './pages/OperationLogs';

// 权限路由守卫
function PrivateRoute({ children }) {
  const { token } = useAuthStore();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

// 角色路由守卫
function RoleRoute({ children, roles }) {
  const { user } = useAuthStore();
  if (!user || !roles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <MainLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          
          {/* 基础数据管理 - 仅管理员 */}
          <Route path="skus" element={<RoleRoute roles={['admin']}><Skus /></RoleRoute>} />
          <Route path="customers" element={<RoleRoute roles={['admin']}><Customers /></RoleRoute>} />
          <Route path="suppliers" element={<RoleRoute roles={['admin']}><Suppliers /></RoleRoute>} />
          <Route path="qrcodes" element={<RoleRoute roles={['admin']}><QrCodes /></RoleRoute>} />
          
          {/* 销售账单 - 管理员+客服 */}
          <Route path="sales" element={<RoleRoute roles={['admin', 'service']}><SalesBills /></RoleRoute>} />
          
          {/* 采购账单 - 管理员+生产线 */}
          <Route path="purchases" element={<RoleRoute roles={['admin', 'production']}><PurchaseBills /></RoleRoute>} />
          
          {/* 食堂账单 - 管理员+生产线 */}
          <Route path="canteen" element={<RoleRoute roles={['admin', 'production']}><CanteenBills /></RoleRoute>} />
          
          {/* 订单管理 - 管理员+客服+发货 */}
          <Route path="orders" element={<RoleRoute roles={['admin', 'service', 'shipping']}><Orders /></RoleRoute>} />
          
          {/* 仓库管理 */}
          <Route path="inventory/finished" element={<RoleRoute roles={['admin', 'production', 'service', 'shipping']}><Inventory warehouseType="finished" /></RoleRoute>} />
          <Route path="inventory/material" element={<RoleRoute roles={['admin', 'production']}><Inventory warehouseType="material" /></RoleRoute>} />
          <Route path="inventory/packaging" element={<RoleRoute roles={['admin', 'service', 'shipping']}><Inventory warehouseType="packaging" /></RoleRoute>} />
          
          {/* 系统设置 - 仅管理员 */}
          <Route path="users" element={<RoleRoute roles={['admin']}><Users /></RoleRoute>} />
          <Route path="change-password" element={<ChangePassword />} />
          <Route path="logs" element={<RoleRoute roles={['admin']}><OperationLogs /></RoleRoute>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

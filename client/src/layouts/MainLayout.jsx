import React, { useState, useEffect } from 'react';
import { Layout, Menu, Avatar, Dropdown, Typography, Badge, theme, Drawer, Button } from 'antd';
import {
  DashboardOutlined,
  AppstoreOutlined,
  ShoppingOutlined,
  ShoppingCartOutlined,
  FileTextOutlined,
  ShopOutlined,
  InboxOutlined,
  SettingOutlined,
  HistoryOutlined,
  QrcodeOutlined,
  LogoutOutlined,
  UserOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MenuOutlined,
  HomeOutlined,
  EllipsisOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import useAuthStore from '../store/auth';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const ROLE_NAMES = {
  admin: '主管理者',
  production: '生产线管理者',
  service: '客服管理者',
  shipping: '发货部门',
};

// 根据角色生成菜单
function getMenuItems(role) {
  const allMenus = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: '数据看板',
      roles: ['admin', 'production', 'service', 'shipping'],
    },
    {
      key: 'basic',
      icon: <AppstoreOutlined />,
      label: '基础数据管理',
      roles: ['admin'],
      children: [
        {
          key: 'sku-group',
          icon: <InboxOutlined />,
          label: 'SKU库',
          roles: ['admin'],
          children: [
            { key: '/skus?tab=finished', label: '成品SKU', roles: ['admin'] },
            { key: '/skus?tab=material', label: '生产材料SKU', roles: ['admin'] },
            { key: '/skus?tab=packaging', label: '包材SKU', roles: ['admin'] },
          ],
        },
        { key: '/customers', icon: <UserOutlined />, label: '客户档案', roles: ['admin'] },
        { key: '/suppliers', icon: <ShopOutlined />, label: '供应商档案', roles: ['admin'] },
        { key: '/qrcodes', icon: <QrcodeOutlined />, label: '二维码管理', roles: ['admin'] },
      ],
    },
    {
      key: '/sales',
      icon: <ShoppingOutlined />,
      label: '销售账单',
      roles: ['admin', 'service'],
    },
    {
      key: '/purchases',
      icon: <ShoppingCartOutlined />,
      label: '采购账单',
      roles: ['admin', 'production'],
    },
    {
      key: '/canteen',
      icon: <FileTextOutlined />,
      label: '食堂账单',
      roles: ['admin', 'production'],
    },
    {
      key: '/orders',
      icon: <FileTextOutlined />,
      label: '订单管理',
      roles: ['admin', 'service', 'shipping'],
    },
    {
      key: 'warehouse',
      icon: <InboxOutlined />,
      label: '仓库管理',
      roles: ['admin', 'production', 'service', 'shipping'],
      children: [
        { key: '/inventory/finished', label: '成品现货库存', roles: ['admin', 'production', 'service', 'shipping'] },
        { key: '/inventory/material', label: '生产材料库存', roles: ['admin', 'production'] },
        { key: '/inventory/packaging', label: '包装材料库存', roles: ['admin', 'service', 'shipping'] },
      ],
    },
    {
      key: 'system',
      icon: <SettingOutlined />,
      label: '系统设置',
      roles: ['admin'],
      children: [
        { key: '/users', icon: <UserOutlined />, label: '账号管理', roles: ['admin'] },
        { key: '/change-password', icon: <SettingOutlined />, label: '修改密码', roles: ['admin', 'production', 'service', 'shipping'] },
      ],
    },
    {
      key: '/logs',
      icon: <HistoryOutlined />,
      label: '操作日志',
      roles: ['admin'],
    },
  ];

  function filterMenus(menus) {
    return menus
      .filter((item) => item.roles.includes(role))
      .map((item) => {
        if (item.children) {
          const children = filterMenus(item.children);
          if (children.length === 0) return null;
          return { ...item, children };
        }
        return item;
      })
      .filter(Boolean);
  }

  return filterMenus(allMenus);
}

// 获取移动端底部导航栏的主菜单项（最多4个+更多）
function getMobileTabs(role) {
  const tabMap = {
    admin: [
      { key: '/dashboard', label: '看板', icon: <HomeOutlined /> },
      { key: '/orders', label: '订单', icon: <FileTextOutlined /> },
      { key: 'warehouse', label: '仓库', icon: <InboxOutlined /> },
      { key: '/sales', label: '账单', icon: <ShoppingOutlined /> },
    ],
    production: [
      { key: '/dashboard', label: '看板', icon: <HomeOutlined /> },
      { key: '/purchases', label: '采购', icon: <ShoppingCartOutlined /> },
      { key: 'warehouse', label: '仓库', icon: <InboxOutlined /> },
      { key: '/canteen', label: '食堂', icon: <FileTextOutlined /> },
    ],
    service: [
      { key: '/dashboard', label: '看板', icon: <HomeOutlined /> },
      { key: '/orders', label: '订单', icon: <FileTextOutlined /> },
      { key: 'warehouse', label: '仓库', icon: <InboxOutlined /> },
      { key: '/sales', label: '销售', icon: <ShoppingOutlined /> },
    ],
    shipping: [
      { key: '/dashboard', label: '看板', icon: <HomeOutlined /> },
      { key: '/orders', label: '订单', icon: <FileTextOutlined /> },
      { key: 'warehouse', label: '仓库', icon: <InboxOutlined /> },
    ],
  };
  return tabMap[role] || [];
}

export default function MainLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [warehouseDrawerOpen, setWarehouseDrawerOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { token: { colorBgContainer } } = theme.useToken();

  // 检测屏幕宽度
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const menuItems = getMenuItems(user.role);
  const mobileTabs = getMobileTabs(user.role);

  const handleMenuClick = ({ key }) => {
    navigate(key);
    setDrawerOpen(false);
    setWarehouseDrawerOpen(false);
  };

  // 确定当前选中的菜单和展开的子菜单
  const selectedKey = location.pathname + (location.search || '');
  const selectedPathOnly = location.pathname;
  const openKeys = [];
  if (selectedPathOnly.startsWith('/skus') || selectedPathOnly.startsWith('/customers') || selectedPathOnly.startsWith('/suppliers') || selectedPathOnly.startsWith('/qrcodes')) {
    openKeys.push('basic');
    if (selectedPathOnly.startsWith('/skus')) openKeys.push('sku-group');
  }
  if (selectedKey.startsWith('/inventory')) {
    openKeys.push('warehouse');
  }
  if (selectedKey.startsWith('/users') || selectedKey === '/change-password') {
    openKeys.push('system');
  }

  const userMenu = {
    items: [
      {
        key: 'role',
        label: `角色：${ROLE_NAMES[user.role]}`,
        disabled: true,
      },
      { type: 'divider' },
      {
        key: 'change-password',
        label: '修改密码',
        icon: <SettingOutlined />,
        onClick: () => navigate('/change-password'),
      },
      { type: 'divider' },
      {
        key: 'logout',
        label: '退出登录',
        icon: <LogoutOutlined />,
        onClick: () => {
          logout();
          navigate('/login');
        },
      },
    ],
  };

  // 仓库子菜单项
  const warehouseChildren = menuItems.find(m => m.key === 'warehouse')?.children || [];

  // 移动端底部导航栏点击处理
  const handleTabClick = (tabKey) => {
    if (tabKey === 'warehouse') {
      // 仓库需要选择子项
      if (warehouseChildren.length === 1) {
        navigate(warehouseChildren[0].key);
      } else {
        setWarehouseDrawerOpen(true);
      }
    } else {
      navigate(tabKey);
    }
  };

  // 判断当前激活的tab
  const getActiveTab = () => {
    if (selectedKey === '/dashboard') return '/dashboard';
    if (selectedKey.startsWith('/inventory')) return 'warehouse';
    const match = mobileTabs.find(t => t.key === selectedKey);
    return match ? match.key : '';
  };

  // 移动端布局
  if (isMobile) {
    return (
      <Layout style={{ minHeight: '100vh' }}>
        <Header style={{
          padding: '0 12px',
          background: colorBgContainer,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 52,
          position: 'sticky',
          top: 0,
          zIndex: 100,
          boxShadow: '0 1px 4px rgba(0,21,41,.08)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>🏭</span>
            <Text strong style={{ fontSize: 15 }}>工厂管理</Text>
          </div>
          <Dropdown menu={userMenu} placement="bottomRight">
            <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Avatar size="small" style={{ backgroundColor: '#1677ff' }} icon={<UserOutlined />} />
              <Text style={{ fontSize: 13 }}>{user.name}</Text>
            </div>
          </Dropdown>
        </Header>

        <Content style={{ margin: 0, paddingBottom: 60, minHeight: 'calc(100vh - 52px)' }}>
          <Outlet />
        </Content>

        {/* 底部导航栏 */}
        <div className="mobile-tabbar">
          {mobileTabs.map((tab) => {
            const active = getActiveTab() === tab.key;
            return (
              <div
                key={tab.key}
                className={`mobile-tab-item ${active ? 'active' : ''}`}
                onClick={() => handleTabClick(tab.key)}
              >
                <span className="mobile-tab-icon">{tab.icon}</span>
                <span className="mobile-tab-label">{tab.label}</span>
              </div>
            );
          })}
          {/* 更多按钮 */}
          <div
            className={`mobile-tab-item ${getActiveTab() === '' ? 'active' : ''}`}
            onClick={() => setDrawerOpen(true)}
          >
            <EllipsisOutlined className="mobile-tab-icon" />
            <span className="mobile-tab-label">更多</span>
          </div>
        </div>

        {/* 更多菜单抽屉 */}
        <Drawer
          title="全部功能"
          placement="right"
          onClose={() => setDrawerOpen(false)}
          open={drawerOpen}
          width="80%"
          styles={{ body: { padding: 0 } }}
        >
          <Menu
            mode="inline"
            selectedKeys={[selectedKey]}
            defaultOpenKeys={openKeys}
            items={menuItems}
            onClick={handleMenuClick}
            style={{ borderRight: 'none' }}
          />
        </Drawer>

        {/* 仓库子菜单抽屉 */}
        <Drawer
          title="选择仓库"
          placement="bottom"
          onClose={() => setWarehouseDrawerOpen(false)}
          open={warehouseDrawerOpen}
          height="auto"
          styles={{ body: { padding: '8px 0' } }}
        >
          {warehouseChildren.map((child) => (
            <div
              key={child.key}
              className="mobile-warehouse-item"
              onClick={() => handleMenuClick({ key: child.key })}
            >
              <InboxOutlined />
              <span style={{ marginLeft: 12 }}>{child.label}</span>
            </div>
          ))}
        </Drawer>
      </Layout>
    );
  }

  // 桌面端布局
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={220}
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
        }}
      >
        <div style={{
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: collapsed ? 14 : 18,
          fontWeight: 'bold',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        }}>
          {collapsed ? '🏭' : '🏭 工厂管理系统'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          defaultOpenKeys={openKeys}
          items={menuItems}
          onClick={handleMenuClick}
        />
      </Sider>
      <Layout style={{ marginLeft: collapsed ? 80 : 220, transition: 'margin-left 0.2s' }}>
        <Header style={{
          padding: '0 24px',
          background: colorBgContainer,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 1px 4px rgba(0,21,41,.08)',
          position: 'sticky',
          top: 0,
          zIndex: 1,
        }}>
          {React.createElement(collapsed ? MenuUnfoldOutlined : MenuFoldOutlined, {
            onClick: () => setCollapsed(!collapsed),
            style: { fontSize: 18, cursor: 'pointer' },
          })}
          <Dropdown menu={userMenu} placement="bottomRight">
            <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar style={{ backgroundColor: '#1677ff' }} icon={<UserOutlined />} />
              <Text>{user.name}</Text>
            </div>
          </Dropdown>
        </Header>
        <Content style={{ margin: 0, minHeight: 280 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

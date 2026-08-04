import React, { useEffect, useState } from 'react';
import { Card, Col, Row, Statistic, Table, Tag, Typography, Spin, Empty, Progress } from 'antd';
import {
  ShoppingOutlined,
  ShoppingCartOutlined,
  InboxOutlined,
  TeamOutlined,
  AlertOutlined,
  DollarOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import useAuthStore from '../store/auth';

const { Title, Text } = Typography;
const { Meta } = Card;

const ORDER_STATUS_MAP = {
  pending: { label: '待发货', color: 'orange' },
  shipped: { label: '已发货', color: 'blue' },
  completed: { label: '已完成', color: 'green' },
  cancelled: { label: '已取消', color: 'default' },
  returning: { label: '退货中', color: 'red' },
};

const CATEGORY_MAP = {
  finished: '成品',
  material: '生产材料',
  packaging: '包装材料',
};

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/stats/dashboard').then((res) => {
      setData(res);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>;
  if (!data) return <Empty />;

  // 管理员看板
  if (user.role === 'admin') {
    const orderTotal = Object.values(data.orderStats).reduce((a, b) => a + b, 0);
    return (
      <div className="page-container">
        <Title level={4}>数据看板</Title>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={6}>
            <Card hoverable onClick={() => navigate('/orders')}>
              <Statistic title="订单总数" value={orderTotal} prefix={<ShoppingOutlined />} />
              <div style={{ marginTop: 8 }}>
                <Tag color="orange">待发货 {data.orderStats.pending}</Tag>
                <Tag color="blue">已发货 {data.orderStats.shipped}</Tag>
                <Tag color="green">已完成 {data.orderStats.completed}</Tag>
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card hoverable onClick={() => navigate('/sales')}>
              <Statistic title="今日销售" value={data.salesToday.total} precision={2} prefix={<DollarOutlined />} suffix="元" />
              <Text type="secondary">{data.salesToday.count} 笔账单</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card hoverable onClick={() => navigate('/purchases')}>
              <Statistic title="今日采购" value={data.purchaseToday.total} precision={2} prefix={<ShoppingCartOutlined />} suffix="元" />
              <Text type="secondary">{data.purchaseToday.count} 笔采购单</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card hoverable onClick={() => navigate('/inventory/finished')}>
              <Statistic title="低库存预警" value={data.lowStockCount} prefix={<AlertOutlined />} valueStyle={{ color: data.lowStockCount > 0 ? '#ff4d4f' : '#3f8600' }} />
              <Text type="secondary">待补货SKU</Text>
            </Card>
          </Col>
        </Row>

        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24} sm={12} md={6}>
            <Card><Statistic title="活跃SKU数" value={data.totalSkus} prefix={<InboxOutlined />} /></Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card><Statistic title="客户总数" value={data.totalCustomers} prefix={<TeamOutlined />} /></Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card><Statistic title="供应商总数" value={data.totalSuppliers} prefix={<TeamOutlined />} /></Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card hoverable onClick={() => navigate('/purchases')}>
              <Statistic title="待到货采购单" value={data.pendingPurchases} prefix={<ClockCircleOutlined />} valueStyle={{ color: data.pendingPurchases > 0 ? '#fa8c16' : '#3f8600' }} />
            </Card>
          </Col>
        </Row>

        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24} md={8}>
            <Card title="库存价值（元）" size="small">
              {data.inventoryValue.map((item) => (
                <div key={item.category} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <Text>{CATEGORY_MAP[item.category] || item.category}</Text>
                  <Text strong>{item.value.toFixed(2)} 元 ({item.total_qty})</Text>
                </div>
              ))}
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card title="本月食堂支出" size="small">
              <Statistic value={data.canteenThisMonth.total} precision={2} prefix="¥" />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card title="最近订单" size="small" extra={<a onClick={() => navigate('/orders')}>查看全部</a>}>
              <Table
                size="small"
                pagination={false}
                dataSource={data.recentOrders}
                rowKey="order_no"
                columns={[
                  { title: '订单号', dataIndex: 'order_no', width: 140, ellipsis: true },
                  { title: '客户', dataIndex: 'customer_name', ellipsis: true },
                  { title: '状态', dataIndex: 'status', width: 80, render: (v) => <Tag color={ORDER_STATUS_MAP[v]?.color}>{ORDER_STATUS_MAP[v]?.label}</Tag> },
                  { title: '金额', dataIndex: 'total_amount', width: 80, render: (v) => `¥${v.toFixed(0)}` },
                ]}
              />
            </Card>
          </Col>
        </Row>
      </div>
    );
  }

  // 客服看板
  if (user.role === 'service') {
    const orderTotal = Object.values(data.orderStats).reduce((a, b) => a + b, 0);
    return (
      <div className="page-container">
        <Title level={4}>数据看板</Title>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={8}>
            <Card hoverable onClick={() => navigate('/orders')}>
              <Statistic title="订单总数" value={orderTotal} prefix={<ShoppingOutlined />} />
              <div style={{ marginTop: 8 }}>
                <Tag color="orange">待发货 {data.orderStats.pending}</Tag>
                <Tag color="blue">已发货 {data.orderStats.shipped}</Tag>
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card hoverable onClick={() => navigate('/sales')}>
              <Statistic title="今日销售" value={data.mySalesToday.total} precision={2} prefix={<DollarOutlined />} suffix="元" />
              <Text type="secondary">{data.mySalesToday.count} 笔账单</Text>
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic title="今日录单" value={data.myOrdersToday} prefix={<ShoppingOutlined />} />
              <Text type="secondary">今天录入的订单数</Text>
            </Card>
          </Col>
        </Row>
        <Card title="最近订单" style={{ marginTop: 16 }} extra={<a onClick={() => navigate('/orders')}>查看全部</a>}>
          <Table
            size="small"
            pagination={false}
            dataSource={data.recentOrders}
            rowKey="order_no"
            columns={[
              { title: '订单号', dataIndex: 'order_no', width: 140, ellipsis: true },
              { title: '客户', dataIndex: 'customer_name', ellipsis: true },
              { title: '平台', dataIndex: 'platform', width: 80 },
              { title: '状态', dataIndex: 'status', width: 80, render: (v) => <Tag color={ORDER_STATUS_MAP[v]?.color}>{ORDER_STATUS_MAP[v]?.label}</Tag> },
              { title: '金额', dataIndex: 'total_amount', width: 80, render: (v) => `¥${v.toFixed(0)}` },
            ]}
          />
        </Card>
      </div>
    );
  }

  // 发货部门看板
  if (user.role === 'shipping') {
    return (
      <div className="page-container">
        <Title level={4}>发货看板</Title>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={8}>
            <Card hoverable onClick={() => navigate('/orders')}>
              <Statistic title="待发货订单" value={data.pendingOrders} prefix={<ClockCircleOutlined />} valueStyle={{ color: data.pendingOrders > 0 ? '#fa8c16' : '#3f8600' }} />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic title="今日已发货" value={data.shippedToday} prefix={<ShoppingOutlined />} />
            </Card>
          </Col>
        </Row>
        <Card title="待发货订单列表" style={{ marginTop: 16 }} extra={<a onClick={() => navigate('/orders')}>查看全部</a>}>
          <Table
            size="small"
            pagination={false}
            dataSource={data.pendingOrderList}
            rowKey="order_no"
            columns={[
              { title: '订单号', dataIndex: 'order_no', width: 140, ellipsis: true },
              { title: '客户', dataIndex: 'customer_name', ellipsis: true },
              { title: '联系人', dataIndex: 'contact', width: 80 },
              { title: '电话', dataIndex: 'phone', width: 120 },
              { title: '收货地址', dataIndex: 'address', ellipsis: true },
              { title: '金额', dataIndex: 'total_amount', width: 80, render: (v) => `¥${v.toFixed(0)}` },
            ]}
          />
        </Card>
      </div>
    );
  }

  // 生产线看板
  if (user.role === 'production') {
    return (
      <div className="page-container">
        <Title level={4}>生产线看板</Title>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={8}>
            <Card hoverable onClick={() => navigate('/purchases')}>
              <Statistic title="待到货采购单" value={data.pendingPurchases} prefix={<ClockCircleOutlined />} valueStyle={{ color: data.pendingPurchases > 0 ? '#fa8c16' : '#3f8600' }} />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card hoverable onClick={() => navigate('/purchases')}>
              <Statistic title="今日采购" value={data.myPurchasesToday.total} precision={2} prefix={<ShoppingCartOutlined />} suffix="元" />
              <Text type="secondary">{data.myPurchasesToday.count} 笔</Text>
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card hoverable onClick={() => navigate('/canteen')}>
              <Statistic title="本月食堂支出" value={data.canteenThisMonth.total} precision={2} prefix="¥" />
            </Card>
          </Col>
        </Row>
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24} sm={12}>
            <Card hoverable onClick={() => navigate('/inventory/material')}>
              <Statistic title="材料低库存预警" value={data.materialLowStock} prefix={<AlertOutlined />} valueStyle={{ color: data.materialLowStock > 0 ? '#ff4d4f' : '#3f8600' }} />
              <Text type="secondary">需补货的生产材料</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12}>
            <Card hoverable onClick={() => navigate('/inventory/finished')}>
              <InboxOutlined style={{ fontSize: 24, color: '#1677ff' }} />
              <Meta title="成品入库" description="生产完成后扫码入库" style={{ marginTop: 8 }} />
            </Card>
          </Col>
        </Row>
      </div>
    );
  }

  return <Empty />;
}

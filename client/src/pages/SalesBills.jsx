import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Input, InputNumber, Select, Tag, Space, message, Typography, DatePicker, Tabs, Descriptions, Row, Col, Statistic } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, ReloadOutlined, EyeOutlined, BarChartOutlined } from '@ant-design/icons';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import api from '../utils/api';
import useAuthStore from '../store/auth';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { TextArea } = Input;

const PLATFORM_OPTIONS = ['1688', '淘宝', '拼多多', '抖音', '微信', '线下', '其他'];
const PLATFORM_COLORS = ['#1677ff', '#52c41a', '#fa8c16', '#eb2f96', '#722ed1', '#13c2c2', '#999999'];

// 小计单元格：独立组件以遵守 Hooks 规则
const SubtotalCell = ({ name }) => {
  const q = Form.useWatch(['items', name, 'quantity']);
  const p = Form.useWatch(['items', name, 'unit_price']);
  return <Text>¥{((q || 0) * (p || 0)).toFixed(2)}</Text>;
};

export default function SalesBills() {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ keyword: '', billType: '', platform: '', dateRange: null });
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [form] = Form.useForm();
  const [skuList, setSkuList] = useState([]);
  const [customerList, setCustomerList] = useState([]);
  const [orderList, setOrderList] = useState([]);
  const [activeTab, setActiveTab] = useState('list');
  const [stats, setStats] = useState(null);
  const { user } = useAuthStore();

  const fetchData = async (p = 1) => {
    setLoading(true);
    try {
      const params = { page: p, pageSize: 50 };
      if (filters.keyword) params.keyword = filters.keyword;
      if (filters.billType) params.billType = filters.billType;
      if (filters.platform) params.platform = filters.platform;
      if (filters.dateRange) {
        params.startDate = filters.dateRange[0].format('YYYY-MM-DD');
        params.endDate = filters.dateRange[1].format('YYYY-MM-DD');
      }
      const res = await api.get('/sales', { params });
      setData(res.list);
      setTotal(res.total);
      setPage(p);
    } catch (err) { message.error(err.message); }
    setLoading(false);
  };

  const fetchStats = async () => {
    try {
      const params = {};
      if (filters.dateRange) {
        params.startDate = filters.dateRange[0].format('YYYY-MM-DD');
        params.endDate = filters.dateRange[1].format('YYYY-MM-DD');
      }
      const res = await api.get('/sales/stats/summary', { params });
      setStats(res);
    } catch (err) { message.error(err.message); }
  };

  useEffect(() => {
    api.get('/skus/all', { params: { category: 'finished' } }).then(setSkuList).catch(() => {});
    api.get('/customers/all').then(setCustomerList).catch(() => {});
    fetchData(1);
  }, []);

  const handleAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ bill_type: 'bulk', platform: '1688', order_date: dayjs() });
    setModalVisible(true);
  };

  const handleEdit = async (record) => {
    try {
      const res = await api.get(`/sales/${record.id}`);
      setEditing(res);
      form.setFieldsValue({ ...res, order_date: dayjs(res.order_date) });
      setModalVisible(true);
    } catch (err) { message.error(err.message); }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const items = form.getFieldValue('items') || [];
      if (!items || items.length === 0) { message.warning('请添加至少一条产品明细'); return; }
      const payload = {
        ...values,
        order_date: values.order_date?.format('YYYY-MM-DD'),
        items: items.map(item => ({
          ...item,
          sku_code: item.sku_code || (skuList.find(s => s.id === item.sku_id)?.code),
          product_name: item.product_name || (skuList.find(s => s.id === item.sku_id)?.name),
          subtotal: (item.quantity || 0) * (item.unit_price || 0),
        })),
      };
      if (editing) {
        await api.put(`/sales/${editing.id}`, payload);
        message.success('账单更新成功');
      } else {
        await api.post('/sales', payload);
        message.success('账单创建成功');
      }
      setModalVisible(false);
      fetchData(page);
    } catch (err) { if (err.errorFields) return; message.error(err.message); }
  };

  const handleDelete = (record) => {
    Modal.confirm({
      title: '确认删除', content: `确定要删除销售账单「${record.bill_no}」吗？`, okType: 'danger',
      onOk: async () => {
        try { await api.delete(`/sales/${record.id}`); message.success('删除成功'); fetchData(page); }
        catch (err) { message.error(err.message); }
      },
    });
  };

  const handleView = async (record) => {
    try {
      const res = await api.get(`/sales/${record.id}`);
      setDetail(res);
      setDetailVisible(true);
    } catch (err) { message.error(err.message); }
  };

  const handleTabChange = (key) => {
    setActiveTab(key);
    if (key === 'stats') fetchStats();
  };

  const columns = [
    { title: '账单号', dataIndex: 'bill_no', width: 150, fixed: 'left' },
    { title: '类型', dataIndex: 'bill_type', width: 90, render: (v) => <Tag color={v === 'bulk' ? 'blue' : 'orange'}>{v === 'bulk' ? '批量' : '零售'}</Tag> },
    { title: '客户', dataIndex: 'customer_name', width: 150, ellipsis: true },
    { title: '平台', dataIndex: 'platform', width: 80 },
    { title: '金额', dataIndex: 'total_amount', width: 100, render: (v) => `¥${v.toFixed(2)}` },
    { title: '日期', dataIndex: 'order_date', width: 110 },
    { title: '录入人', dataIndex: 'creator_name', width: 90 },
    { title: '操作', width: 160, fixed: 'right', render: (_, r) => (
      <Space size={0}>
        <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => handleView(r)}>详情</Button>
        <Button size="small" type="link" icon={<EditOutlined />} onClick={() => handleEdit(r)}>编辑</Button>
        <Button size="small" type="link" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r)}>删除</Button>
      </Space>
    )},
  ];

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4}>销售账单</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增账单</Button>
      </div>

      <Tabs activeKey={activeTab} onChange={handleTabChange} items={[
        { key: 'list', label: '账单列表', children: (
          <Card>
            <Space style={{ marginBottom: 16 }} wrap>
              <Input placeholder="搜索账单号/客户" value={filters.keyword} onChange={(e) => setFilters({ ...filters, keyword: e.target.value })} style={{ width: 200 }} onPressEnter={() => fetchData(1)} />
              <Select placeholder="类型" allowClear style={{ width: 100 }} value={filters.billType || undefined} onChange={(v) => setFilters({ ...filters, billType: v || '' })}
                options={[{ label: '批量销售', value: 'bulk' }, { label: '零售', value: 'retail' }]} />
              <Select placeholder="平台" allowClear style={{ width: 100 }} value={filters.platform || undefined} onChange={(v) => setFilters({ ...filters, platform: v || '' })}
                options={PLATFORM_OPTIONS.map(p => ({ label: p, value: p }))} />
              <RangePicker value={filters.dateRange} onChange={(v) => setFilters({ ...filters, dateRange: v })} />
              <Button type="primary" icon={<SearchOutlined />} onClick={() => fetchData(1)}>搜索</Button>
              <Button icon={<ReloadOutlined />} onClick={() => { setFilters({ keyword: '', billType: '', platform: '', dateRange: null }); fetchData(1); }}>重置</Button>
            </Space>
            <Table columns={columns} dataSource={data} rowKey="id" loading={loading}
              pagination={{ current: page, total, pageSize: 50, onChange: (p) => fetchData(p), showTotal: (t) => `共 ${t} 条` }}
              scroll={{ x: 1100 }} />
          </Card>
        )},
        { key: 'stats', label: <span><BarChartOutlined /> 统计分析</span>, children: (
          <div>
            {stats && (
              <>
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  <Col span={6}><Card><Statistic title="销售总额" value={stats.total.total} precision={2} prefix="¥" /></Card></Col>
                  <Col span={6}><Card><Statistic title="账单数" value={stats.total.count} /></Card></Col>
                  <Col span={6}><Card><Statistic title="平均单笔" value={stats.total.count > 0 ? stats.total.total / stats.total.count : 0} precision={2} prefix="¥" /></Card></Col>
                </Row>
                <Row gutter={16}>
                  <Col span={12}>
                    <Card title="各平台销售占比" size="small">
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie data={stats.byPlatform} dataKey="total" nameKey="platform" cx="50%" cy="50%" outerRadius={100} label={(e) => `${e.platform}: ¥${e.total.toFixed(0)}`}>
                            {stats.byPlatform.map((_, i) => <Cell key={i} fill={PLATFORM_COLORS[i % PLATFORM_COLORS.length]} />)}
                          </Pie>
                          <RTooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card title="近30日销售趋势" size="small">
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={stats.byDay}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={60} />
                          <YAxis />
                          <RTooltip />
                          <Bar dataKey="total" fill="#1677ff" name="销售额" />
                        </BarChart>
                      </ResponsiveContainer>
                    </Card>
                  </Col>
                </Row>
                <Row gutter={16} style={{ marginTop: 16 }}>
                  <Col span={12}>
                    <Card title="客户销售排名 TOP20" size="small">
                      <Table size="small" pagination={false} dataSource={stats.byCustomer} rowKey="customer_name"
                        columns={[
                          { title: '排名', width: 50, render: (_, __, i) => i + 1 },
                          { title: '客户', dataIndex: 'customer_name', ellipsis: true },
                          { title: '笔数', dataIndex: 'count', width: 60 },
                          { title: '金额', dataIndex: 'total', width: 100, render: (v) => `¥${v.toFixed(2)}` },
                        ]} />
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card title="产品销量排名 TOP20" size="small">
                      <Table size="small" pagination={false} dataSource={stats.byProduct} rowKey="sku_code"
                        columns={[
                          { title: '排名', width: 50, render: (_, __, i) => i + 1 },
                          { title: 'SKU', dataIndex: 'sku_code', width: 100 },
                          { title: '名称', dataIndex: 'product_name', ellipsis: true },
                          { title: '数量', dataIndex: 'total_qty', width: 70 },
                          { title: '金额', dataIndex: 'total_amount', width: 100, render: (v) => `¥${v.toFixed(2)}` },
                        ]} />
                    </Card>
                  </Col>
                </Row>
              </>
            )}
          </div>
        )},
      ]} />

      <Modal title={editing ? '编辑销售账单' : '新增销售账单'} open={modalVisible} onCancel={() => setModalVisible(false)} onOk={handleSubmit} width={800} okText="保存">
        <Form form={form} layout="vertical">
          <Space style={{ display: 'flex' }} wrap>
            <Form.Item name="bill_type" label="账单类型" rules={[{ required: true }]} style={{ width: 130 }}>
              <Select options={[{ label: '批量销售', value: 'bulk' }, { label: '零售销售', value: 'retail' }]} />
            </Form.Item>
            <Form.Item name="platform" label="销售平台" rules={[{ required: true }]} style={{ width: 130 }}>
              <Select options={PLATFORM_OPTIONS.map(p => ({ label: p, value: p }))} />
            </Form.Item>
            <Form.Item name="order_date" label="下单日期" rules={[{ required: true }]} style={{ width: 180 }}>
              <DatePicker format="YYYY-MM-DD" />
            </Form.Item>
          </Space>
          <Form.Item name="customer_name" label="客户名称" rules={[{ required: true, message: '请选择或输入客户' }]}>
            <Select showSearch placeholder="选择客户或手动输入" allowClear
              options={customerList.map(c => ({ label: `${c.name} (${c.code})`, value: c.name }))} />
          </Form.Item>
          <Form.Item name="items" label="产品明细" rules={[{ required: true }]}>
            <Form.List name="items">
              {(fields, { add, remove }) => (
                <div>
                  <Table size="small" pagination={false} dataSource={fields} rowKey="fieldKey"
                    columns={[
                      { title: '#', width: 40, render: (_, __, i) => i + 1 },
                      { title: 'SKU', width: 200, render: (_, field) => (
                        <Form.Item name={[field.name, 'sku_id']} noStyle>
                          <Select showSearch placeholder="选择SKU" allowClear size="small" options={skuList.map(s => ({ label: `${s.code} - ${s.name}`, value: s.id }))} />
                        </Form.Item>
                      )},
                      { title: '名称', width: 130, render: (_, field) => (
                        <Form.Item name={[field.name, 'product_name']} noStyle><Input size="small" /></Form.Item>
                      )},
                      { title: '数量', width: 80, render: (_, field) => (
                        <Form.Item name={[field.name, 'quantity']} noStyle><InputNumber min={0.01} size="small" style={{ width: 80 }} /></Form.Item>
                      )},
                      { title: '单价', width: 90, render: (_, field) => (
                        <Form.Item name={[field.name, 'unit_price']} noStyle><InputNumber min={0} step={0.01} size="small" style={{ width: 90 }} /></Form.Item>
                      )},
                      { title: '小计', width: 90, render: (_, field) => <SubtotalCell name={field.name} /> },
                      { title: '', width: 40, render: (_, field) => <Button type="link" danger size="small" onClick={() => remove(field.name)}>删</Button> },
                    ]} />
                  <Button type="dashed" block style={{ marginTop: 8 }} icon={<PlusOutlined />} onClick={() => add({ quantity: 1, unit_price: 0 })}>添加产品</Button>
                </div>
              )}
            </Form.List>
          </Form.Item>
          <Form.Item name="remark" label="备注"><TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      <Modal title="账单详情" open={detailVisible} onCancel={() => setDetailVisible(false)} footer={null} width={650}>
        {detail && (
          <div>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="账单号">{detail.bill_no}</Descriptions.Item>
              <Descriptions.Item label="类型">{detail.bill_type === 'bulk' ? '批量销售' : '零售'}</Descriptions.Item>
              <Descriptions.Item label="客户">{detail.customer_name}</Descriptions.Item>
              <Descriptions.Item label="平台">{detail.platform}</Descriptions.Item>
              <Descriptions.Item label="日期">{detail.order_date}</Descriptions.Item>
              <Descriptions.Item label="总金额"><Text strong style={{ color: '#1677ff' }}>¥{detail.total_amount?.toFixed(2)}</Text></Descriptions.Item>
              <Descriptions.Item label="录入人">{detail.creator_name}</Descriptions.Item>
              <Descriptions.Item label="录入时间">{detail.created_at}</Descriptions.Item>
              {detail.remark && <Descriptions.Item label="备注" span={2}>{detail.remark}</Descriptions.Item>}
            </Descriptions>
            <Title level={5} style={{ marginTop: 16 }}>产品明细</Title>
            <Table size="small" pagination={false} dataSource={detail.items} rowKey="id"
              columns={[
                { title: 'SKU', dataIndex: 'sku_code', width: 100 },
                { title: '名称', dataIndex: 'product_name' },
                { title: '数量', dataIndex: 'quantity', width: 80 },
                { title: '单价', dataIndex: 'unit_price', width: 80, render: (v) => `¥${v.toFixed(2)}` },
                { title: '小计', dataIndex: 'subtotal', width: 100, render: (v) => `¥${v.toFixed(2)}` },
              ]} />
          </div>
        )}
      </Modal>
    </div>
  );
}

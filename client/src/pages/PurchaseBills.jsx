import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Input, InputNumber, Select, Tag, Space, message, Typography, DatePicker, Tabs, Descriptions, Row, Col, Statistic, Progress } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, ReloadOutlined, EyeOutlined, BarChartOutlined } from '@ant-design/icons';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer } from 'recharts';
import api from '../utils/api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { TextArea } = Input;

const STATUS_MAP = {
  pending: { label: '待到货', color: 'orange' },
  partial: { label: '部分到货', color: 'blue' },
  completed: { label: '已完成', color: 'green' },
};

// 小计单元格：独立组件以遵守 Hooks 规则
const SubtotalCell = ({ name }) => {
  const q = Form.useWatch(['items', name, 'quantity']);
  const p = Form.useWatch(['items', name, 'unit_price']);
  return <Text>¥{((q || 0) * (p || 0)).toFixed(2)}</Text>;
};

export default function PurchaseBills() {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ keyword: '', status: '', dateRange: null });
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [form] = Form.useForm();
  const [skuList, setSkuList] = useState([]);
  const [supplierList, setSupplierList] = useState([]);
  const [activeTab, setActiveTab] = useState('list');
  const [stats, setStats] = useState(null);

  const fetchData = async (p = 1) => {
    setLoading(true);
    try {
      const params = { page: p, pageSize: 50 };
      if (filters.keyword) params.keyword = filters.keyword;
      if (filters.status) params.status = filters.status;
      if (filters.dateRange) {
        params.startDate = filters.dateRange[0].format('YYYY-MM-DD');
        params.endDate = filters.dateRange[1].format('YYYY-MM-DD');
      }
      const res = await api.get('/purchases', { params });
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
      const res = await api.get('/purchases/stats/summary', { params });
      setStats(res);
    } catch (err) { message.error(err.message); }
  };

  useEffect(() => {
    api.get('/skus/all', { params: { category: 'material' } }).then(setSkuList).catch(() => {});
    api.get('/suppliers/all').then(setSupplierList).catch(() => {});
    fetchData(1);
  }, []);

  const handleAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ order_date: dayjs() });
    setModalVisible(true);
  };

  const handleEdit = async (record) => {
    try {
      const res = await api.get(`/purchases/${record.id}`);
      setEditing(res);
      form.setFieldsValue({ ...res, order_date: dayjs(res.order_date), expected_date: res.expected_date ? dayjs(res.expected_date) : null });
      setModalVisible(true);
    } catch (err) { message.error(err.message); }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const items = form.getFieldValue('items') || [];
      if (!items || items.length === 0) { message.warning('请添加至少一条材料明细'); return; }
      const payload = {
        ...values,
        order_date: values.order_date?.format('YYYY-MM-DD'),
        expected_date: values.expected_date?.format('YYYY-MM-DD'),
        items: items.map(item => ({
          ...item,
          sku_code: item.sku_code || (skuList.find(s => s.id === item.sku_id)?.code),
          material_name: item.material_name || (skuList.find(s => s.id === item.sku_id)?.name),
          subtotal: (item.quantity || 0) * (item.unit_price || 0),
        })),
      };
      if (editing) {
        await api.put(`/purchases/${editing.id}`, payload);
        message.success('采购单更新成功');
      } else {
        await api.post('/purchases', payload);
        message.success('采购单创建成功');
      }
      setModalVisible(false);
      fetchData(page);
    } catch (err) { if (err.errorFields) return; message.error(err.message); }
  };

  const handleDelete = (record) => {
    Modal.confirm({
      title: '确认删除', content: `确定要删除采购单「${record.bill_no}」吗？`, okType: 'danger',
      onOk: async () => {
        try { await api.delete(`/purchases/${record.id}`); message.success('删除成功'); fetchData(page); }
        catch (err) { message.error(err.message); }
      },
    });
  };

  const handleView = async (record) => {
    try {
      const res = await api.get(`/purchases/${record.id}`);
      setDetail(res);
      setDetailVisible(true);
    } catch (err) { message.error(err.message); }
  };

  const columns = [
    { title: '采购单号', dataIndex: 'bill_no', width: 150, fixed: 'left' },
    { title: '供应商', dataIndex: 'supplier_name', width: 150, ellipsis: true },
    { title: '金额', dataIndex: 'total_amount', width: 100, render: (v) => `¥${v.toFixed(2)}` },
    { title: '下单日期', dataIndex: 'order_date', width: 110 },
    { title: '预计到货', dataIndex: 'expected_date', width: 110, render: (v) => v || '-' },
    { title: '状态', dataIndex: 'status', width: 90, render: (v) => <Tag color={STATUS_MAP[v]?.color}>{STATUS_MAP[v]?.label}</Tag> },
    { title: '录入人', dataIndex: 'creator_name', width: 90 },
    { title: '操作', width: 160, fixed: 'right', render: (_, r) => (
      <Space size={0}>
        <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => handleView(r)}>详情</Button>
        {r.status !== 'completed' && <Button size="small" type="link" icon={<EditOutlined />} onClick={() => handleEdit(r)}>编辑</Button>}
        {r.status === 'pending' && <Button size="small" type="link" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r)}>删除</Button>}
      </Space>
    )},
  ];

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4}>采购账单</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增采购单</Button>
      </div>

      <Tabs activeKey={activeTab} onChange={(key) => { setActiveTab(key); if (key === 'stats') fetchStats(); }} items={[
        { key: 'list', label: '采购单列表', children: (
          <Card>
            <Space style={{ marginBottom: 16 }} wrap>
              <Input placeholder="搜索采购单号/供应商" value={filters.keyword} onChange={(e) => setFilters({ ...filters, keyword: e.target.value })} style={{ width: 200 }} onPressEnter={() => fetchData(1)} />
              <Select placeholder="状态" allowClear style={{ width: 100 }} value={filters.status || undefined} onChange={(v) => setFilters({ ...filters, status: v || '' })}
                options={Object.entries(STATUS_MAP).map(([k, v]) => ({ label: v.label, value: k }))} />
              <RangePicker value={filters.dateRange} onChange={(v) => setFilters({ ...filters, dateRange: v })} />
              <Button type="primary" icon={<SearchOutlined />} onClick={() => fetchData(1)}>搜索</Button>
              <Button icon={<ReloadOutlined />} onClick={() => { setFilters({ keyword: '', status: '', dateRange: null }); fetchData(1); }}>重置</Button>
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
                  <Col span={6}><Card><Statistic title="采购总额" value={stats.total.total} precision={2} prefix="¥" /></Card></Col>
                  <Col span={6}><Card><Statistic title="采购单数" value={stats.total.count} /></Card></Col>
                  <Col span={6}><Card><Statistic title="待到货单数" value={stats.pending.count} /></Card></Col>
                  <Col span={6}><Card><Statistic title="待到货金额" value={stats.pending.total} precision={2} prefix="¥" valueStyle={{ color: '#fa8c16' }} /></Card></Col>
                </Row>
                <Row gutter={16}>
                  <Col span={12}>
                    <Card title="供应商采购排名" size="small">
                      <Table size="small" pagination={false} dataSource={stats.bySupplier} rowKey="supplier_name"
                        columns={[
                          { title: '排名', width: 50, render: (_, __, i) => i + 1 },
                          { title: '供应商', dataIndex: 'supplier_name', ellipsis: true },
                          { title: '笔数', dataIndex: 'count', width: 60 },
                          { title: '金额', dataIndex: 'total', width: 100, render: (v) => `¥${v.toFixed(2)}` },
                        ]} />
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card title="材料采购排名" size="small">
                      <Table size="small" pagination={false} dataSource={stats.byMaterial} rowKey="sku_code"
                        columns={[
                          { title: '排名', width: 50, render: (_, __, i) => i + 1 },
                          { title: 'SKU', dataIndex: 'sku_code', width: 100 },
                          { title: '名称', dataIndex: 'material_name', ellipsis: true },
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

      <Modal title={editing ? '编辑采购单' : '新增采购单'} open={modalVisible} onCancel={() => setModalVisible(false)} onOk={handleSubmit} width={800} okText="保存">
        <Form form={form} layout="vertical">
          <Space style={{ display: 'flex' }} wrap>
            <Form.Item name="supplier_name" label="供应商" rules={[{ required: true, message: '请选择供应商' }]} style={{ width: 280 }}>
              <Select showSearch placeholder="选择供应商" allowClear
                options={supplierList.map(s => ({ label: `${s.name} (${s.code})`, value: s.name }))} />
            </Form.Item>
            <Form.Item name="order_date" label="下单日期" rules={[{ required: true }]} style={{ width: 180 }}>
              <DatePicker format="YYYY-MM-DD" />
            </Form.Item>
            <Form.Item name="expected_date" label="预计到货日期" style={{ width: 180 }}>
              <DatePicker format="YYYY-MM-DD" />
            </Form.Item>
          </Space>
          <Form.Item name="items" label="材料明细" rules={[{ required: true }]}>
            <Form.List name="items">
              {(fields, { add, remove }) => (
                <div>
                  <Table size="small" pagination={false} dataSource={fields} rowKey="fieldKey"
                    columns={[
                      { title: '#', width: 40, render: (_, __, i) => i + 1 },
                      { title: 'SKU', width: 200, render: (_, field) => (
                        <Form.Item name={[field.name, 'sku_id']} noStyle>
                          <Select showSearch placeholder="选择材料SKU" allowClear size="small" options={skuList.map(s => ({ label: `${s.code} - ${s.name}`, value: s.id }))} />
                        </Form.Item>
                      )},
                      { title: '名称', width: 130, render: (_, field) => (
                        <Form.Item name={[field.name, 'material_name']} noStyle><Input size="small" /></Form.Item>
                      )},
                      { title: '采购数量', width: 90, render: (_, field) => (
                        <Form.Item name={[field.name, 'quantity']} noStyle><InputNumber min={0.01} size="small" style={{ width: 90 }} /></Form.Item>
                      )},
                      { title: '单价', width: 90, render: (_, field) => (
                        <Form.Item name={[field.name, 'unit_price']} noStyle><InputNumber min={0} step={0.01} size="small" style={{ width: 90 }} /></Form.Item>
                      )},
                      { title: '小计', width: 90, render: (_, field) => <SubtotalCell name={field.name} /> },
                      { title: '', width: 40, render: (_, field) => <Button type="link" danger size="small" onClick={() => remove(field.name)}>删</Button> },
                    ]} />
                  <Button type="dashed" block style={{ marginTop: 8 }} icon={<PlusOutlined />} onClick={() => add({ quantity: 1, unit_price: 0 })}>添加材料</Button>
                </div>
              )}
            </Form.List>
          </Form.Item>
          <Form.Item name="remark" label="备注"><TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      <Modal title="采购单详情" open={detailVisible} onCancel={() => setDetailVisible(false)} footer={null} width={750}>
        {detail && (
          <div>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="采购单号">{detail.bill_no}</Descriptions.Item>
              <Descriptions.Item label="状态"><Tag color={STATUS_MAP[detail.status]?.color}>{STATUS_MAP[detail.status]?.label}</Tag></Descriptions.Item>
              <Descriptions.Item label="供应商">{detail.supplier_name}</Descriptions.Item>
              <Descriptions.Item label="总金额"><Text strong style={{ color: '#1677ff' }}>¥{detail.total_amount?.toFixed(2)}</Text></Descriptions.Item>
              <Descriptions.Item label="下单日期">{detail.order_date}</Descriptions.Item>
              <Descriptions.Item label="预计到货">{detail.expected_date || '-'}</Descriptions.Item>
              <Descriptions.Item label="录入人">{detail.creator_name}</Descriptions.Item>
              <Descriptions.Item label="录入时间">{detail.created_at}</Descriptions.Item>
              {detail.remark && <Descriptions.Item label="备注" span={2}>{detail.remark}</Descriptions.Item>}
            </Descriptions>
            <Title level={5} style={{ marginTop: 16 }}>材料明细（含到货进度）</Title>
            <Table size="small" pagination={false} dataSource={detail.items} rowKey="id"
              columns={[
                { title: 'SKU', dataIndex: 'sku_code', width: 100 },
                { title: '名称', dataIndex: 'material_name' },
                { title: '采购量', dataIndex: 'quantity', width: 80 },
                { title: '已到货', dataIndex: 'arrived_quantity', width: 80, render: (v) => <Text style={{ color: v > 0 ? '#52c41a' : '#999' }}>{v}</Text> },
                { title: '未到货', dataIndex: 'arrived_quantity', width: 80, render: (v, r) => <Text style={{ color: v < r.quantity ? '#ff4d4f' : '#999' }}>{(r.quantity - v).toFixed(2)}</Text> },
                { title: '进度', width: 120, render: (_, r) => {
                  const pct = r.quantity > 0 ? Math.round((r.arrived_quantity / r.quantity) * 100) : 0;
                  return <Progress percent={pct} size="small" status={pct === 100 ? 'success' : pct > 0 ? 'active' : 'normal'} />;
                }},
                { title: '单价', dataIndex: 'unit_price', width: 80, render: (v) => `¥${v.toFixed(2)}` },
                { title: '小计', dataIndex: 'subtotal', width: 100, render: (v) => `¥${v.toFixed(2)}` },
              ]} />
          </div>
        )}
      </Modal>
    </div>
  );
}

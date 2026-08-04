import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Input, InputNumber, Select, Space, message, Typography, DatePicker, Tabs, Descriptions, Row, Col, Statistic } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, ReloadOutlined, EyeOutlined, BarChartOutlined } from '@ant-design/icons';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer } from 'recharts';
import api from '../utils/api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { TextArea } = Input;

const UNIT_OPTIONS = ['斤', '公斤', '个', '袋', '瓶', '箱', '份', '把'];

// 小计单元格：独立组件以遵守 Hooks 规则
const SubtotalCell = ({ name }) => {
  const q = Form.useWatch(['items', name, 'quantity']);
  const p = Form.useWatch(['items', name, 'unit_price']);
  return <Text>¥{((q || 0) * (p || 0)).toFixed(2)}</Text>;
};

export default function CanteenBills() {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ keyword: '', dateRange: null });
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [form] = Form.useForm();
  const [activeTab, setActiveTab] = useState('list');
  const [monthly, setMonthly] = useState([]);

  const fetchData = async (p = 1) => {
    setLoading(true);
    try {
      const params = { page: p, pageSize: 50 };
      if (filters.keyword) params.keyword = filters.keyword;
      if (filters.dateRange) {
        params.startDate = filters.dateRange[0].format('YYYY-MM-DD');
        params.endDate = filters.dateRange[1].format('YYYY-MM-DD');
      }
      const res = await api.get('/canteen', { params });
      setData(res.list);
      setTotal(res.total);
      setPage(p);
    } catch (err) { message.error(err.message); }
    setLoading(false);
  };

  const fetchMonthly = async () => {
    try {
      const res = await api.get('/canteen/stats/monthly');
      setMonthly(res);
    } catch (err) { message.error(err.message); }
  };

  useEffect(() => { fetchData(1); }, []);

  const handleAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ buy_date: dayjs() });
    setModalVisible(true);
  };

  const handleEdit = async (record) => {
    try {
      const res = await api.get(`/canteen/${record.id}`);
      setEditing(res);
      form.setFieldsValue({ ...res, buy_date: dayjs(res.buy_date) });
      setModalVisible(true);
    } catch (err) { message.error(err.message); }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const items = form.getFieldValue('items') || [];
      if (!items || items.length === 0) { message.warning('请添加至少一条食材明细'); return; }
      const payload = {
        ...values,
        buy_date: values.buy_date?.format('YYYY-MM-DD'),
        items: items.map(item => ({ ...item, subtotal: (item.quantity || 0) * (item.unit_price || 0) })),
      };
      if (editing) {
        await api.put(`/canteen/${editing.id}`, payload);
        message.success('账单更新成功');
      } else {
        await api.post('/canteen', payload);
        message.success('账单创建成功');
      }
      setModalVisible(false);
      fetchData(page);
    } catch (err) { if (err.errorFields) return; message.error(err.message); }
  };

  const handleDelete = (record) => {
    Modal.confirm({
      title: '确认删除', content: `确定要删除食堂账单「${record.bill_no}」吗？`, okType: 'danger',
      onOk: async () => {
        try { await api.delete(`/canteen/${record.id}`); message.success('删除成功'); fetchData(page); }
        catch (err) { message.error(err.message); }
      },
    });
  };

  const handleView = async (record) => {
    try {
      const res = await api.get(`/canteen/${record.id}`);
      setDetail(res);
      setDetailVisible(true);
    } catch (err) { message.error(err.message); }
  };

  const columns = [
    { title: '账单号', dataIndex: 'bill_no', width: 150, fixed: 'left' },
    { title: '采买日期', dataIndex: 'buy_date', width: 110 },
    { title: '金额', dataIndex: 'total_amount', width: 100, render: (v) => `¥${v.toFixed(2)}` },
    { title: '采买人', dataIndex: 'buyer', width: 100 },
    { title: '录入人', dataIndex: 'creator_name', width: 90 },
    { title: '备注', dataIndex: 'remark', ellipsis: true },
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
        <Title level={4}>食堂采买账单</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增账单</Button>
      </div>

      <Tabs activeKey={activeTab} onChange={(key) => { setActiveTab(key); if (key === 'stats') fetchMonthly(); }} items={[
        { key: 'list', label: '账单列表', children: (
          <Card>
            <Space style={{ marginBottom: 16 }} wrap>
              <Input placeholder="搜索账单号/采买人" value={filters.keyword} onChange={(e) => setFilters({ ...filters, keyword: e.target.value })} style={{ width: 200 }} onPressEnter={() => fetchData(1)} />
              <RangePicker value={filters.dateRange} onChange={(v) => setFilters({ ...filters, dateRange: v })} />
              <Button type="primary" icon={<SearchOutlined />} onClick={() => fetchData(1)}>搜索</Button>
              <Button icon={<ReloadOutlined />} onClick={() => { setFilters({ keyword: '', dateRange: null }); fetchData(1); }}>重置</Button>
            </Space>
            <Table columns={columns} dataSource={data} rowKey="id" loading={loading}
              pagination={{ current: page, total, pageSize: 50, onChange: (p) => fetchData(p), showTotal: (t) => `共 ${t} 条` }}
              scroll={{ x: 900 }} />
          </Card>
        )},
        { key: 'stats', label: <span><BarChartOutlined /> 月度统计</span>, children: (
          <div>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              {monthly.slice(0, 4).map((m) => (
                <Col span={6} key={m.month}>
                  <Card>
                    <Statistic title={`${m.month}月`} value={m.total} precision={2} prefix="¥" />
                    <Text type="secondary">{m.count} 笔</Text>
                  </Card>
                </Col>
              ))}
            </Row>
            <Card title="近12月食堂支出趋势" size="small">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={monthly}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <RTooltip />
                  <Bar dataKey="total" fill="#52c41a" name="支出金额" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
        )},
      ]} />

      <Modal title={editing ? '编辑食堂账单' : '新增食堂账单'} open={modalVisible} onCancel={() => setModalVisible(false)} onOk={handleSubmit} width={700} okText="保存">
        <Form form={form} layout="vertical">
          <Space style={{ display: 'flex' }} wrap>
            <Form.Item name="buy_date" label="采买日期" rules={[{ required: true, message: '请选择日期' }]} style={{ width: 200 }}>
              <DatePicker format="YYYY-MM-DD" />
            </Form.Item>
            <Form.Item name="buyer" label="采买人" style={{ width: 200 }}>
              <Input placeholder="采买人姓名" />
            </Form.Item>
          </Space>
          <Form.Item name="items" label="食材明细" rules={[{ required: true }]}>
            <Form.List name="items">
              {(fields, { add, remove }) => (
                <div>
                  <Table size="small" pagination={false} dataSource={fields} rowKey="fieldKey"
                    columns={[
                      { title: '#', width: 40, render: (_, __, i) => i + 1 },
                      { title: '名称', width: 150, render: (_, field) => (
                        <Form.Item name={[field.name, 'name']} noStyle><Input size="small" placeholder="食材名称" /></Form.Item>
                      )},
                      { title: '数量', width: 80, render: (_, field) => (
                        <Form.Item name={[field.name, 'quantity']} noStyle><InputNumber min={0.01} size="small" style={{ width: 80 }} /></Form.Item>
                      )},
                      { title: '单位', width: 80, render: (_, field) => (
                        <Form.Item name={[field.name, 'unit']} noStyle>
                          <Select size="small" style={{ width: 80 }} options={UNIT_OPTIONS.map(u => ({ label: u, value: u }))} />
                        </Form.Item>
                      )},
                      { title: '单价', width: 90, render: (_, field) => (
                        <Form.Item name={[field.name, 'unit_price']} noStyle><InputNumber min={0} step={0.01} size="small" style={{ width: 90 }} /></Form.Item>
                      )},
                      { title: '小计', width: 90, render: (_, field) => <SubtotalCell name={field.name} /> },
                      { title: '', width: 40, render: (_, field) => <Button type="link" danger size="small" onClick={() => remove(field.name)}>删</Button> },
                    ]} />
                  <Button type="dashed" block style={{ marginTop: 8 }} icon={<PlusOutlined />} onClick={() => add({ quantity: 1, unit_price: 0 })}>添加食材</Button>
                </div>
              )}
            </Form.List>
          </Form.Item>
          <Form.Item name="remark" label="备注"><TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      <Modal title="账单详情" open={detailVisible} onCancel={() => setDetailVisible(false)} footer={null} width={600}>
        {detail && (
          <div>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="账单号">{detail.bill_no}</Descriptions.Item>
              <Descriptions.Item label="采买日期">{detail.buy_date}</Descriptions.Item>
              <Descriptions.Item label="总金额"><Text strong style={{ color: '#1677ff' }}>¥{detail.total_amount?.toFixed(2)}</Text></Descriptions.Item>
              <Descriptions.Item label="采买人">{detail.buyer || '-'}</Descriptions.Item>
              <Descriptions.Item label="录入人">{detail.creator_name}</Descriptions.Item>
              <Descriptions.Item label="录入时间">{detail.created_at}</Descriptions.Item>
              {detail.remark && <Descriptions.Item label="备注" span={2}>{detail.remark}</Descriptions.Item>}
            </Descriptions>
            <Title level={5} style={{ marginTop: 16 }}>食材明细</Title>
            <Table size="small" pagination={false} dataSource={detail.items} rowKey="id"
              columns={[
                { title: '名称', dataIndex: 'name' },
                { title: '数量', dataIndex: 'quantity', width: 80 },
                { title: '单位', dataIndex: 'unit', width: 60 },
                { title: '单价', dataIndex: 'unit_price', width: 80, render: (v) => `¥${v.toFixed(2)}` },
                { title: '小计', dataIndex: 'subtotal', width: 100, render: (v) => `¥${v.toFixed(2)}` },
              ]} />
          </div>
        )}
      </Modal>
    </div>
  );
}

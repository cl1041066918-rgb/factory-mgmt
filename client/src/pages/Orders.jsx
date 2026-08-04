import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, Tag, Space, message, Typography, DatePicker, Tabs, Descriptions, Tooltip, InputNumber, AutoComplete } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, ReloadOutlined, EyeOutlined, SendOutlined, ExportOutlined } from '@ant-design/icons';
import api from '../utils/api';
import useAuthStore from '../store/auth';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { TextArea } = Input;

// 小计独立组件：必须在顶层调用 Form.useWatch，不能放在 column.render 回调里
function OrderItemSubtotalCell({ name }) {
  const q = Form.useWatch(['items', name, 'quantity']);
  const p = Form.useWatch(['items', name, 'unit_price']);
  return <Text>¥{((q || 0) * (p || 0)).toFixed(2)}</Text>;
}

const PLATFORM_OPTIONS = ['1688', '淘宝', '拼多多', '抖音', '微信', '线下', '其他'];
const EXPRESS_OPTIONS = ['顺丰', '中通', '圆通', '韵达', '其他'];

const STATUS_MAP = {
  pending: { label: '待发货', color: 'orange' },
  shipped: { label: '已发货', color: 'blue' },
  completed: { label: '已完成', color: 'green' },
  cancelled: { label: '已取消', color: 'default' },
  returning: { label: '退货中', color: 'red' },
};

export default function Orders() {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ keyword: '', status: '', platform: '', orderType: '', dateRange: null });
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [shipVisible, setShipVisible] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [shipRecord, setShipRecord] = useState(null);
  const [form] = Form.useForm();
  const [shipForm] = Form.useForm();
  const [skuList, setSkuList] = useState([]);
  const [customerList, setCustomerList] = useState([]);
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('all');

  const fetchData = async (p = 1) => {
    setLoading(true);
    try {
      const params = { page: p, pageSize: 50 };
      if (filters.keyword) params.keyword = filters.keyword;
      if (filters.status) params.status = filters.status;
      if (filters.platform) params.platform = filters.platform;
      if (filters.orderType) params.orderType = filters.orderType;
      if (filters.dateRange) {
        params.startDate = filters.dateRange[0].format('YYYY-MM-DD');
        params.endDate = filters.dateRange[1].format('YYYY-MM-DD');
      }
      // 发货部门默认看待发货
      if (user.role === 'shipping' && !params.status) {
        params.status = 'pending';
      }
      const res = await api.get('/orders', { params });
      setData(res.list);
      setTotal(res.total);
      setPage(p);
    } catch (err) { message.error(err.message); }
    setLoading(false);
  };

  useEffect(() => {
    api.get('/skus/all', { params: { category: 'finished' } }).then(setSkuList).catch(() => {});
    api.get('/customers/all').then(setCustomerList).catch(() => {});
    fetchData(1);
  }, []);

  const handleAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      order_type: 'online',
      platform: '1688',
      order_time: dayjs(),
    });
    setModalVisible(true);
  };

  const handleEdit = async (record) => {
    try {
      const res = await api.get(`/orders/${record.id}`);
      setEditing(res);
      form.setFieldsValue({
        ...res,
        order_time: dayjs(res.order_time),
        customer_name: res.customer_name,
      });
      setModalVisible(true);
    } catch (err) { message.error(err.message); }
  };

  const handleView = async (record) => {
    try {
      const res = await api.get(`/orders/${record.id}`);
      setDetail(res);
      setDetailVisible(true);
    } catch (err) { message.error(err.message); }
  };

  const handleShip = (record) => {
    setShipRecord(record);
    shipForm.resetFields();
    setShipVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const items = form.getFieldValue('items') || [];
      if (!items || items.length === 0) { message.warning('请添加至少一条产品明细'); return; }
      const payload = {
        ...values,
        order_time: values.order_time?.format('YYYY-MM-DD HH:mm:ss'),
        items: items.map(item => ({
          ...item,
          sku_code: item.sku_code || (skuList.find(s => s.id === item.sku_id)?.code),
          product_name: item.product_name || (skuList.find(s => s.id === item.sku_id)?.name),
          subtotal: (item.quantity || 0) * (item.unit_price || 0),
        })),
      };
      if (editing) {
        await api.put(`/orders/${editing.id}`, payload);
        message.success('订单更新成功');
      } else {
        await api.post('/orders', payload);
        message.success('订单创建成功');
      }
      setModalVisible(false);
      fetchData(page);
    } catch (err) {
      if (err.errorFields) return;
      message.error(err.message);
    }
  };

  const handleShipSubmit = async () => {
    try {
      const values = await shipForm.validateFields();
      await api.post(`/orders/${shipRecord.id}/ship`, values);
      message.success('发货成功');
      setShipVisible(false);
      fetchData(page);
    } catch (err) {
      if (err.errorFields) return;
      message.error(err.message);
    }
  };

  const handleStatusChange = async (record, newStatus, cancelReason) => {
    try {
      await api.put(`/orders/${record.id}/status`, { status: newStatus, cancelReason });
      message.success('状态更新成功');
      fetchData(page);
    } catch (err) { message.error(err.message); }
  };

  const handleDelete = (record) => {
    Modal.confirm({
      title: '确认删除', content: `确定要删除订单「${record.order_no}」吗？`, okType: 'danger',
      onOk: async () => {
        try { await api.delete(`/orders/${record.id}`); message.success('删除成功'); fetchData(page); }
        catch (err) { message.error(err.message); }
      },
    });
  };

  const handleCancelOrder = (record) => {
    let reason = '';
    Modal.confirm({
      title: '取消订单', content: (
        <div>
          <p>确定要取消订单「{record.order_no}」吗？</p>
          <Input placeholder="请输入取消原因" onChange={(e) => reason = e.target.value} />
        </div>
      ),
      okText: '确认取消', okType: 'danger', cancelText: '不取消',
      onOk: () => handleStatusChange(record, 'cancelled', reason),
    });
  };

  const columns = [
    { title: '订单号', dataIndex: 'order_no', width: 150, fixed: 'left' },
    { title: '客户', dataIndex: 'customer_name', width: 120, ellipsis: true },
    { title: '联系人', dataIndex: 'contact', width: 80 },
    { title: '电话', dataIndex: 'phone', width: 120 },
    { title: '平台', dataIndex: 'platform', width: 70 },
    { title: '类型', dataIndex: 'order_type', width: 70, render: (v) => <Tag color={v === 'online' ? 'blue' : 'purple'}>{v === 'online' ? '线上' : '线下'}</Tag> },
    { title: '金额', dataIndex: 'total_amount', width: 90, render: (v) => `¥${v.toFixed(2)}` },
    { title: '状态', dataIndex: 'status', width: 80, render: (v) => <Tag color={STATUS_MAP[v]?.color}>{STATUS_MAP[v]?.label}</Tag> },
    { title: '下单时间', dataIndex: 'order_time', width: 160, ellipsis: true },
    { title: '快递单号', dataIndex: 'tracking_no', width: 130, ellipsis: true, render: (v) => v || '-' },
    { title: '操作', width: 180, fixed: 'right', render: (_, r) => (
      <Space size={0}>
        <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => handleView(r)}>详情</Button>
        {r.status === 'pending' && user.role !== 'shipping' && (
          <Button size="small" type="link" icon={<EditOutlined />} onClick={() => handleEdit(r)}>编辑</Button>
        )}
        {r.status === 'pending' && (user.role === 'admin' || user.role === 'shipping') && (
          <Button size="small" type="link" icon={<SendOutlined />} onClick={() => handleShip(r)}>发货</Button>
        )}
        {r.status === 'pending' && user.role !== 'shipping' && (
          <Button size="small" type="link" danger onClick={() => handleCancelOrder(r)}>取消</Button>
        )}
        {(r.status === 'shipped' || r.status === 'returning') && user.role !== 'shipping' && (
          <Button size="small" type="link" onClick={() => handleStatusChange(r, 'completed')}>完成</Button>
        )}
        {r.status === 'shipped' && user.role !== 'shipping' && (
          <Button size="small" type="link" danger onClick={() => handleStatusChange(r, 'returning')}>退货</Button>
        )}
        {user.role !== 'shipping' && (
          <Button size="small" type="link" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r)} />
        )}
      </Space>
    )},
  ];

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4}>订单管理</Title>
        {user.role !== 'shipping' && (
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增订单</Button>
        )}
      </div>

      {/* 状态标签 */}
      {user.role !== 'shipping' && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Space>
            {Object.entries(STATUS_MAP).map(([key, val]) => {
              const count = data.filter(d => d.status === key).length;
              return (
                <Tag key={key} color={val.color} style={{ cursor: 'pointer', padding: '4px 12px' }} onClick={() => { setFilters({ ...filters, status: key }); }}>
                  {val.label} {count > 0 && `(${count})`}
                </Tag>
              );
            })}
            <Button size="small" type="link" onClick={() => { setFilters({ ...filters, status: '' }); fetchData(1); }}>全部</Button>
          </Space>
        </Card>
      )}

      <Card>
        <Space style={{ marginBottom: 16 }} wrap>
          <Input placeholder="搜索订单号/客户/电话/快递单号" value={filters.keyword} onChange={(e) => setFilters({ ...filters, keyword: e.target.value })} style={{ width: 220 }} onPressEnter={() => fetchData(1)} />
          <Select placeholder="状态" allowClear style={{ width: 100 }} value={filters.status || undefined} onChange={(v) => { setFilters({ ...filters, status: v || '' }); }}
            options={Object.entries(STATUS_MAP).map(([k, v]) => ({ label: v.label, value: k }))} />
          <Select placeholder="平台" allowClear style={{ width: 100 }} value={filters.platform || undefined} onChange={(v) => setFilters({ ...filters, platform: v || '' })}
            options={PLATFORM_OPTIONS.map(p => ({ label: p, value: p }))} />
          <Select placeholder="类型" allowClear style={{ width: 90 }} value={filters.orderType || undefined} onChange={(v) => setFilters({ ...filters, orderType: v || '' })}
            options={[{ label: '线上', value: 'online' }, { label: '线下', value: 'offline' }]} />
          <RangePicker value={filters.dateRange} onChange={(v) => setFilters({ ...filters, dateRange: v })} />
          <Button type="primary" icon={<SearchOutlined />} onClick={() => fetchData(1)}>搜索</Button>
          <Button icon={<ReloadOutlined />} onClick={() => { setFilters({ keyword: '', status: '', platform: '', orderType: '', dateRange: null }); fetchData(1); }}>重置</Button>
        </Space>
        <Table columns={columns} dataSource={data} rowKey="id" loading={loading}
          pagination={{ current: page, total, pageSize: 50, onChange: (p) => fetchData(p), showTotal: (t) => `共 ${t} 条` }}
          scroll={{ x: 1400 }} />
      </Card>

      {/* 新增/编辑弹窗 */}
      <Modal title={editing ? '编辑订单' : '新增订单'} open={modalVisible} onCancel={() => setModalVisible(false)}
        onOk={handleSubmit} width={800} okText="保存" cancelText="取消">
        <Form form={form} layout="vertical">
          <Space style={{ display: 'flex' }} wrap>
            <Form.Item name="order_type" label="订单类型" rules={[{ required: true }]} style={{ width: 120 }}>
              <Select options={[{ label: '线上订单', value: 'online' }, { label: '线下订单', value: 'offline' }]} />
            </Form.Item>
            <Form.Item name="platform" label="销售平台" rules={[{ required: true }]} style={{ width: 120 }}>
              <Select options={PLATFORM_OPTIONS.map(p => ({ label: p, value: p }))} />
            </Form.Item>
            <Form.Item name="platform_order_no" label="平台订单号" style={{ width: 200 }}>
              <Input placeholder="对应平台的原始订单号" />
            </Form.Item>
            <Form.Item name="order_time" label="下单时间" rules={[{ required: true }]} style={{ width: 200 }}>
              <DatePicker showTime format="YYYY-MM-DD HH:mm:ss" />
            </Form.Item>
          </Space>
          <Form.Item label="客户名称" name="customer_name" rules={[{ required: true, message: '请选择或输入客户' }]}>
            <AutoComplete
              placeholder="输入客户名称/编号/电话搜索，或手动输入新客户"
              allowClear
              style={{ width: '100%' }}
              filterOption={(input, option) => {
                if (!option || !option.customer) return false;
                const c = option.customer;
                const q = input.toLowerCase();
                return (
                  c.name?.toLowerCase().includes(q) ||
                  c.code?.toLowerCase().includes(q) ||
                  c.contact?.toLowerCase().includes(q) ||
                  c.phone?.toLowerCase().includes(q)
                );
              }}
              onSelect={(_, option) => {
                // 选中已有客户时，自动填充联系人/电话/地址
                const c = option?.customer;
                if (c) {
                  form.setFieldsValue({
                    contact: c.contact || '',
                    phone: c.phone || '',
                    address: c.address || '',
                  });
                }
              }}
              onChange={(val) => {
                // 用户手动改了值（不是从候选里选的），保留输入
                form.setFieldValue('customer_name', val || '');
              }}
              options={customerList.map(c => ({
                value: c.name,
                label: (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span><b>{c.name}</b> <Text type="secondary" style={{ fontSize: 12 }}>({c.code})</Text></span>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {[c.contact, c.phone].filter(Boolean).join(' · ')}
                    </Text>
                  </div>
                ),
                customer: c,
              }))}
            />
          </Form.Item>
          <Space style={{ display: 'flex' }} wrap>
            <Form.Item name="contact" label="联系人" rules={[{ required: true, message: '请输入联系人' }]} style={{ width: 150 }}><Input /></Form.Item>
            <Form.Item name="phone" label="联系电话" rules={[{ required: true, message: '请输入电话' }]} style={{ width: 180 }}><Input /></Form.Item>
          </Space>
          <Form.Item name="address" label="收货地址" rules={[{ required: true, message: '请输入收货地址' }]}>
            <TextArea rows={2} placeholder="完整收货地址" />
          </Form.Item>
          <Form.Item name="items" label="产品明细" rules={[{ required: true }]}>
            <ProductItemsTable skuList={skuList} form={form} />
          </Form.Item>
          <Form.Item name="remark" label="备注"><TextArea rows={2} placeholder="客户特殊要求等" /></Form.Item>
        </Form>
      </Modal>

      {/* 详情弹窗 */}
      <Modal title="订单详情" open={detailVisible} onCancel={() => setDetailVisible(false)} footer={null} width={700}>
        {detail && (
          <div>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="订单号">{detail.order_no}</Descriptions.Item>
              <Descriptions.Item label="状态"><Tag color={STATUS_MAP[detail.status]?.color}>{STATUS_MAP[detail.status]?.label}</Tag></Descriptions.Item>
              <Descriptions.Item label="订单类型">{detail.order_type === 'online' ? '线上' : '线下'}</Descriptions.Item>
              <Descriptions.Item label="平台">{detail.platform}</Descriptions.Item>
              <Descriptions.Item label="平台订单号">{detail.platform_order_no || '-'}</Descriptions.Item>
              <Descriptions.Item label="下单时间">{detail.order_time}</Descriptions.Item>
              <Descriptions.Item label="客户">{detail.customer_name}</Descriptions.Item>
              <Descriptions.Item label="联系人">{detail.contact}</Descriptions.Item>
              <Descriptions.Item label="电话">{detail.phone}</Descriptions.Item>
              <Descriptions.Item label="收货地址" span={2}>{detail.address}</Descriptions.Item>
              <Descriptions.Item label="总金额"><Text strong style={{ color: '#1677ff' }}>¥{detail.total_amount?.toFixed(2)}</Text></Descriptions.Item>
              <Descriptions.Item label="录入人">{detail.creator_name}</Descriptions.Item>
              {detail.tracking_no && <Descriptions.Item label="快递单号">{detail.tracking_no}</Descriptions.Item>}
              {detail.express_company && <Descriptions.Item label="快递公司">{detail.express_company}</Descriptions.Item>}
              {detail.ship_time && <Descriptions.Item label="发货时间">{detail.ship_time}</Descriptions.Item>}
              {detail.shipper_name && <Descriptions.Item label="发货人">{detail.shipper_name}</Descriptions.Item>}
              {detail.cancel_reason && <Descriptions.Item label="取消原因" span={2}>{detail.cancel_reason}</Descriptions.Item>}
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

      {/* 发货弹窗 */}
      <Modal title="订单发货" open={shipVisible} onCancel={() => setShipVisible(false)} onOk={handleShipSubmit} width={450} okText="确认发货">
        {shipRecord && (
          <div style={{ marginBottom: 16 }}>
            <Text>订单号：<Text strong>{shipRecord.order_no}</Text></Text><br />
            <Text>客户：{shipRecord.customer_name} | 金额：¥{shipRecord.total_amount?.toFixed(2)}</Text>
          </div>
        )}
        <Form form={shipForm} layout="vertical">
          <Form.Item name="tracking_no" label="快递单号" rules={[{ required: true, message: '请输入快递单号' }]}>
            <Input placeholder="快递单号" />
          </Form.Item>
          <Form.Item name="express_company" label="快递公司">
            <Select placeholder="选择快递公司" allowClear options={EXPRESS_OPTIONS.map(e => ({ label: e, value: e }))} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

// 产品明细组件
function ProductItemsTable({ skuList, form }) {
  return (
    <Form.List name="items">
      {(fields, { add, remove }) => (
        <div>
          <Table size="small" pagination={false} dataSource={fields} rowKey="fieldKey"
            columns={[
              { title: '#', width: 40, render: (_, __, idx) => idx + 1 },
              { title: 'SKU', width: 240, render: (_, field) => (
                <Form.Item name={[field.name, 'sku_code']} noStyle>
                  <SkuAutoComplete
                    skuList={skuList}
                    value={form.getFieldValue(['items', field.name, 'sku_code'])}
                    onChange={(val) => {
                      form.setFieldValue(['items', field.name, 'sku_code'], val);
                      // 用户手动了输入，清空 sku_id（不再关联已有 SKU）
                      const matched = skuList.find(s => s.code === val);
                      if (!matched) form.setFieldValue(['items', field.name, 'sku_id'], null);
                    }}
                    onSelect={(sku) => {
                      // 选中已有 SKU：自动填充 id/名称/单价
                      form.setFields([
                        { name: ['items', field.name, 'sku_id'], value: sku.id },
                        { name: ['items', field.name, 'sku_code'], value: sku.code },
                        { name: ['items', field.name, 'product_name'], value: sku.name },
                        { name: ['items', field.name, 'unit_price'], value: sku.default_price || 0 },
                      ]);
                    }}
                  />
                </Form.Item>
              )},
              { title: '名称', width: 150, render: (_, field) => (
                <Form.Item name={[field.name, 'product_name']} noStyle><Input placeholder="产品名称" size="small" /></Form.Item>
              )},
              { title: '数量', width: 80, render: (_, field) => (
                <Form.Item name={[field.name, 'quantity']} noStyle><InputNumber min={0.01} step={1} size="small" style={{ width: 80 }} /></Form.Item>
              )},
              { title: '单价', width: 90, render: (_, field) => (
                <Form.Item name={[field.name, 'unit_price']} noStyle><InputNumber min={0} step={0.01} size="small" style={{ width: 90 }} /></Form.Item>
              )},
              { title: '小计', width: 90, render: (_, field) => (
                <OrderItemSubtotalCell name={field.name} />
              )},
              { title: '', width: 40, render: (_, field) => <Button type="link" danger size="small" onClick={() => remove(field.name)}>删除</Button> },
            ]} />
          <Button type="dashed" block style={{ marginTop: 8 }} icon={<PlusOutlined />} onClick={() => add({ quantity: 1, unit_price: 0 })}>添加产品</Button>
        </div>
      )}
    </Form.List>
  );
}

// SKU 自动补全组件：输入关键词实时过滤候选，选中后回填名称/单价
function SkuAutoComplete({ skuList, value, onChange, onSelect }) {
  const [inputVal, setInputVal] = useState(value || '');
  // 同步外部 value
  useEffect(() => { setInputVal(value || ''); }, [value]);

  // 实时过滤：按 code/name/spec 包含输入关键字（最多50条防止卡顿）
  const filterFn = (input) => {
    if (!input) return skuList.slice(0, 50);
    const q = input.toLowerCase().trim();
    return skuList.filter(s =>
      s.code?.toLowerCase().includes(q) ||
      s.name?.toLowerCase().includes(q) ||
      s.spec?.toLowerCase().includes(q)
    ).slice(0, 50);
  };

  const [options, setOptions] = useState([]);

  useEffect(() => {
    setOptions(filterFn(inputVal));
  }, [inputVal, skuList]);

  return (
    <AutoComplete
      value={inputVal}
      allowClear
      size="small"
      style={{ width: '100%' }}
      placeholder="输入编码/名称/规格搜索"
      onSearch={(val) => setInputVal(val)}
      onChange={(val) => {
        setInputVal(val || '');
        onChange?.(val || '');
      }}
      onSelect={(_, option) => {
        setInputVal(option.value);
        onSelect?.(option.sku);
        onChange?.(option.value);
      }}
      options={options.map(s => ({
        value: s.code,
        label: (
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span><b style={{ color: '#1677ff' }}>{s.code}</b> <Text style={{ fontSize: 12 }}>{s.name}</Text></span>
            <Text type="secondary" style={{ fontSize: 12 }}>¥{Number(s.default_price || 0).toFixed(2)} / {s.unit || '台'}</Text>
          </div>
        ),
        sku: s,
      }))}
      notFoundContent={inputVal ? <Text type="secondary" style={{ fontSize: 12 }}>无匹配SKU，可手动输入新编码</Text> : null}
    />
  );
}

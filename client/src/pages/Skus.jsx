import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Input, InputNumber, Select, Tag, Space, message, Typography, Upload, Tabs, Badge, Statistic } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, ReloadOutlined, ImportOutlined, WarningOutlined } from '@ant-design/icons';
import api from '../utils/api';

const { Title, Text } = Typography;

const CATEGORY_OPTIONS = [
  { label: '成品', value: 'finished' },
  { label: '生产材料', value: 'material' },
  { label: '包装材料', value: 'packaging' },
];

const CATEGORY_MAP = { finished: '成品', material: '生产材料', packaging: '包装材料' };
const CATEGORY_COLORS = { finished: 'blue', material: 'orange', packaging: 'green' };

const UNIT_OPTIONS = ['个', '台', '箱', '套', '米', '公斤', '卷', '批', '件'];

// 编码前缀规则
const CODE_PREFIX = { finished: 'CP', material: 'CL', packaging: 'BC' };

function SkuTabContent({ category, onCountChange }) {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ keyword: '', status: '' });
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();
  const [importModal, setImportModal] = useState(false);

  const fetchData = async (p = 1) => {
    setLoading(true);
    try {
      const res = await api.get('/skus', { params: { ...filters, category, page: p, pageSize: 50 } });
      setData(res.list);
      setTotal(res.total);
      setPage(p);
      if (onCountChange) onCountChange(res.total);
    } catch (err) { message.error(err.message); }
    setLoading(false);
  };

  useEffect(() => { fetchData(1); }, [category]);

  const handleAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ status: 'active', unit: '个', category });
    setModalVisible(true);
  };

  const handleEdit = (r) => {
    setEditing(r);
    form.setFieldsValue(r);
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editing) { await api.put(`/skus/${editing.id}`, values); message.success('更新成功'); }
      else { await api.post('/skus', values); message.success('添加成功'); }
      setModalVisible(false); fetchData(page);
    } catch (err) { if (err.errorFields) return; message.error(err.message); }
  };

  const handleDelete = (record) => {
    Modal.confirm({
      title: '确认删除', content: `确定要删除SKU「${record.code} - ${record.name}」吗？如果有库存或历史记录将无法删除。`, okType: 'danger',
      onOk: async () => {
        try { await api.delete(`/skus/${record.id}`); message.success('删除成功'); fetchData(page); }
        catch (err) { message.error(err.message); }
      },
    });
  };

  const columns = [
    { title: 'SKU编码', dataIndex: 'code', width: 120, fixed: 'left' },
    { title: '名称', dataIndex: 'name', width: 150, ellipsis: true },
    { title: '规格', dataIndex: 'spec', width: 120, ellipsis: true },
    { title: '单位', dataIndex: 'unit', width: 60 },
    { title: '默认单价', dataIndex: 'default_price', width: 90, render: (v) => `¥${(v || 0).toFixed(2)}` },
    { title: '当前库存', dataIndex: 'stock_quantity', width: 90, render: (v, r) => {
      const lowStock = r.min_stock > 0 && (v || 0) <= r.min_stock;
      return <span style={{ color: lowStock ? '#ff4d4f' : 'inherit', fontWeight: lowStock ? 'bold' : 'normal' }}>{v || 0}</span>;
    }},
    { title: '预警值', dataIndex: 'min_stock', width: 70 },
    { title: '状态', dataIndex: 'status', width: 70, render: (v) => <Tag color={v === 'active' ? 'green' : 'default'}>{v === 'active' ? '启用' : '停用'}</Tag> },
    { title: '操作', width: 120, fixed: 'right', render: (_, r) => (
      <Space>
        <Button size="small" type="link" icon={<EditOutlined />} onClick={() => handleEdit(r)}>编辑</Button>
        <Button size="small" type="link" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r)}>删除</Button>
      </Space>
    )},
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space>
          <Input placeholder="搜索编码/名称/规格" value={filters.keyword} onChange={(e) => setFilters({ ...filters, keyword: e.target.value })} style={{ width: 200 }} onPressEnter={() => fetchData(1)} />
          <Select placeholder="状态" allowClear style={{ width: 100 }} value={filters.status || undefined} onChange={(v) => setFilters({ ...filters, status: v || '' })} options={[{ label: '启用', value: 'active' }, { label: '停用', value: 'inactive' }]} />
          <Button type="primary" icon={<SearchOutlined />} onClick={() => fetchData(1)}>搜索</Button>
          <Button icon={<ReloadOutlined />} onClick={() => { setFilters({ keyword: '', status: '' }); fetchData(1); }}>重置</Button>
        </Space>
        <Space>
          <Button icon={<ImportOutlined />} onClick={() => setImportModal(true)}>批量导入</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增{CATEGORY_MAP[category]}</Button>
        </Space>
      </div>
      <Table columns={columns} dataSource={data} rowKey="id" loading={loading}
        pagination={{ current: page, total, pageSize: 50, onChange: (p) => fetchData(p), showTotal: (t) => `共 ${t} 条` }}
        scroll={{ x: 1000 }} />

      <Modal title={editing ? `编辑${CATEGORY_MAP[category]}` : `新增${CATEGORY_MAP[category]}`} open={modalVisible} onOk={handleSubmit} onCancel={() => setModalVisible(false)} width={600}>
        <Form form={form} layout="vertical">
          <Form.Item name="code" label="SKU编码" rules={[{ required: true, message: '请输入SKU编码' }]}
            extra={`建议前缀：${CODE_PREFIX[category]}-001（如 ${CODE_PREFIX[category]}-001）`}>
            <Input placeholder={`如 ${CODE_PREFIX[category]}-001`} disabled={editing} />
          </Form.Item>
          <Form.Item name="name" label={`${CATEGORY_MAP[category]}名称`} rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="名称" />
          </Form.Item>
          <Space style={{ display: 'flex' }}>
            <Form.Item name="spec" label="规格型号" style={{ flex: 1 }}><Input placeholder="如 500W、12V" /></Form.Item>
            <Form.Item name="unit" label="单位" rules={[{ required: true, message: '请选择单位' }]}>
              <Select style={{ width: 100 }} options={UNIT_OPTIONS.map(u => ({ label: u, value: u }))} />
            </Form.Item>
          </Space>
          <Form.Item name="category" label="分类" rules={[{ required: true }]} >
            <Select options={CATEGORY_OPTIONS} disabled />
          </Form.Item>
          <Space style={{ display: 'flex' }}>
            <Form.Item name="default_price" label="默认单价（元）" style={{ flex: 1 }}>
              <InputNumber min={0} step={0.01} style={{ width: '100%' }} placeholder="参考价格" />
            </Form.Item>
            <Form.Item name="min_stock" label="最低库存预警" style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} placeholder="低于此数量标红" />
            </Form.Item>
          </Space>
          <Form.Item name="status" label="状态" rules={[{ required: true }]}>
            <Select options={[{ label: '启用', value: 'active' }, { label: '停用', value: 'inactive' }]} />
          </Form.Item>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      <Modal title={`批量导入${CATEGORY_MAP[category]}`} open={importModal} onCancel={() => setImportModal(false)} footer={null} width={600}>
        <div style={{ marginBottom: 16 }}>
          <p>请准备JSON数据，字段格式如下：</p>
          <p style={{ color: '#999', fontSize: 12 }}>SKU编码 | 产品名称 | 规格型号 | 单位 | 分类(固定{category}) | 默认单价 | 最低库存 | 状态(active/inactive) | 备注</p>
        </div>
        <Upload
          accept=".json"
          beforeUpload={(file) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
              try {
                let items = JSON.parse(e.target.result);
                // 强设置分类为当前tab
                items = items.map(it => ({ ...it, category }));
                const res = await api.post('/skus/import', { items });
                message.success(res.message);
                setImportModal(false);
                fetchData(1);
              } catch (err) { message.error(err.message); }
            };
            reader.readAsText(file);
            return false;
          }}
        >
          <Button type="primary" icon={<ImportOutlined />}>上传JSON文件</Button>
        </Upload>
      </Modal>
    </div>
  );
}

export default function Skus() {
  // 从 URL 获取初始 tab（支持菜单跳转 ?tab=finished/material/packaging）
  const urlParams = new URLSearchParams(window.location.search);
  const initialTab = urlParams.get('tab');
  const [activeKey, setActiveKey] = useState(['finished', 'material', 'packaging'].includes(initialTab) ? initialTab : 'finished');
  const [counts, setCounts] = useState({ finished: 0, material: 0, packaging: 0 });

  const items = [
    {
      key: 'finished',
      label: <span><Badge count={counts.finished} offset={[8, -2]} size="small" color="#1677ff">成品</Badge></span>,
      children: <SkuTabContent category="finished" onCountChange={(t) => setCounts(c => ({ ...c, finished: t }))} />,
    },
    {
      key: 'material',
      label: <span><Badge count={counts.material} offset={[8, -2]} size="small" color="#fa8c16">生产材料</Badge></span>,
      children: <SkuTabContent category="material" onCountChange={(t) => setCounts(c => ({ ...c, material: t }))} />,
    },
    {
      key: 'packaging',
      label: <span><Badge count={counts.packaging} offset={[8, -2]} size="small" color="#52c41a">包装材料</Badge></span>,
      children: <SkuTabContent category="packaging" onCountChange={(t) => setCounts(c => ({ ...c, packaging: t }))} />,
    },
  ];

  return (
    <div className="page-container">
      <Title level={4} style={{ marginBottom: 16 }}>SKU库管理</Title>
      <Card>
        <Tabs
          activeKey={activeKey}
          onChange={setActiveKey}
          items={items}
          size="large"
          destroyInactiveTabPane={false}
        />
      </Card>
    </div>
  );
}

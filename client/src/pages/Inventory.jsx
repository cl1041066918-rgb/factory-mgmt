import React, { useState, useEffect, useRef } from 'react';
import { Card, Table, Button, Modal, Form, Input, InputNumber, Select, Tag, Space, message, Typography, Tabs, Badge, Statistic } from 'antd';
import { PlusOutlined, MinusOutlined, SettingOutlined, SearchOutlined, ReloadOutlined, ScanOutlined, HistoryOutlined, InboxOutlined, CameraOutlined, EditOutlined } from '@ant-design/icons';
import api from '../utils/api';
import useAuthStore from '../store/auth';
import QrScanner from '../components/QrScanner';

const { Title, Text } = Typography;

const WAREHOUSE_CONFIG = {
  finished: { name: '成品现货库存', short: '成品仓' },
  material: { name: '生产材料库存', short: '材料仓' },
  packaging: { name: '包装材料库存', short: '包材仓' },
};

const CATEGORY_MAP = { finished: '成品', material: '生产材料', packaging: '包装材料' };

export default function Inventory({ warehouseType }) {
  const [activeTab, setActiveTab] = useState('list');
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ keyword: '', lowStock: false });
  const [records, setRecords] = useState([]);
  const [recordTotal, setRecordTotal] = useState(0);
  const [recordPage, setRecordPage] = useState(1);
  const [recordFilters, setRecordFilters] = useState({ keyword: '', operationType: '' });
  const { user } = useAuthStore();
  
  // 扫码出入库
  const [scanModal, setScanModal] = useState(false);
  const [scanMode, setScanMode] = useState('in'); // in / out
  const [scannedSku, setScannedSku] = useState(null);
  const [skuCode, setSkuCode] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [relatedBillNo, setRelatedBillNo] = useState('');
  const [remark, setRemark] = useState('');
  const [pendingPurchases, setPendingPurchases] = useState([]);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [adjustModal, setAdjustModal] = useState(false);
  const [adjustSku, setAdjustSku] = useState(null);
  const [adjustQty, setAdjustQty] = useState(0);
  const [adjustRemark, setAdjustRemark] = useState('');
  const [cameraMode, setCameraMode] = useState(false); // 摄像头扫码模式
  const skuCodeRef = useRef(null);

  const config = WAREHOUSE_CONFIG[warehouseType];

  const fetchData = async (p = 1) => {
    setLoading(true);
    try {
      const res = await api.get(`/inventory/${warehouseType}`, { params: { ...filters, page: p, pageSize: 50 } });
      setData(res.list);
      setTotal(res.total);
      setPage(p);
    } catch (err) { message.error(err.message); }
    setLoading(false);
  };

  const fetchRecords = async (p = 1) => {
    setLoading(true);
    try {
      const res = await api.get(`/inventory/${warehouseType}/records`, { params: { ...recordFilters, page: p, pageSize: 50 } });
      setRecords(res.list);
      setRecordTotal(res.total);
      setRecordPage(p);
    } catch (err) { message.error(err.message); }
    setLoading(false);
  };

  useEffect(() => {
    fetchData(1);
    setActiveTab('list');
  }, [warehouseType]);

  // 权限判断
  const canIn = () => {
    if (user.role === 'admin') return true;
    if (user.role === 'production' && (warehouseType === 'material' || warehouseType === 'finished')) return true;
    return false;
  };
  const canOut = () => {
    if (user.role === 'admin') return true;
    if (user.role === 'production' && warehouseType === 'material') return true;
    if (user.role === 'shipping' && (warehouseType === 'finished' || warehouseType === 'packaging')) return true;
    return false;
  };
  const canAdjust = () => user.role === 'admin';

  const handleOpenScan = async (mode) => {
    setScanMode(mode);
    setScannedSku(null);
    setSkuCode('');
    setQuantity(1);
    setRelatedBillNo('');
    setRemark('');
    setCameraMode(false);
    setScanModal(true);
    // 如果是材料入库，获取待到货采购单
    if (mode === 'in' && warehouseType === 'material') {
      try {
        const res = await api.get('/purchases/pending/all');
        setPendingPurchases(res);
      } catch (e) { /* ignore */ }
    }
    // 如果是成品出库，获取待发货订单
    if (mode === 'out' && warehouseType === 'finished') {
      try {
        const res = await api.get('/orders', { params: { status: 'pending', pageSize: 100 } });
        setPendingOrders(res.list || []);
      } catch (e) { /* ignore */ }
    }
    setTimeout(() => skuCodeRef.current?.focus(), 300);
  };

  const handleScan = async () => {
    if (!skuCode) { message.warning('请输入或扫描SKU编码'); return; }
    try {
      const res = await api.get(`/skus/code/${skuCode}`);
      if (res.category !== warehouseType) {
        message.error(`该SKU分类为「${CATEGORY_MAP[res.category] || res.category}」，不属于「${config.short}」`);
        return;
      }
      setScannedSku(res);
      message.success(`识别成功：${res.code} - ${res.name}，当前库存：${res.stock_quantity || 0}`);
    } catch (err) { message.error(err.message); }
  };

  const handleScanSubmit = async () => {
    if (!scannedSku) { message.warning('请先扫码识别SKU'); return; }
    if (!quantity || quantity <= 0) { message.warning('数量必须大于0'); return; }
    
    const endpoint = scanMode === 'in' ? 'in' : 'out';
    try {
      const res = await api.post(`/inventory/${warehouseType}/${endpoint}`, {
        skuId: scannedSku.id,
        quantity: parseFloat(quantity),
        relatedBillNo: relatedBillNo || undefined,
        remark,
      });
      message.success(res.message);
      setScanModal(false);
      fetchData(page);
    } catch (err) { message.error(err.message); }
  };

  const handleAdjust = (record) => {
    setAdjustSku(record);
    setAdjustQty(record.quantity);
    setAdjustRemark('');
    setAdjustModal(true);
  };

  const handleAdjustSubmit = async () => {
    if (!adjustSku) return;
    if (adjustQty < 0) { message.warning('数量不能为负'); return; }
    try {
      await api.post(`/inventory/${warehouseType}/adjust`, {
        skuId: adjustSku.id,
        actualQuantity: parseFloat(adjustQty),
        remark: adjustRemark,
      });
      message.success('库存调整成功');
      setAdjustModal(false);
      fetchData(page);
    } catch (err) { message.error(err.message); }
  };

  const stockColumns = [
    { title: 'SKU编码', dataIndex: 'code', width: 120, fixed: 'left' },
    { title: '名称', dataIndex: 'name', width: 150, ellipsis: true },
    { title: '规格', dataIndex: 'spec', width: 120, ellipsis: true },
    { title: '单位', dataIndex: 'unit', width: 60 },
    { title: '当前库存', dataIndex: 'quantity', width: 100, render: (v, r) => {
      const low = r.min_stock > 0 && (v || 0) <= r.min_stock;
      return <span style={{ color: low ? '#ff4d4f' : 'inherit', fontWeight: low ? 'bold' : 'normal', fontSize: 16 }}>{v || 0}</span>;
    }},
    { title: '预警值', dataIndex: 'min_stock', width: 70 },
    { title: '状态', dataIndex: 'status', width: 70, render: (v) => <Tag color={v === 'active' ? 'green' : 'default'}>{v === 'active' ? '启用' : '停用'}</Tag> },
    { title: '更新时间', dataIndex: 'updated_at', width: 160, ellipsis: true },
    { title: '操作', width: 80, fixed: 'right', render: (_, r) => canAdjust() ? (
      <Button size="small" type="link" icon={<SettingOutlined />} onClick={() => handleAdjust(r)}>调整</Button>
    ) : null },
  ];

  const recordColumns = [
    { title: '时间', dataIndex: 'created_at', width: 180 },
    { title: '操作人', dataIndex: 'operator_name', width: 100 },
    { title: '操作类型', dataIndex: 'operation_type', width: 80, render: (v) => {
      const map = { in: { label: '入库', color: 'green' }, out: { label: '出库', color: 'orange' }, adjust: { label: '调整', color: 'blue' } };
      return <Tag color={map[v]?.color}>{map[v]?.label}</Tag>;
    }},
    { title: 'SKU编码', dataIndex: 'sku_code', width: 120 },
    { title: '名称', dataIndex: 'product_name', width: 150, ellipsis: true },
    { title: '数量', dataIndex: 'quantity', width: 80, render: (v, r) => {
      const sign = r.operation_type === 'in' ? '+' : r.operation_type === 'out' ? '-' : '±';
      const color = r.operation_type === 'in' ? '#52c41a' : r.operation_type === 'out' ? '#ff4d4f' : '#1677ff';
      return <span style={{ color, fontWeight: 'bold' }}>{sign}{v}</span>;
    }},
    { title: '关联单号', dataIndex: 'related_bill_no', width: 140, render: (v) => v || '-' },
    { title: '备注', dataIndex: 'remark', ellipsis: true },
  ];

  // 统计
  const totalQty = data.reduce((sum, item) => sum + (item.quantity || 0), 0);
  const lowStockCount = data.filter(item => item.min_stock > 0 && (item.quantity || 0) <= item.min_stock).length;

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4}>{config.name}</Title>
        <Space>
          {canIn() && <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenScan('in')}>扫码入库</Button>}
          {canOut() && <Button type="primary" danger icon={<MinusOutlined />} onClick={() => handleOpenScan('out')}>扫码出库</Button>}
        </Space>
      </div>

      <Tabs activeKey={activeTab} onChange={(key) => { setActiveTab(key); if (key === 'records') fetchRecords(1); }} items={[
        {
          key: 'list',
          label: <span><InboxOutlined /> 库存列表</span>,
          children: (
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <Space wrap>
                  <Input placeholder="搜索编码/名称/规格" value={filters.keyword} onChange={(e) => setFilters({ ...filters, keyword: e.target.value })} style={{ width: 200 }} onPressEnter={() => fetchData(1)} />
                  <Button type="primary" icon={<SearchOutlined />} onClick={() => fetchData(1)}>搜索</Button>
                  <Button icon={<ReloadOutlined />} onClick={() => { setFilters({ keyword: '', lowStock: false }); fetchData(1); }}>重置</Button>
                  <Button type="link" onClick={() => { setFilters({ ...filters, lowStock: !filters.lowStock }); setTimeout(() => fetchData(1), 100); }}>
                    {filters.lowStock ? '✓ ' : ''}仅看低库存
                  </Button>
                </Space>
                <Space>
                  <Statistic title="总库存" value={totalQty} valueStyle={{ fontSize: 20 }} />
                  <Statistic title="低库存" value={lowStockCount} valueStyle={{ fontSize: 20, color: lowStockCount > 0 ? '#ff4d4f' : undefined }} />
                </Space>
              </div>
              <Table columns={stockColumns} dataSource={data} rowKey="id" loading={loading}
                pagination={{ current: page, total, pageSize: 50, onChange: (p) => fetchData(p), showTotal: (t) => `共 ${t} 条` }}
                scroll={{ x: 1000 }} />
            </Card>
          ),
        },
        {
          key: 'records',
          label: <span><HistoryOutlined /> 出入库记录</span>,
          children: (
            <Card>
              <Space style={{ marginBottom: 16 }} wrap>
                <Input placeholder="搜索编码/名称/关联单号" value={recordFilters.keyword} onChange={(e) => setRecordFilters({ ...recordFilters, keyword: e.target.value })} style={{ width: 200 }} onPressEnter={() => fetchRecords(1)} />
                <Select placeholder="操作类型" allowClear style={{ width: 120 }} value={recordFilters.operationType || undefined} onChange={(v) => setRecordFilters({ ...recordFilters, operationType: v || '' })}
                  options={[{ label: '入库', value: 'in' }, { label: '出库', value: 'out' }, { label: '调整', value: 'adjust' }]} />
                <Button type="primary" icon={<SearchOutlined />} onClick={() => fetchRecords(1)}>搜索</Button>
                <Button icon={<ReloadOutlined />} onClick={() => { setRecordFilters({ keyword: '', operationType: '' }); fetchRecords(1); }}>重置</Button>
              </Space>
              <Table columns={recordColumns} dataSource={records} rowKey="id" loading={loading}
                pagination={{ current: recordPage, total: recordTotal, pageSize: 50, onChange: (p) => fetchRecords(p), showTotal: (t) => `共 ${t} 条` }}
                scroll={{ x: 1100 }} />
            </Card>
          ),
        },
      ]} />

      {/* 扫码出入库弹窗 */}
      <Modal title={scanMode === 'in' ? `扫码入库 - ${config.short}` : `扫码出库 - ${config.short}`}
        open={scanModal} onCancel={() => { setScanModal(false); setCameraMode(false); }} width={500}
        footer={[
          <Button key="cancel" onClick={() => { setScanModal(false); setCameraMode(false); }}>取消</Button>,
          <Button key="submit" type="primary" onClick={handleScanSubmit} disabled={!scannedSku}>确认{scanMode === 'in' ? '入库' : '出库'}</Button>,
        ]}>
        
        {cameraMode ? (
          /* 摄像头扫码界面 */
          <div>
            <QrScanner
              onScan={async (code) => {
                setSkuCode(code);
                setCameraMode(false);
                // 自动识别SKU
                try {
                  const res = await api.get(`/skus/code/${code}`);
                  if (res.category !== warehouseType) {
                    message.error(`该SKU分类为「${CATEGORY_MAP[res.category] || res.category}」，不属于「${config.short}」`);
                    return;
                  }
                  setScannedSku(res);
                  message.success(`识别成功：${res.code} - ${res.name}，当前库存：${res.stock_quantity || 0}`);
                } catch (err) { message.error(err.message); }
              }}
              onClose={() => setCameraMode(false)}
            />
          </div>
        ) : (
          /* 手动输入界面 */
          <div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text strong>步骤1：输入或扫描SKU编码</Text>
                <Button type="link" icon={<CameraOutlined />} onClick={() => setCameraMode(true)} style={{ padding: 0 }}>
                  摄像头扫码
                </Button>
              </div>
              <Space.Compact style={{ width: '100%' }}>
                <Input ref={skuCodeRef} placeholder="输入或扫描SKU编码（如CP-001）" value={skuCode} onChange={(e) => setSkuCode(e.target.value)}
                  onPressEnter={handleScan} prefix={<ScanOutlined />} />
                <Button type="primary" onClick={handleScan}>识别</Button>
              </Space.Compact>
            </div>
            {scannedSku && (
              <Card size="small" style={{ marginBottom: 16, background: '#f6ffed', borderColor: '#b7eb8f' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <Text strong>{scannedSku.code}</Text>
                    <br />
                    <Text>{scannedSku.name} {scannedSku.spec && `| ${scannedSku.spec}`}</Text>
                    <br />
                    <Text type="secondary">单位：{scannedSku.unit} | 预警值：{scannedSku.min_stock}</Text>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <Text type="secondary">当前库存</Text>
                    <div style={{ fontSize: 28, fontWeight: 'bold', color: scannedSku.stock_quantity <= scannedSku.min_stock ? '#ff4d4f' : '#52c41a' }}>
                      {scannedSku.stock_quantity || 0}
                    </div>
                  </div>
                </div>
              </Card>
            )}
            <div style={{ marginBottom: 16 }}>
              <Text strong>步骤2：输入{scanMode === 'in' ? '入库' : '出库'}数量</Text>
              <InputNumber min={0.01} step={1} style={{ width: '100%', marginTop: 8 }} value={quantity} onChange={setQuantity}
                addonAfter={scannedSku?.unit || ''} />
              {scanMode === 'out' && scannedSku && quantity > scannedSku.stock_quantity && (
                <Text type="danger" style={{ fontSize: 12 }}>⚠️ 出库数量超过当前库存！</Text>
              )}
            </div>
            {scanMode === 'in' && warehouseType === 'material' && pendingPurchases.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <Text strong>关联采购单（可选）</Text>
                <Select style={{ width: '100%', marginTop: 8 }} placeholder="选择关联的采购单" value={relatedBillNo || undefined}
                  onChange={setRelatedBillNo} allowClear
                  options={pendingPurchases.map(p => ({ label: `${p.bill_no} - ${p.supplier_name} (${p.status})`, value: p.bill_no }))} />
              </div>
            )}
            {scanMode === 'out' && warehouseType === 'finished' && pendingOrders.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <Text strong>关联订单（可选）</Text>
                <Select style={{ width: '100%', marginTop: 8 }} placeholder="选择关联的订单" value={relatedBillNo || undefined}
                  onChange={setRelatedBillNo} allowClear
                  options={pendingOrders.map(o => ({ label: `${o.order_no} - ${o.customer_name}`, value: o.order_no }))} />
              </div>
            )}
            <div>
              <Text strong>备注（可选）</Text>
              <Input.TextArea rows={2} style={{ marginTop: 8 }} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="如批次号、用途说明等" />
            </div>
          </div>
        )}
      </Modal>

      {/* 库存调整弹窗 */}
      <Modal title={`库存调整 - ${adjustSku?.code || ''}`}
        open={adjustModal} onCancel={() => setAdjustModal(false)} width={420}
        footer={[
          <Button key="cancel" onClick={() => setAdjustModal(false)}>取消</Button>,
          <Button key="submit" type="primary" onClick={handleAdjustSubmit}>确认调整</Button>,
        ]}>
        {adjustSku && (
          <div>
            <Card size="small" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <Text strong>{adjustSku.code}</Text><br />
                  <Text>{adjustSku.name} | {adjustSku.spec}</Text>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <Text type="secondary">当前库存</Text>
                  <div style={{ fontSize: 24, fontWeight: 'bold' }}>{adjustSku.quantity}</div>
                </div>
              </div>
            </Card>
            <div style={{ marginBottom: 16 }}>
              <Text strong>实际数量（盘点后）</Text>
              <InputNumber min={0} style={{ width: '100%', marginTop: 8 }} value={adjustQty} onChange={setAdjustQty}
                addonAfter={adjustSku.unit} />
              <Text type="secondary" style={{ fontSize: 12 }}>
                差异：{adjustQty - adjustSku.quantity > 0 ? '+' : ''}{(adjustQty - adjustSku.quantity).toFixed(2)}
                {adjustQty - adjustSku.quantity !== 0 && (adjustQty - adjustSku.quantity > 0 ? '（盘盈）' : '（盘亏）')}
              </Text>
            </div>
            <div>
              <Text strong>调整原因</Text>
              <Input.TextArea rows={2} style={{ marginTop: 8 }} value={adjustRemark} onChange={(e) => setAdjustRemark(e.target.value)}
                placeholder="如：盘盈、盘亏、损耗、损坏等" />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

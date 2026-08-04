import React, { useState, useEffect, useRef } from 'react';
import { Card, Table, Button, Modal, Space, message, Typography, Input, Select, Row, Col } from 'antd';
import { QrcodeOutlined, ReloadOutlined, PrinterOutlined, SearchOutlined } from '@ant-design/icons';
import { QRCodeCanvas } from 'qrcode.react';
import api from '../utils/api';

const { Title } = Typography;

const CATEGORY_MAP = { finished: '成品', material: '生产材料', packaging: '包装材料' };

export default function QrCodes() {
  const [data, setData] = useState([]);
  const [skus, setSkus] = useState([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [selectedSkuIds, setSelectedSkuIds] = useState([]);
  const [printModal, setPrintModal] = useState(false);
  const [printItems, setPrintItems] = useState([]);
  const printRef = useRef();

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/qrcodes', { params: { keyword } });
      setData(res);
      const skuRes = await api.get('/skus/all');
      setSkus(skuRes);
    } catch (err) { message.error(err.message); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleGenerate = async () => {
    if (selectedSkuIds.length === 0) {
      message.warning('请先选择要生成二维码的SKU');
      return;
    }
    try {
      const res = await api.post('/qrcodes/generate', { skuIds: selectedSkuIds });
      message.success(res.message);
      fetchData();
      setSelectedSkuIds([]);
    } catch (err) { message.error(err.message); }
  };

  const handlePrintSingle = (record) => {
    setPrintItems([record]);
    setPrintModal(true);
  };

  const handlePrintBatch = () => {
    if (data.length === 0) { message.warning('没有可打印的二维码'); return; }
    setPrintItems(data);
    setPrintModal(true);
  };

  const handlePrint = () => {
    window.print();
  };

  const columns = [
    { title: '二维码内容', dataIndex: 'code', width: 120 },
    { title: 'SKU名称', dataIndex: 'sku_name', ellipsis: true },
    { title: '规格', dataIndex: 'spec', width: 120 },
    { title: '单位', dataIndex: 'unit', width: 60 },
    { title: '分类', dataIndex: 'category', width: 100, render: (v) => CATEGORY_MAP[v] || v },
    { title: '二维码', width: 100, render: (_, record) => (
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <QRCodeCanvas value={record.code} size={64} />
      </div>
    )},
    { title: '操作', width: 100, render: (_, record) => (
      <Button size="small" type="link" icon={<PrinterOutlined />} onClick={() => handlePrintSingle(record)}>打印</Button>
    )},
  ];

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4}>二维码管理</Title>
        <Space>
          <Button icon={<PrinterOutlined />} onClick={handlePrintBatch} disabled={data.length === 0}>批量打印</Button>
          <Button type="primary" icon={<QrcodeOutlined />} onClick={handleGenerate} disabled={selectedSkuIds.length === 0}>
            生成二维码 ({selectedSkuIds.length})
          </Button>
        </Space>
      </div>

      <Card title="未生成二维码的SKU" size="small" style={{ marginBottom: 16 }}>
        <Select mode="multiple" style={{ width: '100%' }} placeholder="选择需要生成二维码的SKU"
          value={selectedSkuIds} onChange={setSelectedSkuIds}
          options={skus.map(s => ({ label: `${s.code} - ${s.name}`, value: s.id }))} />
      </Card>

      <Card>
        <Space style={{ marginBottom: 16 }}>
          <Input placeholder="搜索编码或名称" value={keyword} onChange={(e) => setKeyword(e.target.value)} style={{ width: 200 }} onPressEnter={fetchData} />
          <Button type="primary" icon={<SearchOutlined />} onClick={fetchData}>搜索</Button>
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
        </Space>
        <Table columns={columns} dataSource={data} rowKey="id" loading={loading} pagination={{ pageSize: 50 }} scroll={{ x: 800 }} />
      </Card>

      <Modal title="打印二维码标签" open={printModal} onCancel={() => setPrintModal(false)} width={700}
        footer={[<Button key="close" onClick={() => setPrintModal(false)}>关闭</Button>, <Button key="print" type="primary" icon={<PrinterOutlined />} onClick={handlePrint}>打印</Button>]}>
        <div ref={printRef} className="qr-preview" id="print-area">
          {printItems.map((item, idx) => (
            <div key={idx} className="qr-item" style={{ width: 180, padding: 8 }}>
              <QRCodeCanvas value={item.code || item.sku_code} size={120} />
              <div style={{ textAlign: 'center', marginTop: 4 }}>
                <div style={{ fontWeight: 'bold', fontSize: 12 }}>{item.sku_name || item.product_name || item.name}</div>
                <div style={{ fontSize: 11, color: '#666' }}>{item.code || item.sku_code}</div>
                <div style={{ fontSize: 10, color: '#999' }}>{item.spec}</div>
              </div>
            </div>
          ))}
        </div>
      </Modal>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #print-area, #print-area * { visibility: visible; }
          #print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .ant-modal-footer, .ant-modal-close { display: none !important; }
        }
      `}</style>
    </div>
  );
}

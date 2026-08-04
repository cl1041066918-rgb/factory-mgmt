import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, Space, message, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import api from '../utils/api';

const { Title } = Typography;

const PLATFORM_OPTIONS = ['1688', '淘宝', '拼多多', '抖音', '微信', '线下', '其他'];

export default function Customers() {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [platform, setPlatform] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  const fetchData = async (p = 1) => {
    setLoading(true);
    try {
      const res = await api.get('/customers', { params: { page: p, pageSize: 50, keyword, platform } });
      setData(res.list);
      setTotal(res.total);
      setPage(p);
    } catch (err) { message.error(err.message); }
    setLoading(false);
  };

  useEffect(() => { fetchData(1); }, [platform]);

  const handleAdd = () => {
    setEditing(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record) => {
    setEditing(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleDelete = (record) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除客户「${record.name}」吗？`,
      okType: 'danger',
      onOk: async () => {
        try {
          await api.delete(`/customers/${record.id}`);
          message.success('删除成功');
          fetchData(page);
        } catch (err) { message.error(err.message); }
      },
    });
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editing) {
        await api.put(`/customers/${editing.id}`, values);
        message.success('更新成功');
      } else {
        await api.post('/customers', values);
        message.success('添加成功');
      }
      setModalVisible(false);
      fetchData(page);
    } catch (err) {
      if (err.errorFields) return;
      message.error(err.message);
    }
  };

  const columns = [
    { title: '客户编号', dataIndex: 'code', width: 120 },
    { title: '客户名称', dataIndex: 'name', ellipsis: true },
    { title: '联系人', dataIndex: 'contact', width: 100 },
    { title: '联系电话', dataIndex: 'phone', width: 130 },
    { title: '常用平台', dataIndex: 'platform', width: 100 },
    { title: '收货地址', dataIndex: 'address', ellipsis: true },
    { title: '备注', dataIndex: 'remark', width: 120, ellipsis: true },
    { title: '操作', width: 120, render: (_, record) => (
      <Space>
        <Button size="small" type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
        <Button size="small" type="link" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)}>删除</Button>
      </Space>
    )},
  ];

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4}>客户档案</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增客户</Button>
      </div>
      <Card>
        <Space style={{ marginBottom: 16 }}>
          <Input placeholder="搜索客户编号/名称/联系人/电话" value={keyword} onChange={(e) => setKeyword(e.target.value)} style={{ width: 250 }} onPressEnter={() => fetchData(1)} />
          <Select placeholder="筛选平台" allowClear style={{ width: 120 }} value={platform || undefined} onChange={(v) => setPlatform(v || '')} options={PLATFORM_OPTIONS.map(p => ({ label: p, value: p }))} />
          <Button type="primary" icon={<SearchOutlined />} onClick={() => fetchData(1)}>搜索</Button>
          <Button icon={<ReloadOutlined />} onClick={() => { setKeyword(''); setPlatform(''); fetchData(1); }}>重置</Button>
        </Space>
        <Table columns={columns} dataSource={data} rowKey="id" loading={loading} pagination={{ current: page, total, pageSize: 50, onChange: (p) => fetchData(p) }} scroll={{ x: 1000 }} />
      </Card>
      <Modal title={editing ? '编辑客户' : '新增客户'} open={modalVisible} onOk={handleSubmit} onCancel={() => setModalVisible(false)} width={560}>
        <Form form={form} layout="vertical">
          <Form.Item name="code" label="客户编号" rules={[{ required: true, message: '请输入客户编号' }]}>
            <Input placeholder="如 KH-001" />
          </Form.Item>
          <Form.Item name="name" label="客户名称" rules={[{ required: true, message: '请输入客户名称' }]}>
            <Input placeholder="客户或公司名称" />
          </Form.Item>
          <Form.Item name="contact" label="联系人"><Input placeholder="联系人姓名" /></Form.Item>
          <Form.Item name="phone" label="联系电话"><Input placeholder="联系电话" /></Form.Item>
          <Form.Item name="address" label="收货地址"><Input.TextArea rows={2} placeholder="完整收货地址" /></Form.Item>
          <Form.Item name="platform" label="常用平台">
            <Select placeholder="选择平台" allowClear options={PLATFORM_OPTIONS.map(p => ({ label: p, value: p }))} />
          </Form.Item>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

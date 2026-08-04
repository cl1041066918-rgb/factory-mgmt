import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Input, Space, message, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import api from '../utils/api';

const { Title } = Typography;

export default function Suppliers() {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  const fetchData = async (p = 1) => {
    setLoading(true);
    try {
      const res = await api.get('/suppliers', { params: { page: p, pageSize: 50, keyword } });
      setData(res.list);
      setTotal(res.total);
      setPage(p);
    } catch (err) { message.error(err.message); }
    setLoading(false);
  };

  useEffect(() => { fetchData(1); }, []);

  const handleAdd = () => { setEditing(null); form.resetFields(); setModalVisible(true); };
  const handleEdit = (r) => { setEditing(r); form.setFieldsValue(r); setModalVisible(true); };

  const handleDelete = (record) => {
    Modal.confirm({
      title: '确认删除', content: `确定要删除供应商「${record.name}」吗？`, okType: 'danger',
      onOk: async () => {
        try { await api.delete(`/suppliers/${record.id}`); message.success('删除成功'); fetchData(page); }
        catch (err) { message.error(err.message); }
      },
    });
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editing) { await api.put(`/suppliers/${editing.id}`, values); message.success('更新成功'); }
      else { await api.post('/suppliers', values); message.success('添加成功'); }
      setModalVisible(false); fetchData(page);
    } catch (err) { if (err.errorFields) return; message.error(err.message); }
  };

  const columns = [
    { title: '供应商编号', dataIndex: 'code', width: 120 },
    { title: '供应商名称', dataIndex: 'name', ellipsis: true },
    { title: '联系人', dataIndex: 'contact', width: 100 },
    { title: '联系电话', dataIndex: 'phone', width: 130 },
    { title: '主营品类', dataIndex: 'category', width: 120 },
    { title: '备注', dataIndex: 'remark', ellipsis: true },
    { title: '操作', width: 120, render: (_, r) => (
      <Space>
        <Button size="small" type="link" icon={<EditOutlined />} onClick={() => handleEdit(r)}>编辑</Button>
        <Button size="small" type="link" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r)}>删除</Button>
      </Space>
    )},
  ];

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4}>供应商档案</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增供应商</Button>
      </div>
      <Card>
        <Space style={{ marginBottom: 16 }}>
          <Input placeholder="搜索供应商编号/名称/联系人/电话" value={keyword} onChange={(e) => setKeyword(e.target.value)} style={{ width: 250 }} onPressEnter={() => fetchData(1)} />
          <Button type="primary" icon={<SearchOutlined />} onClick={() => fetchData(1)}>搜索</Button>
          <Button icon={<ReloadOutlined />} onClick={() => { setKeyword(''); fetchData(1); }}>重置</Button>
        </Space>
        <Table columns={columns} dataSource={data} rowKey="id" loading={loading} pagination={{ current: page, total, pageSize: 50, onChange: (p) => fetchData(p) }} scroll={{ x: 900 }} />
      </Card>
      <Modal title={editing ? '编辑供应商' : '新增供应商'} open={modalVisible} onOk={handleSubmit} onCancel={() => setModalVisible(false)} width={480}>
        <Form form={form} layout="vertical">
          <Form.Item name="code" label="供应商编号" rules={[{ required: true, message: '请输入供应商编号' }]}>
            <Input placeholder="如 GYS-001" />
          </Form.Item>
          <Form.Item name="name" label="供应商名称" rules={[{ required: true, message: '请输入供应商名称' }]}>
            <Input placeholder="供应商或公司名称" />
          </Form.Item>
          <Form.Item name="contact" label="联系人"><Input /></Form.Item>
          <Form.Item name="phone" label="联系电话"><Input /></Form.Item>
          <Form.Item name="category" label="主营品类"><Input placeholder="如：硅钢片、铜线、纸箱等" /></Form.Item>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

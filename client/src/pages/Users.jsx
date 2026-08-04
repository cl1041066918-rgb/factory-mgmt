import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, Tag, Space, message, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import api from '../utils/api';

const { Title } = Typography;

const ROLE_OPTIONS = [
  { label: '主管理者', value: 'admin' },
  { label: '生产线管理者', value: 'production' },
  { label: '客服管理者', value: 'service' },
  { label: '发货部门', value: 'shipping' },
];

const ROLE_COLORS = { admin: 'red', production: 'blue', service: 'green', shipping: 'orange' };
const ROLE_LABELS = { admin: '主管理者', production: '生产线', service: '客服', shipping: '发货' };

export default function Users() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  const fetchData = async (params = {}) => {
    setLoading(true);
    try {
      const res = await api.get('/users', { params });
      setData(res);
    } catch (err) { message.error(err.message); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ status: 'active' });
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
      content: `确定要删除用户「${record.name}」吗？`,
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.delete(`/users/${record.id}`);
          message.success('删除成功');
          fetchData();
        } catch (err) { message.error(err.message); }
      },
    });
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editing) {
        await api.put(`/users/${editing.id}`, values);
        message.success('更新成功');
      } else {
        await api.post('/users', values);
        message.success('添加成功');
      }
      setModalVisible(false);
      fetchData();
    } catch (err) {
      if (err.errorFields) return;
      message.error(err.message);
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '用户名', dataIndex: 'username', width: 120 },
    { title: '姓名', dataIndex: 'name', width: 120 },
    { title: '角色', dataIndex: 'role', width: 120, render: (v) => <Tag color={ROLE_COLORS[v]}>{ROLE_LABELS[v]}</Tag> },
    { title: '状态', dataIndex: 'status', width: 80, render: (v) => <Tag color={v === 'active' ? 'green' : 'default'}>{v === 'active' ? '启用' : '停用'}</Tag> },
    { title: '创建时间', dataIndex: 'created_at', width: 180 },
    { title: '操作', width: 120, render: (_, record) => (
      <Space>
        <Button size="small" type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
        {record.username !== 'admin' && <Button size="small" type="link" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)}>删除</Button>}
      </Space>
    )},
  ];

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4}>账号管理</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => fetchData()}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增用户</Button>
        </Space>
      </div>
      <Card>
        <Table columns={columns} dataSource={data} rowKey="id" loading={loading} pagination={{ pageSize: 50 }} scroll={{ x: 800 }} />
      </Card>
      <Modal title={editing ? '编辑用户' : '新增用户'} open={modalVisible} onOk={handleSubmit} onCancel={() => setModalVisible(false)} width={480}>
        <Form form={form} layout="vertical">
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input disabled={editing} placeholder="登录用户名" />
          </Form.Item>
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input placeholder="真实姓名" />
          </Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true, message: '请选择角色' }]}>
            <Select options={ROLE_OPTIONS} />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true }]}>
            <Select options={[{ label: '启用', value: 'active' }, { label: '停用', value: 'inactive' }]} />
          </Form.Item>
          <Form.Item name="password" label={editing ? '重置密码（留空则不修改）' : '密码'} rules={editing ? [] : [{ required: true, message: '请输入密码' }]}>
            <Input.Password placeholder={editing ? '输入新密码可重置' : '登录密码'} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

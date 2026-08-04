import React, { useState } from 'react';
import { Card, Form, Input, Button, Typography, Alert, Space, Tag } from 'antd';
import { UserOutlined, LockOutlined, HomeOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/auth';

const { Title, Text } = Typography;

const demoAccounts = [
  { role: '主管理者', username: 'admin', password: 'admin123', color: 'red' },
  { role: '生产线', username: 'production', password: 'prod123', color: 'blue' },
  { role: '客服', username: 'service', password: 'service123', color: 'green' },
  { role: '发货', username: 'shipping', password: 'ship123', color: 'orange' },
];

export default function Login() {
  const [form] = Form.useForm();
  const [error, setError] = useState('');
  const { login, loading } = useAuthStore();
  const navigate = useNavigate();

  const onFinish = async (values) => {
    setError('');
    try {
      await login(values.username, values.password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || '登录失败');
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    }}>
      <Card style={{ width: '90%', maxWidth: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }} bordered={false}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <HomeOutlined style={{ fontSize: 48, color: '#1677ff' }} />
          <Title level={3} style={{ marginTop: 16, marginBottom: 4 }}>工厂管理系统</Title>
          <Text type="secondary">账单 · 订单 · 仓库 · 扫码</Text>
        </div>

        {error && <Alert message={error} type="error" showIcon style={{ marginBottom: 16 }} closable onClose={() => setError('')} />}

        <Form form={form} onFinish={onFinish} size="large">
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              登录
            </Button>
          </Form.Item>
        </Form>

        <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>演示账号（点击快速填充）：</Text>
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {demoAccounts.map((acc) => (
              <Tag
                key={acc.username}
                color={acc.color}
                style={{ cursor: 'pointer' }}
                onClick={() => form.setFieldsValue({ username: acc.username, password: acc.password })}
              >
                {acc.role}
              </Tag>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

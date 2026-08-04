import React, { useState } from 'react';
import { Card, Form, Input, Button, message, Typography } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import api from '../utils/api';
import useAuthStore from '../store/auth';

const { Title } = Typography;

export default function ChangePassword() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const { logout } = useAuthStore();

  const onFinish = async (values) => {
    if (values.newPassword !== values.confirmPassword) {
      message.error('两次输入的新密码不一致');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/change-password', { oldPassword: values.oldPassword, newPassword: values.newPassword });
      message.success('密码修改成功，请重新登录');
      logout();
      window.location.href = '/login';
    } catch (err) {
      message.error(err.message);
    }
    setLoading(false);
  };

  return (
    <div className="page-container">
      <Card style={{ maxWidth: 500, margin: '0 auto' }}>
        <Title level={4}>修改密码</Title>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="oldPassword" label="原密码" rules={[{ required: true, message: '请输入原密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="请输入原密码" />
          </Form.Item>
          <Form.Item name="newPassword" label="新密码" rules={[{ required: true, message: '请输入新密码' }, { min: 6, message: '密码至少6位' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="请输入新密码" />
          </Form.Item>
          <Form.Item name="confirmPassword" label="确认新密码" rules={[{ required: true, message: '请确认新密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="请再次输入新密码" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading}>确认修改</Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}

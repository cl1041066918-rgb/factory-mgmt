import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Space, message, Typography, Input, Select, Tag, DatePicker } from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import api from '../utils/api';
import dayjs from 'dayjs';

const { Title } = Typography;
const { RangePicker } = DatePicker;

const OP_TYPE_LABELS = {
  create: '新增', update: '修改', delete: '删除', status_change: '状态变更',
  ship: '发货', import: '导入', inventory_in: '入库', inventory_out: '出库', inventory_adjust: '调整',
};

export default function OperationLogs() {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ keyword: '', operationType: '', dateRange: null });

  const fetchData = async (p = 1) => {
    setLoading(true);
    try {
      const params = { page: p, pageSize: 50 };
      if (filters.keyword) params.keyword = filters.keyword;
      if (filters.operationType) params.operationType = filters.operationType;
      if (filters.dateRange) {
        params.startDate = filters.dateRange[0].format('YYYY-MM-DD');
        params.endDate = filters.dateRange[1].format('YYYY-MM-DD');
      }
      const res = await api.get('/logs', { params });
      setData(res.list);
      setTotal(res.total);
      setPage(p);
    } catch (err) { message.error(err.message); }
    setLoading(false);
  };

  useEffect(() => { fetchData(1); }, []);

  const columns = [
    { title: '时间', dataIndex: 'created_at', width: 180 },
    { title: '操作人', dataIndex: 'user_name', width: 100 },
    { title: '操作类型', dataIndex: 'operation_type', width: 100, render: (v) => <Tag>{OP_TYPE_LABELS[v] || v}</Tag> },
    { title: '操作对象', dataIndex: 'target', ellipsis: true },
    { title: '操作前', dataIndex: 'before_value', ellipsis: true, render: (v) => v ? <span style={{ fontSize: 12, color: '#999' }}>{v.length > 100 ? v.substring(0, 100) + '...' : v}</span> : '-' },
    { title: '操作后', dataIndex: 'after_value', ellipsis: true, render: (v) => v ? <span style={{ fontSize: 12, color: '#999' }}>{v.length > 100 ? v.substring(0, 100) + '...' : v}</span> : '-' },
  ];

  return (
    <div className="page-container">
      <Title level={4} style={{ marginBottom: 16 }}>操作日志</Title>
      <Card>
        <Space style={{ marginBottom: 16 }} wrap>
          <Input placeholder="搜索操作对象/操作人" value={filters.keyword} onChange={(e) => setFilters({ ...filters, keyword: e.target.value })} style={{ width: 200 }} onPressEnter={() => fetchData(1)} />
          <Select placeholder="操作类型" allowClear style={{ width: 120 }} value={filters.operationType || undefined} onChange={(v) => setFilters({ ...filters, operationType: v || '' })}
            options={Object.entries(OP_TYPE_LABELS).map(([k, v]) => ({ label: v, value: k }))} />
          <RangePicker value={filters.dateRange} onChange={(v) => setFilters({ ...filters, dateRange: v })} />
          <Button type="primary" icon={<SearchOutlined />} onClick={() => fetchData(1)}>搜索</Button>
          <Button icon={<ReloadOutlined />} onClick={() => { setFilters({ keyword: '', operationType: '', dateRange: null }); fetchData(1); }}>重置</Button>
        </Space>
        <Table columns={columns} dataSource={data} rowKey="id" loading={loading}
          pagination={{ current: page, total, pageSize: 50, onChange: (p) => fetchData(p) }} scroll={{ x: 900 }} />
      </Card>
    </div>
  );
}

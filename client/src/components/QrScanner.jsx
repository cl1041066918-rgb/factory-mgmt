import React, { useEffect, useRef, useState } from 'react';
import { Button, Spin, message, Typography } from 'antd';
import { CameraOutlined, CloseOutlined, ReloadOutlined } from '@ant-design/icons';
import { Html5Qrcode } from 'html5-qrcode';

const { Text } = Typography;

/**
 * QR扫码组件 - 调用手机摄像头扫描二维码
 * 使用方式：<QrScanner onScan={(decodedText) => console.log(decodedText)} onClose={() => setShow(false)} />
 */
export default function QrScanner({ onScan, onClose }) {
  const containerId = 'qr-scanner-container';
  const scannerRef = useRef(null);
  const [status, setStatus] = useState('starting'); // starting | scanning | error
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let mounted = true;

    const startScanner = async () => {
      try {
        const html5QrCode = new Html5Qrcode(containerId, { verbose: false });
        scannerRef.current = html5QrCode;

        // 尝试使用后置摄像头
        const config = {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        };

        // 获取摄像头列表，优先选择后置
        let facingMode = 'environment';
        
        await html5QrCode.start(
          { facingMode },
          config,
          (decodedText) => {
            if (mounted && decodedText) {
              // 提取SKU编码：二维码内容格式可能是 "CP-001 产品名称" 或纯编码
              let skuCode = decodedText.trim();
              // 如果包含空格，取第一段作为编码
              if (skuCode.includes(' ')) {
                skuCode = skuCode.split(' ')[0];
              }
              // 如果包含换行，取第一行
              if (skuCode.includes('\n')) {
                skuCode = skuCode.split('\n')[0].trim();
              }
              onScan(skuCode);
            }
          },
          () => {} // 忽略错误帧
        );

        if (mounted) setStatus('scanning');
      } catch (err) {
        console.error('Scanner error:', err);
        if (mounted) {
          setStatus('error');
          let msg = '无法启动摄像头';
          if (err && err.includes && err.includes('Permission')) {
            msg = '摄像头权限被拒绝，请在浏览器设置中允许摄像头访问';
          } else if (err && err.includes && err.includes('NotFound')) {
            msg = '未检测到摄像头设备';
          } else if (err && err.message) {
            msg = err.message;
          }
          setErrorMsg(msg);
        }
      }
    };

    // 延迟一帧确保 DOM 已渲染
    setTimeout(startScanner, 100);

    return () => {
      mounted = false;
      if (scannerRef.current) {
        scannerRef.current.stop().then(() => {
          scannerRef.current.clear();
        }).catch(() => {
          // 忽略清理错误
        });
      }
    };
  }, []);

  const handleRetry = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
      } catch (e) { /* ignore */ }
      scannerRef.current = null;
    }
    setStatus('starting');
    setErrorMsg('');
    setTimeout(async () => {
      try {
        const html5QrCode = new Html5Qrcode(containerId, { verbose: false });
        scannerRef.current = html5QrCode;
        await html5QrCode.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
          (decodedText) => {
            let skuCode = decodedText.trim();
            if (skuCode.includes(' ')) skuCode = skuCode.split(' ')[0];
            if (skuCode.includes('\n')) skuCode = skuCode.split('\n')[0].trim();
            onScan(skuCode);
          },
          () => {}
        );
        setStatus('scanning');
      } catch (err) {
        setStatus('error');
        setErrorMsg(err?.message || '重试失败');
      }
    }, 100);
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative', width: '100%', paddingTop: '100%', background: '#000', borderRadius: 8, overflow: 'hidden' }}>
        <div id={containerId} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
        
        {status === 'starting' && (
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', gap: 12 }}>
            <Spin size="large" />
            <Text style={{ color: '#fff' }}>正在启动摄像头...</Text>
          </div>
        )}

        {status === 'error' && (
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', gap: 12, padding: 20, textAlign: 'center' }}>
            <CameraOutlined style={{ fontSize: 48, opacity: 0.5 }} />
            <Text style={{ color: '#fff', fontSize: 14 }}>{errorMsg}</Text>
            <Button type="primary" icon={<ReloadOutlined />} onClick={handleRetry} size="small">重试</Button>
          </div>
        )}

        {status === 'scanning' && (
          <>
            {/* 扫描框 */}
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '60%', maxWidth: 280, aspectRatio: '1',
              border: '2px solid #1677ff', borderRadius: 12,
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.3)',
              pointerEvents: 'none',
            }}>
              <div style={{
                position: 'absolute', top: -2, left: -2,
                width: 24, height: 24,
                borderTop: '4px solid #1677ff', borderLeft: '4px solid #1677ff', borderRadius: '4px 0 0 0',
              }} />
              <div style={{
                position: 'absolute', top: -2, right: -2,
                width: 24, height: 24,
                borderTop: '4px solid #1677ff', borderRight: '4px solid #1677ff', borderRadius: '0 4px 0 0',
              }} />
              <div style={{
                position: 'absolute', bottom: -2, left: -2,
                width: 24, height: 24,
                borderBottom: '4px solid #1677ff', borderLeft: '4px solid #1677ff', borderRadius: '0 0 0 4px',
              }} />
              <div style={{
                position: 'absolute', bottom: -2, right: -2,
                width: 24, height: 24,
                borderBottom: '4px solid #1677ff', borderRight: '4px solid #1677ff', borderRadius: '0 0 4px 0',
              }} />
            </div>
            <Text style={{ position: 'absolute', bottom: 16, left: 0, right: 0, textAlign: 'center', color: '#fff', fontSize: 13 }}>
              将二维码对准框内即可自动识别
            </Text>
          </>
        )}
      </div>

      <Button block icon={<CloseOutlined />} onClick={onClose} style={{ marginTop: 12 }}>
        关闭扫码
      </Button>
    </div>
  );
}

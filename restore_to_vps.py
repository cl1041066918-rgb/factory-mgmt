# -*- coding: utf-8 -*-
"""
把现有数据（433 条 SKU + 6 张食堂账单）迁移到任意服务器。
用法：
  python restore_to_vps.py                        # 默认迁移到 Render
  python restore_to_vps.py http://1.2.3.4:3000    # 迁移到新 VPS（阿里云/腾讯云试用）
  python restore_to_vps.py https://your.domain    # 迁移到已绑域名的正式环境
"""
import json
import sys
import os
import urllib.request
import urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
BASE_URL = sys.argv[1] if len(sys.argv) > 1 else 'https://factory-mgmt.onrender.com'
SKU_JSON = os.path.join(HERE, 'sku_import.json')

# 6 张食堂账单（7/21 已按图当日合计修正为 ¥185.5）
CANTEEN_BILLS = [
    {
        'buy_date': '2026-07-21', 'buyer': '食堂采购',
        'remark': '历史补录（7月份，按图当日合计185.5修正青菜/豆芽单价）',
        'items': [
            {'name': '猪肉', 'quantity': 10, 'unit': '斤', 'unit_price': 10.0, 'subtotal': 100},
            {'name': '猪板油', 'quantity': 3, 'unit': '斤', 'unit_price': 2.5, 'subtotal': 7.5},
            {'name': '蛏子', 'quantity': 1, 'unit': '斤', 'unit_price': 30.0, 'subtotal': 30},
            {'name': '虾', 'quantity': 1, 'unit': '斤', 'unit_price': 30.0, 'subtotal': 30},
            {'name': '青菜', 'quantity': 1, 'unit': '斤', 'unit_price': 1.8, 'subtotal': 1.8},
            {'name': '豆芽', 'quantity': 2, 'unit': '斤', 'unit_price': 4.6, 'subtotal': 9.2},
            {'name': '豌豆玉米混合', 'quantity': 2, 'unit': '斤', 'unit_price': 3.5, 'subtotal': 7},
        ],
    },
    {
        'buy_date': '2026-07-22', 'buyer': '食堂采购', 'remark': '历史补录（7月份）',
        'items': [
            {'name': '酸豆角', 'quantity': 3, 'unit': '斤', 'unit_price': 2.0, 'subtotal': 6},
            {'name': '蒜苔', 'quantity': 2, 'unit': '斤', 'unit_price': 2.5, 'subtotal': 5},
            {'name': '豆腐', 'quantity': 1, 'unit': '斤', 'unit_price': 3.0, 'subtotal': 3},
            {'name': '上海青', 'quantity': 5, 'unit': '斤', 'unit_price': 2.9, 'subtotal': 14.5},
            {'name': '猪肉沫', 'quantity': 2.5, 'unit': '斤', 'unit_price': 11.2, 'subtotal': 28},
            {'name': '鸡肉', 'quantity': 3, 'unit': '斤', 'unit_price': 11.3, 'subtotal': 33.9},
            {'name': '鸭肉', 'quantity': 4, 'unit': '斤', 'unit_price': 8.5, 'subtotal': 34},
            {'name': '调料包', 'quantity': 1, 'unit': '袋', 'unit_price': 4.0, 'subtotal': 4},
        ],
    },
    {
        'buy_date': '2026-07-23', 'buyer': '食堂采购', 'remark': '历史补录（7月份）',
        'items': [
            {'name': '茄子', 'quantity': 3, 'unit': '斤', 'unit_price': 2.2, 'subtotal': 6.6},
            {'name': '土豆', 'quantity': 5, 'unit': '斤', 'unit_price': 1.4, 'subtotal': 7},
            {'name': '青椒', 'quantity': 5, 'unit': '斤', 'unit_price': 1.8, 'subtotal': 9},
            {'name': '番茄', 'quantity': 2, 'unit': '斤', 'unit_price': 3.5, 'subtotal': 7},
            {'name': '白菜', 'quantity': 6, 'unit': '斤', 'unit_price': 1.5, 'subtotal': 9},
            {'name': '土豆', 'quantity': 1.7, 'unit': '斤', 'unit_price': 3.5, 'subtotal': 5.95},
            {'name': '肥肉', 'quantity': 2, 'unit': '斤', 'unit_price': 3, 'subtotal': 6},
            {'name': '瘦肉', 'quantity': 12, 'unit': '斤', 'unit_price': 10, 'subtotal': 120},
            {'name': '鲈鱼', 'quantity': 1, 'unit': '斤', 'unit_price': 18, 'subtotal': 18},
            {'name': '蒜叶', 'quantity': 2, 'unit': '斤', 'unit_price': 5, 'subtotal': 10},
        ],
    },
    {
        'buy_date': '2026-07-24', 'buyer': '食堂采购', 'remark': '历史补录（7月份）',
        'items': [
            {'name': '苦瓜', 'quantity': 5.5, 'unit': '斤', 'unit_price': 2.6, 'subtotal': 14.3},
            {'name': '菜心', 'quantity': 1, 'unit': '斤', 'unit_price': 2.0, 'subtotal': 2},
        ],
    },
    {
        'buy_date': '2026-07-25', 'buyer': '食堂采购', 'remark': '历史补录（7月份）',
        'items': [
            {'name': '鸡蛋', 'quantity': 2, 'unit': '斤', 'unit_price': 20, 'subtotal': 40},
        ],
    },
    {
        'buy_date': '2026-08-04', 'buyer': '食堂采购', 'remark': '图一订单，蔬菜4件，实付¥21.94',
        'items': [
            {'name': '高山大白菜（清甜爽口，2斤-3斤/袋）', 'quantity': 1, 'unit': '袋', 'unit_price': 5.99, 'subtotal': 5.99},
            {'name': '鲜香脆嫩豇豆酸豆角（净含量≥30%，500g/袋）', 'quantity': 3, 'unit': '袋', 'unit_price': 1.99, 'subtotal': 5.97},
            {'name': '带泥胡萝卜（大小混装，4斤±0.3斤/袋）', 'quantity': 1, 'unit': '袋', 'unit_price': 4.99, 'subtotal': 4.99},
            {'name': '贵州平包菜（网套装，3斤-4斤/份）', 'quantity': 1, 'unit': '份', 'unit_price': 4.99, 'subtotal': 4.99},
        ],
    },
]


def api(path, token=None, method='GET', data=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    body = json.dumps(data, ensure_ascii=False).encode('utf-8') if data is not None else None
    req = urllib.request.Request(f'{BASE_URL}{path}', data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read().decode('utf-8')), None
    except urllib.error.HTTPError as e:
        return None, f'HTTP {e.code}: {e.read().decode("utf-8")[:200]}'
    except Exception as e:
        return None, str(e)


print(f'目标服务器: {BASE_URL}')
print('=' * 50)

# 1. Login
print('[1/3] 登录...')
r, err = api('/api/auth/login', method='POST', data={'username': 'admin', 'password': 'admin123'})
if err or not r or not r.get('token'):
    print(f'  登录失败: {err or r}')
    sys.exit(1)
token = r['token']
print('  OK')

# 2. SKU: wipe + import
print('[2/3] 迁移 SKU（清空 + 重新导入）...')
if not os.path.exists(SKU_JSON):
    print(f'  找不到 {SKU_JSON}，跳过 SKU 迁移')
else:
    with open(SKU_JSON, 'r', encoding='utf-8') as f:
        skus = json.load(f)
    print(f'  读取 {len(skus)} 条 SKU')

    r, err = api('/api/skus/wipe-all', token=token, method='POST')
    print(f'  清空: {"OK" if not err else err}')

    r, err = api('/api/skus/import', token=token, method='POST', data={'items': skus})
    if err:
        print(f'  导入失败: {err}')
    else:
        print(f'  导入: {r}')

# 3. Canteen bills
print('[3/3] 迁移食堂账单（6张）...')
ok = 0
for spec in CANTEEN_BILLS:
    payload = {
        'buy_date': spec['buy_date'],
        'buyer': spec['buyer'],
        'remark': spec['remark'],
        'items': [{'name': it['name'], 'quantity': it['quantity'], 'unit': it['unit'],
                   'unit_price': it['unit_price'], 'subtotal': it['subtotal']} for it in spec['items']],
    }
    r, err = api('/api/canteen', token=token, method='POST', data=payload)
    if err:
        print(f'  ✗ {spec["buy_date"]}: {err}')
    else:
        actual = sum(it['subtotal'] for it in spec['items'])
        ok += 1
        print(f'  ✓ {spec["buy_date"]} | {r.get("bill_no","?")} | {len(spec["items"])}件 | ¥{actual:.2f}')

print('=' * 50)
print(f'完成: SKU 已迁移, 食堂账单 {ok}/{len(CANTEEN_BILLS)} 张')

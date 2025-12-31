# -*- coding: utf-8 -*-
"""对比 JSON 和 XLSX 文件的字段内容是否完全一致。

功能：
    1. 读取 data/2025.json
    2. 读取 tools/2025 Racehorse Deaths (Active & Retired).xlsx
    3. 逐行对比每个字段的值是否一致
    4. 输出所有不一致的地方

使用方法：
    py -3 compare_json_xlsx.py

输出：
    在控制台显示对比结果和所有差异
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
JSON_PATH = ROOT / "data" / "2025.json"
EXCEL_PATH = ROOT / "tools" / "2025 Racehorse Deaths (Active & Retired).xlsx"


def normalize_value(value) -> str:
    """标准化值，用于对比（包含日期序列号转换）"""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    
    value_str = str(value).strip()
    
    if not value_str:
        return ""
    
    # 1. 如果是 Excel 日期序列号（纯数字字符串，且不是年份）
    if value_str.isdigit():
        try:
            days = int(value_str)
            # 过滤掉显然是年份的数字 (比如 1990-2030)
            if not (1900 <= days <= 2100):
                # 转换 Excel 序列号为日期（Excel 起点是 1899-12-30）
                from datetime import datetime, timedelta
                dt = datetime(1899, 12, 30) + timedelta(days=days)
                return dt.strftime('%Y-%m-%d')
        except:
            pass
    
    # 2. 去掉日期中的 " 00:00:00"
    if ' 00:00:00' in value_str:
        value_str = value_str.replace(' 00:00:00', '')
    
    return value_str


def main() -> None:
    # 1. 检查文件存在性
    if not JSON_PATH.exists():
        print(f"❌ JSON 文件不存在: {JSON_PATH}")
        return
    
    if not EXCEL_PATH.exists():
        print(f"❌ Excel 文件不存在: {EXCEL_PATH}")
        return
    
    # 2. 读取 JSON
    print(f"📖 正在读取 JSON: {JSON_PATH}")
    json_data = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    
    if not isinstance(json_data, list):
        print("❌ JSON 文件格式错误：根元素应该是数组")
        return
    
    print(f"  ✅ JSON 共有 {len(json_data)} 条记录")
    
    # 3. 读取 Excel
    print(f"📖 正在读取 Excel: {EXCEL_PATH}")
    df = pd.read_excel(EXCEL_PATH, dtype=str)
    df = df.fillna('')
    
    print(f"  ✅ Excel 共有 {len(df)} 行数据")
    
    # 4. 检查行数是否一致
    if len(json_data) != len(df):
        print(f"\n⚠️  警告：行数不一致！")
        print(f"  JSON: {len(json_data)} 行")
        print(f"  Excel: {len(df)} 行")
        print()
    
    # 5. 获取列名映射
    json_columns = set()
    if json_data:
        json_columns = set(json_data[0].keys())
    
    excel_columns = set(df.columns)
    
    print(f"\n📋 列名对比：")
    print(f"  JSON 列数: {len(json_columns)}")
    print(f"  Excel 列数: {len(excel_columns)}")
    
    # 检查列名差异
    json_only = json_columns - excel_columns
    excel_only = excel_columns - json_columns
    common_columns = json_columns & excel_columns
    
    if json_only:
        print(f"\n  ⚠️  仅在 JSON 中存在的列: {json_only}")
    
    if excel_only:
        print(f"\n  ⚠️  仅在 Excel 中存在的列: {excel_only}")
    
    print(f"\n  ✅ 共同列数: {len(common_columns)}")
    
    # 6. 构建 JSON 的马名映射
    print(f"\n🔍 构建数据映射...")
    json_map = {}
    for record in json_data:
        name = normalize_value(record.get("马名", ""))
        if name:
            json_map[name] = record
    
    print(f"  ✅ JSON 映射: {len(json_map)} 匹马")
    
    # 7. 按 Excel 的顺序逐行对比
    print(f"\n🔍 开始逐行对比...")
    differences = []
    unmatched_in_excel = []
    unmatched_in_json = set(json_map.keys())
    
    for idx, excel_record in df.iterrows():
        excel_name = normalize_value(excel_record.get("马名", ""))
        
        if not excel_name:
            continue
        
        # 从 JSON 中查找对应的记录
        if excel_name not in json_map:
            unmatched_in_excel.append(excel_name)
            continue
        
        # 找到匹配的记录
        json_record = json_map[excel_name]
        unmatched_in_json.discard(excel_name)
        
        # 获取标识信息（用于报告）
        seq = normalize_value(json_record.get("序号", ""))
        identifier = f"序号 {seq} ({excel_name})" if seq else excel_name
        
        # 对比每个共同列（排除序号，因为 JSON 和 Excel 的序号逻辑不同）
        for col in common_columns:
            if col == "序号":
                continue  # 跳过序号字段
            
            json_val = normalize_value(json_record.get(col, ""))
            excel_val = normalize_value(excel_record.get(col, ""))
            
            if json_val != excel_val:
                differences.append({
                    "identifier": identifier,
                    "column": col,
                    "json_value": json_val,
                    "excel_value": excel_val
                })
    
    # 8. 输出结果
    print(f"\n{'='*100}")
    print(f"对比完成！")
    print(f"{'='*100}")
    print(f"📊 Excel 总行数: {len(df)}")
    print(f"📊 JSON 总记录数: {len(json_data)}")
    print(f"✅ 成功匹配: {len(json_map) - len(unmatched_in_json)}")
    print(f"📋 对比列数: {len(common_columns)}")
    print(f"❌ 发现差异: {len(differences)} 处")
    
    # 显示未匹配的记录
    if unmatched_in_excel:
        print(f"\n⚠️  仅在 Excel 中存在的马匹 ({len(unmatched_in_excel)} 匹):")
        for name in unmatched_in_excel[:10]:
            print(f"  - {name}")
        if len(unmatched_in_excel) > 10:
            print(f"  ... 还有 {len(unmatched_in_excel) - 10} 匹未显示")
    
    if unmatched_in_json:
        print(f"\n⚠️  仅在 JSON 中存在的马匹 ({len(unmatched_in_json)} 匹):")
        for name in sorted(unmatched_in_json)[:10]:
            print(f"  - {name}")
        if len(unmatched_in_json) > 10:
            print(f"  ... 还有 {len(unmatched_in_json) - 10} 匹未显示")
    
    if differences:
        print(f"\n{'='*100}")
        print(f"差异详情：")
        print(f"{'='*100}")
        
        # 按行分组显示
        current_identifier = None
        for diff in differences:
            if diff["identifier"] != current_identifier:
                current_identifier = diff["identifier"]
                print(f"\n📍 {current_identifier}")
            
            print(f"  列: {diff['column']}")
            print(f"    JSON:  [{diff['json_value']}]")
            print(f"    Excel: [{diff['excel_value']}]")
    else:
        if not unmatched_in_excel and not unmatched_in_json:
            print(f"\n✅ 所有字段完全一致！")
        else:
            print(f"\n✅ 匹配的记录字段完全一致！")


if __name__ == "__main__":
    main()


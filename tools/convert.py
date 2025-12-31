import pandas as pd
import json
import os
import glob
import sys
import re
from datetime import datetime, timedelta

# ================= 配置区 =================
# 输出 JSON 的文件夹 (相对于当前脚本的位置)
OUTPUT_DIR = '../data'
# ==========================================

def parse_date_for_sorting(date_str):
    """
    从各种复杂的日期描述中提取出一个可用于排序的标准日期对象。
    """
    if not isinstance(date_str, str):
        return datetime.max 

    # 1. 尝试匹配 YYYY/MM/DD, YYYY-MM-DD, YYYY年MM月DD日
    match = re.search(r'(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})', date_str)
    if match:
        try:
            year, month, day = map(int, match.groups())
            return datetime(year, month, day)
        except ValueError:
            pass

    return datetime.max

def excel_date_to_string(value):
    """
    将 Excel 的日期数字或带时间的字符串清洗为标准的 YYYY-MM-DD 格式
    """
    if not isinstance(value, str):
        value = str(value)
    
    value = value.strip()
    if not value:
        return ""

    # 1. 如果是 Excel 数字日期 (纯数字字符串，且不是年份如2025)
    # Excel 日期起点是 1899-12-30
    if value.isdigit():
        try:
            days = int(value)
            # 过滤掉显然是年份的数字 (比如 1990-2030)
            if 1900 <= days <= 2100: 
                return value # 可能是纯年份，保留原样
            
            # 否则认为是 Excel 序列号
            dt = datetime(1899, 12, 30) + timedelta(days=days)
            return dt.strftime('%Y-%m-%d')
        except:
            pass
            
    # 2. 如果包含 "00:00:00"，去掉它
    if ' 00:00:00' in value:
        value = value.replace(' 00:00:00', '')
        
    # 3. 尝试进一步标准化 YYYY/MM/DD -> YYYY-MM-DD
    # 仅当整个字符串严格匹配日期格式时才转换，防止截断 "2025/02/14至..." 这样的长文本
    match = re.match(r'^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})$', value)
    if match:
        try:
            year, month, day = map(int, match.groups())
            return f"{year}-{month:02d}-{day:02d}"
        except:
            pass

    return value

def convert():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.join(base_dir, OUTPUT_DIR)

    files = glob.glob(os.path.join(base_dir, '*.xlsx')) + \
            glob.glob(os.path.join(base_dir, '*.xls')) + \
            glob.glob(os.path.join(base_dir, '*.csv'))
    
    if not files:
        print("错误: 当前 tools 目录下找不到任何 .xlsx, .xls 或 .csv 文件。")
        input("按回车键退出...")
        return

    selected_file = files[0]
    if len(files) > 1:
        print("找到多个文件，请选择要转换的文件:")
        for idx, f in enumerate(files):
            print(f"{idx + 1}. {os.path.basename(f)}")
        try:
            choice = int(input("请输入文件序号: ")) - 1
            if 0 <= choice < len(files):
                selected_file = files[choice]
        except ValueError:
            pass

    filename = os.path.basename(selected_file)
    ext = os.path.splitext(filename)[1].lower()

    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    try:
        print(f"正在读取 {filename} ...")
        
        # 强制按字符串读取，避免 Pandas 自动转换带来的不可控
        if ext in ['.xlsx', '.xls']:
            df = pd.read_excel(selected_file, dtype=str)
        else:
            try:
                df = pd.read_csv(selected_file, encoding='utf-8', dtype=str)
            except UnicodeDecodeError:
                df = pd.read_csv(selected_file, encoding='gbk', dtype=str)

        df = df.fillna('')
        
        # =================================================
        # 1. 数据清洗：修复日期格式
        # =================================================
        print("正在清洗日期格式...")
        date_keywords = ['出生', '逝世', '日期', 'Date', 'Birth', 'Death']
        
        for col in df.columns:
            # 检查列名是否包含日期关键词
            if any(k in col for k in date_keywords):
                print(f"  - 处理列: {col}")
                df[col] = df[col].apply(excel_date_to_string)

        # =================================================
        # 2. 排序逻辑
        # =================================================
        print("正在处理日期排序...")
        death_col = None
        for col in df.columns:
            if '逝世' in col or 'Death' in col or ('日期' in col and '出生' not in col):
                if '逝世' in col: 
                    death_col = col
                    break
                if not death_col:
                    death_col = col

        if death_col:
            # 创建临时排序列
            df['_sort_date'] = df[death_col].apply(parse_date_for_sorting)
            # 排序
            df = df.sort_values(by='_sort_date', ascending=True)
            df = df.drop(columns=['_sort_date'])
        
        # =================================================
        # 3. 重生成序号
        # =================================================
        print("正在重新生成序号...")
        id_col = None
        for col in df.columns:
            if '序号' in col or 'No' in col or 'id' in col.lower():
                id_col = col
                break
        
        new_indices = range(1, len(df) + 1)
        if id_col:
            df[id_col] = new_indices
        else:
            df.insert(0, '序号', new_indices)

        # =================================================

        data = df.to_dict(orient='records')
        
        default_year = ''
        match = re.search(r'(\d{4})', filename)
        if match:
            default_year = match.group(1)

        year = input(f"请输入这份数据所属的年份 (默认: {default_year}): ").strip()
        if not year and default_year:
            year = default_year
        
        if not year:
            print("错误: 年份不能为空！")
            return

        output_path = os.path.join(output_dir, f'{year}.json')
        
        # =================================================
        # 4. 保留原 JSON 中的特殊字段（如 hasPhoto）
        # =================================================
        print("正在合并原有的特殊字段...")
        preserved_fields = {}  # {序号: {字段名: 值}}
        
        if os.path.exists(output_path):
            try:
                with open(output_path, 'r', encoding='utf-8') as f:
                    old_data = json.load(f)
                
                # 提取需要保留的字段
                fields_to_preserve = ['hasPhoto']  # 可以在这里添加更多需要保留的字段
                
                for old_record in old_data:
                    serial = old_record.get('序号')
                    if serial:
                        # 统一转换为字符串类型，避免类型不匹配
                        serial_key = str(serial)
                        preserved = {}
                        for field in fields_to_preserve:
                            if field in old_record:
                                preserved[field] = old_record[field]
                        if preserved:
                            preserved_fields[serial_key] = preserved
                
                if preserved_fields:
                    print(f"  - 找到 {len(preserved_fields)} 条记录包含需要保留的字段")
            except Exception as e:
                print(f"  ⚠️ 读取旧 JSON 失败，将跳过字段保留: {e}")
        
        # 合并保留的字段到新数据
        for record in data:
            serial = record.get('序号')
            if serial:
                # 统一转换为字符串类型进行匹配
                serial_key = str(serial)
                if serial_key in preserved_fields:
                    for field, value in preserved_fields[serial_key].items():
                        record[field] = value
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            
        print(f"✅ 转换成功!")
        print(f"数据已保存到: {output_path}")
        print("日期已清洗，排序已重置。")
        
    except Exception as e:
        print(f"❌ 转换失败: {e}")
        import traceback
        traceback.print_exc()

    input("按回车键退出...")

if __name__ == '__main__':
    convert()

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
根据 JSON 文件中的序号重命名图片文件

功能：
1. 读取指定年份的 JSON 文件
2. 扫描对应年份的图片目录
3. 根据马名匹配图片，使用 JSON 中的序号重命名

使用方法：
    python rename_images.py 2025
"""

import json
import os
import re
import sys
from pathlib import Path


def get_english_name(horse_name):
    """
    从马名中提取英文名称（与前端 getEnglishName 逻辑一致）
    
    逻辑：找到第一个完全由 ASCII 字符组成的部分
    - "火速姬|ハヤスギ|Hayasugi" → "Hayasugi"
    - "Gallo Blue Chip" → "Gallo Blue Chip"
    
    Args:
        horse_name: 马名，格式如 "中文|日文|English" 或 "English Name"
    
    Returns:
        str: 英文名称
    """
    if not horse_name:
        return ''
    
    # 按竖线分割
    name_parts = horse_name.split('|')
    
    # 找到第一个完全由 ASCII 字符（\u0020-\u007E）组成的部分
    for part in name_parts:
        part = part.strip()
        # 检查是否完全由 ASCII 可打印字符组成
        if part and all(0x20 <= ord(c) <= 0x7E for c in part):
            return part
    
    # 如果没有找到纯 ASCII 部分，返回空字符串
    return ''


def normalize_filename(name):
    """
    规范化文件名，移除不合法字符
    
    Args:
        name: 原始名称
    
    Returns:
        str: 规范化后的名称
    """
    # Windows 文件名不允许的字符
    invalid_chars = r'[<>:"/\\|?*]'
    return re.sub(invalid_chars, '', name)


def find_image_by_name(image_dir, english_name, debug=False):
    """
    在图片目录中查找匹配的图片文件
    
    Args:
        image_dir: 图片目录路径
        english_name: 英文马名
        debug: 是否输出调试信息
    
    Returns:
        tuple: (找到的图片文件路径, 调试信息字典)
    """
    normalized_name = normalize_filename(english_name)
    debug_info = {
        'english_name': english_name,
        'normalized_name': normalized_name,
        'candidates': []
    }
    
    # 遍历目录中的所有 jpg 文件
    for img_file in image_dir.glob('*.jpg'):
        # 移除序号前缀（格式：01_Name.jpg 或 Name.jpg）
        filename = img_file.stem  # 不含扩展名
        
        # 尝试移除序号前缀
        match = re.match(r'^\d+_(.+)$', filename)
        if match:
            name_part = match.group(1)
        else:
            name_part = filename
        
        # 记录候选文件（用于调试）
        if debug:
            debug_info['candidates'].append({
                'filename': img_file.name,
                'name_part': name_part,
                'match': name_part.lower() == normalized_name.lower()
            })
        
        # 对比名称（忽略大小写）
        if name_part.lower() == normalized_name.lower():
            return img_file, debug_info
    
    return None, debug_info


def rename_images(year, debug_mode=False, max_debug_items=5):
    """
    重命名指定年份的图片文件
    
    Args:
        year: 年份（如 2025）
        debug_mode: 是否启用调试模式
        max_debug_items: 调试模式下最多显示多少条详细信息
    
    Returns:
        bool: 是否成功
    """
    # 获取项目根目录（脚本在 tools 目录下）
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    
    # 构建路径
    json_path = project_root / 'data' / f'{year}.json'
    image_dir = project_root / 'images' / str(year)
    
    # 检查文件和目录是否存在
    if not json_path.exists():
        print(f'[错误] JSON 文件不存在: {json_path}')
        return False
    
    if not image_dir.exists():
        print(f'[错误] 图片目录不存在: {image_dir}')
        return False
    
    # 读取 JSON 文件
    print(f'正在读取 JSON 文件: {json_path}')
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print(f'[错误] 读取 JSON 文件失败: {e}')
        return False
    
    if not isinstance(data, list):
        print('[错误] JSON 文件格式错误，应为数组')
        return False
    
    print(f'共找到 {len(data)} 条记录')
    print(f'图片目录: {image_dir}')
    
    if debug_mode:
        print(f'\n[调试模式] 将显示前 {max_debug_items} 条未找到图片的详细信息')
    
    print()
    
    # 统计信息
    renamed_count = 0
    skipped_count = 0
    not_found_count = 0
    debug_items_shown = 0
    
    # 遍历 JSON 数据
    for item in data:
        serial = item.get('序号')
        horse_name = item.get('马名', '').strip()
        has_photo = item.get('hasPhoto', True)
        
        if not horse_name:
            continue
        
        # 如果标记为无图片，跳过
        if not has_photo:
            print(f'[跳过] #{serial:02d} {horse_name} - 标记为无图片')
            skipped_count += 1
            continue
        
        # 获取英文名
        english_name = get_english_name(horse_name)
        normalized_name = normalize_filename(english_name)
        
        # 查找图片文件
        old_image, debug_info = find_image_by_name(image_dir, english_name, debug=debug_mode)
        
        if not old_image:
            print(f'[未找到] #{serial:02d} {horse_name}')
            
            # 调试模式：显示详细信息
            if debug_mode and debug_items_shown < max_debug_items:
                print(f'  提取的英文名: {debug_info["english_name"]}')
                print(f'  规范化后: {debug_info["normalized_name"]}')
                print(f'  目录中的文件（前5个）:')
                for i, candidate in enumerate(debug_info['candidates'][:5]):
                    match_symbol = '✓' if candidate['match'] else '✗'
                    print(f'    [{match_symbol}] {candidate["filename"]} -> 提取名称: {candidate["name_part"]}')
                if len(debug_info['candidates']) > 5:
                    print(f'    ... 还有 {len(debug_info["candidates"]) - 5} 个文件未显示')
                print()
                debug_items_shown += 1
            
            not_found_count += 1
            continue
        
        # 构建新文件名
        new_filename = f'{serial:02d}_{normalized_name}.jpg'
        new_image = image_dir / new_filename
        
        # 如果文件名已经正确，跳过
        if old_image.name == new_filename:
            print(f'[已是最新] #{serial:02d} {horse_name}')
            skipped_count += 1
            continue
        
        # 重命名文件
        try:
            old_image.rename(new_image)
            print(f'[重命名] #{serial:02d} {horse_name}')
            print(f'  {old_image.name} → {new_filename}')
            renamed_count += 1
        except Exception as e:
            print(f'[错误] 重命名失败: {old_image.name} → {new_filename}')
            print(f'  错误信息: {e}')
    
    # 输出统计信息
    print()
    print('=' * 80)
    print('重命名完成！')
    print(f'  成功重命名: {renamed_count} 个文件')
    print(f'  跳过: {skipped_count} 个文件')
    print(f'  未找到: {not_found_count} 个文件')
    print('=' * 80)
    
    return True


def main():
    """主函数"""
    print('=' * 80)
    print('图片重命名工具')
    print('=' * 80)
    print()
    
    # 获取年份参数
    if len(sys.argv) > 1:
        year = sys.argv[1]
    else:
        year = input('请输入年份（如 2025）: ').strip()
    
    # 验证年份格式
    if not re.match(r'^\d{4}$', year):
        print('[错误] 年份格式不正确，应为 4 位数字（如 2025）')
        return
    
    # 询问是否启用调试模式
    debug_input = input('是否启用调试模式？(y/n，默认 n): ').strip().lower()
    debug_mode = debug_input in ['y', 'yes', '是']
    
    if debug_mode:
        max_debug_input = input('显示多少条详细调试信息？(默认 5): ').strip()
        try:
            max_debug_items = int(max_debug_input) if max_debug_input else 5
        except ValueError:
            max_debug_items = 5
    else:
        max_debug_items = 5
    
    print()
    
    # 执行重命名
    success = rename_images(year, debug_mode=debug_mode, max_debug_items=max_debug_items)
    
    if not success:
        sys.exit(1)


if __name__ == '__main__':
    main()


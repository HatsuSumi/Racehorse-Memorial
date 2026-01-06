#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""project_stats.py

全项目90%领域通用统计工具：
- 统计项目文件数量（按类型，覆盖代码、设计资源、多媒体、文档数据等）
- 统计代码行数与字符数（智能去除空行与注释，支持 C/Py/JS/Go/Rust/Shell 等所有主流语言）
- 统计资源文件大小与分布（支持 3D/2D 图形、音视频、工程源文件、归档等）
- 生成可视化 HTML 报表（可选）

核心支持领域（覆盖率 >90%）：
- 软件工程: 前后端(Web/App), 嵌入式, 桌面应用, 脚本工具
- 游戏开发: Unity, Unreal, Godot, Cocos, RPG Maker 等所有主流引擎
- 数字艺术: 2D绘画(PSD/CSP), 3D建模(Blender/Maya/Max), 动画(Spine/Live2D)
- 音频创作: DAW工程(FL/Logic/Cubase), 音频中间件, 乐谱
- 产品设计: 原型设计(Axure/Sketch), 思维导图(XMind), 剧本
- 数据归档: 数据库脚本, Office文档, 各类封包与压缩格式

用法：
  py -3 project_stats.py
  py -3 project_stats.py "H:/path/to/project"
  python project_stats.py . --html

可选参数：
  --html [FILE]      生成交互式 HTML 可视化报告（默认 project_stats_report.html）
  --assets           统计非代码/资源文件（图片/音频/模型/二进制等）
  --no-ignore        不忽略常见目录（如 .git, node_modules）
  --include-hidden   也统计隐藏文件/目录
  --detail           输出细分统计（按后缀名）
  --list-files       输出文件路径清单
  --log [FILE]       输出统计结果到 txt 文件
  --markdown         生成 Markdown 格式输出（适合直接复制到 README.md）
"""

from __future__ import annotations

import argparse
import io
import os
import sys
import threading
import time

# 强制设置 stdout 为 UTF-8 编码，避免 Windows 下的 GBK 编码问题
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple, Callable


# ----------------------------
# 配置：类型识别
# ----------------------------

FILE_TYPE_DEFS: List[Tuple[str, Tuple[str, ...]]] = [
    # Web / Markup / Data
    ("JavaScript", (".js", ".mjs", ".cjs")),
    ("TypeScript", (".ts", ".tsx", ".mts", ".cts")),
    ("HTML", (".html", ".htm", ".xhtml")),
    ("CSS", (".css",)),
    ("SCSS", (".scss", ".sass")),
    ("Less", (".less",)),
    ("JSON", (".json", ".json5", ".jsonc")),
    ("YAML", (".yml", ".yaml")),
    ("XML", (".xml", ".xsl", ".xslt", ".svg", ".xaml")),
    ("TOML", (".toml",)),
    ("INI", (".ini", ".cfg", ".conf", ".editorconfig", ".properties", ".prefs")),
    ("Markdown", (".md", ".markdown", ".mdown", ".mkd")),
    # C family / compiled
    ("C", (".c", ".h")),
    ("C++", (".cc", ".cpp", ".cxx", ".hpp", ".hh", ".hxx", ".inl", ".inc")),
    ("C#", (".cs", ".csx")),
    ("Objective-C", (".m", ".mm")),
    ("Java", (".java", ".jav", ".jsp")),
    ("Kotlin", (".kt", ".kts")),
    ("Swift", (".swift",)),
    ("Go", (".go",)),
    ("Rust", (".rs", ".rlib")),
    ("Dart", (".dart",)),
    ("Scala", (".scala", ".sc")),
    # Script
    ("Python", (".py", ".pyw", ".pyi")),
    ("Ruby", (".rb", ".rake", ".gemspec")),
    ("PHP", (".php", ".phtml", ".php3", ".php4", ".php5", ".phps")),
    ("Perl", (".pl", ".pm", ".t")),
    ("Lua", (".lua",)),
    ("R", (".r", ".R", ".Rmd")),
    ("SQL", (".sql", ".ddl", ".dml")),
    ("Shell", (".sh", ".bash", ".zsh", ".fish", ".ksh")),
    ("PowerShell", (".ps1", ".psm1", ".psd1")),
    ("批处理", (".bat", ".cmd")),
    # Game Engine & Shaders
    ("Shader", (".shader", ".cg", ".cginc", ".hlsl", ".glsl", ".vert", ".frag", ".geom", ".comp", ".tesc", ".tese", ".vsh", ".fsh")),
    ("Unity", (".unity", ".prefab", ".asset", ".meta", ".mat", ".controller", ".anim", ".mask")),
    ("Unreal", (".uproject", ".umap", ".uasset")),
    ("Godot", (".gd", ".tscn", ".tres", ".godot")),
    ("RenPy", (".rpy", ".rpyc", ".rpym")),
    ("RPG Maker", (".rvdata2", ".rpgsave")),
    ("Kirikiri", (".ks", ".tjs")),
    ("ActionScript", (".as",)),
    ("Haxe", (".hx",)),
    ("WebAssembly", (".wat",)), # .wasm is binary
]

# 扩展名 -> 类型（加速 detect）
EXT_TO_TYPE: Dict[str, str] = {}
for _t, _exts in FILE_TYPE_DEFS:
    for _e in _exts:
        EXT_TO_TYPE[_e.lower()] = _t

# 文件数量统计展示名（按你示例中文风格）
FILE_TYPE_LABELS: Dict[str, str] = {
    "JavaScript": "JavaScript文件",
    "TypeScript": "TypeScript文件",
    "JSON": "JSON文件",
    "HTML": "HTML文件",
    "CSS": "CSS文件",
    "SCSS": "SCSS/Sass文件",
    "Less": "Less文件",
    "YAML": "YAML文件",
    "XML": "XML文件",
    "TOML": "TOML文件",
    "INI": "INI/配置文件",
    "Markdown": "Markdown文档",
    "C": "C文件",
    "C++": "C++文件",
    "C#": "C#文件",
    "Objective-C": "Objective-C文件",
    "Java": "Java文件",
    "Kotlin": "Kotlin文件",
    "Swift": "Swift文件",
    "Go": "Go文件",
    "Rust": "Rust文件",
    "Dart": "Dart文件",
    "Scala": "Scala文件",
    "Python": "Python脚本",
    "Ruby": "Ruby脚本",
    "PHP": "PHP脚本",
    "Perl": "Perl脚本",
    "Lua": "Lua脚本",
    "R": "R脚本",
    "SQL": "SQL脚本",
    "Shell": "Shell脚本",
    "PowerShell": "PowerShell脚本",
    "批处理": "批处理脚本",
    "Unity": "Unity工程文件",
    "Unreal": "Unreal工程文件",
    "Godot": "Godot文件",
    "RenPy": "Ren'Py脚本",
    "RPG Maker": "RPG Maker数据",
    "Shader": "着色器代码",
    "License": "License文件",
    "Other": "其他文件",
}

# 代码统计展示名（按你示例：语言名对齐）
CODE_TYPE_LABELS: Dict[str, str] = {
    "JavaScript": "JavaScript",
    "TypeScript": "TypeScript",
    "HTML": "HTML",
    "CSS": "CSS",
    "SCSS": "SCSS",
    "Less": "Less",
    "Python": "Python",
    "C": "C",
    "C++": "C++",
    "C#": "C#",
    "Objective-C": "ObjC",
    "Java": "Java",
    "Kotlin": "Kotlin",
    "Swift": "Swift",
    "Go": "Go",
    "Rust": "Rust",
    "Dart": "Dart",
    "Scala": "Scala",
    "Ruby": "Ruby",
    "PHP": "PHP",
    "Perl": "Perl",
    "Lua": "Lua",
    "R": "R",
    "SQL": "SQL",
    "Shell": "Shell",
    "PowerShell": "PowerShell",
    "批处理": "Batch",
    "Shader": "Shader",
    "Unity": "Unity",
    "Godot": "Godot",
    "RenPy": "RenPy",
    "Kirikiri": "Kirikiri",
    "ActionScript": "ActionScript",
    "Haxe": "Haxe",
    "WebAssembly": "WASM(Text)",
}

LICENSE_NAMES = {
    "license",
    "license.txt",
    "license.md",
    "copying",
    "copying.txt",
    "copying.md",
}

DEFAULT_IGNORED_DIRS = {
    ".git",
    ".hg",
    ".svn",
    ".idea",
    ".vscode",
    ".cursor",
    "node_modules",
    "dist",
    "build",
    "out",
    ".next",
    ".nuxt",
    ".cache",
    "coverage",
    "__pycache__",
    ".venv",
    "venv",
}

DEFAULT_IGNORED_FILES = {
    ".ds_store",
    "project_stats.py",  # 排除脚本自身
}

# 排除生成的文件（通配符模式）
DEFAULT_IGNORED_PATTERNS = [
    "project_stats_report*.html",  # 排除生成的HTML报告（支持自定义文件名）
    "project_stats*.log",          # 排除生成的日志文件（支持自定义文件名）
    "*_stats_report*.html",        # 其他可能的报告文件名
    "*.log",                       # 排除所有.log文件（用户自定义的日志）
]

BINARY_EXTS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".ico",
    ".bmp",
    ".tiff",
    ".mp3",
    ".wav",
    ".flac",
    ".mp4",
    ".mkv",
    ".mov",
    ".avi",
    ".pdf",
    ".zip",
    ".7z",
    ".rar",
    ".gz",
    ".tar",
    ".woff",
    ".woff2",
    ".ttf",
    ".otf",
    ".psd",
}

ASSET_TYPES: Dict[str, str] = {
    "image": "图片文件",
    "texture": "纹理/贴图文件",
    "video": "视频文件",
    "audio": "音频文件",
    "audio_middleware": "音频中间件/库",
    "daw": "音乐工程(DAW)/乐谱",
    "adobe": "Adobe工程/素材文件",
    "art_source": "绘画/像素画源文件",
    "live2d": "Live2D模型文件",
    "spine": "Spine动画文件",
    "model3d": "3D模型文件",
    "game_model": "游戏引擎模型/资产",
    "game_archive": "游戏封包/归档",
    "game_save": "游戏存档文件",
    "design": "策划/剧本/脑图",
    "mobile_package": "移动端应用包",
    "rom": "游戏ROM/镜像",
    "flash": "Flash文件",
    "video_edit": "视频剪辑工程",
    "office": "Office文档",
    "pdf": "PDF文档",
    "archive": "压缩包",
    "font": "字体文件",
    "backup": "备份文件",
    "other_asset": "其他资源文件",
}

BACKUP_EXTS = {".bak", ".old", ".orig", ".tmp", ".swp", ".~"}

IMAGE_EXTS = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tiff", ".ico", ".svg",
    ".tga", ".exr", ".hdr", ".tif", ".heic", ".raw"
}

# 纹理格式（GPU压缩格式等）
TEXTURE_EXTS = {
    ".dds", ".ktx", ".ktx2", ".pvr", ".astc", ".pkm", ".atc", ".tex", ".mat",
    ".assetbundle", ".vtf", ".vmt" # Source Engine
}

# 绘画/像素画源文件 (非Adobe)
ART_SOURCE_EXTS = {
    ".clip", ".cmc", # Clip Studio Paint
    ".sai", ".sai2", # SAI
    ".kra", ".krz", # Krita
    ".ase", ".aseprite", # Aseprite
    ".procreate", # Procreate
    ".ora", # OpenRaster
    ".mdp", # FireAlpaca / MediBang
}

VIDEO_EXTS = {".mp4", ".mkv", ".mov", ".avi", ".webm", ".wmv", ".flv", ".m4v", ".ogv", ".ts", ".3gp"}

# 视频剪辑工程 (非Adobe)
VIDEO_EDIT_EXTS = {
    ".veg", ".veg-bak", # Vegas Pro
    ".drp", # DaVinci Resolve Project (export)
    ".fcpxml", # Final Cut Pro
    ".edl", # Edit Decision List
}

AUDIO_EXTS = {".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a", ".opus", ".wma", ".mid", ".midi", ".aiff", ".caf", ".m4b"}

# 音乐制作工程 (DAW) & 乐谱
DAW_EXTS = {
    ".flp", # FL Studio
    ".cpr", ".npr", # Cubase / Nuendo
    ".als", # Ableton Live
    ".logic", ".logicx", # Logic Pro
    ".rpp", # Reaper
    ".song", # Studio One
    ".ptx", ".ptf", # Pro Tools
    ".reason", # Reason
    ".mscz", ".mscx", # MuseScore
    ".sib", # Sibelius
    ".mus", ".musx", # Finale
    ".vsqx", ".vpr", ".ust", ".svp", # Vocaloid / Synthesizer V
}

# 音频中间件格式
AUDIO_MIDDLEWARE_EXTS = {
    ".bnk", ".pck", # Wwise
    ".acb", ".awb", # CRI ADX2
    ".fsb", ".fev", ".bank", # FMOD
    ".wem", # Wwise encoded media
    ".sab", ".sob", # Sony
}

FONT_EXTS = {".woff", ".woff2", ".ttf", ".otf", ".eot", ".ttc"}
ARCHIVE_EXTS = {".zip", ".7z", ".rar", ".gz", ".tar", ".bz2", ".xz", ".iso", ".img", ".dmg", ".cab"}

# 游戏常用封包/归档格式
GAME_ARCHIVE_EXTS = {
    ".pak", # Unreal / 通用
    ".cpk", # CRI Middleware
    ".arc", ".bfa", ".bin", ".dat", ".cat", ".idx", # 通用
    ".assets", ".bundle", # Unity
    ".vpk", # Source Engine
    ".rgss3a", ".rgss2a", ".rgssad", # RPG Maker
    ".xp3", # Kirikiri
    ".npk", ".kpk",
    ".asar", # Electron
    ".bsp", # Source Engine Map (compiled)
    ".wad", # Doom / Half-Life
}

# 游戏存档格式
GAME_SAVE_EXTS = {
    ".sav", ".save",
    ".rpgsave", # RPG Maker
    ".sol", # Flash Shared Object
    ".dat", # 优先判save
    ".osr", # osu! replay
    ".srm", ".state", # Emulator saves
}

# 策划/剧本/脑图
DESIGN_EXTS = {
    ".xmind", ".mm", ".km", # MindMap
    ".fountain", ".fdx", # Screenplay
    ".articy", # Articy:draft
    ".twee", ".tw", # Twine
    ".drawio", # Draw.io
    ".axure", ".rp", # Axure
}

# 移动端包体 / 原生库
MOBILE_PACKAGE_EXTS = {
    ".apk", ".aab", ".xapk", ".obb", # Android
    ".ipa", ".app", # iOS
    ".so", ".dex", # Android Native
}

# 游戏ROM / 模拟器镜像
ROM_EXTS = {
    ".nes", ".sfc", ".smc", # FC/SFC
    ".gba", ".gbc", ".gb", # GameBoy
    ".nds", ".3ds", ".cia", # DS/3DS
    ".nsp", ".xci", # Switch
    ".iso", ".wbfs", ".gcm", # Wii/GC/PS2
    ".cso", # PSP
    ".n64", ".z64", # N64
}

# Flash 相关
FLASH_EXTS = {".swf", ".fla", ".flv"} # flv also in video, order matters

# Spine 2D
SPINE_EXTS = {".spine", ".skel", ".atlas"}

OFFICE_EXTS = {
    ".xlsx",
    ".xls",
    ".xlsm",
    ".xlsb",
    ".docx",
    ".doc",
    ".pptx",
    ".ppt",
    ".ppsx",
    ".pps",
}

ADOBE_EXTS = {
    # Photoshop
    ".psd",
    ".psb",
    ".psdt",
    ".abr",  # brushes
    ".atn",  # actions
    ".aco",  # color swatches
    ".ase",  # adobe swatch exchange
    ".asl",  # styles
    ".pat",  # patterns
    ".grd",  # gradients
    # Illustrator
    ".ai",
    ".ait",
    # InDesign
    ".indd",
    ".idml",
    ".indt",
    # After Effects
    ".aep",
    ".aet",
    # Premiere Pro
    ".prproj",
    # Audition
    ".sesx",
    # Lightroom
    ".lrcat",
    # XD
    ".xd",
    # Animate / Flash
    ".fla",
    ".xfl",
}

MODEL3D_EXTS = {
    ".fbx", ".obj", ".gltf", ".glb", ".dae", ".3ds", ".blend", ".stl", ".ply", ".usd", ".usdz",
    ".abc", ".x", ".mqo", # Metasequoia
    ".pmx", ".pmd", ".vmd", ".vpd", # MMD
    ".ma", ".mb", # Maya
    ".max", # 3ds Max
    ".c4d", # Cinema 4D
}

LIVE2D_BINARY_EXTS = {".moc3", ".moc"}
LIVE2D_JSON_SUFFIXES = (
    ".model3.json",
    ".motion3.json",
    ".physics3.json",
    ".pose3.json",
    ".cdi3.json",
    ".exp3.json",
    ".cubism.json",
)


# ----------------------------
# 工具：数字格式化
# ----------------------------

def fmt_int(n: int) -> str:
    return f"{n:,}"

def fmt_bytes(n: int) -> str:
    # 友好显示：B / KB / MB / GB
    units = ["B", "KB", "MB", "GB", "TB"]
    v = float(n)
    for u in units:
        if v < 1024.0 or u == units[-1]:
            if u == "B":
                return f"{int(v)} {u}"
            return f"{v:.2f} {u}"
        v /= 1024.0


def fmt_pct(x: float) -> str:
    # 一位小数，宽度对齐由外层控制
    return f"{x:5.1f}%"


def adjust_percentages(values: List[float], total: float) -> List[float]:
    """
    使用最大余额法调整百分比，确保四舍五入后的总和恰好为 100.0%
    
    Args:
        values: 原始数值列表
        total: 总和
    
    Returns:
        调整后的百分比列表（已四舍五入到小数点后1位）
    """
    if total == 0 or not values:
        return [0.0] * len(values)
    
    # 计算原始百分比
    raw_pcts = [(v / total * 100.0) for v in values]
    
    # 四舍五入到1位小数
    rounded_pcts = [round(p, 1) for p in raw_pcts]
    
    # 计算总和与目标的差值
    current_sum = sum(rounded_pcts)
    diff = 100.0 - current_sum
    
    # 如果差值很小（±0.1%），则需要调整
    if abs(diff) < 0.001:
        return rounded_pcts
    
    # 计算每个值的余额（原始百分比 - 四舍五入后的百分比）
    remainders = [(raw_pcts[i] - rounded_pcts[i], i) for i in range(len(values))]
    
    # 按余额排序（如果需要增加百分比，选择余额最大的；如果需要减少，选择余额最小的）
    if diff > 0:
        # 需要增加总和，选择被向下舍入最多的项（余额最大）
        remainders.sort(reverse=True)
    else:
        # 需要减少总和，选择被向上舍入最多的项（余额最小）
        remainders.sort()
    
    # 调整百分比
    adjustments_needed = int(round(abs(diff) / 0.1))
    for i in range(min(adjustments_needed, len(values))):
        idx = remainders[i][1]
        if diff > 0:
            rounded_pcts[idx] += 0.1
        else:
            rounded_pcts[idx] -= 0.1
        rounded_pcts[idx] = round(rounded_pcts[idx], 1)
    
    return rounded_pcts


# ----------------------------
# 注释剥离：通用结果
# ----------------------------

@dataclass
class CodeStat:
    files: int = 0
    code_lines: int = 0
    code_chars: int = 0


@dataclass
class AssetStat:
    files: int = 0
    bytes: int = 0


def detect_file_type(path: Path) -> str:
    name = path.name.lower()
    if name in LICENSE_NAMES or name.startswith("license") or name.startswith("copying"):
        return "License"

    ext = path.suffix.lower()
    return EXT_TO_TYPE.get(ext, "Other")


def is_probably_binary(path: Path) -> bool:
    ext = path.suffix.lower()
    if ext in BINARY_EXTS:
        return True

    # 保险：小读一段看是否含 \0
    try:
        with path.open("rb") as f:
            chunk = f.read(4096)
        return b"\x00" in chunk
    except OSError:
        return True


def read_text_best_effort(path: Path) -> str:
    # 优先 utf-8-sig；失败再用系统默认；最后 replace
    for enc in ("utf-8-sig", "utf-8", "gb18030"):
        try:
            return path.read_text(encoding=enc)
        except Exception:
            pass
    return path.read_text(encoding="utf-8", errors="replace")

def _ext_or_noext(path: Path) -> str:
    ext = path.suffix.lower()
    return ext if ext else "(无后缀)"

def detect_asset_kind(path: Path) -> Optional[Tuple[str, str]]:
    """
    识别“非代码/资源文件”类型。
    返回 (ASSET_TYPES 的 key, 细分子类)；若不是资源类文件则返回 None。
    """
    name_low = path.name.lower()
    ext = path.suffix.lower()

    # 备份文件：尝试保留“原类型”信息作为后缀
    if ext in BACKUP_EXTS:
        # 尝试取倒数第二个后缀
        stem_ext = Path(path.stem).suffix.lower()
        if stem_ext:
            return ("backup", f"{stem_ext}{ext}")
        return ("backup", ext)

    # Live2D：部分是 json（文本），但语义属于资源
    for suf in LIVE2D_JSON_SUFFIXES:
        if name_low.endswith(suf):
            return ("live2d", suf)
    if ext in LIVE2D_BINARY_EXTS:
        return ("live2d", ext)
    
    # Spine
    if ext in SPINE_EXTS:
        return ("spine", ext)

    # Adobe：工程/素材（优先于图片/二进制兜底分类）
    if ext in ADOBE_EXTS:
        return ("adobe", ext)
    
    # 绘画/像素画源文件 (CSP/SAI/Aseprite...)
    if ext in ART_SOURCE_EXTS:
        return ("art_source", ext)

    # 音乐制作工程 (DAW)
    if ext in DAW_EXTS:
        return ("daw", ext)

    # 视频剪辑工程
    if ext in VIDEO_EDIT_EXTS:
        return ("video_edit", ext)

    # 策划/剧本/脑图
    if ext in DESIGN_EXTS:
        return ("design", ext)
    
    # 移动端包体
    if ext in MOBILE_PACKAGE_EXTS:
        return ("mobile_package", ext)
    
    # ROMs
    if ext in ROM_EXTS:
        return ("rom", ext)

    # Flash
    if ext in FLASH_EXTS:
        return ("flash", ext)

    # 游戏存档
    if ext in GAME_SAVE_EXTS:
        return ("game_save", ext)

    # 音频中间件 (Wwise/FMOD/CRI)
    if ext in AUDIO_MIDDLEWARE_EXTS:
        return ("audio_middleware", ext)
    
    # 游戏封包/归档
    if ext in GAME_ARCHIVE_EXTS:
        return ("game_archive", ext)

    # 纹理/贴图 (dds/pvr/ktx...)
    if ext in TEXTURE_EXTS:
        return ("texture", ext)

    if ext in IMAGE_EXTS:
        return ("image", ext)
    if ext in VIDEO_EXTS:
        return ("video", ext)
    if ext in AUDIO_EXTS:
        return ("audio", ext)
    if ext in MODEL3D_EXTS:
        return ("model3d", ext)
    if ext in OFFICE_EXTS:
        return ("office", ext)
    if ext == ".pdf":
        return ("pdf", ext)
    if ext in ARCHIVE_EXTS:
        return ("archive", ext)
    if ext in FONT_EXTS:
        return ("font", ext)

    # 兜底：二进制文件也算“其他资源”
    if is_probably_binary(path):
        return ("other_asset", _ext_or_noext(path))

    return None


def detect_asset_type(path: Path) -> Optional[str]:
    k = detect_asset_kind(path)
    return k[0] if k else None


# ----------------------------
# 注释剥离：JS/CSS（// 与 /* */），考虑字符串
# ----------------------------

def strip_js_css_comments(text: str) -> str:
    out: List[str] = []
    i = 0
    n = len(text)

    in_squote = False
    in_dquote = False
    in_btick = False
    in_block = False

    while i < n:
        ch = text[i]
        nxt = text[i + 1] if i + 1 < n else ""

        if in_block:
            if ch == "*" and nxt == "/":
                in_block = False
                i += 2
                continue
            # 保留换行，避免把两行拼一起
            if ch == "\n":
                out.append("\n")
            i += 1
            continue

        # 字符串状态
        if in_squote:
            out.append(ch)
            if ch == "\\" and i + 1 < n:
                out.append(text[i + 1])
                i += 2
                continue
            if ch == "'":
                in_squote = False
            i += 1
            continue

        if in_dquote:
            out.append(ch)
            if ch == "\\" and i + 1 < n:
                out.append(text[i + 1])
                i += 2
                continue
            if ch == '"':
                in_dquote = False
            i += 1
            continue

        if in_btick:
            out.append(ch)
            if ch == "\\" and i + 1 < n:
                out.append(text[i + 1])
                i += 2
                continue
            if ch == "`":
                in_btick = False
            i += 1
            continue

        # 进入字符串
        if ch == "'":
            in_squote = True
            out.append(ch)
            i += 1
            continue
        if ch == '"':
            in_dquote = True
            out.append(ch)
            i += 1
            continue
        if ch == "`":
            in_btick = True
            out.append(ch)
            i += 1
            continue

        # 行注释
        if ch == "/" and nxt == "/":
            # 跳到行尾，但保留换行
            i += 2
            while i < n and text[i] != "\n":
                i += 1
            continue

        # 块注释
        if ch == "/" and nxt == "*":
            in_block = True
            i += 2
            continue

        out.append(ch)
        i += 1

    return "".join(out)


# ----------------------------
# 注释剥离：HTML（<!-- -->）
# ----------------------------

def strip_html_comments(text: str) -> str:
    out: List[str] = []
    i = 0
    n = len(text)
    in_comment = False

    while i < n:
        if not in_comment and text.startswith("<!--", i):
            in_comment = True
            i += 4
            continue
        if in_comment and text.startswith("-->", i):
            in_comment = False
            i += 3
            continue
        ch = text[i]
        if in_comment:
            if ch == "\n":
                out.append("\n")
            i += 1
            continue
        out.append(ch)
        i += 1

    return "".join(out)


# ----------------------------
# 注释剥离：# 行注释（Shell/Ruby/Perl/R/YAML/TOML 等），考虑引号
# ----------------------------

def strip_hash_line_comments(text: str) -> str:
    out: List[str] = []
    i = 0
    n = len(text)
    in_squote = False
    in_dquote = False

    while i < n:
        ch = text[i]

        if in_squote:
            out.append(ch)
            if ch == "\\" and i + 1 < n:
                out.append(text[i + 1])
                i += 2
                continue
            if ch == "'":
                in_squote = False
            i += 1
            continue

        if in_dquote:
            out.append(ch)
            if ch == "\\" and i + 1 < n:
                out.append(text[i + 1])
                i += 2
                continue
            if ch == '"':
                in_dquote = False
            i += 1
            continue

        if ch == "'":
            in_squote = True
            out.append(ch)
            i += 1
            continue
        if ch == '"':
            in_dquote = True
            out.append(ch)
            i += 1
            continue

        if ch == "#":
            while i < n and text[i] != "\n":
                i += 1
            continue

        out.append(ch)
        i += 1

    return "".join(out)


# ----------------------------
# 注释剥离：INI（; 或 #），不做复杂字符串语义
# ----------------------------

def strip_ini_comments(text: str) -> str:
    out_lines: List[str] = []
    for raw in text.splitlines():
        s = raw.lstrip()
        if s.startswith(";") or s.startswith("#"):
            out_lines.append("")
            continue
        # 行内注释（保守：只有在前面全是空白时才视作注释分隔）
        cut = None
        for marker in ("#", ";"):
            idx = raw.find(marker)
            if idx >= 0 and (idx == 0 or raw[:idx].rstrip() == ""):
                cut = idx
                break
        out_lines.append(raw[:cut].rstrip() if cut is not None else raw)
    return "\n".join(out_lines)


# ----------------------------
# 注释剥离：SQL（-- 与 /* */），考虑单引号字符串
# ----------------------------

def strip_sql_comments(text: str) -> str:
    out: List[str] = []
    i = 0
    n = len(text)
    in_squote = False
    in_block = False

    while i < n:
        ch = text[i]
        nxt = text[i + 1] if i + 1 < n else ""

        if in_block:
            if ch == "*" and nxt == "/":
                in_block = False
                i += 2
                continue
            if ch == "\n":
                out.append("\n")
            i += 1
            continue

        if in_squote:
            out.append(ch)
            # SQL 单引号转义：'' 表示一个 '
            if ch == "'" and nxt == "'":
                out.append(nxt)
                i += 2
                continue
            if ch == "'":
                in_squote = False
            i += 1
            continue

        if ch == "'":
            in_squote = True
            out.append(ch)
            i += 1
            continue

        if ch == "-" and nxt == "-":
            i += 2
            while i < n and text[i] != "\n":
                i += 1
            continue

        if ch == "/" and nxt == "*":
            in_block = True
            i += 2
            continue

        out.append(ch)
        i += 1

    return "".join(out)


# ----------------------------
# 注释剥离：PowerShell（# 与 <# #>），考虑引号
# ----------------------------

def strip_powershell_comments(text: str) -> str:
    out: List[str] = []
    i = 0
    n = len(text)
    in_squote = False
    in_dquote = False
    in_block = False

    while i < n:
        ch = text[i]
        nxt = text[i + 1] if i + 1 < n else ""

        if in_block:
            if ch == "#" and nxt == ">":
                in_block = False
                i += 2
                continue
            if ch == "\n":
                out.append("\n")
            i += 1
            continue

        if in_squote:
            out.append(ch)
            # PowerShell 单引号：'' 逃逸
            if ch == "'" and nxt == "'":
                out.append(nxt)
                i += 2
                continue
            if ch == "'":
                in_squote = False
            i += 1
            continue

        if in_dquote:
            out.append(ch)
            # PowerShell 双引号内用 ` 逃逸
            if ch == "`" and i + 1 < n:
                out.append(text[i + 1])
                i += 2
                continue
            if ch == '"':
                in_dquote = False
            i += 1
            continue

        if ch == "<" and nxt == "#":
            in_block = True
            i += 2
            continue

        if ch == "'":
            in_squote = True
            out.append(ch)
            i += 1
            continue
        if ch == '"':
            in_dquote = True
            out.append(ch)
            i += 1
            continue

        if ch == "#":
            while i < n and text[i] != "\n":
                i += 1
            continue

        out.append(ch)
        i += 1

    return "".join(out)


# ----------------------------
# 注释剥离：Lua（-- 与 --[[ ]] / --[=[ ]=]），考虑引号
# ----------------------------

def strip_lua_comments(text: str) -> str:
    out: List[str] = []
    i = 0
    n = len(text)
    in_squote = False
    in_dquote = False
    in_long_str = False
    long_eq = 0  # = 的数量
    in_block = False
    block_eq = 0

    def match_long_open(pos: int) -> Optional[int]:
        # [[  或 [=[ 或 [==[
        if pos >= n or text[pos] != "[":
            return None
        j = pos + 1
        eq = 0
        while j < n and text[j] == "=":
            eq += 1
            j += 1
        if j < n and text[j] == "[":
            return eq
        return None

    def match_long_close(pos: int, eq: int) -> bool:
        # ]] or ]=] or ]==]
        if pos >= n or text[pos] != "]":
            return False
        j = pos + 1
        k = 0
        while k < eq and j < n and text[j] == "=":
            k += 1
            j += 1
        return k == eq and j < n and text[j] == "]"

    while i < n:
        ch = text[i]
        nxt = text[i + 1] if i + 1 < n else ""

        if in_block:
            if ch == "\n":
                out.append("\n")
                i += 1
                continue
            if match_long_close(i, block_eq):
                in_block = False
                i += 2 + block_eq
                continue
            i += 1
            continue

        if in_long_str:
            out.append(ch)
            if ch == "\n":
                i += 1
                continue
            if match_long_close(i, long_eq):
                # 把 ]...] 一并写出
                out.append(text[i + 1 : i + 2 + long_eq])
                in_long_str = False
                i += 2 + long_eq
                continue
            i += 1
            continue

        if in_squote:
            out.append(ch)
            if ch == "\\" and i + 1 < n:
                out.append(text[i + 1])
                i += 2
                continue
            if ch == "'":
                in_squote = False
            i += 1
            continue

        if in_dquote:
            out.append(ch)
            if ch == "\\" and i + 1 < n:
                out.append(text[i + 1])
                i += 2
                continue
            if ch == '"':
                in_dquote = False
            i += 1
            continue

        # 长字符串
        eq_open = match_long_open(i)
        if eq_open is not None:
            in_long_str = True
            long_eq = eq_open
            out.append(ch)
            out.append(text[i + 1 : i + 2 + eq_open])
            i += 2 + eq_open
            continue

        if ch == "'":
            in_squote = True
            out.append(ch)
            i += 1
            continue
        if ch == '"':
            in_dquote = True
            out.append(ch)
            i += 1
            continue

        # 注释：-- 行注释或块注释
        if ch == "-" and nxt == "-":
            # 可能是 --[[ 形式的块注释
            eq2 = match_long_open(i + 2)
            if eq2 is not None:
                in_block = True
                block_eq = eq2
                i += 2 + 2 + eq2  # 跳过 -- + [=*[ 
                continue
            # 行注释
            i += 2
            while i < n and text[i] != "\n":
                i += 1
            continue

        out.append(ch)
        i += 1

    return "".join(out)


# ----------------------------
# 注释剥离：Python（用 tokenize 去 # 注释，并剔除 docstring）
# ----------------------------

def strip_python_comments_and_docstrings(text: str) -> str:
    try:
        import io
        import tokenize

        tokens = list(tokenize.generate_tokens(io.StringIO(text).readline))

        # docstring 判断：
        # - module 顶部第一个 stmt
        # - class/def 体内第一个 stmt
        # 这里用一个启发式：STRING token 若紧跟在 INDENT 或 NEWLINE/ENCODING 后，且之前仅有 NL/NEWLINE/INDENT/DEDENT，则视为 docstring。

        out_parts: List[str] = []
        prev_sig = []  # 记录最近的“结构性 token”

        def push_sig(tok_type: int):
            # 只记录少量结构 token
            if tok_type in (
                tokenize.INDENT,
                tokenize.DEDENT,
                tokenize.NEWLINE,
                tokenize.NL,
                tokenize.NAME,
                tokenize.OP,
            ):
                prev_sig.append(tok_type)
                if len(prev_sig) > 12:
                    prev_sig.pop(0)

        for tok in tokens:
            tok_type, tok_str, _, _, _ = tok

            if tok_type == tokenize.COMMENT:
                # 丢弃注释
                continue

            if tok_type == tokenize.STRING:
                # docstring 启发式：前面“没有真正代码”
                # 允许前缀是 ENCODING/NL/NEWLINE/INDENT/DEDENT
                # 若之前出现过 NAME/OP 且不是结构（比如 = 右侧字符串），就不当 docstring。
                # 这里比较保守：只在最近 token 里没有 OP 且没有 NAME 时，或最近是 INDENT/NEWLINE/NL 时剔除。
                recent = prev_sig[-6:]
                if recent and all(t in (tokenize.INDENT, tokenize.DEDENT, tokenize.NEWLINE, tokenize.NL) for t in recent):
                    continue
                if recent and recent[-1] in (tokenize.INDENT, tokenize.NEWLINE, tokenize.NL) and (
                    tokenize.NAME not in recent and tokenize.OP not in recent
                ):
                    continue

            out_parts.append(tok_str)
            push_sig(tok_type)

        return "".join(out_parts)
    except Exception:
        # 兜底：简单去掉 # 行注释（不处理字符串内 #）
        lines = []
        for line in text.splitlines(True):
            stripped = line.lstrip()
            if stripped.startswith("#"):
                lines.append("\n" if line.endswith("\n") else "")
                continue
            if "#" in line:
                # 粗暴：只截断第一个 #
                idx = line.find("#")
                lines.append(line[:idx] + ("\n" if line.endswith("\n") else ""))
            else:
                lines.append(line)
        return "".join(lines)


# ----------------------------
# 注释剥离：Batch（rem / :: 行注释）
# ----------------------------

def strip_batch_comments(text: str) -> str:
    out_lines: List[str] = []
    for raw in text.splitlines():
        s = raw.lstrip()
        low = s.lower()
        if low.startswith("rem ") or low == "rem":
            out_lines.append("")
            continue
        if s.startswith("::"):
            out_lines.append("")
            continue
        out_lines.append(raw)
    return "\n".join(out_lines)


def strip_comments_for_type(file_type: str, text: str) -> str:
    # C-like：支持 // 与 /* */ 的语言
    if file_type in (
        "JavaScript",
        "TypeScript",
        "CSS",
        "SCSS",
        "Less",
        "C",
        "C++",
        "C#",
        "Objective-C",
        "Java",
        "Kotlin",
        "Swift",
        "Go",
        "Rust",
        "Dart",
        "Scala",
        "PHP",
        "Shader", # HLSL/GLSL/CG
        "Unity",  # Unity ShaderLab or C# scripts inside
        "ActionScript",
        "Haxe",
        "Kirikiri", # TJS is C-like
    ):
        return strip_js_css_comments(text)
    if file_type in ("HTML", "XML"):
        return strip_html_comments(text)
    if file_type == "Python":
        return strip_python_comments_and_docstrings(text)
    if file_type == "批处理":
        return strip_batch_comments(text)
    if file_type in ("Shell", "Ruby", "Perl", "R", "YAML", "TOML", "RenPy", "Godot"): # Godot GDScript 也是 #
        return strip_hash_line_comments(text)
    if file_type == "PowerShell":
        return strip_powershell_comments(text)
    if file_type == "SQL":
        return strip_sql_comments(text)
    if file_type == "INI":
        return strip_ini_comments(text)
    if file_type == "Lua":
        return strip_lua_comments(text)
    # JSON/Markdown/Other：默认不剥离（JSON无注释；Markdown不纳入代码统计默认会跳过）
    return text


def compute_code_lines_and_chars(text_wo_comments: str) -> Tuple[int, int]:
    code_lines = 0
    code_chars = 0

    for line in text_wo_comments.splitlines():
        if line.strip() == "":
            continue
        code_lines += 1
        # 字符数：不含换行；保留行内空格
        code_chars += len(line)

    return code_lines, code_chars


def should_ignore_file(filename: str) -> bool:
    """检查文件名是否应该被忽略（支持通配符模式）"""
    import fnmatch
    low = filename.lower()
    
    # 检查精确匹配
    if low in DEFAULT_IGNORED_FILES:
        return True
    
    # 检查通配符模式
    for pattern in DEFAULT_IGNORED_PATTERNS:
        if fnmatch.fnmatch(low, pattern):
            return True
    
    return False


def iter_files(root: Path, *, no_ignore: bool, include_hidden: bool) -> Iterable[Path]:
    root = root.resolve()

    for dirpath, dirnames, filenames in os.walk(root):
        d = Path(dirpath)

        # 目录过滤
        if not no_ignore:
            dirnames[:] = [
                n
                for n in dirnames
                if n not in DEFAULT_IGNORED_DIRS
                and (include_hidden or not n.startswith("."))
            ]
        else:
            if not include_hidden:
                dirnames[:] = [n for n in dirnames if not n.startswith(".")]

        for fn in filenames:
            low = fn.lower()
            if not include_hidden and fn.startswith("."):
                continue
            if (not no_ignore) and should_ignore_file(fn):
                continue

            p = d / fn
            # 跳过明显二进制
            if is_probably_binary(p):
                continue
            yield p


def iter_all_files(root: Path, *, no_ignore: bool, include_hidden: bool) -> Iterable[Path]:
    """
    枚举项目内所有文件（包括二进制/资源文件），仍会应用 ignore 规则。
    """
    root = root.resolve()

    for dirpath, dirnames, filenames in os.walk(root):
        d = Path(dirpath)

        if not no_ignore:
            dirnames[:] = [
                n
                for n in dirnames
                if n not in DEFAULT_IGNORED_DIRS
                and (include_hidden or not n.startswith("."))
            ]
        else:
            if not include_hidden:
                dirnames[:] = [n for n in dirnames if not n.startswith(".")]

        for fn in filenames:
            low = fn.lower()
            if not include_hidden and fn.startswith("."):
                continue
            if (not no_ignore) and should_ignore_file(fn):
                continue
            yield d / fn


@dataclass
class AnalyzeResult:
    root: Path
    total_files: int = 0
    file_counts: Dict[str, int] = field(default_factory=dict)
    code_stats: Dict[str, CodeStat] = field(default_factory=dict)
    asset_stats: Dict[str, AssetStat] = field(default_factory=dict)
    file_type_ext_counts: Dict[str, Dict[str, int]] = field(default_factory=dict)
    asset_type_sub_counts: Dict[str, Dict[str, int]] = field(default_factory=dict)
    asset_total_files: int = 0
    asset_total_bytes: int = 0
    file_list: Optional[List[str]] = None


class StatsAnalyzer:
    def __init__(
        self,
        root: Path,
        no_ignore: bool = False,
        include_hidden: bool = False,
        count_assets: bool = False,
        detail: bool = False,
        need_file_list: bool = False,
    ):
        self.root = root
        self.no_ignore = no_ignore
        self.include_hidden = include_hidden
        self.count_assets = count_assets
        self.detail = detail
        self.need_file_list = need_file_list
        self._stop_event = threading.Event()

    def stop(self):
        self._stop_event.set()

    def analyze(self, progress_callback: Optional[Callable[[str], None]] = None) -> AnalyzeResult:
        res = AnalyzeResult(root=self.root)
        all_files_for_list = []

        # 优化：只遍历一次 iter_all_files，然后在内部判断
        for p in iter_all_files(self.root, no_ignore=self.no_ignore, include_hidden=self.include_hidden):
            if self._stop_event.is_set():
                break

            if progress_callback:
                progress_callback(p.name)

            # 1. 收集文件清单 (如果需要)
            if self.need_file_list:
                try:
                    rel = p.resolve().relative_to(self.root.resolve())
                    all_files_for_list.append(rel.as_posix())
                except Exception:
                    all_files_for_list.append(str(p))

            # 判断是否二进制
            is_binary = is_probably_binary(p)

            # 2. 模拟 iter_files 的逻辑：非二进制才进入 file_counts 和 code_stats
            if not is_binary:
                ft = detect_file_type(p)
                res.file_counts[ft] = res.file_counts.get(ft, 0) + 1
                ext = _ext_or_noext(p)
                res.file_type_ext_counts.setdefault(ft, {})
                res.file_type_ext_counts[ft][ext] = res.file_type_ext_counts[ft].get(ext, 0) + 1
                res.total_files += 1

                # 代码统计
                if ft in (
                    "JavaScript", "TypeScript", "HTML", "CSS", "SCSS", "Less", "Python", "批处理",
                    "C", "C++", "C#", "Objective-C", "Java", "Kotlin", "Swift", "Go", "Rust",
                    "Dart", "Scala", "Ruby", "PHP", "Perl", "Lua", "R", "SQL", "Shell", "PowerShell",
                    "XML", "JSON", "YAML", "TOML", "INI",
                ):
                    try:
                        txt = read_text_best_effort(p)
                        txt_wo = strip_comments_for_type(ft, txt)
                        lines, chars = compute_code_lines_and_chars(txt_wo)

                        st = res.code_stats.get(ft)
                        if not st:
                            st = CodeStat()
                            res.code_stats[ft] = st
                        st.files += 1
                        st.code_lines += lines
                        st.code_chars += chars
                    except Exception:
                        pass

            # 3. 资源统计 (如果开启)
            if self.count_assets:
                kind = detect_asset_kind(p)
                if kind:
                    k, sub = kind
                    try:
                        sz = p.stat().st_size
                    except OSError:
                        sz = 0

                    st = res.asset_stats.get(k)
                    if not st:
                        st = AssetStat()
                        res.asset_stats[k] = st
                    st.files += 1
                    st.bytes += sz
                    res.asset_total_files += 1
                    res.asset_total_bytes += sz

                    res.asset_type_sub_counts.setdefault(k, {})
                    res.asset_type_sub_counts[k][sub] = res.asset_type_sub_counts[k].get(sub, 0) + 1

        if self.need_file_list:
            all_files_for_list.sort()
            res.file_list = all_files_for_list

        return res


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("path", nargs="?", default=".", help="项目根目录（默认当前目录）")
    ap.add_argument("--no-ignore", action="store_true", help="不忽略常见目录")
    ap.add_argument("--include-hidden", action="store_true", help="包含隐藏文件/目录")
    ap.add_argument("--assets", action="store_true", help="额外统计非代码/资源文件（图片/视频/音频/Live2D/3D/Office 等）")
    ap.add_argument("--detail", action="store_true", help="输出细分统计（按后缀）")
    ap.add_argument("--list-files", action="store_true", help="输出每个文件的相对路径清单")
    ap.add_argument("--log", nargs="?", const="project_stats.log", help="输出统计结果到文件（默认 project_stats.log）")
    ap.add_argument(
        "--html",
        nargs="?",
        const="project_stats_report.html",
        default=None,
        help="生成 HTML 可视化报告（可选指定文件名；不带值默认 project_stats_report.html）",
    )
    ap.add_argument("--markdown", action="store_true", help="生成 Markdown 格式输出（适合直接复制到 README.md）")
    args = ap.parse_args(argv)

    root = Path(args.path)
    if not root.exists() or not root.is_dir():
        print(f"[Error] 路径不存在或不是目录: {root}")
        return 2

    out_lines: List[str] = []

    def emit(line: str = "") -> None:
        out_lines.append(line)
        print(line)

    # 使用 StatsAnalyzer 进行统计
    analyzer = StatsAnalyzer(
        root=root,
        no_ignore=args.no_ignore,
        include_hidden=args.include_hidden,
        count_assets=args.assets,
        detail=args.detail,
        need_file_list=args.list_files
    )
    
    res = analyzer.analyze()

    # ----------------------------
    # 输出：文件类型统计
    # ----------------------------

    emit("文件类型统计：")
    emit("-" * 80)

    # 只输出"出现过的类型"（避免打印一堆 0）
    for t, cnt in sorted(res.file_counts.items(), key=lambda kv: (-kv[1], kv[0])):
        if cnt <= 0:
            continue
        label = FILE_TYPE_LABELS.get(t, t)
        emit(f"   {label}: {cnt}")

    emit(f"   文件总数: {res.total_files}")

    # 细分统计（按后缀）：当前仅对"样式文件"做一个合并视图，避免刷屏
    if args.detail:
        style_types = ("CSS", "SCSS", "Less")
        merged: Dict[str, int] = {}
        total_style = 0
        for t in style_types:
            for ext, cnt in res.file_type_ext_counts.get(t, {}).items():
                merged[ext] = merged.get(ext, 0) + cnt
                total_style += cnt

        if total_style > 0:
            emit()
            emit("细分统计（按后缀）：")
            emit("-" * 80)
            emit(f"   样式文件(CSS/SCSS/Less): {total_style}")
            for ext, cnt in sorted(merged.items(), key=lambda kv: (-kv[1], kv[0])):
                emit(f"      {ext}: {cnt}")

    # ----------------------------
    # 输出：文件清单（可选）
    # ----------------------------
    if args.list_files and res.file_list:
        emit()
        emit("=" * 80)
        emit("--- 文件清单（相对项目根目录）")
        emit("=" * 80)
        emit(f"根目录: {root.resolve()}")
        emit(f"文件数: {len(res.file_list)}")
        emit("-" * 80)
        for s in res.file_list:
            emit(s)

    # ----------------------------
    # 输出：资源文件统计（可选）
    # ----------------------------

    if args.assets:
        emit()
        emit("=" * 80)
        emit("[+] 资源/非代码文件统计（可选）")
        emit("=" * 80)
        emit()

        for k, st in sorted(res.asset_stats.items(), key=lambda kv: (-kv[1].bytes, kv[0])):
            label = ASSET_TYPES.get(k, k)
            emit(f"   {label:<14}: {st.files:>6} 个文件, {fmt_bytes(st.bytes):>12}")
            if args.detail:
                subs = res.asset_type_sub_counts.get(k, {})
                for sub, cnt in sorted(subs.items(), key=lambda kv: (-kv[1], kv[0])):
                    emit(f"      {sub}: {cnt}")

        emit()
    emit(f"   [+] 资源文件总数: {res.asset_total_files} 个, 总大小 {fmt_bytes(res.asset_total_bytes)}")
    emit(f"   [+] 全项目总文件数（含资源）: {res.total_files + res.asset_total_files}")

    # ----------------------------
    # 输出：代码统计
    # ----------------------------

    emit()
    emit("=" * 80)
    emit("--- 代码统计（不包括空行和注释）")
    emit("=" * 80)
    emit()

    # 只展示有统计到的类型：按代码行数降序
    rows: List[Tuple[str, CodeStat]] = sorted(res.code_stats.items(), key=lambda kv: (-kv[1].code_lines, kv[0]))

    total_code_files = sum(st.files for _, st in rows)
    total_lines = sum(st.code_lines for _, st in rows)
    total_chars = sum(st.code_chars for _, st in rows)

    # 调整百分比，确保总和为 100%
    line_values = [st.code_lines for _, st in rows]
    char_values = [st.code_chars for _, st in rows]
    adjusted_line_pcts = adjust_percentages(line_values, total_lines)
    adjusted_char_pcts = adjust_percentages(char_values, total_chars)

    # 输出每行
    for i, (t, st) in enumerate(rows):
        name = CODE_TYPE_LABELS.get(t, t)
        line_pct = adjusted_line_pcts[i]
        char_pct = adjusted_char_pcts[i]

        # 尽量贴近样例：
        # JavaScript  :  93 个文件, 18,848 行代码 ( 68.3%),   936,197 字符 ( 75.8%)
        emit(
            f"   {name:<10}:"
            f" {st.files:>4} 个文件,"
            f" {fmt_int(st.code_lines):>8} 行代码 ({fmt_pct(line_pct)}),"
            f" {fmt_int(st.code_chars):>10} 字符 ({fmt_pct(char_pct)})"
        )

    emit()
    emit(f"   [+] 总计: {total_code_files} 个文件, {fmt_int(total_lines)} 行有效代码, {fmt_int(total_chars)} 字符")

    # ----------------------------
    # 输出：日志文件
    # ----------------------------
    if args.log:
        try:
            log_path = Path(args.log)
            log_path.write_text("\n".join(out_lines), encoding="utf-8")
            print(f"[+] 统计日志已保存: {log_path}")
        except Exception as e:
            print(f"[Warn] 保存日志失败: {e}")

    # 额外输出到 HTML
    if args.html is not None:
        try:
            html_path = Path(args.html)
            if not html_path.is_absolute():
                html_path = Path.cwd() / html_path
            
            # 准备数据供 HTML 使用
            html_data = {
                "root": str(root.resolve()),
                "total_files": res.total_files + res.asset_total_files,
                "total_code_files": total_code_files,
                "total_code_lines": total_lines,
                "total_code_chars": total_chars,
                "total_asset_files": res.asset_total_files,
                "total_asset_bytes": res.asset_total_bytes,
                "file_counts": res.file_counts, # { type: count }
                "code_stats": [
                    {
                        "name": CODE_TYPE_LABELS.get(t, t),
                        "files": st.files,
                        "lines": st.code_lines,
                        "chars": st.code_chars
                    }
                    for t, st in rows
                ],
                "asset_stats": [
                    {
                        "name": ASSET_TYPES.get(k, k),
                        "files": st.files,
                        "bytes": st.bytes
                    }
                    for k, st in sorted(res.asset_stats.items(), key=lambda kv: (-kv[1].bytes, kv[0]))
                ]
            }
            
            generate_html_report(html_data, html_path)
            emit(f"[+] HTML 报告已生成: {html_path}")
        except Exception as e:
            print(f"[Warn] 生成 HTML 失败: {e}")
            import traceback
            traceback.print_exc()

    # ----------------------------
    # 输出：Markdown 格式
    # ----------------------------
    if args.markdown:
        print()
        print("=" * 80)
        print("Markdown 格式输出（可直接复制到 README.md）")
        print("=" * 80)
        print()
        markdown_output = generate_markdown_output(res, total_code_files, total_lines, total_chars, rows)
        print(markdown_output)
        print()
        print("=" * 80)

    return 0


def generate_markdown_output(res, total_code_files: int, total_lines: int, total_chars: int, rows: List[Tuple[str, 'CodeStat']]) -> str:
    """生成 Markdown 格式的统计输出"""
    lines = []
    
    lines.append("## 📊 项目规模")
    lines.append("")
    lines.append("### 文件统计")
    lines.append("")
    
    # 总文件数
    total_all_files = res.total_files + res.asset_total_files
    lines.append(f"- **总文件数**：{fmt_int(total_all_files)} 个")
    
    # 按文件类型排序（降序）
    file_types = sorted(res.file_counts.items(), key=lambda kv: (-kv[1], kv[0]))
    for t, cnt in file_types:
        if cnt <= 0:
            continue
        label = FILE_TYPE_LABELS.get(t, t)
        lines.append(f"  - {label}：{cnt} 个")
    
    lines.append("")
    lines.append("### 代码规模")
    lines.append("")
    
    # 调整百分比，确保总和为 100%
    line_values = [st.code_lines for _, st in rows]
    char_values = [st.code_chars for _, st in rows]
    adjusted_line_pcts = adjust_percentages(line_values, total_lines)
    adjusted_char_pcts = adjust_percentages(char_values, total_chars)
    
    # 代码总行数
    lines.append(f"- **代码总行数**：{fmt_int(total_lines)} 行（不含空行、注释）")
    for i, (t, st) in enumerate(rows):
        name = CODE_TYPE_LABELS.get(t, t)
        line_pct = adjusted_line_pcts[i]
        lines.append(f"  - {name}：{fmt_int(st.code_lines)} 行（{fmt_pct(line_pct)}）")
    
    lines.append("")
    
    # 字符总数
    lines.append(f"- **字符总数**：{fmt_int(total_chars)} 字符（不含注释）")
    for i, (t, st) in enumerate(rows):
        name = CODE_TYPE_LABELS.get(t, t)
        char_pct = adjusted_char_pcts[i]
        lines.append(f"  - {name}：{fmt_int(st.code_chars)} 字符（{fmt_pct(char_pct)}）")
    
    # 如果有资源文件统计
    if res.asset_total_files > 0:
        lines.append("")
        lines.append("### 资源文件")
        lines.append("")
        lines.append(f"- **资源文件总数**：{res.asset_total_files} 个")
        lines.append(f"- **资源文件总大小**：{fmt_bytes(res.asset_total_bytes)}")
        
        # 按大小排序
        for k, st in sorted(res.asset_stats.items(), key=lambda kv: (-kv[1].bytes, kv[0])):
            label = ASSET_TYPES.get(k, k)
            lines.append(f"  - {label}：{st.files} 个文件，{fmt_bytes(st.bytes)}")
    
    return "\n".join(lines)


def generate_html_report(data: Dict, output_path: Path) -> None:
    import json
    
    # 嵌入 JSON 数据
    json_data = json.dumps(data, ensure_ascii=False)
    
    html_template = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>项目代码统计报告</title>
    <script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>
    <style>
        :root { --bg: #f4f6f8; --card-bg: #fff; --text: #2c3e50; --accent: #3498db; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 20px; }
        .container { max-width: 1200px; margin: 0 auto; }
        h1 { text-align: center; margin-bottom: 30px; }
        .dashboard { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .card { background: var(--card-bg); padding: 20px; border-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,0.05); text-align: center; }
        .card h3 { margin: 0 0 10px; font-size: 14px; color: #7f8c8d; text-transform: uppercase; }
        .card .num { font-size: 32px; font-weight: bold; color: var(--accent); }
        .card .sub { font-size: 12px; color: #95a5a6; margin-top: 5px; }
        
        .charts-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(500px, 1fr)); gap: 20px; }
        .chart-box { background: var(--card-bg); padding: 20px; border-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,0.05); }
        .chart-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
        .chart-title { font-size: 18px; font-weight: bold; margin: 0; }
        .chart-controls select { padding: 4px 8px; border-radius: 4px; border: 1px solid #ddd; }
        
        .chart-container { height: 400px; width: 100%; }
        
        footer { text-align: center; margin-top: 40px; color: #95a5a6; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>项目代码统计报告</h1>
        <p style="text-align:center; color:#666;">路径: <code id="root-path"></code></p>
        
        <div class="dashboard">
            <div class="card">
                <h3>总文件数</h3>
                <div class="num" id="total-files">-</div>
                <div class="sub">含代码与资源</div>
            </div>
            <div class="card">
                <h3>代码总行数</h3>
                <div class="num" id="total-lines">-</div>
                <div class="sub">不含空行/注释</div>
            </div>
            <div class="card">
                <h3>代码字符数</h3>
                <div class="num" id="total-chars">-</div>
            </div>
            <div class="card">
                <h3>资源总大小</h3>
                <div class="num" id="total-asset-size">-</div>
                <div class="sub" id="total-asset-files">-</div>
            </div>
        </div>

        <div class="charts-grid">
            <!-- 代码量分布 -->
            <div class="chart-box">
                <div class="chart-header">
                    <h2 class="chart-title">代码量分布 (行数)</h2>
                    <div class="chart-controls">
                        <select onchange="renderCodeChart(this.value)">
                            <option value="bar">柱状图 (Bar)</option>
                            <option value="pie">饼图 (Pie)</option>
                        </select>
                    </div>
                </div>
                <div id="chart-code" class="chart-container"></div>
            </div>

            <!-- 文件类型分布 -->
            <div class="chart-box">
                <div class="chart-header">
                    <h2 class="chart-title">文件类型分布</h2>
                    <div class="chart-controls">
                        <select onchange="renderFileChart(this.value)">
                            <option value="pie">饼图 (Pie)</option>
                            <option value="bar">柱状图 (Bar)</option>
                        </select>
                    </div>
                </div>
                <div id="chart-file" class="chart-container"></div>
            </div>
            
            <!-- 资源分布 -->
            <div class="chart-box" style="grid-column: 1 / -1;">
                <div class="chart-header">
                    <h2 class="chart-title">资源类型分布 (大小)</h2>
                    <div class="chart-controls">
                        <select onchange="renderAssetChart(this.value)">
                            <option value="bar">横向柱状图 (Bar)</option>
                            <option value="pie">饼图 (Pie)</option>
                        </select>
                    </div>
                </div>
                <div id="chart-asset" class="chart-container"></div>
            </div>
        </div>

        <footer>Generated by project_stats.py</footer>
    </div>

    <script>
        const DATA = __JSON_DATA__;

        // Utils
        function fmtBytes(bytes) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }
        
        function fmtInt(n) {
            return n.toLocaleString();
        }

        // Init Dashboard
        document.getElementById('root-path').textContent = DATA.root;
        document.getElementById('total-files').textContent = fmtInt(DATA.total_files);
        document.getElementById('total-lines').textContent = fmtInt(DATA.total_code_lines);
        document.getElementById('total-chars').textContent = fmtInt(DATA.total_code_chars);
        document.getElementById('total-asset-size').textContent = fmtBytes(DATA.total_asset_bytes);
        document.getElementById('total-asset-files').textContent = fmtInt(DATA.total_asset_files) + ' 个文件';

        // Charts
        const colorPalette = ['#3498db', '#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6', '#34495e', '#16a085', '#d35400'];

        function initChart(domId, option) {
            const chart = echarts.init(document.getElementById(domId));
            chart.setOption(option);
            window.addEventListener('resize', () => chart.resize());
            return chart;
        }

        let codeChart, fileChart, assetChart;

        // 1. Code Stats
        function renderCodeChart(type) {
            const data = DATA.code_stats.map(item => ({ name: item.name, value: item.lines }));
            // sort desc
            data.sort((a, b) => b.value - a.value);
            
            let option = {};
            if (type === 'pie') {
                option = {
                    tooltip: { trigger: 'item', formatter: '{b}: {c}行 ({d}%)' },
                    series: [{
                        type: 'pie',
                        radius: ['40%', '70%'],
                        data: data,
                        itemStyle: { borderRadius: 5, borderColor: '#fff', borderWidth: 2 }
                    }]
                };
            } else {
                option = {
                    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
                    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
                    xAxis: { type: 'category', data: data.map(d => d.name), axisLabel: { rotate: 45 } },
                    yAxis: { type: 'value' },
                    series: [{
                        type: 'bar',
                        data: data.map(d => d.value),
                        itemStyle: { color: '#3498db' }
                    }]
                };
            }
            if (codeChart) codeChart.dispose();
            codeChart = initChart('chart-code', option);
        }

        // 2. File Types
        function renderFileChart(type) {
            // Convert dict to array
            const data = Object.entries(DATA.file_counts).map(([k, v]) => ({ name: k, value: v }));
            data.sort((a, b) => b.value - a.value);
            // Limit to top 15 + others
            const top = data.slice(0, 15);
            const others = data.slice(15).reduce((acc, cur) => acc + cur.value, 0);
            if (others > 0) top.push({ name: '其他', value: others });

            let option = {};
            if (type === 'pie') {
                option = {
                    tooltip: { trigger: 'item' },
                    series: [{
                        type: 'pie',
                        radius: '65%',
                        data: top
                    }]
                };
            } else {
                option = {
                    tooltip: { trigger: 'axis' },
                    xAxis: { type: 'category', data: top.map(d => d.name), axisLabel: { rotate: 45 } },
                    yAxis: { type: 'value' },
                    series: [{ type: 'bar', data: top.map(d => d.value), itemStyle: { color: '#2ecc71' } }]
                };
            }
            if (fileChart) fileChart.dispose();
            fileChart = initChart('chart-file', option);
        }

        // 3. Asset Stats
        function renderAssetChart(type) {
            const data = DATA.asset_stats.map(item => ({ name: item.name, value: item.bytes, files: item.files }));
            data.sort((a, b) => b.value - a.value);

            let option = {};
            if (type === 'pie') {
                option = {
                    tooltip: { 
                        trigger: 'item', 
                        formatter: function(params) {
                            return `${params.name}<br/>大小: ${fmtBytes(params.value)}<br/>文件数: ${params.data.files}`;
                        }
                    },
                    series: [{
                        type: 'pie',
                        radius: ['30%', '70%'],
                        roseType: 'area',
                        data: data
                    }]
                };
            } else {
                // Horizontal Bar
                option = {
                    tooltip: { 
                        trigger: 'axis',
                        formatter: function(params) {
                            const p = params[0];
                            return `${p.name}<br/>大小: ${fmtBytes(p.value)}`;
                        }
                    },
                    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
                    xAxis: { type: 'value', axisLabel: { formatter: (val) => fmtBytes(val) } },
                    yAxis: { type: 'category', data: data.map(d => d.name) },
                    series: [{
                        type: 'bar',
                        data: data.map(d => d.value),
                        itemStyle: { color: '#e74c3c' },
                        label: { show: true, position: 'right', formatter: (p) => fmtBytes(p.value) }
                    }]
                };
            }
            if (assetChart) assetChart.dispose();
            assetChart = initChart('chart-asset', option);
        }

        // Initial Render
        renderCodeChart('bar');
        renderFileChart('pie');
        renderAssetChart('bar');

    </script>
</body>
</html>
"""
    # 替换占位符
    html_content = html_template.replace('__JSON_DATA__', json_data)
    output_path.write_text(html_content, encoding='utf-8')


# ----------------------------
# GUI Implementation (Tkinter)
# ----------------------------

class StatsGUI:
    def __init__(self):
        import tkinter as tk
        from tkinter import ttk, filedialog, messagebox
        
        self.root = tk.Tk()
        self.root.title("全项目统计工具 Project Stats")
        self.root.geometry("900x700")
        
        # 字体大小配置（统一管理）
        self.FONT_SIZE_MAIN = 14          # 主要元素（按钮、复选框、标签）
        self.FONT_SIZE_TITLE = 16         # 标题文字
        self.FONT_SIZE_INPUT = 13         # 输入框
        self.FONT_SIZE_LOG = 12           # 日志窗口
        self.FONT_SIZE_STATUS = 11        # 状态栏
        self.ROW_HEIGHT = 40              # 行高
        self.PADDING = 6                  # 内边距
        
        # 尝试设置图标和样式优化
        try:
            # 简单的 DPI 适配
            from ctypes import windll
            windll.shcore.SetProcessDpiAwareness(1)
        except:
            pass
            
        style = ttk.Style()
        style.theme_use('clam') # 'clam', 'alt', 'default', 'classic'
        
        # --- 样式优化：全局字体调整 ---
        # Windows 默认通常较小，这里手动调大
        main_font = ('Microsoft YaHei UI', self.FONT_SIZE_MAIN)
        heading_font = ('Microsoft YaHei UI', self.FONT_SIZE_MAIN, 'bold')
        
        style.configure('.', font=main_font)
        style.configure('Treeview', font=main_font, rowheight=self.ROW_HEIGHT)
        style.configure('Treeview.Heading', font=heading_font)
        style.configure('TButton', font=main_font, padding=self.PADDING)
        style.configure('TEntry', font=main_font, padding=self.PADDING)
        style.configure('TLabel', font=main_font)
        style.configure('TCheckbutton', font=main_font)
        
        # 变量绑定
        self.path_var = tk.StringVar(value=str(Path.cwd()))
        self.no_ignore_var = tk.BooleanVar(value=False)
        self.include_hidden_var = tk.BooleanVar(value=False)
        self.assets_var = tk.BooleanVar(value=True)
        self.html_var = tk.BooleanVar(value=False)
        self.detail_var = tk.BooleanVar(value=False)
        self.list_files_var = tk.BooleanVar(value=False)
        self.log_var = tk.BooleanVar(value=False)
        self.markdown_var = tk.BooleanVar(value=False)
        self.status_var = tk.StringVar(value="就绪")
        
        self.analyzer: Optional[StatsAnalyzer] = None
        self.analyzing = False
        self.last_report_path: Optional[Path] = None
        
        self._build_ui()
        
    def _build_ui(self):
        import tkinter as tk
        from tkinter import ttk, scrolledtext
        
        # 1. 顶部：目标选择 (大按钮风格)
        top_frame = ttk.Frame(self.root, padding="20 20 20 10")
        top_frame.pack(fill=tk.X)
        
        ttk.Label(top_frame, text="目标项目路径:", font=("Microsoft YaHei UI", self.FONT_SIZE_TITLE, "bold")).pack(anchor=tk.W, pady=(0, 5))
        
        path_box = ttk.Frame(top_frame)
        path_box.pack(fill=tk.X)
        
        self.entry_path = ttk.Entry(path_box, textvariable=self.path_var, font=("Consolas", self.FONT_SIZE_INPUT))
        self.entry_path.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 10), ipady=self.PADDING)
        
        # 大大的选择按钮
        btn_browse = ttk.Button(path_box, text="📂 选择项目文件夹", command=self._browse_path)
        btn_browse.pack(side=tk.LEFT, ipadx=10, ipady=5)
        
        # 2. 中部：功能开关 (网格布局)
        opt_frame = ttk.LabelFrame(self.root, text="统计选项", padding="15")
        opt_frame.pack(fill=tk.X, padx=20, pady=10)
        
        # 使用 Grid 让复选框排列整齐 (5行2列)
        ttk.Checkbutton(opt_frame, text="统计资源文件 (--assets)", variable=self.assets_var).grid(row=0, column=0, sticky=tk.W, padx=10, pady=5)
        ttk.Checkbutton(opt_frame, text="生成 HTML 报表 (--html)", variable=self.html_var).grid(row=0, column=1, sticky=tk.W, padx=10, pady=5)
        ttk.Checkbutton(opt_frame, text="输出细分统计 (--detail)", variable=self.detail_var).grid(row=1, column=0, sticky=tk.W, padx=10, pady=5)
        ttk.Checkbutton(opt_frame, text="输出文件清单 (--list-files)", variable=self.list_files_var).grid(row=1, column=1, sticky=tk.W, padx=10, pady=5)
        ttk.Checkbutton(opt_frame, text="导出日志文件 (--log)", variable=self.log_var).grid(row=2, column=0, sticky=tk.W, padx=10, pady=5)
        ttk.Checkbutton(opt_frame, text="生成 Markdown 格式 (--markdown)", variable=self.markdown_var).grid(row=2, column=1, sticky=tk.W, padx=10, pady=5)
        ttk.Checkbutton(opt_frame, text="包含隐藏文件 (--include-hidden)", variable=self.include_hidden_var).grid(row=3, column=0, sticky=tk.W, padx=10, pady=5)
        ttk.Checkbutton(opt_frame, text="包含 .git/node_modules (--no-ignore)", variable=self.no_ignore_var).grid(row=3, column=1, sticky=tk.W, padx=10, pady=5)
        
        # 3. 底部：行动区
        action_frame = ttk.Frame(self.root, padding="20 10 20 20")
        action_frame.pack(fill=tk.BOTH, expand=True)
        
        # 巨大地开始按钮
        self.btn_run = ttk.Button(action_frame, text="🚀 开始扫描项目", command=self._start_analysis)
        self.btn_run.pack(fill=tk.X, ipady=10, pady=(0, 15))
        
        # 日志区域 (黑客风格)
        log_frame = ttk.LabelFrame(action_frame, text="扫描日志", padding="5")
        log_frame.pack(fill=tk.BOTH, expand=True)
        
        self.log_text = scrolledtext.ScrolledText(
            log_frame, 
            height=10, 
            font=("Consolas", self.FONT_SIZE_LOG),
            bg="#1e1e1e", 
            fg="#00ff00", # 黑底绿字
            state='disabled'
        )
        self.log_text.pack(fill=tk.BOTH, expand=True)
        
        # 浏览器打开按钮 (初始隐藏或禁用)
        self.btn_open_report = ttk.Button(
            action_frame, 
            text="🌐 在浏览器打开报告 (仅在勾选了生成HTML报表时生效)", 
            command=self._open_report,
            state='disabled'
        )
        self.btn_open_report.pack(fill=tk.X, ipady=8, pady=(15, 0))

        # 状态栏
        status_bar = ttk.Label(self.root, textvariable=self.status_var, relief=tk.SUNKEN, anchor=tk.W, font=("Microsoft YaHei UI", self.FONT_SIZE_STATUS))
        status_bar.pack(side=tk.BOTTOM, fill=tk.X)

    def _append_log(self, msg: str):
        self.log_text.config(state='normal')
        self.log_text.insert("end", msg + "\n")
        self.log_text.see("end")
        self.log_text.config(state='disabled')
        
    def _open_report(self):
        import webbrowser
        import os
        from tkinter import messagebox
        
        p = self.last_report_path or (Path(self.path_var.get()) / "project_stats_report.html")
        try:
            p = p.resolve()
        except Exception:
            pass
            
        if not p.exists():
            self._append_log("[!] 未找到报告文件：请先勾选“生成HTML报表”，并完成一次扫描。")
            messagebox.showinfo("提示", "未找到报告文件：请先勾选“生成HTML报表”，并完成一次扫描。")
            return
            
        try:
            # 优先使用 Windows 原生关联打开 (最稳)
            if sys.platform.startswith('win'):
                os.startfile(p)
                self._append_log(f"[+] 已调用系统打开：{p}")
            else:
                # Mac/Linux 使用 webbrowser
                webbrowser.open(p.as_uri())
                self._append_log(f"[+] 已调用浏览器打开：{p.as_uri()}")
        except Exception as e:
            # 兜底
            self._append_log(f"[!] 打开失败，尝试 webbrowser 兜底：{p} ({e})")
            webbrowser.open(p.as_uri())

    # --- 移除了原来的 _build_overview_tab, _build_code_tab, _build_asset_tab ---


    def _browse_path(self):
        from tkinter import filedialog
        p = filedialog.askdirectory()
        if p:
            self.path_var.set(p)

    def _start_analysis(self):
        if self.analyzing:
            return
            
        p = Path(self.path_var.get())
        if not p.exists():
            from tkinter import messagebox
            messagebox.showerror("错误", "路径不存在")
            return
            
        self.analyzing = True
        self.btn_run.config(state="disabled")
        # self.progress.start(10) # Removed progress bar logic
        
        # 清空旧数据
        self.log_text.config(state='normal')
        self.log_text.delete(1.0, "end")
        self.log_text.config(state='disabled')
        self.btn_open_report.config(state='disabled')
        
        # 后台运行
        thread = threading.Thread(target=self._run_bg, args=(p,))
        thread.daemon = True
        thread.start()

    def _run_bg(self, root_path: Path):
        try:
            self.root.after(0, lambda: self._append_log(f"[*] 开始扫描: {root_path}"))
            
            analyzer = StatsAnalyzer(
                root=root_path,
                no_ignore=self.no_ignore_var.get(),
                include_hidden=self.include_hidden_var.get(),
                count_assets=self.assets_var.get(),
                detail=self.detail_var.get(),
                need_file_list=self.list_files_var.get()
            )
            self.analyzer = analyzer
            
            # 用于控制日志刷新频率
            last_log_time = 0
            
            def on_progress(name):
                nonlocal last_log_time
                now = time.time()
                # 每 100ms 刷新一次日志，避免刷屏太快卡死UI
                if now - last_log_time > 0.1:
                    self.root.after(0, lambda: self._append_log(f"Scanning: {name}"))
                    last_log_time = now

            res = analyzer.analyze(progress_callback=on_progress)
            
            self.root.after(0, lambda: self._append_log("=" * 60))
            self.root.after(0, lambda: self._append_log("[+] 扫描完成!"))
            self.root.after(0, lambda: self._append_log("=" * 60))
            
            # ===== 文件类型统计 =====
            self.root.after(0, lambda: self._append_log(""))
            self.root.after(0, lambda: self._append_log("文件类型统计："))
            self.root.after(0, lambda: self._append_log("-" * 60))
            for t, cnt in sorted(res.file_counts.items(), key=lambda kv: (-kv[1], kv[0])):
                if cnt <= 0:
                    continue
                label = FILE_TYPE_LABELS.get(t, t)
                self.root.after(0, lambda l=label, c=cnt: self._append_log(f"   {l}: {c}"))
            self.root.after(0, lambda: self._append_log(f"   文件总数: {res.total_files}"))
            
            # ===== 细分统计（如果勾选了 --detail）=====
            if self.detail_var.get():
                style_types = ("CSS", "SCSS", "Less")
                merged = {}
                total_style = 0
                for t in style_types:
                    for ext, cnt in res.file_type_ext_counts.get(t, {}).items():
                        merged[ext] = merged.get(ext, 0) + cnt
                        total_style += cnt
                
                if total_style > 0:
                    self.root.after(0, lambda: self._append_log(""))
                    self.root.after(0, lambda: self._append_log("细分统计（按后缀）："))
                    self.root.after(0, lambda: self._append_log("-" * 60))
                    self.root.after(0, lambda ts=total_style: self._append_log(f"   样式文件(CSS/SCSS/Less): {ts}"))
                    for ext, cnt in sorted(merged.items(), key=lambda kv: (-kv[1], kv[0])):
                        self.root.after(0, lambda e=ext, c=cnt: self._append_log(f"      {e}: {c}"))
            
            # ===== 文件清单（如果勾选）=====
            if self.list_files_var.get() and res.file_list:
                self.root.after(0, lambda: self._append_log(""))
                self.root.after(0, lambda: self._append_log("=" * 60))
                self.root.after(0, lambda: self._append_log("--- 文件清单（相对项目根目录）"))
                self.root.after(0, lambda: self._append_log("=" * 60))
                self.root.after(0, lambda: self._append_log(f"根目录: {res.root.resolve()}"))
                self.root.after(0, lambda: self._append_log(f"文件数: {len(res.file_list)}"))
                self.root.after(0, lambda: self._append_log("-" * 60))
                # 限制显示前100个，避免刷屏
                display_count = min(100, len(res.file_list))
                for f in res.file_list[:display_count]:
                    self.root.after(0, lambda file=f: self._append_log(file))
                if len(res.file_list) > display_count:
                    remaining = len(res.file_list) - display_count
                    self.root.after(0, lambda r=remaining: self._append_log(f"... 还有 {r} 个文件未显示"))
            
            # ===== 资源文件统计 =====
            if self.assets_var.get():
                self.root.after(0, lambda: self._append_log(""))
                self.root.after(0, lambda: self._append_log("=" * 60))
                self.root.after(0, lambda: self._append_log("[+] 资源/非代码文件统计"))
                self.root.after(0, lambda: self._append_log("=" * 60))
                self.root.after(0, lambda: self._append_log(""))
                
                for k, st in sorted(res.asset_stats.items(), key=lambda kv: (-kv[1].bytes, kv[0])):
                    label = ASSET_TYPES.get(k, k)
                    self.root.after(0, lambda l=label, s=st: self._append_log(f"   {l:<14}: {s.files:>6} 个文件, {fmt_bytes(s.bytes):>12}"))
                    if self.detail_var.get():
                        subs = res.asset_type_sub_counts.get(k, {})
                        for sub, cnt in sorted(subs.items(), key=lambda kv: (-kv[1], kv[0])):
                            self.root.after(0, lambda su=sub, c=cnt: self._append_log(f"      {su}: {c}"))
                
                self.root.after(0, lambda: self._append_log(""))
            
            self.root.after(0, lambda: self._append_log(f"   [+] 资源文件总数: {res.asset_total_files} 个, 总大小 {fmt_bytes(res.asset_total_bytes)}"))
            self.root.after(0, lambda: self._append_log(f"   [+] 全项目总文件数（含资源）: {res.total_files + res.asset_total_files}"))
            
            # ===== 代码统计 =====
            self.root.after(0, lambda: self._append_log(""))
            self.root.after(0, lambda: self._append_log("=" * 60))
            self.root.after(0, lambda: self._append_log("--- 代码统计（不包括空行和注释）"))
            self.root.after(0, lambda: self._append_log("=" * 60))
            self.root.after(0, lambda: self._append_log(""))
            
            rows = sorted(res.code_stats.items(), key=lambda kv: (-kv[1].code_lines, kv[0]))
            total_code_files = sum(st.files for _, st in rows)
            total_lines = sum(st.code_lines for _, st in rows)
            total_chars = sum(st.code_chars for _, st in rows)
            
            for t, st in rows:
                name = CODE_TYPE_LABELS.get(t, t)
                line_pct = (st.code_lines / total_lines * 100.0) if total_lines else 0.0
                char_pct = (st.code_chars / total_chars * 100.0) if total_chars else 0.0
                
                msg = (
                    f"   {name:<10}:"
                    f" {st.files:>4} 个文件,"
                    f" {fmt_int(st.code_lines):>8} 行代码 ({fmt_pct(line_pct)}),"
                    f" {fmt_int(st.code_chars):>10} 字符 ({fmt_pct(char_pct)})"
                )
                self.root.after(0, lambda m=msg: self._append_log(m))
            
            self.root.after(0, lambda: self._append_log(""))
            self.root.after(0, lambda: self._append_log(f"   [+] 总计: {total_code_files} 个文件, {fmt_int(total_lines)} 行有效代码, {fmt_int(total_chars)} 字符"))
            self.root.after(0, lambda: self._append_log(""))
            
            # 生成 HTML (如果勾选)
            if self.html_var.get():
                html_path = root_path / "project_stats_report.html"
                self.root.after(0, lambda: self._append_log(f"[*] 正在生成 HTML 报告..."))
                
                rows = sorted(res.code_stats.items(), key=lambda kv: (-kv[1].code_lines, kv[0]))
                
                html_data = {
                    "root": str(res.root.resolve()),
                    "total_files": res.total_files + res.asset_total_files,
                    "total_code_files": sum(st.files for _, st in rows),
                    "total_code_chars": sum(st.code_chars for _, st in rows),
                    "total_code_lines": sum(st.code_lines for _, st in rows), # Fix: add total_code_lines
                    "total_asset_files": res.asset_total_files,
                    "total_asset_bytes": res.asset_total_bytes,
                    "file_counts": res.file_counts,
                    "code_stats": [
                        {
                            "name": CODE_TYPE_LABELS.get(t, t),
                            "files": st.files,
                            "lines": st.code_lines,
                            "chars": st.code_chars
                        }
                        for t, st in rows
                    ],
                    "asset_stats": [
                        {
                            "name": ASSET_TYPES.get(k, k),
                            "files": st.files,
                            "bytes": st.bytes
                        }
                        for k, st in sorted(res.asset_stats.items(), key=lambda kv: (-kv[1].bytes, kv[0]))
                    ]
                }
                
                try:
                    generate_html_report(html_data, html_path)
                    try:
                        self.last_report_path = html_path.resolve()
                    except Exception:
                        self.last_report_path = html_path
                    report_path_str = str(self.last_report_path)
                    try:
                        report_uri = self.last_report_path.as_uri()
                    except Exception:
                        report_uri = report_path_str
                    self.root.after(0, lambda: self._append_log(f"[+] 报告已生成: {report_path_str}"))
                    self.root.after(0, lambda: self._append_log(f"[+] 链接: {report_uri}"))
                    self.root.after(0, lambda: self.btn_open_report.config(state='normal'))
                except Exception as e:
                    self.root.after(0, lambda: self._append_log(f"[!] 生成报告失败: {e}"))

            # 导出日志文件（如果勾选）
            if self.log_var.get():
                log_path = root_path / "project_stats.log"
                try:
                    # 获取日志文本内容
                    log_content = self.log_text.get("1.0", "end").strip()
                    log_path.write_text(log_content, encoding="utf-8")
                    self.root.after(0, lambda: self._append_log(f"[+] 日志已保存: {log_path}"))
                except Exception as e:
                    self.root.after(0, lambda: self._append_log(f"[!] 保存日志失败: {e}"))

            # 生成 Markdown 格式（如果勾选）
            if self.markdown_var.get():
                self.root.after(0, lambda: self._append_log(""))
                self.root.after(0, lambda: self._append_log("=" * 60))
                self.root.after(0, lambda: self._append_log("Markdown 格式输出（可直接复制）"))
                self.root.after(0, lambda: self._append_log("=" * 60))
                self.root.after(0, lambda: self._append_log(""))
                
                rows = sorted(res.code_stats.items(), key=lambda kv: (-kv[1].code_lines, kv[0]))
                total_code_files = sum(st.files for _, st in rows)
                total_lines = sum(st.code_lines for _, st in rows)
                total_chars = sum(st.code_chars for _, st in rows)
                
                markdown_output = generate_markdown_output(res, total_code_files, total_lines, total_chars, rows)
                for line in markdown_output.split('\n'):
                    self.root.after(0, lambda l=line: self._append_log(l))
                
                self.root.after(0, lambda: self._append_log(""))
                self.root.after(0, lambda: self._append_log("=" * 60))

            self.root.after(0, lambda: self.status_var.set("统计完成"))
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            self.root.after(0, lambda: self._append_log(f"[!] 发生错误: {str(e)}"))
        finally:
            self.root.after(0, self._reset_ui_state)

    def _reset_ui_state(self):
        self.analyzing = False
        self.btn_run.config(state="normal")
        # self.progress.stop() # 移除了进度条，不需要stop

    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    if len(sys.argv) > 1:
        # CLI 模式
        raise SystemExit(main())
    else:
        # GUI 模式
        app = StatsGUI()
        app.run()

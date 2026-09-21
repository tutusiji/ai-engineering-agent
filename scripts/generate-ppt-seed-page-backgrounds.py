#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generate-ppt-seed-page-backgrounds.py — 内置 PPT 模板多页背景生成器

为四套内置完整版式模板（luxe-indigo / champagne-gold / jade-night / mist-blue）
程序化绘制章节页、内容页、结尾页三种页面背景（封面复用 generate-ppt-seed-backgrounds.py
的成品），输出 <key>-section.jpg / <key>-content.jpg / <key>-ending.jpg 到
apps/studio-api/assets/ppt-seeds/，由打包脚本组装为 .pptx 模板文件。
生成内容全部为本程序原创绘制，无任何第三方素材，无版权负担。

可读性约定（与 build.ts 的文字用色一一对应）：
- 章节页/结尾页文字色 = colors.background → 底色以 primary 主导（浅底主题配深 primary、
  深底主题配亮 primary），中央 40%-62% 垂直带保持低对比留白给标题
- 内容页（toc/content/quote）文字色 = primary/text → 底色以 background 主导，
  装饰元素 alpha ≤ 0.16，不侵蚀文字对比度

用法: python3 scripts/generate-ppt-seed-page-backgrounds.py [输出目录]
"""

import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 1920, 1080
SS = 2

_Y, _X = np.mgrid[0:H, 0:W].astype(np.float64)


def hex_rgb(color):
    """'#RRGGBB'/'RRGGBB' -> float64 RGB 三元组"""
    c = color.lstrip('#')
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float64)


def canvas(top, bottom, angle_deg=90.0):
    """双色渐变画布"""
    t = np.radians(angle_deg)
    proj = np.cos(t) * (_X / W) + np.sin(t) * (_Y / H)
    proj = (proj - proj.min()) / (proj.max() - proj.min() + 1e-9)
    a, b = hex_rgb(top), hex_rgb(bottom)
    return a[None, None, :] * (1 - proj[..., None]) + b[None, None, :] * proj[..., None]


def over(img, mask, color):
    """按 [0,1] 掩码将颜色 alpha-over 叠加到画布"""
    m = np.clip(mask, 0.0, 1.0)[..., None]
    return img * (1 - m) + hex_rgb(color)[None, None, :] * m


def glow_mask(cx, cy, radius, strength):
    """径向高斯柔光掩码"""
    d2 = ((_X - cx) ** 2 + (_Y - cy) ** 2) / (radius ** 2)
    return np.exp(-d2) * strength


def band_mask(y0, y1, y2, y3):
    """垂直柔和条带掩码"""
    up = np.clip((_Y - y0) / max(y1 - y0, 1e-9), 0, 1)
    down = np.clip((y3 - _Y) / max(y3 - y2, 1e-9), 0, 1)
    return np.minimum(up, down)


def vector_mask(draw_fn, blur=0.0):
    """2x 超采样矢量层掩码"""
    layer = Image.new('L', (W * SS, H * SS), 0)
    draw_fn(ImageDraw.Draw(layer))
    if blur > 0:
        layer = layer.filter(ImageFilter.GaussianBlur(blur * SS))
    return np.asarray(layer.resize((W, H), Image.LANCZOS), dtype=np.float64) / 255.0


def sine_points(x0, x1, y_base, amp, period, phase, step=6):
    """正弦曲线采样点"""
    xs = np.arange(x0 * SS, x1 * SS, step * SS)
    ys = (y_base + amp * np.sin(xs / (period * SS) * 2 * np.pi + phase)) * SS
    return list(zip(xs.tolist(), ys.tolist()))


def add_grain(img, sigma, seed):
    """胶片颗粒"""
    rng = np.random.default_rng(seed)
    return img + rng.normal(0, sigma, (H, W, 1))


def save(img, out_dir, name):
    """uint8 化并保存 JPEG q90"""
    arr = np.clip(img, 0, 255).astype(np.uint8)
    path = os.path.join(out_dir, name)
    Image.fromarray(arr).save(path, 'JPEG', quality=90, optimize=True)
    print(f'  {name}: {os.path.getsize(path) // 1024} KB')


# ---------------------------------------------------------------------------
# 四套内置模板调色板（与 SEED_PPT_TEMPLATES 的 colors 六槽一致）
# section/ending 页底色以 primary 主导；content 页底色以 background 主导
# ---------------------------------------------------------------------------

PALETTES = {
    'luxe-indigo': {
        'primary': '4F46E5', 'secondary': '8B5CF6', 'background': 'FAF9F6',
        'surface': 'EEF2FF', 'text': '1E1B4B', 'accent': 'D4AF37',
    },
    'champagne-gold': {
        'primary': 'A16207', 'secondary': 'CA8A04', 'background': 'FDFBF6',
        'surface': 'FAF3E0', 'text': '292524', 'accent': '0E7490',
    },
    'jade-night': {
        'primary': '34D399', 'secondary': '2DD4BF', 'background': '0A0F0D',
        'surface': '12201A', 'text': 'E7F6EF', 'accent': 'FBBF24',
    },
    'mist-blue': {
        'primary': '0369A1', 'secondary': '38BDF8', 'background': 'FFFFFF',
        'surface': 'F0F9FF', 'text': '0C4A6E', 'accent': '059669',
    },
}


# ---------------------------------------------------------------------------
# 章节页：primary 主导的大色场，中央 40%-62% 垂直带低对比留白（给章节标题），
# 装饰分风格：indigo 金弧 / gold 波纹 / jade 星点 / mist 雾带
# ---------------------------------------------------------------------------

def paint_section(p):
    primary, accent, text = p['primary'], p['accent'], p['text']
    style_dark = sum(hex_rgb(primary)) / 3 < 128  # primary 偏深 → 亮文字（底用深 primary 系）

    if style_dark:
        # 深色场：primary → 与 text 混合的更深端，中央微亮 glow
        deep = tuple((np.array(hex_rgb(primary)) * 0.55 + np.array(hex_rgb(text)) * 0.45))
        img = canvas(primary, '%02X%02X%02X' % tuple(int(c) for c in deep), 70)
        img = over(img, glow_mask(W * 0.5, H * 0.42, W * 0.55, 0.16), p['secondary'])
        decor = accent
    else:
        # 亮色场（jade-night）：primary → 稍亮的次级渐变，中央微暗以承深色标题
        img = canvas(primary, p['secondary'], 105)
        img = over(img, glow_mask(W * 0.5, H * 0.5, W * 0.6, 0.10), 'FFFFFF')
        decor = text

    # 中央留白带：轻微整体压暗/提亮让标题区域更干净（对文字色方向相反的低对比处理）
    if style_dark:
        img = over(img, band_mask(H * 0.30, H * 0.42, H * 0.60, H * 0.74) * 0.10, p['secondary'])
    else:
        img = over(img, band_mask(H * 0.30, H * 0.42, H * 0.60, H * 0.74) * 0.06, 'FFFFFF')

    if p is PALETTES['luxe-indigo']:
        # 底部金色大弧（章节页签名装饰）
        def arc(d):
            d.arc([int(-W * 0.25), int(H * 0.86), int(W * 0.75), int(H * 1.55)], 0, 360, fill=255, width=int(3 * SS))
            d.arc([int(-W * 0.25), int(H * 0.92), int(W * 0.75), int(H * 1.65)], 0, 360, fill=255, width=int(1.5 * SS))
        img = over(img, vector_mask(arc, blur=1.2) * 0.42, decor)
    elif p is PALETTES['champagne-gold']:
        # 底部三层波纹
        def waves(d):
            for i, (amp, yb) in enumerate([(26, H * 0.80), (34, H * 0.87), (40, H * 0.94)]):
                pts = sine_points(-50, W + 50, yb, amp, W * 0.9, i * 1.4)
                d.line(pts + [(int(W + 50), int(H + 80)), (int(-50), int(H + 80))], fill=255, width=int((2.2 - i * 0.5) * SS))
        img = over(img, vector_mask(waves, blur=1.0) * 0.34, decor)
    elif p is PALETTES['jade-night']:
        # 左上疏朗星点 + 右下微光（亮底，装饰用深色低 alpha）
        def stars(d):
            for (x, y, r) in [(0.16, 0.18, 3), (0.24, 0.30, 1.6), (0.80, 0.22, 2.4), (0.88, 0.34, 1.4), (0.72, 0.14, 1.2)]:
                d.ellipse([int((x - r / 400) * W * SS), int((y - r / 711) * H * SS),
                           int((x + r / 400) * W * SS), int((y + r / 711) * H * SS)], fill=255)
        img = over(img, vector_mask(stars, blur=0.8) * 0.30, decor)
        img = over(img, glow_mask(W * 0.82, H * 0.85, W * 0.35, 0.12), 'FFFFFF')
    else:
        # mist-blue：横贯雾带（低 alpha 宽条带模拟雾）
        img = over(img, band_mask(H * 0.66, H * 0.74, H * 0.86, H * 0.98) * 0.18, 'FFFFFF')
        img = over(img, glow_mask(W * 0.15, H * 0.90, W * 0.4, 0.10), p['secondary'])

    return img


# ---------------------------------------------------------------------------
# 内容页（toc / content-bullets / content-two-col / quote 共用）：
# background 色纸面 + 角落极轻装饰（alpha ≤ 0.16，不侵蚀正文对比度）
# ---------------------------------------------------------------------------

def paint_content(p):
    img = canvas(p['background'], p['surface'], 115)
    # 顶部轻微光感
    img = over(img, glow_mask(W * 0.5, -H * 0.1, W * 0.7, 0.05), p['secondary'])

    if p is PALETTES['luxe-indigo']:
        # 右上金色细弧 + 左下点阵
        def arc(d):
            d.arc([int(W * 0.72), int(-H * 0.30), int(W * 1.28), int(H * 0.26)], 0, 360, fill=255, width=int(2.4 * SS))
        img = over(img, vector_mask(arc, blur=1.0) * 0.14, p['accent'])
        def dots(d):
            for gy in range(5):
                for gx in range(9):
                    cx = int((0.035 + gx * 0.022) * W * SS)
                    cy = int((0.86 + gy * 0.022) * H * SS)
                    d.ellipse([cx - 4 * SS, cy - 4 * SS, cx + 4 * SS, cy + 4 * SS], fill=255)
        img = over(img, vector_mask(dots) * 0.08, p['primary'])
    elif p is PALETTES['champagne-gold']:
        # 底部极轻波纹 + 右上金线
        def waves(d):
            pts = sine_points(-50, W + 50, H * 0.94, 22, W * 0.8, 0.5)
            d.line(pts, fill=255, width=int(2 * SS))
        img = over(img, vector_mask(waves, blur=1.0) * 0.12, p['primary'])
        def arc(d):
            d.arc([int(W * 0.80), int(-H * 0.22), int(W * 1.24), int(H * 0.22)], 0, 360, fill=255, width=int(1.8 * SS))
        img = over(img, vector_mask(arc, blur=1.0) * 0.12, p['accent'])
    elif p is PALETTES['jade-night']:
        # 深色纸面：右下萤火微光 + 稀疏星点
        img = over(img, glow_mask(W * 0.86, H * 0.88, W * 0.3, 0.10), p['secondary'])
        def stars(d):
            for (x, y, r) in [(0.12, 0.14, 1.6), (0.30, 0.08, 1.0), (0.90, 0.12, 1.4)]:
                d.ellipse([int((x - r / 400) * W * SS), int((y - r / 711) * H * SS),
                           int((x + r / 400) * W * SS), int((y + r / 711) * H * SS)], fill=255)
        img = over(img, vector_mask(stars, blur=0.6) * 0.16, p['primary'])
    else:
        # mist-blue：右上雾晕 + 左下细波
        img = over(img, glow_mask(W * 0.90, H * 0.06, W * 0.3, 0.08), p['secondary'])
        def waves(d):
            pts = sine_points(-50, W * 0.55, H * 0.96, 14, W * 0.7, 1.1)
            d.line(pts, fill=255, width=int(1.8 * SS))
        img = over(img, vector_mask(waves, blur=0.8) * 0.10, p['primary'])

    return img


# ---------------------------------------------------------------------------
# 结尾页：primary 主导，中央完全留白，装饰为居中呼应（与章节页同文字色约定）
# ---------------------------------------------------------------------------

def paint_ending(p):
    primary, accent, text = p['primary'], p['accent'], p['text']
    style_dark = sum(hex_rgb(primary)) / 3 < 128

    if style_dark:
        deep = tuple((np.array(hex_rgb(primary)) * 0.55 + np.array(hex_rgb(text)) * 0.45))
        img = canvas(primary, '%02X%02X%02X' % tuple(int(c) for c in deep), 90)
        img = over(img, glow_mask(W * 0.5, H * 0.5, W * 0.5, 0.14), p['secondary'])
        decor = accent
    else:
        img = canvas(p['secondary'], primary, 90)
        img = over(img, glow_mask(W * 0.5, H * 0.5, W * 0.5, 0.08), 'FFFFFF')
        decor = text

    if p is PALETTES['luxe-indigo']:
        # 中央下方同心细环
        def rings(d):
            d.arc([int(W * 0.40), int(H * 0.72), int(W * 0.60), int(H * 0.92)], 0, 360, fill=255, width=int(2.2 * SS))
            d.arc([int(W * 0.43), int(H * 0.75), int(W * 0.57), int(H * 0.89)], 0, 360, fill=255, width=int(1.2 * SS))
        img = over(img, vector_mask(rings, blur=0.8) * 0.40, decor)
    elif p is PALETTES['champagne-gold']:
        # 上下对称细波收束
        def waves(d):
            pts = sine_points(-50, W + 50, H * 0.10, 18, W * 0.85, 0.3)
            d.line(pts, fill=255, width=int(1.8 * SS))
        img = over(img, vector_mask(waves, blur=1.0) * 0.26, decor)
    elif p is PALETTES['jade-night']:
        # 四角对称星点
        def stars(d):
            for (x, y, r) in [(0.14, 0.16, 2.2), (0.86, 0.16, 2.2), (0.14, 0.84, 2.2), (0.86, 0.84, 2.2), (0.50, 0.88, 1.4)]:
                d.ellipse([int((x - r / 400) * W * SS), int((y - r / 711) * H * SS),
                           int((x + r / 400) * W * SS), int((y + r / 711) * H * SS)], fill=255)
        img = over(img, vector_mask(stars, blur=0.7) * 0.28, decor)
    else:
        # 底部宽雾带
        img = over(img, band_mask(H * 0.80, H * 0.88, H * 0.96, H * 1.04) * 0.16, 'FFFFFF')

    return img


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(os.path.abspath(__file__)), '..', 'apps', 'studio-api', 'assets', 'ppt-seeds')
    out_dir = os.path.abspath(out_dir)
    os.makedirs(out_dir, exist_ok=True)
    print(f'输出目录: {out_dir}')
    for key, p in PALETTES.items():
        print(f'{key}:')
        save(add_grain(paint_section(p), 3.0, hash(key + 'section') % (2**32)), out_dir, f'{key}-section.jpg')
        save(add_grain(paint_content(p), 2.2, hash(key + 'content') % (2**32)), out_dir, f'{key}-content.jpg')
        save(add_grain(paint_ending(p), 3.0, hash(key + 'ending') % (2**32)), out_dir, f'{key}-ending.jpg')
    print('完成：12 张页面背景')


if __name__ == '__main__':
    main()

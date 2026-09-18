#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generate-ppt-seed-backgrounds.py — 内置 PPT 主题封面背景生成器

用 PIL + numpy 程序化绘制六套内置主题的 1920×1080 封面背景图（JPEG，含细腻胶片颗粒），
输出到 apps/studio-api/assets/ppt-seeds/，由 studio-api 启动种子例程分发到各模板资产目录。
生成内容全部为本程序原创绘制，无任何第三方素材，无版权负担。

用法: python3 scripts/generate-ppt-seed-backgrounds.py [输出目录]
"""

import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 1920, 1080
SS = 2  # 矢量元素（弧线/曲线/星点）超采样倍数，用于抗锯齿

_Y, _X = np.mgrid[0:H, 0:W].astype(np.float64)


def hex_rgb(color):
    """'#RRGGBB'/'RRGGBB' -> float64 RGB 三元组"""
    c = color.lstrip('#')
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float64)


def canvas(top, bottom, angle_deg=90.0):
    """双色渐变画布（指定方向角，numpy 连续场，天然平滑）"""
    t = np.radians(angle_deg)
    proj = np.cos(t) * (_X / W) + np.sin(t) * (_Y / H)
    proj = (proj - proj.min()) / (proj.max() - proj.min() + 1e-9)
    a, b = hex_rgb(top), hex_rgb(bottom)
    return a[None, None, :] * (1 - proj[..., None]) + b[None, None, :] * proj[..., None]


def over(img, mask, color):
    """按 [0,1] 掩码将颜色 alpha-over 叠加到画布"""
    m = np.clip(mask, 0.0, 1.0)[..., None]
    return img * (1 - m) + hex_rgb(color)[None, None, :] * m


def glow_mask(cx, cy, radius, strength, power=2.0):
    """径向高斯柔光掩码（strength 为峰值不透明度）"""
    d2 = ((_X - cx) ** 2 + (_Y - cy) ** 2) / (radius ** 2)
    return np.exp(-d2) * strength * (power if power != 2.0 else 1.0)


def band_mask(y0, y1, y2, y3):
    """垂直柔和条带掩码（y0-y1 渐入，y1-y2 全强，y2-y3 渐出）"""
    up = np.clip((_Y - y0) / max(y1 - y0, 1e-9), 0, 1)
    down = np.clip((y3 - _Y) / max(y3 - y2, 1e-9), 0, 1)
    return np.minimum(up, down)


def vector_mask(draw_fn, blur=0.0):
    """在 2x 超采样画布上绘制矢量元素并缩放回原尺寸，返回 [0,1] 掩码"""
    layer = Image.new('L', (W * SS, H * SS), 0)
    draw_fn(ImageDraw.Draw(layer))
    if blur > 0:
        layer = layer.filter(ImageFilter.GaussianBlur(blur * SS))
    return np.asarray(layer.resize((W, H), Image.LANCZOS), dtype=np.float64) / 255.0


def sine_points(x0, x1, y_base, amp, period, phase, step=6):
    """生成正弦曲线采样点（矢量层坐标系）"""
    xs = np.arange(x0 * SS, x1 * SS, step * SS)
    ys = (y_base + amp * np.sin(xs / (period * SS) * 2 * np.pi + phase)) * SS
    return list(zip(xs.tolist(), ys.tolist()))


def add_grain(img, sigma, seed):
    """叠加亮度胶片颗粒（单通道噪声，三通道共享）"""
    rng = np.random.default_rng(seed)
    return img + rng.normal(0, sigma, (H, W, 1))


def save(img, out_dir, name):
    """uint8 化并保存 JPEG（质量 90：颗粒与渐变下体积约 0.3-0.7MB）"""
    arr = np.clip(img, 0, 255).astype(np.uint8)
    im = Image.fromarray(arr)
    path = os.path.join(out_dir, name)
    im.save(path, 'JPEG', quality=90, optimize=True)
    print(f'  {name}: {os.path.getsize(path) // 1024} KB')


# ── 六套主题 painters：构图原则 —— 中心偏左保持低对比（留给封面标题），重点元素压边角 ──

def paint_luxe_indigo():
    """轻奢靛蓝：暖米白纸面 + 右上靛紫渐变幕 + 金色细弧 + 极淡点阵"""
    img = canvas('#FAF9F6', '#F0EEE8', angle_deg=70)
    yy, xx = _Y, _X
    d_main = np.sqrt((xx - W) ** 2 + (yy - 60) ** 2)
    img = over(img, np.clip(1 - d_main / 1250, 0, 1) ** 1.7 * 0.94, '#6D5AE6')
    d_violet = np.sqrt((xx - 1560) ** 2 + (yy - 640) ** 2)
    img = over(img, np.clip(1 - d_violet / 720, 0, 1) ** 2 * 0.32, '#8B5CF6')
    d_bal = np.sqrt((xx - 140) ** 2 + (yy - 1040) ** 2)
    img = over(img, np.clip(1 - d_bal / 640, 0, 1) ** 2 * 0.10, '#4F46E5')

    def arcs(d):
        cx, cy = W * SS, 60 * SS
        for r, w, a in ((760, 3, 0.55), (836, 2, 0.35)):
            d.arc((cx - r * SS, cy - r * SS, cx + r * SS, cy + r * SS), 96, 172, fill=int(255 * a), width=w * SS)
        # 左下角金色小圆点缀
        d.ellipse((150 * SS, 972 * SS, 162 * SS, 984 * SS), fill=int(255 * 0.8))
    img = over(img, vector_mask(arcs), '#D4AF37')

    def dots(d):
        for gy in range(140 * SS, 940 * SS, 46 * SS):
            for gx in range(110 * SS, 880 * SS, 46 * SS):
                d.ellipse((gx - 1 * SS, gy - 1 * SS, gx + 1 * SS, gy + 1 * SS), fill=13)
    img = over(img, vector_mask(dots), '#4F46E5')
    return add_grain(img, 1.8, 11)


def paint_champagne_gold():
    """暖沙鎏金：奶油底 + 底部层叠金色丝缎波纹 + 柔金辉光"""
    img = canvas('#FDFBF6', '#F4EAD6', angle_deg=90)
    img = over(img, glow_mask(W / 2, H * 1.06, 940, 0.32), '#E8C877')

    def waves(d):
        specs = [
            (0.60, 26, 620, 0.0, 7, 0.30, '#C89B4B'),
            (0.66, 30, 540, 1.4, 6, 0.45, '#B8860B'),
            (0.72, 22, 700, 2.6, 8, 0.55, '#D9B25F'),
            (0.79, 28, 580, 0.8, 6, 0.65, '#B8860B'),
            (0.87, 24, 660, 1.9, 9, 0.75, '#C89B4B'),
            (0.94, 26, 520, 3.1, 7, 0.85, '#A9762B'),
        ]
        for base, amp, period, phase, w, a, color in specs:
            pts = sine_points(0, W, base * H, amp, period, phase)
            d.line(pts, fill=int(255 * a), width=w * SS, joint='curve')
    img = over(img, vector_mask(waves, blur=0.6), '#B8860B')

    def ring(d):
        cx, cy = 300 * SS, 240 * SS
        d.arc((cx - 150 * SS, cy - 150 * SS, cx + 150 * SS, cy + 150 * SS), 200, 330, fill=int(255 * 0.30), width=2 * SS)
    img = over(img, vector_mask(ring), '#C89B4B')
    return add_grain(img, 2.0, 22)


def paint_jade_night():
    """墨玉暗夜：深墨绿底 + 翡翠辉光 + 同心细弧 + 星点"""
    img = canvas('#0C130F', '#070B09', angle_deg=100)
    img = over(img, glow_mask(430, 880, 680, 0.55), '#0F9D6E')
    img = over(img, glow_mask(1660, 160, 520, 0.26), '#134E4A')

    def arcs(d):
        cx, cy = 430 * SS, 880 * SS
        for r, a in ((300, 0.30), (430, 0.22), (570, 0.15)):
            d.arc((cx - r * SS, cy - r * SS, cx + r * SS, cy + r * SS), 285, 400, fill=int(255 * a), width=2 * SS)
    img = over(img, vector_mask(arcs), '#34D399')

    rng = np.random.default_rng(33)

    def stars(d):
        for _ in range(95):
            x, y = rng.uniform(0, W * SS), rng.uniform(0, H * 0.72 * SS)
            r = rng.uniform(0.6, 1.8) * SS
            a = rng.uniform(0.20, 0.70)
            d.ellipse((x - r, y - r, x + r, y + r), fill=int(255 * a))
    img = over(img, vector_mask(stars), '#E7F6EF')
    return add_grain(img, 2.2, 44)


def paint_mist_blue():
    """晨雾蓝白：留白底 + 中下部淡蓝雾带 + 柔雾团 + 细海平线"""
    img = canvas('#FFFFFF', '#F0F8FE', angle_deg=90)
    img = over(img, band_mask(H * 0.52, H * 0.66, H * 0.86, H * 1.04) * 0.65, '#C4E3F8')
    img = over(img, glow_mask(W * 0.82, H * 0.12, 380, 0.22), '#BAE0FB')

    def mists(d):
        for cx, cy, rx, ry, a in (
            (280, 700, 340, 90, 0.55), (760, 780, 420, 100, 0.45),
            (1260, 720, 380, 95, 0.50), (1700, 820, 340, 90, 0.45),
        ):
            d.ellipse(((cx - rx) * SS, (cy - ry) * SS, (cx + rx) * SS, (cy + ry) * SS), fill=int(255 * a))
    img = over(img, vector_mask(mists, blur=26), '#FFFFFF')

    def horizon(d):
        d.line((140 * SS, 640 * SS, 1780 * SS, 640 * SS), fill=int(255 * 0.30), width=1 * SS)
    img = over(img, vector_mask(horizon), '#0369A1')
    return add_grain(img, 1.4, 55)


def paint_forest_sage():
    """森语绿意：灰绿纸面 + 有机色块晕染 + 连接弧线"""
    img = canvas('#F5F8EF', '#E7EFD9', angle_deg=80)
    img = over(img, glow_mask(400, 240, 720, 0.60), '#9DBB8F')
    img = over(img, glow_mask(1580, 940, 760, 0.52), '#DEC474')
    img = over(img, glow_mask(1080, 660, 460, 0.20), '#7FA36F')

    def arcs(d):
        d.arc((520 * SS, 200 * SS, 1560 * SS, 1080 * SS), 190, 300, fill=int(255 * 0.50), width=3 * SS)
        d.arc((440 * SS, 140 * SS, 1640 * SS, 1160 * SS), 200, 290, fill=int(255 * 0.32), width=2 * SS)
    img = over(img, vector_mask(arcs), '#1D5C34')

    def leaf(d):
        cx, cy = 1560 * SS, 920 * SS
        d.arc((cx - 120 * SS, cy - 60 * SS, cx + 120 * SS, cy + 60 * SS), 120, 300, fill=int(255 * 0.70), width=3 * SS)
        d.line((cx - 110 * SS, cy + 30 * SS, cx + 110 * SS, cy - 30 * SS), fill=int(255 * 0.50), width=2 * SS)
    img = over(img, vector_mask(leaf), '#5E7A4A')
    return add_grain(img, 1.8, 66)


def paint_violet_dusk():
    """绛紫晚霞：深紫夜幕 + 地平线洋红/琥珀辉光 + 山影 + 星点 + 金色弯钩"""
    img = canvas('#150B28', '#251349', angle_deg=95)
    img = over(img, glow_mask(W / 2, H * 1.02, 980, 0.40), '#B0368C')
    img = over(img, glow_mask(W * 0.42, H * 1.06, 720, 0.30), '#E8A34D')

    rng = np.random.default_rng(77)

    def stars(d):
        for _ in range(150):
            x, y = rng.uniform(0, W * SS), rng.uniform(0, H * 0.68 * SS)
            r = rng.uniform(0.5, 1.6) * SS
            a = rng.uniform(0.18, 0.75)
            d.ellipse((x - r, y - r, x + r, y + r), fill=int(255 * a))
    img = over(img, vector_mask(stars), '#F5EFFF')

    def crescent(d):
        cx, cy = 1580 * SS, 260 * SS
        r = 210 * SS
        d.arc((cx - r, cy - r, cx + r, cy + r), 115, 300, fill=int(255 * 0.70), width=3 * SS)
        r2 = 190 * SS
        d.arc((cx - r2, cy - r2, cx + r2, cy + r2), 125, 290, fill=int(255 * 0.25), width=2 * SS)
    img = over(img, vector_mask(crescent), '#F2C46B')

    def hills(d):
        xs = np.arange(0, W * SS, 4 * SS)
        base = H * 0.94 * SS
        ys = base - (36 * SS * np.sin(xs / (250 * SS) + 1.2) + 20 * SS * np.sin(xs / (90 * SS) + 0.4)) - 30 * SS
        d.polygon([(0, H * SS)] + list(zip(xs.tolist(), ys.tolist())) + [(W * SS, H * SS)], fill=int(255 * 0.88))
    img = over(img, vector_mask(hills), '#0C0716')
    return add_grain(img, 2.2, 88)


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'apps', 'studio-api', 'assets', 'ppt-seeds'
    )
    os.makedirs(out_dir, exist_ok=True)
    painters = {
        'luxe-indigo': paint_luxe_indigo,
        'champagne-gold': paint_champagne_gold,
        'jade-night': paint_jade_night,
        'mist-blue': paint_mist_blue,
        'forest-sage': paint_forest_sage,
        'violet-dusk': paint_violet_dusk,
    }
    print(f'输出目录: {out_dir}')
    for key, paint in painters.items():
        save(paint(), out_dir, f'{key}.jpg')
    print('完成')


if __name__ == '__main__':
    main()

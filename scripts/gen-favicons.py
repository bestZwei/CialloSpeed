"""生成 CialloSpeed favicon：品牌渐变圆角方块 + 白色 C 字母标。

设计：底色为对角线渐变 #00b8e6 -> #7c5cff（与 --grad-brand 一致），
白色「C」开口朝右，叠加其上，浅/深标签背景均可清晰辨识。
输出：public/favicon.svg（矢量）及多尺寸 PNG（favicon-16/32、apple-touch-icon-180、
android-chrome-192/512）。
"""
import math
from PIL import Image, ImageDraw

C1 = (0, 184, 230)   # #00b8e6
C2 = (124, 92, 255)  # #7c5cff
WHITE = (255, 255, 255, 255)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def draw_favicon(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 渐变圆角方块
    pad = size * 4 / 64
    r = size * 14 / 64
    box = [pad, pad, size - pad, size - pad]
    for y in range(size):
        for x in range(size):
            t = min(1.0, max(0.0, (x + y) / (2 * size)))
            img.putpixel((x, y), lerp(C1, C2, t) + (255,))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(box, radius=r, fill=255)
    base = img.copy()
    img = Image.composite(img, Image.new("RGBA", (size, size), (0, 0, 0, 0)), mask)
    d = ImageDraw.Draw(img)

    # 白色 C（开口朝右）
    cx = cy = size * 32 / 64
    rad = size * 17 / 64
    width = max(2, int(size * 11 / 64))
    arc_box = [cx - rad, cy - rad, cx + rad, cy + rad]
    start, end = 35, 325
    d.arc(arc_box, start, end, fill=WHITE, width=width)
    # 圆角端点
    for ang in (start, end):
        a = math.radians(ang)
        ex, ey = cx + rad * math.cos(a), cy + rad * math.sin(a)
        d.ellipse([ex - width / 2, ey - width / 2, ex + width / 2, ey + width / 2], fill=WHITE)
    return img


def main():
    targets = {
        "public/favicon-16x16.png": 16,
        "public/favicon-32x32.png": 32,
        "public/apple-touch-icon.png": 180,
        "public/android-chrome-192x192.png": 192,
        "public/android-chrome-512x512.png": 512,
    }
    for path, s in targets.items():
        draw_favicon(s).save(path)
        print(f"  {path}: {s}x{s}")

    # 矢量 SVG（轻量，约 1KB）
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">\n'
        '  <defs>\n'
        '    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">\n'
        '      <stop offset="0" stop-color="#00b8e6"/>\n'
        '      <stop offset="1" stop-color="#7c5cff"/>\n'
        '    </linearGradient>\n'
        '  </defs>\n'
        '  <rect x="4" y="4" width="56" height="56" rx="14" fill="url(#g)"/>\n'
        '  <path d="M45.9 41.75 A 17 17 0 1 1 45.9 22.25" fill="none" stroke="#fff" '
        'stroke-width="11" stroke-linecap="round"/>\n'
        '</svg>\n'
    )
    with open("public/favicon.svg", "w", encoding="utf-8") as f:
        f.write(svg)
    print("  public/favicon.svg: vector")


if __name__ == "__main__":
    main()

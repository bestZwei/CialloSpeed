"""生成 public/apple-touch-icon.png（iOS 主屏图标）。

源图 public/Ciallo.png 为「深色 Ciallo 字标 + 透明底」。
- 反白：保留 alpha 形状、RGB 置白（抗锯齿由 alpha 承载，不会出现灰边）
- 底色：品牌渐变（#00b8e6 -> #7c5cff，135° 对角）全出血正方形
  （iOS 要求主屏图标不透明，透明区域会被渲染为黑色；圆角由 iOS 自行裁切）

其余尺寸（favicon-16/32/48、android-chrome-192/512）沿用仓库中既有的
「透明底 + 品牌渐变描边 C」版本，本脚本不改动它们。
"""
from PIL import Image

SRC = "public/Ciallo.png"
OUT = "public/apple-touch-icon.png"
SIZE = 180
LOGO_RATIO = 0.70  # logo 占画布边长比例（横扁字标取偏大值，主屏上更有存在感）
C1 = (0, 184, 230)   # #00b8e6
C2 = (124, 92, 255)  # #7c5cff


def load_logo():
    """裁切到不透明区域 bbox，logo 反白（RGB 置白，保留 alpha）。"""
    im = Image.open(SRC).convert("RGBA")
    crop = im.crop(im.getbbox())
    white = Image.new("RGBA", crop.size, (255, 255, 255, 0))
    white.putalpha(crop.split()[3])
    return white


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient_canvas(size):
    img = Image.new("RGBA", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = min(1.0, max(0.0, (x + y) / (2 * size)))
            px[x, y] = lerp(C1, C2, t) + (255,)
    return img


def main():
    logo = load_logo()
    target = round(SIZE * LOGO_RATIO)
    scale = target / max(logo.size)
    lw, lh = max(1, round(logo.width * scale)), max(1, round(logo.height * scale))
    canvas = gradient_canvas(SIZE)
    canvas.alpha_composite(logo.resize((lw, lh), Image.LANCZOS), ((SIZE - lw) // 2, (SIZE - lh) // 2))
    canvas.save(OUT)
    print(f"  {OUT}: {SIZE}x{SIZE}  gradient bg + white logo {lw}x{lh}")


if __name__ == "__main__":
    main()

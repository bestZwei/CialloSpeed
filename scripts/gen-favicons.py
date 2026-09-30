"""从 public/favicon.png（透明底主图）生成各尺寸 favicon PNG。

做法：裁切到不透明区域 bounding box，等比 contain 到正方形画布并居中。
- 浏览器/PWA 图标（favicon-*、android-chrome-*）：透明背景，保留源图透明底。
- apple-touch-icon：iOS 主屏图标规范要求不透明，单独垫一层品牌渐变底（#00b8e6 -> #7c5cff），
  避免透明区域被渲染为黑色。
"""
from PIL import Image, ImageChops

SRC = "public/favicon.png"
C1 = (0, 184, 230)   # #00b8e6
C2 = (124, 92, 255)  # #7c5cff


def invert_rgb(im):
    """反相 RGB（保留 alpha），用于深色 logo 反白。"""
    r, g, b, a = im.split()
    inv = ImageChops.invert(Image.merge("RGB", (r, g, b)))
    return Image.merge("RGBA", (*inv.split(), a))


def load_crop():
    im = Image.open(SRC).convert("RGBA")
    w, h = im.size
    px = im.load()
    minx, miny, maxx, maxy = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > 30:
                if x < minx:
                    minx = x
                if x > maxx:
                    maxx = x
                if y < miny:
                    miny = y
                if y > maxy:
                    maxy = y
    return im.crop((minx, miny, maxx + 1, maxy + 1))


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient_canvas(size):
    """对角线渐变画布（135deg: 左上 C1 -> 右下 C2）。"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = min(1.0, max(0.0, (x + y) / (2 * size)))
            px[x, y] = lerp(C1, C2, t) + (255,)
    return img


def place(crop, size, background=False, pad=1.0):
    cw, ch = crop.size
    scale = size * pad / max(cw, ch)
    nw, nh = max(1, round(cw * scale)), max(1, round(ch * scale))
    resized = crop.resize((nw, nh), Image.LANCZOS)
    canvas = gradient_canvas(size) if background else Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(resized, ((size - nw) // 2, (size - nh) // 2), resized)
    return canvas


def main():
    crop = load_crop()
    crop_inv = invert_rgb(crop)  # 反白后的 logo（用于加底色场景）
    targets = {
        "public/favicon-16x16.png": (16, False, crop),
        "public/favicon-32x32.png": (32, False, crop),
        "public/favicon-48x48.png": (48, False, crop),
        "public/apple-touch-icon.png": (180, True, crop_inv, 0.80),
        "public/android-chrome-192x192.png": (192, False, crop),
        "public/android-chrome-512x512.png": (512, False, crop),
    }
    for path, (s, bg, c, *rest) in targets.items():
        pad = rest[0] if rest else 1.0
        place(c, s, bg, pad).save(path)
        print(f"  {path}: {s}x{s}  bg={'gradient' if bg else 'transparent'}  logo={'inverted' if bg else 'original'}")


if __name__ == "__main__":
    main()

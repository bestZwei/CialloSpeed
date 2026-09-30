"""从 public/favicon.png（透明底主图）生成各尺寸 favicon PNG。

做法：裁切到不透明区域 bounding box，等比 contain 到正方形画布（透明留白），
保留源图透明背景。输出 favicon-16/32、apple-touch-icon-180、android-chrome-192/512。
"""
from PIL import Image

SRC = "public/favicon.png"


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


def place(crop, size):
    cw, ch = crop.size
    scale = size / max(cw, ch)
    nw, nh = max(1, round(cw * scale)), max(1, round(ch * scale))
    resized = crop.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(resized, ((size - nw) // 2, (size - nh) // 2), resized)
    return canvas


def main():
    crop = load_crop()
    targets = {
        "public/favicon-16x16.png": 16,
        "public/favicon-32x32.png": 32,
        "public/apple-touch-icon.png": 180,
        "public/android-chrome-192x192.png": 192,
        "public/android-chrome-512x512.png": 512,
    }
    for path, s in targets.items():
        place(crop, s).save(path)
        print(f"  {path}: {s}x{s}")


if __name__ == "__main__":
    main()

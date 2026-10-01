"""从 public/ciallo-apple.png 生成全规格 favicon 套件。

输出：
- favicon.ico（32×32，单尺寸 ICO，兼容旧浏览器自动请求 /favicon.ico）
- favicon-16x16.png / 32x32 / 48x48（浏览器 <link> 用）
- favicon.png（512×512，通用备用）
- apple-touch-icon.png（180×180，iOS 主屏图标）
- android-chrome-192x192.png / 512x512（PWA 图标）

源图为带深色渐变底 + 反白 Ciallo 字标的成品 Apple 图标风格，
脚本直接按 LANCZOS 高质量缩放，不再额外绘制底色或反白。
"""

from PIL import Image
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "public" / "ciallo-apple.png"
OUT_DIR = ROOT / "public"

SIZES_PNG = {
    "favicon-16x16.png": 16,
    "favicon-32x32.png": 32,
    "favicon-48x48.png": 48,
    "favicon.png": 512,
    "apple-touch-icon.png": 180,
    "android-chrome-192x192.png": 192,
    "android-chrome-512x512.png": 512,
}


def main():
    if not SRC.exists():
        raise SystemExit(f"源图不存在：{SRC}")

    src = Image.open(SRC).convert("RGBA")
    print(f"源图：{src.size[0]}x{src.size[1]} {src.mode}")

    for name, size in SIZES_PNG.items():
        out = OUT_DIR / name
        im = src.resize((size, size), Image.Resampling.LANCZOS)
        # 保留源图 alpha；Apple/Android 图标不需要强制不透明
        im.save(out, "PNG", optimize=True)
        print(f"  {out.name}: {size}x{size}")

    # ICO：Pillow 原生仅支持单尺寸写入，选 32×32 作为 /favicon.ico 兜底
    ico = src.resize((32, 32), Image.Resampling.LANCZOS)
    ico_out = OUT_DIR / "favicon.ico"
    ico.save(ico_out, "ICO")
    print(f"  {ico_out.name}: 32x32")


if __name__ == "__main__":
    main()

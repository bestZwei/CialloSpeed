#!/usr/bin/env python3
"""从 public/favicon.png（正方形母版）生成各标准尺寸 logo。

输出文件（public/）：
  favicon-16x16.png / favicon-32x32.png / favicon-48x48.png
  apple-touch-icon.png (180)
  android-chrome-192x192.png / android-chrome-512x512.png
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, "public")
SRC = os.path.join(PUB, "favicon.png")

img = Image.open(SRC).convert("RGBA")
print("源图尺寸:", img.size)

targets = {
    16: "favicon-16x16.png",
    32: "favicon-32x32.png",
    48: "favicon-48x48.png",
    180: "apple-touch-icon.png",
    192: "android-chrome-192x192.png",
    512: "android-chrome-512x512.png",
}

for size, name in targets.items():
    out = img.resize((size, size), Image.LANCZOS)
    out.save(os.path.join(PUB, name), "PNG", optimize=True)
    print("生成:", name, out.size)

#!/usr/bin/env python3
"""从 Canva 导出的 favicon.svg 中提取内嵌 PNG，生成各标准尺寸 logo（等比 contain + 透明留白居中）。

输出文件（public/）：
  favicon-16x16.png / favicon-32x32.png / favicon-48x48.png
  apple-touch-icon.png (180)
  android-chrome-192x192.png / android-chrome-512x512.png
  favicon.svg  -> 精简版（仅保留设计，去掉 Canva C2PA 签名元数据）
"""
import base64
import io
import re
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, "public")
SRC = os.path.join(PUB, "favicon.svg")

with open(SRC, "r", encoding="utf-8") as f:
    svg = f.read()

m = re.search(r'data:image/png;base64,([A-Za-z0-9+/=]+)', svg)
assert m, "未找到内嵌 PNG"
img = Image.open(io.BytesIO(base64.b64decode(m.group(1)))).convert("RGBA")
print("源 PNG 尺寸:", img.size)

targets = {
    16: "favicon-16x16.png",
    32: "favicon-32x32.png",
    48: "favicon-48x48.png",
    180: "apple-touch-icon.png",
    192: "android-chrome-192x192.png",
    512: "android-chrome-512x512.png",
}

# 先用 LANCZOS 缩到 512 基准，保证缩小时质量；等比 contain 居中到正方形画布
base = img.resize((512, int(512 * img.size[1] / img.size[0])), Image.LANCZOS) \
    if img.size[0] >= img.size[1] else \
    img.resize((int(512 * img.size[0] / img.size[1]), 512), Image.LANCZOS)

for size, name in targets.items():
    side = min(base.size)
    cropped = base.crop(((base.size[0] - side) // 2, (base.size[1] - side) // 2,
                         (base.size[0] + side) // 2, (base.size[1] + side) // 2))
    out = cropped.resize((size, size), Image.LANCZOS)
    out.save(os.path.join(PUB, name), "PNG", optimize=True)
    print("生成:", name, out.size)

# 精简 favicon.svg：去掉 C2PA 签名块的庞杂元数据
clean = re.sub(r"<metadata>.*?</metadata>", "<metadata>Stripped Canva C2PA by gen-favicons.py</metadata>", svg, flags=re.S)
with open(os.path.join(PUB, "favicon.svg"), "w", encoding="utf-8") as f:
    f.write(clean)
print("精简 favicon.svg 完成")

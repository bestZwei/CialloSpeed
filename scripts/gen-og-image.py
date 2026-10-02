"""生成社交分享图 public/og-image.png（1200×630，Open Graph / Twitter 标准尺寸）。

设计语言与站点一致：深蓝黑底 + 青→紫品牌渐变 + 反白 Ciallo 字标。
字标直接复用 Ciallo-mark-invert.png（深色版反白），只额外绘制 "Speed"。

依赖系统字体（Windows）；找不到时按字体链回退。
手动运行：`python scripts/gen-og-image.py`，改动品牌色或文案后重新生成并提交产物。
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
ASSETS = ROOT / "assets-src"
OUT = PUBLIC / "og-image.png"

W, H = 1200, 630

BG = (11, 16, 26)          # --bg (dark)
SURFACE = (20, 28, 41)     # --surface
LINE = (34, 48, 69)        # --line
TEXT = (230, 242, 255)     # --text (dark)
MUTED = (148, 168, 196)
BRAND_1 = (0, 184, 230)    # --brand-1
BRAND_2 = (124, 92, 255)   # --brand-2
BRAND_3 = (51, 214, 255)   # --brand-3（渐变文字起点）
BRAND_4 = (192, 132, 252)  # 渐变文字终点

# 同时覆盖中文与拉丁字形，优先雅黑
FONT_CHAIN = [
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\arialbd.ttf",
    r"/System/Library/Fonts/PingFang.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CHAIN:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    raise SystemExit("未找到可用字体，请检查 FONT_CHAIN")


def radial_glow(base: Image.Image, cx: int, cy: int, radius: int, color, alpha: int) -> None:
    """在 base 上叠加一层柔和径向光斑（单独画圆后高斯模糊，避免硬边）。"""
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=(*color, alpha))
    layer = layer.filter(ImageFilter.GaussianBlur(radius * 0.55))
    base.alpha_composite(layer)


def gradient_text(
    base: Image.Image,
    xy: tuple[int, int],
    text: str,
    font: ImageFont.FreeTypeFont,
    colors=(BRAND_3, BRAND_2, BRAND_4),
) -> int:
    """按水平渐变填充文字，返回文字宽度。"""
    bbox = font.getbbox(text)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    if tw <= 0 or th <= 0:
        return 0

    mask = Image.new("L", (tw, th), 0)
    ImageDraw.Draw(mask).text((-bbox[0], -bbox[1]), text, font=font, fill=255)

    strip = Image.new("RGBA", (tw, th))
    sdraw = ImageDraw.Draw(strip)
    for x in range(tw):
        ratio = x / max(tw - 1, 1)
        pos = ratio * (len(colors) - 1)
        i = min(int(pos), len(colors) - 2)
        t = pos - i
        c0, c1 = colors[i], colors[i + 1]
        sdraw.line(
            [(x, 0), (x, th)],
            fill=tuple(round(c0[k] + (c1[k] - c0[k]) * t) for k in range(3)) + (255,),
        )

    base.paste(strip, (xy[0], xy[1]), mask)
    return tw


def solid_text(
    base: Image.Image,
    xy: tuple[int, int],
    text: str,
    font: ImageFont.FreeTypeFont,
    color,
) -> int:
    ImageDraw.Draw(base).text(xy, text, font=font, fill=color)
    bbox = font.getbbox(text)
    return bbox[2] - bbox[0]


def chip(base: Image.Image, x: int, y: int, text: str, font, pad_x: int = 26) -> int:
    """软底胶囊标签，返回下一个 x。"""
    bbox = font.getbbox(text)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    w = tw + pad_x * 2
    h = 58
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).rounded_rectangle(
        [x, y, x + w, y + h], radius=h // 2, fill=(*BRAND_1, 26), outline=(*LINE, 255), width=2
    )
    base.alpha_composite(layer)
    ImageDraw.Draw(base).text((x + pad_x - bbox[0], y + (h - th) // 2 - bbox[1]), text, font=font, fill=TEXT)
    return x + w + 18


def main() -> None:
    src_mark = ASSETS / "Ciallo-mark-invert.png"
    if not src_mark.exists():
        raise SystemExit(f"缺少字标源图：{src_mark}")

    canvas = Image.new("RGBA", (W, H), (*BG, 255))
    radial_glow(canvas, 150, 90, 460, BRAND_1, 40)
    radial_glow(canvas, 1080, 580, 480, BRAND_2, 38)

    # 内描边面板，给分享图一个稳定的视觉边界
    frame = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(frame).rounded_rectangle(
        [44, 44, W - 44, H - 44], radius=30, fill=(*SURFACE, 70), outline=(*LINE, 255), width=2
    )
    canvas.alpha_composite(frame)

    M = 96
    y = 100

    # 品牌行：反白 Ciallo 字标 + 渐变 Speed
    mark = Image.open(src_mark).convert("RGBA")
    mark_h = 58
    mark_w = round(mark.width * mark_h / mark.height)
    canvas.alpha_composite(mark.resize((mark_w, mark_h), Image.Resampling.LANCZOS), (M, y))

    f_brand = load_font(64)
    speed_w = gradient_text(canvas, (M + mark_w + 14, y - 10), "Speed", f_brand)
    solid_text(
        canvas,
        (M + mark_w + speed_w + 26, y + 12),
        "·  免费在线网速测试",
        load_font(30),
        MUTED,
    )

    # 主标题
    f_title = load_font(84)
    title_y = 236
    gradient_text(canvas, (M, title_y), "真实网速，一次测准", f_title)

    f_sub = load_font(32)
    solid_text(canvas, (M, title_y + 116), "7 大测速引擎交叉验证 · 结果只存在你的浏览器里", f_sub, MUTED)

    # 指标胶囊
    f_chip = load_font(27)
    cx = M
    for label in ("下载 Download", "上传 Upload", "延迟 Latency", "抖动 Jitter"):
        cx = chip(canvas, cx, 480, label, f_chip)

    # 右侧仪表环：呼应首屏测速表盘
    ring = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    rd = ImageDraw.Draw(ring)
    rx, ry, rr = 1018, 318, 132
    rd.ellipse([rx - rr, ry - rr, rx + rr, ry + rr], outline=(*LINE, 255), width=16)
    rd.arc([rx - rr, ry - rr, rx + rr, ry + rr], start=120, end=420, fill=(*BRAND_3, 255), width=16)
    rd.arc([rx - rr + 28, ry - rr + 28, rx + rr - 28, ry + rr - 28], start=120, end=330, fill=(*BRAND_2, 200), width=10)
    canvas.alpha_composite(ring)
    solid_text(canvas, (rx - 52, ry - 52), "10+", load_font(64), TEXT)
    solid_text(canvas, (rx - 56, ry + 24), "Gbps", load_font(34), BRAND_3)

    canvas.convert("RGB").save(OUT, "PNG", optimize=True)
    print(f"已生成 {OUT}  {W}x{H}")


if __name__ == "__main__":
    main()

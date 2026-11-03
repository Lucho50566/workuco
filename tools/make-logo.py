"""Genera los assets de marca de Workuco desde el logo original (JPG)."""
from PIL import Image, ImageDraw
import os

SRC = r"C:\Users\ezequ\.openclaw\media\inbound\d35001ee-8317-4352-b285-792f9e76450b.jpg"
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public")
os.makedirs(OUT, exist_ok=True)

im = Image.open(SRC).convert("RGB")
W, H = im.size

# Regiones detectadas en la inspección (con margen)
ICON_BOX = (440, 142, 836, 468)
FULL_BOX = (148, 142, 1130, 664)

def to_rgba(img):
    """Convierte fondo blanco en transparencia y quita el halo blanco (unmatte)."""
    img = img.convert("RGB")
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    src = img.load()
    dst = out.load()
    DARK = 12.0  # valor mínimo esperado en el logo (verde/navy)
    for y in range(img.height):
        for x in range(img.width):
            r, g, b = src[x, y]
            mn = min(r, g, b)
            a = (255.0 - mn) / (255.0 - DARK)
            a = max(0.0, min(1.0, a))
            if a <= 0.02:
                dst[x, y] = (0, 0, 0, 0)
                continue
            # deshacer la mezcla con blanco: C = a*F + (1-a)*255
            fr = (r - 255.0 * (1 - a)) / a
            fg = (g - 255.0 * (1 - a)) / a
            fb = (b - 255.0 * (1 - a)) / a
            dst[x, y] = (
                max(0, min(255, int(round(fr)))),
                max(0, min(255, int(round(fg)))),
                max(0, min(255, int(round(fb)))),
                max(0, min(255, int(round(a * 255)))),
            )
    return out

def trim(img, pad=8):
    bbox = img.getbbox()
    if not bbox:
        return img
    l, t, r, b = bbox
    l = max(0, l - pad); t = max(0, t - pad)
    r = min(img.width, r + pad); b = min(img.height, b + pad)
    return img.crop((l, t, r, b))

icon = trim(to_rgba(im.crop(ICON_BOX)), 6)
full = trim(to_rgba(im.crop(FULL_BOX)), 10)

# Icono cuadrado con aire
side = max(icon.width, icon.height)
icon_sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
icon_sq.paste(icon, ((side - icon.width) // 2, (side - icon.height) // 2), icon)
icon_sq.resize((160, 160), Image.LANCZOS).save(os.path.join(OUT, "logo-icon.png"))

full.resize((600, round(600 * full.height / full.width)), Image.LANCZOS).save(os.path.join(OUT, "logo-full.png"))

def on_tile(size, radius_ratio=0.22, bg=(255, 255, 255, 255)):
    tile = Image.new("RGBA", (size, size), bg)
    inner = icon_sq.resize((int(size * 0.78), int(size * 0.78)), Image.LANCZOS)
    tile.paste(inner, ((size - inner.width) // 2, (size - inner.height) // 2), inner)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * radius_ratio), fill=255)
    tile.putalpha(mask)
    return tile

on_tile(512).save(os.path.join(OUT, "icon-512.png"))
on_tile(192).save(os.path.join(OUT, "icon-192.png"))
on_tile(180).save(os.path.join(OUT, "apple-touch-icon.png"))
on_tile(64, 0.24).save(os.path.join(OUT, "favicon.png"))

print("logo-icon", icon_sq.size)
print("logo-full", full.size)
print("archivos:", sorted(f for f in os.listdir(OUT) if f.startswith(("logo", "icon", "apple", "favicon"))))

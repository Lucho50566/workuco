from PIL import Image
from collections import Counter
import sys, json

p = r"C:\Users\ezequ\.openclaw\media\inbound\d35001ee-8317-4352-b285-792f9e76450b.jpg"
im = Image.open(p).convert("RGB")
w, h = im.size
print("size", w, h)

px = list(im.getdata())
cnt = Counter(px)
print("top colors:")
for c, n in cnt.most_common(8):
    print("  #%02X%02X%02X" % c, n)

bg = cnt.most_common(1)[0][0]
print("bg", "#%02X%02X%02X" % bg)

def ink(c, thr=40):
    return abs(c[0]-bg[0]) + abs(c[1]-bg[1]) + abs(c[2]-bg[2]) > thr

rows = []
for y in range(h):
    n = sum(1 for x in range(0, w, 2) if ink(im.getpixel((x, y))))
    rows.append(n)

# find bands of content
bands = []
inside = False
for y, n in enumerate(rows):
    if n > 1 and not inside:
        start = y; inside = True
    elif n <= 1 and inside:
        bands.append((start, y-1)); inside = False
if inside: bands.append((start, h-1))
print("row bands:", bands)

for (a, b) in bands:
    cols = []
    for x in range(w):
        c = sum(1 for y in range(a, b+1, 2) if ink(im.getpixel((x, y))))
        cols.append(c)
    xs = [x for x, c in enumerate(cols) if c > 0]
    print(" band", a, b, "x", (min(xs), max(xs)) if xs else None, "height", b-a+1)

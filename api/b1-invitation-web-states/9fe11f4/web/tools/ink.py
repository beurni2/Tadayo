import sys, subprocess
from PIL import Image
def runs(path):
    im = Image.open(path).convert("RGB").resize((393, 852), Image.LANCZOS)
    bg = im.getpixel((5, 5))
    w, h = im.size
    rows = []
    for y in range(h):
        ink = any(sum(abs(a - b) for a, b in zip(im.getpixel((x, y)), bg)) > 60 for x in range(20, 373))
        rows.append(ink)
    out, start = [], None
    for y, ink in enumerate(rows + [False]):
        if ink and start is None: start = y
        if not ink and start is not None: out.append((start, y - 1)); start = None
    return out
a, b = sys.argv[1], sys.argv[2]
ra, rb = runs(a), runs(b)
print("frame:", ra)
print("page: ", rb)

import numpy as np
from PIL import Image, ImageDraw
F = np.load("frames.npy", mmap_mode="r"); solid = np.load("solid.npy")
nx, ny = solid.shape; cx, cy, r = nx // 6, ny // 2, ny // 10
POS = np.array([255, 226, 122]); NEG = np.array([200, 240, 255])
N = 512
h = 68                                    # half height of the crop (lattice units)
xa, xb = cx - int(2.2 * r), cx - int(2.2 * r) + 2 * h
v = np.array(F[63])[xa:xb, cy - h:cy + h].T[::-1]
a = np.clip(np.abs(v) / 0.022, 0, 1) ** 0.6
col = np.where(v[..., None] > 0, POS, NEG)
flow = Image.fromarray(np.dstack([col, 255 * a]).astype(np.uint8), "RGBA").resize((N, N), Image.BICUBIC)
# blue gradient (same as the navbar and banner), rounded square
t = (np.add.outer(np.arange(N), np.arange(N)) / (2 * N - 2))[..., None]
c0, c1 = np.array([31, 95, 168]), np.array([41, 128, 212])
bg = Image.fromarray(np.dstack([c0 + (c1 - c0) * t, np.full((N, N, 1), 255)]).astype(np.uint8), "RGBA")
img = Image.alpha_composite(bg, flow)
d = ImageDraw.Draw(img)
s = N / (2 * h); X, Y, R = (cx - xa) * s, h * s, r * s
d.ellipse([X - 1.12*R, Y - 1.12*R, X + 1.12*R, Y + 1.12*R], fill=(255, 255, 255, 255))
mask = Image.new("L", (N, N), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, N - 1, N - 1], radius=N // 5, fill=255)
img.putalpha(mask)
img.save("logo.png")
img.resize((64, 64), Image.LANCZOS).save("logo64.png")

"""Renders the vortex street as opaque frames on the banner colour, for an H.264 video."""
import numpy as np, os
from PIL import Image, ImageDraw
F = np.load("frames.npy", mmap_mode="r"); solid = np.load("solid.npy")
nx, ny = solid.shape; cx, cy, r = nx // 6, ny // 2, ny // 10
POS = np.array([255, 226, 122.]); NEG = np.array([200, 240, 255.]); BG = np.array([41, 128, 212.])
S, W = 2, 400
x0 = cx - 3 * r
os.makedirs("vframes", exist_ok=True)
# window: the vorticity fades out near the edges, so that they have exactly the colour BG
def ramp(n, a, b):
    s = np.linspace(0, 1, n); return np.clip(np.minimum(s / a, (1 - s) / b), 0, 1)
win = np.outer(ramp(ny, 0.18, 0.18), ramp(W, 0.03, 0.3))
for k, i in enumerate(range(63, 138)):
    v = np.array(F[i])[x0:x0 + W, :].T[::-1]
    a = np.clip((np.abs(v) - 0.0015) / 0.0205, 0, 1) ** 0.6   # soft threshold: no tint in the far field
    a = (a * win)[..., None]
    col = np.where(v[..., None] > 0, POS, NEG)
    img = Image.fromarray((BG * (1 - a) + col * a).astype(np.uint8), "RGB")
    img = img.resize((W * S, ny * S), Image.BICUBIC)
    X, Y, R = (cx - x0) * S, (ny - cy) * S, 1.12 * r * S
    ImageDraw.Draw(img).ellipse([X - R, Y - R, X + R, Y + R], fill=(255, 255, 255))
    img.save(f"vframes/{k:03d}.png")
    if k == 0: img.save("karman.jpg", quality=85)

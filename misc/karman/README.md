# Vortex street behind a cylinder (banner and logo)

D2Q9 lattice Boltzmann simulation, Re = 160.

```sh
python3 lbm.py      # simulation (~6 min): frames.npy, probe.npy, solid.npy
python3 video.py    # frames of two shedding periods in vframes/, poster karman.jpg
python3 logo.py     # logo.png (512 px; images/logo_karman.png is the 256 px version)
ffmpeg -framerate 16 -i vframes/%03d.png \
  -vf "scale=out_color_matrix=bt601:out_range=tv,format=yuv420p" \
  -c:v libx264 -preset veryslow -crf 18 -tune animation \
  -colorspace smpte170m -color_primaries smpte170m -color_trc smpte170m -color_range tv \
  -movflags +faststart -an karman.mp4
```

The video is opaque, on the colour #2980d4 of the banner.
BT.601 is used because browsers decode small videos with this matrix
(with BT.709, the background was visibly different from the banner in Chromium).

"""Draw a background image for a dashboard, in the colours it already uses.

A hero needs an image behind it, and stock photography brings a licence along with
it. This draws one instead: a globe graticule in the object's own colours, with a few
cells picked out, which reads as "a grid over the world" without claiming to be any
particular place. The result is a file like any other brand file, so it is uploaded to
ROHub with publish.py and replaced by replacing the resource.

    python scripts/background.py ../examples/brand/matchmaker/background.png \
        --from "#d0eef8" --to "#1d6886" --cell "#1dc690"

Colours default to the FAIR2Adapt palette: pale #d0eef8, teal #1d6886, green #1dc690.
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

#: cells of the graticule to pick out, as (meridian index, parallel index)
HIGHLIGHTS = ((3, 2), (6, 1), (8, 3), (11, 2))
MERIDIANS, PARALLELS = 14, 5


def rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def wash(size: tuple[int, int], start: tuple[int, int, int], end: tuple[int, int, int]) -> Image.Image:
    """A diagonal gradient from one colour to the other."""
    width, height = size
    image = Image.new("RGB", size)
    pixels = image.load()
    for x in range(width):
        for y in range(0, height, 4):
            t = (x / width) * 0.78 + (y / height) * 0.22
            colour = tuple(round(start[i] + (end[i] - start[i]) * t) for i in range(3))
            for dy in range(4):
                if y + dy < height:
                    pixels[x, y + dy] = colour
    return image


def point(lon: float, lat: float, box: tuple[float, float, float, float]) -> tuple[float, float]:
    """A longitude and latitude on an orthographic globe filling the box."""
    left, top, right, bottom = box
    cx, cy = (left + right) / 2, (top + bottom) / 2
    return (cx + (right - left) / 2 * math.sin(lon) * math.cos(lat),
            cy - (bottom - top) / 2 * math.sin(lat))


def draw_graticule(image: Image.Image, cell: tuple[int, int, int]) -> None:
    width, height = image.size
    box = (-width * 0.15, -height * 0.12, width * 1.15, height * 1.12)
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    pen = ImageDraw.Draw(layer)

    lons = [-math.pi / 2 + math.pi * i / (MERIDIANS - 1) for i in range(MERIDIANS)]
    lats = [-math.pi / 2 + math.pi * j / (PARALLELS + 1) for j in range(1, PARALLELS + 1)]

    for (i, j) in HIGHLIGHTS:                      # cells first, so the lines sit on top
        if i + 1 >= len(lons) or j + 1 >= len(lats):
            continue
        edge = []
        edge += [point(lons[i] + (lons[i + 1] - lons[i]) * k / 12, lats[j], box) for k in range(13)]
        edge += [point(lons[i + 1], lats[j] + (lats[j + 1] - lats[j]) * k / 12, box) for k in range(13)]
        edge += [point(lons[i + 1] - (lons[i + 1] - lons[i]) * k / 12, lats[j + 1], box) for k in range(13)]
        edge += [point(lons[i], lats[j + 1] - (lats[j + 1] - lats[j]) * k / 12, box) for k in range(13)]
        pen.polygon(edge, fill=cell + (95,))

    for lon in lons:                               # meridians
        pen.line([point(lon, -math.pi / 2 + math.pi * k / 120, box) for k in range(121)],
                 fill=(255, 255, 255, 120), width=2)
    for lat in lats:                               # parallels
        pen.line([point(-math.pi / 2 + math.pi * k / 120, lat, box) for k in range(121)],
                 fill=(255, 255, 255, 120), width=2)

    image.paste(Image.alpha_composite(image.convert("RGBA"), layer).convert("RGB"), (0, 0))


def main() -> int:
    parser = argparse.ArgumentParser(prog="background.py", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("out", type=Path, help="the image to write")
    parser.add_argument("--from", dest="start", default="#d0eef8", help="colour at the top left")
    parser.add_argument("--to", dest="end", default="#1d6886", help="colour at the bottom right")
    parser.add_argument("--cell", default="#1dc690", help="colour of the highlighted cells")
    parser.add_argument("--size", default="2000x1100", help="pixels, WIDTHxHEIGHT")
    args = parser.parse_args()

    width, height = (int(n) for n in args.size.lower().split("x"))
    image = wash((width, height), rgb(args.start), rgb(args.end))
    draw_graticule(image, rgb(args.cell))
    image = image.filter(ImageFilter.GaussianBlur(0.6))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    image.save(args.out, optimize=True)
    print("wrote", args.out, f"{width}x{height}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

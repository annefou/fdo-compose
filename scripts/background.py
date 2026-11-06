"""Draw a hero background for a dashboard, in the colours it already uses.

A hero needs an image behind it, and a stock photograph brings a licence along with
it. This draws one instead: a soft wash from the dashboard's pale colour through its
primary to its accent, with faint contour lines running across it, so the hero has
depth without competing with the words in front of it. The result is a brand file like
any other, uploaded with publish.py and changed by replacing the resource in ROHub.

    python scripts/background.py ../examples/brand/matchmaker/background.png
    python scripts/background.py ../examples/brand/x/background.png \
        --pale "#eaf6fb" --primary "#1d6886" --accent "#1dc690"

The defaults are the FAIR2Adapt palette. Text usually sits on the left, so the pale
colour is kept there and the saturated ones are pushed to the right.
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

#: blobs of colour, as (x, y, radius, colour name, strength); x and y are fractions
BLOBS = (
    (1.05, 0.95, 0.95, "deep", 1.00),
    (0.85, 0.20, 0.70, "primary", 0.95),
    (0.55, 0.85, 0.55, "primary", 0.70),
    (0.95, 0.55, 0.40, "accent", 0.55),
    (0.15, 0.10, 0.60, "pale", 1.00),
)
LINES = 26          #: contour lines drawn across the wash
LINE_ALPHA = 46     #: how faint each one is


def rgb(value: str) -> np.ndarray:
    value = value.lstrip("#")
    return np.array([int(value[i:i + 2], 16) for i in (0, 2, 4)], dtype=float)


def darker(colour: np.ndarray, by: float = 0.62) -> np.ndarray:
    return colour * by


def wash(size: tuple[int, int], palette: dict[str, np.ndarray]) -> Image.Image:
    """Soft blobs of the palette's colours, melted into one another."""
    width, height = size
    rows, columns = np.mgrid[0:height, 0:width]
    u, v = columns / width, rows / height
    image = np.ones((height, width, 3)) * palette["pale"]
    for cx, cy, radius, name, strength in BLOBS:
        distance = np.sqrt((u - cx) ** 2 + ((v - cy) * (height / width)) ** 2)
        weight = (np.clip(1 - (distance / radius) ** 2, 0, 1) ** 1.5 * strength)[..., None]
        image = image * (1 - weight) + palette[name] * weight
    return Image.fromarray(image.clip(0, 255).astype("uint8")).filter(ImageFilter.GaussianBlur(14))


def contours(image: Image.Image) -> Image.Image:
    """Faint lines running left to right, the way a contour map reads."""
    width, height = image.size
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    pen = ImageDraw.Draw(layer)
    spacing = (height + 400) / LINES
    for k in range(LINES):
        start = -200 + k * spacing
        points = [(x, start
                   + 0.136 * height * math.sin(x / width * 2.2 + k * 0.21)
                   + 0.064 * height * math.sin(x / width * 5.1 + k * 0.6)
                   + k * 8 * x / width)
                  for x in range(0, width + 20, 20)]
        pen.line(points, fill=(255, 255, 255, LINE_ALPHA), width=2)
    return Image.alpha_composite(image.convert("RGBA"), layer).convert("RGB")


def main() -> int:
    parser = argparse.ArgumentParser(prog="background.py", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("out", type=Path, help="the image to write")
    parser.add_argument("--pale", default="#eaf6fb", help="the colour behind the words")
    parser.add_argument("--primary", default="#1d6886", help="the dashboard's primary colour")
    parser.add_argument("--accent", default="#1dc690", help="the dashboard's accent colour")
    parser.add_argument("--size", default="2000x1100", help="pixels, WIDTHxHEIGHT")
    args = parser.parse_args()

    width, height = (int(n) for n in args.size.lower().split("x"))
    primary = rgb(args.primary)
    palette = {"pale": rgb(args.pale), "primary": primary,
               "accent": rgb(args.accent), "deep": darker(primary)}
    image = contours(wash((width, height), palette)).filter(ImageFilter.GaussianBlur(0.4))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    image.save(args.out, quality=90, optimize=True)
    print("wrote", args.out, f"{width}x{height}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

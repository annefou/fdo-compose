#!/bin/sh
# The images these dashboards use are other people's work, so they are fetched rather than
# copied into this repository. Run this before publishing an example that carries a brand.
set -eu
cd "$(dirname "$0")"

# Portugal: the CS4 prototype's own assets (FAIR2Adapt/fdo-knowledge-dashboard, MIT)
base=https://raw.githubusercontent.com/FAIR2Adapt/fdo-knowledge-dashboard/main/web/assets
curl -sL -o portugal/background.png "$base/portugal-landscape.png"
curl -sL -o portugal/logo.png       "$base/icons/brand-symbol.png"
for p in ce3c fair2adapt adaptation-hubs; do
  curl -sL -o "portugal/partner-$p.png" "$base/icons/partner-$p.png"
done

# LifeWatch: the LifeWatch ERIC logo, and a forest photo free to use under the Unsplash Licence
# (Kristaps Ungurs, https://unsplash.com/photos/owcJsiIK7UU)
curl -sL -o lifewatch/logo.png \
  https://raw.githubusercontent.com/sciencelivehub/sciencelivehub.github.io/main/static/assets/img/lifewatch-eric-logo.png
curl -sL -o lifewatch/background.png \
  "https://images.unsplash.com/photo-1759681770982-313332e7f42c?fm=jpg&q=70&w=2000&auto=format&fit=crop"
cp portugal/partner-fair2adapt.png lifewatch/partner-fair2adapt.png

# Matchmaker: EOSC and FAIR2Adapt cut from the lockup used on the forum one-pagers, the EU
# emblem beside them, and the official EU Missions "Adaptation to Climate Change" logo. The
# published file is the negative version, white lettering for a dark background, so the
# lettering above the green band is set in black for a white footer; nothing else is touched.
sheet=../../../FAIR2Adapt/forum-2026/assets
curl -sL -o matchmaker/mission-negative.png \
  "https://climaax.eu/wp-content/uploads/2023/03/EU-Missions-ATCC-v1.png"
python3 - "$sheet" <<'PY'
import sys
from PIL import Image
import numpy as np

sheet = sys.argv[1]
logos = Image.open(f"{sheet}/logos.png").convert("RGBA")       # EOSC | FAIR2Adapt lockup
def trim(image, path):
    """Crop away the margin, whether it is transparent or white."""
    pixels = np.array(image).astype(int)
    ink = (pixels[..., 3] > 8) & (pixels[..., :3].sum(axis=2) < 720)
    rows, columns = np.where(ink)
    image.crop((columns.min(), rows.min(), columns.max() + 1, rows.max() + 1)).save(path, optimize=True)
trim(logos.crop((0, 0, 716, logos.height)), "matchmaker/partner-eosc.png")
trim(logos.crop((728, 0, logos.width, logos.height)), "matchmaker/partner-fair2adapt.png")
trim(Image.open(f"{sheet}/eu.png").convert("RGBA"), "matchmaker/partner-eu.png")

mission = np.array(Image.open("matchmaker/mission-negative.png").convert("RGBA")).astype(int)
r, g, b, alpha = (mission[..., i] for i in range(4))
above_band = np.arange(alpha.shape[0])[:, None].repeat(alpha.shape[1], 1) < 585
white = (alpha > 40) & (r > 190) & (g > 190) & (b > 190) & above_band
for channel in range(3):
    mission[..., channel] = np.where(white, 26, mission[..., channel])
positive = Image.fromarray(mission.astype("uint8"), "RGBA")
positive.thumbnail((900, 900))
trim(positive, "matchmaker/partner-mission-adaptation.png")
PY
rm -f matchmaker/mission-negative.png

# Matchmaker: rolling hills in soft light, free to use under the Unsplash Licence
# (Firli S, https://unsplash.com/photos/rolling-green-hills-under-a-soft-light--psmFP4VC8A)
curl -sL -o matchmaker/background.jpg \
  "https://images.unsplash.com/photo-1774816069888-736d818d349d?fm=jpg&q=75&w=2400&auto=format&fit=crop"
rm -f matchmaker/background.png

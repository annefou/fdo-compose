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
cp lifewatch/background.png matchmaker/background.png
cp portugal/partner-fair2adapt.png lifewatch/partner-fair2adapt.png

#!/bin/bash
# Makes the Google Play phone screenshots from a walkthrough run.
#
#   android/scripts/store-screenshots.sh [walkthrough folder]
#
# The emulator's screen is 1080 x 2400 and the store set is 1080 x 1920 (9:16). Each picture keeps its top, and
# a strip from its bottom when something is pinned there (the tab bar, or the buttons under a recall question),
# so it shows what a shorter phone would. Needs ImageMagick. Run android/scripts/walkthrough.sh first.
set -euo pipefail
cd "$(dirname "$0")/.."
IN="${1:-$PWD/build/walkthrough}"
OUT="fastlane/metadata/android/en-US/images/phoneScreenshots"
TABS=190 # the tab bar and the gesture area under it

# You is left out on purpose: it shows the username the walkthrough logged in with, and this repository is public.
# store name | walkthrough name, or several to try in turn | height of the strip kept from the bottom | height kept from the top
# The last column is for a picture whose two parts only meet cleanly at a gap between elements: the top ends
# there, and its last row of plain background is repeated to make up the height.
SHOTS="
01-today|today|$TABS
02-recall-verdict|recall-verdict-right|190
03-recall-done|recall-done|700
04-today-done|today-recall-done|$TABS
05-city|city-map|1175|700
06-question|question|$TABS
07-building-picker|building-picker-chosen|0
08-library|library|$TABS
09-learning-path|library-path,library-course-leads-to,library-course-take-these-first|$TABS
10-stats|stats-streak|$TABS
"

rm -f "$OUT"/*.png
for line in $SHOTS; do
  IFS='|' read -r name shot keep top <<< "$line"
  top="${top:-$((1920 - keep))}"
  source=""
  for candidate in ${shot//,/ }; do
    source=$(ls "$IN"/[0-9][0-9]-"$candidate".png 2>/dev/null | head -1 || true)
    [ -n "$source" ] && break
  done
  if [ -z "$source" ]; then echo "No \"$shot\" picture in $IN, so $name is left out."; continue; fi
  if [ "$keep" = 0 ]; then
    magick "$source" -gravity north -crop 1080x1920+0+0 +repage "$OUT/$name.png"
  else
    magick \( "$source" -gravity north -crop "1080x${top}+0+0" +repage \) \
           \( "$source" -crop "1080x1+0+$((top - 1))" +repage -scale "1080x$((1920 - top - keep + 1))!" \) \
           \( "$source" -gravity south -crop "1080x${keep}+0+0" +repage \) -append -crop 1080x1920+0+0 +repage "$OUT/$name.png"
  fi
done
ls "$OUT"

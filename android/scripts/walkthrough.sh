#!/bin/bash
# Runs the UI walkthrough on a running emulator or device and saves a screenshot of every screen.
#
#   CS_USER=<username> CS_PW=<password> android/scripts/walkthrough.sh [output folder]
#
# Optional: CS_BASE_URL (a Worker other than https://coursesmash.app; http://10.0.2.2:8787 is a
# `wrangler dev` on this computer, seen from the emulator), CS_LIBRARY_COURSE (the library course
# to start) and CS_QUICK=1 (stop after login, home and the city).
# The login is only passed to the test. It is not written anywhere.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${CS_USER:?Set CS_USER}" "${CS_PW:?Set CS_PW}"
OUT="${1:-$PWD/build/walkthrough}"
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
APP=app.coursesmash.android
mkdir -p "$OUT"

./gradlew -q :app:installDebug :app:installDebugAndroidTest

# A clean status bar: 9:41, full battery and signal.
"$ADB" shell settings put global sysui_demo_allowed 1
demo() { "$ADB" shell am broadcast -a com.android.systemui.demo "$@" >/dev/null; }
demo -e command enter
demo -e command clock -e hhmm 0941
demo -e command battery -e level 100 -e plugged false
demo -e command network -e wifi show -e level 4 -e mobile show -e datatype none -e level 4
demo -e command notifications -e visible false

ARGS=(-e class "$APP.WalkthroughTest" -e csUser "$CS_USER" -e csPw "$CS_PW")
[ -n "${CS_BASE_URL:-}" ] && ARGS+=(-e csBaseUrl "$CS_BASE_URL")
[ -n "${CS_LIBRARY_COURSE:-}" ] && ARGS+=(-e csLibraryCourse "$CS_LIBRARY_COURSE")
[ -n "${CS_QUICK:-}" ] && ARGS+=(-e csQuick "$CS_QUICK")
RESULT=$("$ADB" shell am instrument -w "${ARGS[@]}" "$APP.test/androidx.test.runner.AndroidJUnitRunner" | tr -d '\r')
demo -e command exit

# Screenshots are in the app's private files, which a debug build lets adb read.
"$ADB" exec-out run-as "$APP" tar c -C files walkthrough | tar x -C "$OUT" --strip-components 1
echo "$RESULT" | grep -vE "^$" | tail -12
echo "Screenshots are in $OUT"
echo "$RESULT" | grep -q "^OK (" || exit 1

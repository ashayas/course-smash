#!/bin/bash
# Runs the UI walkthrough in the simulator and saves a screenshot of every screen.
#
#   CS_USER=<username> CS_PW=<password> ios/scripts/walkthrough.sh [output folder]
#
# Optional: CS_BASE_URL (a Worker other than https://coursesmash.app, such as http://localhost:8787),
# CS_DEVICE (default "iPhone 16 Pro Max", whose 1320 x 2868 screenshots are the size the App Store asks for)
# CS_LIBRARY_COURSE (the library course to start) and CS_QUICK=1 (stop after login, home and the city).
# The login is only passed to the test runner. It is not written anywhere.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${CS_USER:?Set CS_USER}" "${CS_PW:?Set CS_PW}"
OUT="${1:-$PWD/build/walkthrough}"
DEVICE="${CS_DEVICE:-iPhone 16 Pro Max}"
mkdir -p "$OUT"
command -v xcodegen >/dev/null && xcodegen generate --quiet

# A clean status bar: 9:41, full battery and signal.
xcrun simctl boot "$DEVICE" 2>/dev/null || true
xcrun simctl bootstatus "$DEVICE" -b >/dev/null
xcrun simctl status_bar "$DEVICE" override --time "9:41" --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3 --dataNetwork wifi

export TEST_RUNNER_CS_USER="$CS_USER" TEST_RUNNER_CS_PW="$CS_PW" TEST_RUNNER_CS_SHOTS="$OUT"
[ -n "${CS_BASE_URL:-}" ] && export TEST_RUNNER_CS_BASE_URL="$CS_BASE_URL"
[ -n "${CS_LIBRARY_COURSE:-}" ] && export TEST_RUNNER_CS_LIBRARY_COURSE="$CS_LIBRARY_COURSE"
[ -n "${CS_MOTION:-}" ] && export TEST_RUNNER_CS_MOTION="$CS_MOTION"
[ -n "${CS_QUICK:-}" ] && export TEST_RUNNER_CS_QUICK="$CS_QUICK"
xcodebuild test -project CourseSmash.xcodeproj -scheme CourseSmash \
  -destination "platform=iOS Simulator,name=$DEVICE" -derivedDataPath build \
  -only-testing:CourseSmashUITests/WalkthroughTests/testWalkthrough ${CS_XCODEBUILD_FLAGS:--quiet}
echo "Screenshots are in $OUT"

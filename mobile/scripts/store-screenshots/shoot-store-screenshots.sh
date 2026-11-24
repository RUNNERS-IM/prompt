#!/bin/bash
# Shoot the phone app's store screenshots in every store language on iPhone, iPad and Android.
#
# Usage:
#   shoot-store-screenshots.sh --ios-app <Prompt.app for the simulator> --android-apk <universal.apk> \
#     --desktop-cli <desktop Prompt.app>/Contents/Resources/bin/prompt --out <folder> \
#     [--langs "ar de en ..."] [--devices "ios-phone ios-ipad android-phone"]
#
# Output: <out>/<lang>/<device>/01-terminal.png 02-changes.png 03-diff.png 04-first.png
# (the iPad has no 04-first). tl has no phone translation, so it gets the English pictures.
#
# What it does:
#   1. Makes a small demo repository (sample-web) with one changed line in src/sum.js.
#   2. Starts a headless desktop runtime with an empty profile and a pairing code, adds the demo
#      as a project and runs `git diff --stat && npm test` in a terminal there.
#   3. Per device: installs the app, light appearance, clean status bar (9:41, full bars,
#      full battery), shoots the first screen in every language before pairing, pairs once, then
#      per language relaunches the app in that language and shoots the terminal, the source
#      control list and the diff of src/sum.js.
#
# Needs: Xcode simulators, the Android emulator already booted (adb), AXe on PATH for iOS taps
# (unsigned AXe builds must be ad-hoc signed first), python3. Run it through heavy-run.
# Sizes match the store raws: iPhone 6.9" 1320x2868, iPad 13" 2064x2752, Android 1080x2400.
set -u

HERE=$(cd "$(dirname "$0")" && pwd)
TAP="python3 $HERE/ui_tap.py"
BUNDLE=im.runners.prompt.mobile
LANGS="ar de en es fr hi id it ja ko nl pl pt ru th tl vi zh"
DEVICES="ios-phone ios-ipad android-phone"
IPHONE_NAME=${IPHONE_NAME:-iPhone 17 Pro Max}
IPAD_NAME=${IPAD_NAME:-iPad Pro 13-inch (M5)}
IOS_APP='' ANDROID_APK='' DESKTOP_CLI='' OUT=''
while [ $# -gt 0 ]; do
  case $1 in
    --ios-app) IOS_APP=$2; shift 2 ;;
    --android-apk) ANDROID_APK=$2; shift 2 ;;
    --desktop-cli) DESKTOP_CLI=$2; shift 2 ;;
    --out) OUT=$2; shift 2 ;;
    --langs) LANGS=$2; shift 2 ;;
    --devices) DEVICES=$2; shift 2 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done
[ -n "$DESKTOP_CLI" ] && [ -n "$OUT" ] || { sed -n 2,8p "$0"; exit 2; }

# Store language -> phone app locale. tl is not translated; it is copied from en at the end.
app_locale() { case $1 in zh) echo zh-Hans ;; *) echo "$1" ;; esac; }
ios_region() { case $1 in zh) echo zh_CN ;; ar) echo ar_SA ;; en) echo en_US ;; pt) echo pt_BR ;; *) echo "${1}_$(echo "$1" | tr a-z A-Z)" ;; esac; }

WORK=$(mktemp -d "${TMPDIR:-/tmp}/prompt-store-shots.XXXXXX")
SERVE_PID=
cleanup() {
  [ -n "$SERVE_PID" ] && kill "$SERVE_PID" 2>/dev/null
  [ -n "${WORK:-}" ] && rm -rf "${WORK:?}"
}
trap cleanup EXIT

# --- 1. demo repository --------------------------------------------------------------
DEMO=$WORK/sample-web
mkdir -p "$DEMO/src"
cat > "$DEMO/package.json" <<'EOF'
{
  "name": "sample-web",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test",
    "start": "node src/server.js"
  }
}
EOF
echo 'export const sum = (...values) => values.reduce((total, value) => total + value, 0)' > "$DEMO/src/sum.js"
cat > "$DEMO/src/sum.test.js" <<'EOF'
import test from 'node:test'
import assert from 'node:assert/strict'
import { sum } from './sum.js'

test('adds numbers', () => assert.equal(sum(1, 2, 3), 6))
test('empty is zero', () => assert.equal(sum(), 0))
EOF
git -C "$DEMO" init -q -b main
git -C "$DEMO" add . && git -C "$DEMO" -c user.name=Demo -c user.email=demo@example.com commit -q -m "Initial"
echo 'export const average = (...values) => values.length ? sum(...values) / values.length : 0' >> "$DEMO/src/sum.js"

# --- 2. headless desktop runtime -------------------------------------------------------
PROFILE=$WORK/profile
mkdir -p "$PROFILE" "$WORK/zdot"
# Why: the store pictures show a short "sample-web %" prompt, not the shooting Mac's own.
echo "PROMPT='%1~ %# '" > "$WORK/zdot/.zshrc"
ADDRESS=$(ipconfig getifaddr en0 2>/dev/null || echo 127.0.0.1)
(cd "$DEMO" && ZDOTDIR=$WORK/zdot ORCA_USER_DATA_PATH=$PROFILE ORCA_BACKGROUND_LAUNCH=1 \
  "$DESKTOP_CLI" app serve --mobile-pairing --pairing-address "$ADDRESS" --project-root "$DEMO" --json \
  > "$WORK/serve.out" 2> "$WORK/serve.err" & echo $! > "$WORK/serve.pid")
SERVE_PID=$(cat "$WORK/serve.pid")
PAIR_URL=
for _ in $(seq 1 60); do
  PAIR_URL=$(python3 -c "
import json,sys
for line in open(sys.argv[1]):
    try: url=json.loads(line).get('pairing',{}).get('url')
    except Exception: url=None
    if url: print(url); break" "$WORK/serve.out" 2>/dev/null)
  [ -n "$PAIR_URL" ] && break
  sleep 1
done
[ -n "$PAIR_URL" ] || { echo "desktop runtime gave no pairing code"; cat "$WORK/serve.err"; exit 1; }
host_cli() { ZDOTDIR=$WORK/zdot ORCA_USER_DATA_PATH=$PROFILE "$DESKTOP_CLI" "$@"; }
host_cli project add "$DEMO" > /dev/null 2>&1
host_cli terminal create --workspace "path:$DEMO" --command 'git diff --stat && npm test' > /dev/null
sleep 5

# --- 3. per device ---------------------------------------------------------------------
sim_udid() { xcrun simctl list devices available -j | python3 -c "
import json,sys
name=sys.argv[1]
for runtime, devices in json.load(sys.stdin)['devices'].items():
    for d in devices:
        if d['name']==name: print(d['udid']); sys.exit()" "$1"; }

shot() { # <device> <lang> <name>
  local dir=$OUT/$2/$1; mkdir -p "$dir"
  if [ "$1" = android-phone ]; then adb exec-out screencap -p > "$dir/$3.png"
  else xcrun simctl io "$UDID" screenshot "$dir/$3.png" > /dev/null 2>&1; fi
  echo "$2/$1/$3.png $(sips -g pixelWidth -g pixelHeight "$dir/$3.png" 2>/dev/null | awk '/pixel/{printf "%s ", $2}')"
}

tap() { # <device> <text...>
  if [ "$1" = android-phone ]; then shift; $TAP android "$(adb get-serialno)" "$@"
  else shift; $TAP ios "$UDID" "$@"; fi
}

launch() { # <device> <lang>
  local locale; locale=$(app_locale "$2")
  if [ "$1" = android-phone ]; then
    adb shell am force-stop $BUNDLE
    adb shell cmd locale set-app-locales $BUNDLE --locales "$locale" > /dev/null
    adb shell am start -W -n $BUNDLE/.MainActivity > /dev/null
  else
    xcrun simctl launch --terminate-running-process "$UDID" $BUNDLE \
      -AppleLanguages "($locale)" -AppleLocale "$(ios_region "$2")" > /dev/null
  fi
  sleep 6
}

prepare() { # <device>
  if [ "$1" = android-phone ]; then
    adb uninstall $BUNDLE > /dev/null 2>&1; adb install "$ANDROID_APK" > /dev/null || return 1
    adb shell cmd uimode night no
    adb shell settings put global sysui_demo_allowed 1
    for args in "enter" "clock -e hhmm 0941" "battery -e level 100 -e plugged false" \
      "network -e wifi show -e level 4 -e mobile show -e datatype none -e level 4" \
      "notifications -e visible false"; do
      set -- $args; local cmd=$1; shift
      adb shell am broadcast -a com.android.systemui.demo -e command "$cmd" "$@" > /dev/null
    done
  else
    xcrun simctl boot "$UDID" 2> /dev/null; xcrun simctl bootstatus "$UDID" -b > /dev/null
    xcrun simctl ui "$UDID" appearance light
    xcrun simctl status_bar "$UDID" override --time 9:41 --dataNetwork wifi --wifiMode active \
      --wifiBars 3 --cellularMode active --cellularBars 4 --batteryState charged --batteryLevel 100
    xcrun simctl uninstall "$UDID" $BUNDLE 2> /dev/null; xcrun simctl install "$UDID" "$IOS_APP" || return 1
  fi
}

pair() { # <device>
  if [ "$1" = android-phone ]; then
    adb shell am start -W -a android.intent.action.VIEW -d "'$PAIR_URL'" $BUNDLE > /dev/null
  else
    xcrun simctl openurl "$UDID" "$PAIR_URL"
    tap "$1" Open --wait 8 > /dev/null # iOS asks once whether the link may open the app
  fi
  tap "$1" Pair || return 1
  # The two first-run questions; either may be skipped when already answered.
  tap "$1" 'Keep terminal' --wait 20
  tap "$1" 'Not now' --wait 8
  sleep 3
}

for DEVICE in $DEVICES; do
  case $DEVICE in
    ios-phone) UDID=$(sim_udid "$IPHONE_NAME") ;;
    ios-ipad) UDID=$(sim_udid "$IPAD_NAME") ;;
    android-phone) UDID= ;;
    *) echo "unknown device $DEVICE"; continue ;;
  esac
  if [ "$DEVICE" != android-phone ] && [ -z "$UDID" ]; then echo "no simulator for $DEVICE"; continue; fi
  prepare "$DEVICE" || { echo "install failed on $DEVICE"; continue; }
  if [ "$DEVICE" != ios-ipad ]; then
    for LANG_CODE in $LANGS; do
      [ "$LANG_CODE" = tl ] && continue
      launch "$DEVICE" "$LANG_CODE"; shot "$DEVICE" "$LANG_CODE" 04-first
    done
  fi
  launch "$DEVICE" en
  pair "$DEVICE" || { echo "pairing failed on $DEVICE"; continue; }
  for LANG_CODE in $LANGS; do
    [ "$LANG_CODE" = tl ] && continue
    locale=$(app_locale "$LANG_CODE")
    launch "$DEVICE" "$LANG_CODE"
    # Why both: a relaunch may open on the host's workspace list or already inside the workspace.
    tap "$DEVICE" sample-web main --wait 10 > /dev/null
    sleep 4; shot "$DEVICE" "$LANG_CODE" 01-terminal
    tap "$DEVICE" "$($TAP label "$locale" session.header.openSourceControl 'Open source control')" \
      && sleep 4 && shot "$DEVICE" "$LANG_CODE" 02-changes
    tap "$DEVICE" src/sum.js sum.js && sleep 4 && shot "$DEVICE" "$LANG_CODE" 03-diff
  done
  if [ "$DEVICE" = android-phone ]; then adb shell am broadcast -a com.android.systemui.demo -e command exit > /dev/null
  else xcrun simctl status_bar "$UDID" clear; fi
done

# tl has no phone translation; the store shows the English app for it.
case " $LANGS " in *" tl "*) [ -d "$OUT/en" ] && rm -rf "${OUT:?}/tl" && cp -R "$OUT/en" "$OUT/tl" ;; esac
echo "done: $OUT"

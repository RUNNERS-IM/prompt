#!/usr/bin/env python3
"""Tap a simulator or emulator element by its visible text or accessibility label.

Usage:
  ui_tap.py ios <udid> <text> [<text> ...] [--wait SECONDS]
  ui_tap.py android <serial> <text> [<text> ...] [--wait SECONDS]
  ui_tap.py label <locale> <key> <english fallback>

Several texts are tried in order; the first one found on screen is tapped. Exits 1 when none
appeared before the wait ran out. iOS reads the screen with AXe (`axe describe-ui`), Android with
`uiautomator dump`. The `label` form prints the phone app's translation for a key so the shooting
script can look for the button in the language being shot.
"""

import json
import os
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ElementTree

HERE = os.path.dirname(os.path.abspath(__file__))
LOCALES = os.path.join(HERE, '..', '..', 'src', 'i18n', 'locales')


def translation(locale, key, fallback):
    for name in (locale, 'en'):
        try:
            with open(os.path.join(LOCALES, f'{name}.json'), encoding='utf-8') as handle:
                value = json.load(handle)
        except OSError:
            continue
        for part in key.split('.'):
            value = value.get(part) if isinstance(value, dict) else None
        if isinstance(value, str) and value:
            return value
    return fallback


def ios_elements(udid):
    out = subprocess.run(
        ['axe', 'describe-ui', '--udid', udid], capture_output=True, text=True, check=False
    ).stdout
    try:
        roots = json.loads(out)
    except json.JSONDecodeError:
        return []
    found = []

    def walk(node):
        frame = node.get('frame') or {}
        for text in (node.get('AXLabel'), node.get('AXValue'), node.get('title')):
            if isinstance(text, str) and text and frame:
                found.append((text, frame['x'] + frame['width'] / 2, frame['y'] + frame['height'] / 2))
        for child in node.get('children') or []:
            walk(child)

    for root in roots if isinstance(roots, list) else [roots]:
        walk(root)
    return found


def android_elements(serial):
    adb = ['adb', '-s', serial]
    subprocess.run(adb + ['shell', 'uiautomator', 'dump', '/sdcard/ui.xml'], capture_output=True, check=False)
    xml = subprocess.run(adb + ['exec-out', 'cat', '/sdcard/ui.xml'], capture_output=True, text=True, check=False).stdout
    try:
        root = ElementTree.fromstring(xml)
    except ElementTree.ParseError:
        return []
    found = []
    for node in root.iter('node'):
        bounds = re.findall(r'\d+', node.get('bounds', ''))
        if len(bounds) != 4:
            continue
        left, top, right, bottom = map(int, bounds)
        for text in (node.get('text'), node.get('content-desc')):
            if text:
                found.append((text, (left + right) / 2, (top + bottom) / 2))
    return found


def tap(platform, device, texts, wait):
    deadline = time.time() + wait
    while True:
        elements = ios_elements(device) if platform == 'ios' else android_elements(device)
        for wanted in texts:
            # Why exact first: "Pair" must not match "Pairing log".
            match = next((e for e in elements if e[0].strip() == wanted), None) or next(
                (e for e in elements if wanted in e[0]), None
            )
            if match:
                _, x, y = match
                if platform == 'ios':
                    subprocess.run(['axe', 'tap', '-x', str(int(x)), '-y', str(int(y)), '--udid', device], check=False)
                else:
                    subprocess.run(['adb', '-s', device, 'shell', 'input', 'tap', str(int(x)), str(int(y))], check=False)
                print(f'tapped {wanted!r}')
                return 0
        if time.time() >= deadline:
            print(f'not found: {texts!r}', file=sys.stderr)
            return 1
        time.sleep(1)


def main(argv):
    if len(argv) >= 4 and argv[0] == 'label':
        print(translation(argv[1], argv[2], argv[3]))
        return 0
    wait = 15.0
    if '--wait' in argv:
        index = argv.index('--wait')
        wait = float(argv[index + 1])
        argv = argv[:index] + argv[index + 2:]
    if len(argv) < 3 or argv[0] not in ('ios', 'android'):
        print(__doc__, file=sys.stderr)
        return 2
    return tap(argv[0], argv[1], argv[2:], wait)


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))

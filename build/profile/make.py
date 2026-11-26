#!/usr/bin/env python3
"""회사 소개서 PDF 만들기.

    python3 build/profile/make.py            → docs/treeland-company-profile.pdf
    python3 build/profile/make.py --png DIR  → 페이지별 미리보기 PNG도 저장

서체(Hahmlet · IBM Plex Sans KR)는 build/profile/node_modules에 있어야 함.
없으면: cd build/profile && npm i
"""
import pathlib, subprocess, sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT = ROOT / 'docs' / 'treeland-company-profile.pdf'

if not (HERE / 'node_modules' / '@fontsource' / 'hahmlet').exists():
    subprocess.run(['npm', 'i', '--silent'], cwd=HERE, check=True)

from playwright.sync_api import sync_playwright

png_dir = None
if '--png' in sys.argv:
    png_dir = pathlib.Path(sys.argv[sys.argv.index('--png') + 1])
    png_dir.mkdir(parents=True, exist_ok=True)

import io
from PIL import Image


def as_jpeg(route):
    """사이트 사진(webp)은 PDF에 넣기 전에 JPEG로 바꿔 용량을 줄임 (투명 로고는 그대로)."""
    path = pathlib.Path(route.request.url.replace('file://', ''))
    try:
        im = Image.open(path)
        if im.mode in ('RGBA', 'LA', 'P') or max(im.size) < 400:
            return route.continue_()
        im = im.convert('RGB')
        im.thumbnail((1500, 1500))
        buf = io.BytesIO()
        im.save(buf, 'JPEG', quality=84, optimize=True, progressive=False)
        route.fulfill(body=buf.getvalue(), content_type='image/jpeg')
    except Exception:
        route.continue_()


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    pg.route('**/*.webp', as_jpeg)
    pg.goto((HERE / 'profile.html').as_uri())
    pg.evaluate('document.fonts.ready')
    pg.wait_for_load_state('networkidle')
    pg.emulate_media(media='print')
    pg.pdf(path=str(OUT), format='A4', print_background=True, prefer_css_page_size=True)
    if png_dir:
        pg.emulate_media(media='screen')
        pg.set_viewport_size({'width': 900, 'height': 1200})
        for i, el in enumerate(pg.query_selector_all('.page'), 1):
            el.screenshot(path=str(png_dir / f'p{i}.png'))
    b.close()
print(OUT, OUT.stat().st_size // 1024, 'KB')

"""하위 페이지 생성: /cases/ /trees/ /faq/  (네이버·구글 하위 링크용)
build.py 다음에 실행. 저장소 루트 index.html(배포본)에서 섹션을 잘라 각 페이지를 만든다.
사용법(저장소 루트): python3 build/pages.py
"""
import re, os, html
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
BASE = 'https://treeland.kr'

def block(s, start_pat):
    """<section ... id=...> 시작부터 짝이 맞는 </section>까지"""
    i = s.index(start_pat)
    tag = re.match(r'<(\w+)', s[i:]).group(1)
    depth, j = 0, i
    for m in re.finditer(r'<(/?)%s\b[^>]*>' % tag, s[i:]):
        depth += -1 if m.group(1) else 1
        if depth == 0:
            return s[i:i + m.end()]
    raise ValueError(start_pat)

SEC = {
    'trust': '<div class="trust">', 'cases': '<section class="cases" id="cases"',
    'detail': '<section id="detail"', 'light': '<section class="light" id="light"', 'colors': '<section id="colors"',
    'process': '<section id="process"', 'faq': '<section id="faq"', 'contact': '<section class="contact" id="contact"',
}
PAGES = [
    ('cases', '설치 사례', '크리스마스트리 설치 사례',
     '카페·매장, 병원, 학교·학원, 기관·공공시설, 사무실·가정에 설치한 트리랜드 크리스마스트리 사례입니다. 설치 전과 후를 비교해 보실 수 있습니다.',
     ['trust', 'cases'], None),
    ('trees', '트리 소개', '트리 소개',
     '트리랜드 크리스마스트리의 잎과 오너먼트, 하단 시그니처 상자, 조명, 장식 색상을 소개합니다. 모든 트리에 KC 인증 전기안정기를 설치합니다.',
     ['detail', 'light', 'colors'], '잎과 오너먼트, 하단 상자, 조명, 장식 색상을 차례로 보실 수 있습니다.'),
    ('faq', '자주 묻는 질문', '자주 묻는 질문',
     '크리스마스트리 대여 예약 시기, 설치와 회수, 대여 기간, 결제와 세금계산서, 취소 기준 등 자주 묻는 질문을 모았습니다.',
     ['faq'], None),
    ('contact', '상담 안내', '상담 안내',
     '카카오톡으로 공간 사진을 보내주시면 맞는 크기와 위치를 제안해 드립니다. 전화·이메일 상담 방법과 예약부터 설치·회수까지의 진행 순서를 안내합니다.',
     ['contact', 'process'], '카카오톡, 전화, 이메일로 상담하실 수 있습니다. 예약부터 설치와 회수까지 어떻게 진행되는지도 함께 보실 수 있습니다.'),
]
TOC_ITEMS = [('/cases/', '설치 사례', 'cases'), ('/trees/', '트리 소개', 'trees'), ('/#price', '가격', None), ('/faq/', 'Q&amp;A', 'faq'), ('/contact/', '상담', 'contact')]

head_end = src.index('<main id="top">')
main_end = src.index('</main>') + len('</main>')
toc_html = block(src, '<nav class="toc" id="toc"')
STYLE = '''<style>
.sub-crumb{padding-top:14px;font-size:13px;color:var(--muted)}
.sub-page .hdr,.sub-page .hdr.clear{background:var(--pine)!important}
.sub-page .hdr.clear::after{display:none!important}
.sub-crumb a{color:var(--muted);text-decoration:none}
.sub-crumb a:hover{color:var(--ink);text-decoration:underline}
.sub-intro{padding-block:40px 0}
.sub-intro h1{font-size:clamp(28px,4.6vw,44px)}
.sub-intro p{margin-top:10px;color:var(--muted);max-width:40em}
h1.sec-h1{font-size:clamp(26px,4.2vw,40px)}
.sub-page main>section:first-of-type,.sub-page main>.trust:first-of-type{padding-top:28px}
.sub-next{padding-block:40px;border-top:1px solid var(--line)}
.sub-next ul{list-style:none;margin:12px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:8px}
.sub-next a{display:inline-flex;align-items:center;min-height:44px;padding:10px 16px;border:1px solid var(--line);border-radius:2px;text-decoration:none;font-weight:600;font-size:15px;background:var(--paper)}
.sub-next a:hover{border-color:var(--ink)}
</style>
'''

def make(slug, label, h1, desc, secs, intro):
    url = f'{BASE}/{slug}/'
    title = f'{label} | 트리랜드 TREELAND'
    head = src[:head_end]
    # 기본 경로를 루트로 (img/… 상대경로 유지)
    head = head.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<base href="/">', 1)
    head = re.sub(r'<title>.*?</title>', f'<title>{title}</title>', head, count=1)
    head = re.sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{desc}">', head, count=1)
    head = head.replace('<link rel="canonical" href="https://treeland.kr/">', f'<link rel="canonical" href="{url}">')
    head = head.replace('<meta property="og:url" content="https://treeland.kr/">', f'<meta property="og:url" content="{url}">')
    head = re.sub(r'<meta property="og:title" content="[^"]*">', f'<meta property="og:title" content="{title}">', head, count=1)
    head = re.sub(r'<meta property="og:description" content="[^"]*">', f'<meta property="og:description" content="{desc}">', head, count=1)
    # 로고 로딩 화면은 첫 페이지에만
    head = re.sub(r'<div id="splash".*?</div></div>\s*', '', head, count=1, flags=re.S)
    head = re.sub(r"<script>\(function\(\)\{var d=document\.documentElement;d\.classList\.add\('intro'\).*?</script>\s*", '', head, count=1, flags=re.S)
    head = head.replace('<body>', '<body class="sub-page">', 1)
    head = head.replace('</head>', STYLE + '</head>', 1)
    # 목차: 하위 페이지 링크
    lis = ''.join(f'<li><a href="{h}"{" class=\"is-on\" aria-current=\"page\"" if s == slug else ""}>{t}</a></li>' for h, t, s in TOC_ITEMS)
    toc = re.sub(r'<ul>.*?</ul>', '<ul>' + lis + '</ul>', toc_html, count=1, flags=re.S)
    body = []
    crumb = f'<div class="wrap sub-crumb"><a href="/">트리랜드</a> › {label}</div>'
    if intro:
        body.append(f'<section class="sub-intro"><div class="wrap"><h1>{h1}</h1><p>{intro}</p></div></section>')
    promoted = bool(intro)
    for k in secs:
        b = block(src, SEC[k])
        if not promoted and '<h2>' in b:
            i = b.index('<h2>'); j = b.index('</h2>', i)
            b = b[:i] + '<h1 class="sec-h1">' + b[i+4:j] + '</h1>' + b[j+5:]
            promoted = True
        body.append(b)
    others = [(f'/{s}/', l) for s, l, *_ in PAGES if s != slug] + [('/', '처음 화면')]
    body.append('<section class="sub-next"><div class="wrap"><p class="label">다른 안내 보기</p><ul>' +
                ''.join(f'<li><a href="{h}">{t}</a></li>' for h, t in others) + '</ul></div></section>')
    if 'contact' not in secs:
        body.append(block(src, SEC['contact']))
    main = '<main id="top">\n' + toc + '\n' + crumb + '\n' + '\n'.join(body) + '\n</main>'
    out = head + main + src[main_end:]
    os.makedirs(os.path.join(ROOT, slug), exist_ok=True)
    open(os.path.join(ROOT, slug, 'index.html'), 'w', encoding='utf-8').write(out)
    print('built', slug, len(out))

for p in PAGES:
    make(*p)

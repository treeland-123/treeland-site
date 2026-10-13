"""treeland.kr 배포용 index.html 빌드
원본(아티팩트용) src/index.html + build/head_prefix.html(메타·OG·파비콘·검색 인증 태그) → 저장소 루트 index.html
사용법(저장소 루트에서): python3 build/build.py
"""
import re, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
a = open(os.path.join(root, 'src/index.html'), encoding='utf-8').read()
prefix = open(os.path.join(root, 'build/head_prefix.html'), encoding='utf-8').read()
TITLE = '<title>트리랜드 TREELAND | 크리스마스트리 대여·설치·철거</title>'
DESC = '<meta name="description" content="매장·기관·기업 크리스마스트리 대여와 설치, 1월 말 철거까지. 2026 1차 얼리버드 예약 15% 할인.">'
a = re.sub(r'<title>.*?</title>', TITLE, a, count=1)
a = re.sub(r'<meta name="description"[^>]*>', DESC, a, count=1)
a = a.replace('<meta name="theme-color" content="#1F3D30">\n', '', 1)
j = a.find('</style>') + len('</style>')
html = prefix + a[:j] + '\n</head>\n<body>' + a[j:].rstrip('\n') + '\n\n</body>\n</html>\n'
open(os.path.join(root, 'index.html'), 'w', encoding='utf-8').write(html)
print('built index.html', len(html))

# treeland.kr 수정·배포 방법

## 파일 구조
- `src/index.html` — 사이트 원본. claude.ai 미리보기(아티팩트)에도 이 파일을 그대로 올림.
- `build/head_prefix.html` — 배포용 머리말(doctype, viewport, canonical, OG/트위터 카드, 파비콘, JSON-LD 회사 정보, 네이버 소유확인 태그).
- `build/build.py` — 위 두 파일을 합쳐 저장소 루트 `index.html` 생성. 검색용 제목·설명도 여기서 지정.
- `img/` — 사이트 이미지. `CNAME`(treeland.kr), `.nojekyll`, `robots.txt`, `sitemap.xml`, 파비콘, `og-image.jpg`.

## 수정 순서
1. `src/index.html` 수정 (수정 전 백업 권장)
2. 저장소 루트에서 `python3 build/build.py`
3. 새 이미지가 있으면 `img/`에 추가
4. commit → push (main). GitHub Pages가 1~3분 뒤 https://treeland.kr 에 반영
5. 미리보기(아티팩트)도 같은 `src/index.html`로 다시 게시 → 두 곳 내용 일치

## 지우면 안 되는 것
- 가비아 DNS의 TXT 레코드 2개(GitHub Pages 인증, 구글 서치콘솔 인증)
- `build/head_prefix.html`의 `naver-site-verification` 메타 태그(네이버 서치어드바이저 인증)
- `CNAME` 파일

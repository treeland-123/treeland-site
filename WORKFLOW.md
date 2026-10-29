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
- `build/head_prefix.html`의 Google 애널리틱스(GA4) 태그 `G-75S6VN6PP6`(계정 hongjs100418@gmail.com, 속성 559412298)와 문의 버튼 클릭 추적 스크립트. 2026-10-17 추가.
  - kakao_popup_open: 카톡 상담 버튼 → 안내 팝업 열림 (popup_type: ask=일반, quote=견적)
  - kakao_click: 팝업의 "카카오톡 열기" 또는 바로가기 링크로 실제 카카오톡 열림 (via: ask_popup / quote_popup / direct)
  - phone_click · email_click · instagram_click · company_pdf_click
  - 버튼 id(askGo, kqGo, copyKakao, barBtn)나 data-sheet 구조를 바꾸면 추적 코드도 같이 수정

## 유입 경로 꼬리표(UTM)
- 당근 비즈프로필 홈페이지 링크: `https://treeland.kr/?utm_source=daangn&utm_medium=bizprofile&utm_campaign=2026_earlybird`
- GA4 → 보고서 → 획득 → 트래픽 획득에서 세션 소스 `daangn`으로 확인


## 하위 페이지 (2026-10-18)
- /cases/(설치 사례) · /trees/(트리 소개) · /faq/(자주 묻는 질문) · /contact/(상담 안내 + 진행 순서): 검색 결과 하위 링크용. 페이지 제목에 "가격"은 넣지 않음(대표님 결정).
- 메인 index.html에서 섹션을 잘라 자동 생성하므로 직접 고치지 말 것. 빌드 순서: `python3 build/build.py` → `python3 build/pages.py`
- 메인 하단에 세 페이지 링크, sitemap.xml에 다섯 주소 등록.


## 견적서 발행 (/quote/, 2026-10-28)
- https://treeland.kr/quote/ — 관리자용. 받는 곳·트리·추가 장식·운임을 고르면 A4 견적서가 바로 만들어지고 PDF·이미지로 저장, 카톡 요약 복사.
- 가격은 열 때마다 메인 index.html의 「크기별 가격」 표(.sheet-row/.tp)와 견적 계산기 스크립트(EXTRAS, BOX_EXTRA, MULTI, REGIONS, 배열형 COLORS), "1차 얼리버드 할인은 ○월 ○일까지" 문장에서 읽음 → 이 구조나 문장을 바꾸면 /quote/도 확인할 것.
- 도장은 quote/stamp.png로 공개 저장(대표님 결정, 2026-10-28)해 자동 적용. 기기별로 다른 도장을 고르면 그게 우선(localStorage).
- 견적 서버: Apps Script 「트리랜드 견적」(hongjs100418), 코드 사본 quote/apps-script/Code.gs. 발행 내역 공유(시트 「트리랜드 견적」), 견적 번호 발급, 메일 발송(발신 info@treeland.kr — Gmail 보내는 주소 별칭). 재배포는 배포 관리 → 새 버전(주소 유지).
- 계약 관리(/contract/admin.html)가 견적을 불러와 링크를 만들면 /quote/?embed=1 을 숨은 창으로 열어 window.tlQuotePdf(state)로 견적서 PDF를 받아 서명본 메일에 함께 첨부함(합계가 저장된 견적과 다르면 중단). 견적서 쪽 renderForm·calc·capture·fileBase나 시작 부분을 바꾸면 이 기능도 확인할 것.
- 견적 번호는 내부 관리번호: 고객에게는 견적서 왼쪽 위에만. 계약서·카톡 문구·메일·파일 이름에 넣지 않음.
- 4그루 이상 추가 할인율, 2차 얼리버드 할인율은 견적마다 직접 입력.

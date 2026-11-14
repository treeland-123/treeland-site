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

- 견적서 페이지를 고친 뒤에는 회귀 테스트를 돌릴 것: `node quote/tests/flow.test.mjs` (가짜 견적 서버로 PC·아이폰·안드로이드 화면에서 새 견적 시작, 이어서 쓰기, PDF·이미지·카톡 요약·메일 발행 기록, 복사 막힘, 서버 장애 보관, 다른 기기 발행분, 연속 발행 덮어쓰기 여부를 확인. 실패 0이어야 배포)

## 관리 시스템 (/admin, 2026-11-14)
- treeland.kr/admin — 구글 계정 로그인(「트리랜드 관리」 Apps Script 웹 앱이 이메일 확인 → 계약 서버가 30일 로그인 유지 토큰 발급). 역할: 대표 / 직원. 직원 명단은 계약 시트 파일의 '직원' 탭, 화면은 /admin/#people.
- 모든 관리 페이지 <head>에 `<script src="/admin/auth.js?v=N" data-page="키">` — 위쪽 공통 메뉴, 직원은 대표 전용 화면을 홈으로 돌려보냄, 계약 서버 요청에 로그인 토큰을 붙임. **auth.js·admin.css를 고치면 모든 페이지의 ?v= 숫자를 올릴 것**(브라우저가 예전 파일을 10분 동안 들고 있어 새 페이지와 어긋남).
- 직원 권한은 계약 서버(전자계약 v23~)가 막음: 직원 허용 list·schedule·cancel·jobs·job·update(준비·설치/회수 완료·보관)·photo·photoGet, 응답에서 금액·PDF·메일 목록 제거. 화면에서만 숨기는 것이 아님.
- 건 상세 /admin/job.html?id= : 현장 담당·필요 자재 체크·설치/회수 완료·사진(드라이브 '현장 사진')·기록('기록' 시트).
- 자재 /admin/prep.html : 설치 완료 처리 전 현장의 필요 자재 합계(이번 주 = 오늘부터 7일 + 지난 미완료 / 앞으로 전체). 계산은 ui.js UI.materials·UI.matTotals(건 상세와 같은 기준). 서명 대기 포함·준비 끝난 현장 빼기 선택.
- 계약서 서명 화면: 사업자등록번호를 적으면 「세금계산서 받을 정보」(이메일·사업장 주소·업태·종목·사업자등록증 사진/PDF) 칸이 나옴. 계약 서버 v26부터 계약 시트 '세금계산서' 열(JSON)에 저장, 사업자등록증은 서명본과 같은 비공개 폴더. 건 상세(대표만)에 표시, 직원 응답에서는 tax·biz 제외. v27: 계약 삭제 때 사업자등록증 사본도 휴지통.
- 입금 여부는 지출 장부(/ledger) 계약보충 extras가 기준. 홈·건 상세의 입금 확인은 장부와 계약 서버 양쪽에 씀(세금계산서·메모 유지).
- 디자인(2026-11-14 개편): 새 화면(홈 /admin/, 건 /admin/jobs.html, 건 상세 /admin/job.html)은 admin/admin.css + admin/ui.js(날짜·상태·캐시·목록 공통). 예전 화면은 auth.js가 admin/skin.css를 붙여 같은 글꼴(Pretendard)·색·입력칸·버튼으로 맞춤(기능·계산은 그대로, 견적서 종이 #paper는 제외). 휴대폰은 아래 탭(홈·건·일정·더보기), PC는 위쪽 메뉴. 용어: 서명 대기·설치 예정·설치 완료·입금 대기·입금 확인·회수 예정·회수 완료·설치 중단·보관.
- 속도: 새 화면은 이 기기 캐시(localStorage tl_c_all)로 먼저 그리고 서버 응답으로 갱신, 버튼은 누르는 즉시 반영 후 실패하면 되돌림. 계약 서버는 읽기 요청을 잠금 없이 동시에 처리(v25).
- 위쪽 메뉴 높이는 CSS 변수 --tlbar-h(PC 56px, 휴대폰 52px). 페이지에 sticky 요소를 만들면 top에 var(--tlbar-h,0px)를 더할 것. 메뉴 z-index 30보다 위에 떠야 하는 전체화면은 z-index 40 이상.

/* 트리랜드 관리 공통: 로그인 상태, 메뉴(PC 위쪽 / 휴대폰 아래 탭), 직원 권한, 화면 전환·알림
   각 관리 페이지 <head>에 <script src="/admin/auth.js?v=N" data-page="키"></script>
   - 로그인 안 했으면: 예전처럼 관리자 비밀번호로 동작 (메뉴만 붙음)
   - 대표: 로그인할 때 서버가 비밀번호를 내려줘 예전 화면이 그대로 열림
   - 직원: 계약 서버 요청에 비밀번호 대신 로그인 정보가 붙고, 금액은 서버가 빼고 보냄. 대표 전용 화면은 홈으로
   - 새 화면(home·jobs·job)은 admin.css, 예전 화면은 skin.css로 같은 글꼴·색·간격을 씀 */
(function(){
  "use strict";
  const V = "6";   // admin.css · skin.css 버전 (고치면 올릴 것)
  const ENDPOINT = "https://script.google.com/macros/s/AKfycbxSKXLeVZoI-Qx2rieXI_f4DjKdf7jNzI9S_vtBrJJnqMYjOBvzs9TUHxQK7Ko0h-9oDg/exec";
  const EP_ID = "AKfycbxSKXLeVZoI";
  const LS = {
    g(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } },
    s(k, v){ try{ v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); }catch(e){} }
  };
  const STAFF_PIN = "@staff";   // 직원 기기의 자리표시. 서버는 비밀번호로 쓰지 않음

  let user = null;
  try{ user = JSON.parse(LS.g("tl_user") || "null"); }catch(e){}
  if(user && (!user.sess || !(user.exp > Date.now()))){ user = null; LS.s("tl_user", null); }
  const staff = !!user && user.role !== "대표";
  // 관리 화면은 구글 로그인만 받음: 로그인 안 한 기기에 남은 관리자 비밀번호는 지움 (11/14)
  if(!user && LS.g("tl_pin")) LS.s("tl_pin", null);

  const me = document.currentScript;
  const embed = /[?&]embed=1/.test(location.search) || window.top !== window;
  const page = embed ? "none" : ((me && me.dataset.page) || "");
  // 로그인 안 했으면 홈(로그인 화면)으로. 홈 자체와 다른 화면 안에 들어간 화면(embed)은 제외
  if(!user && page && page !== "none" && page !== "home"){ document.documentElement.style.visibility = "hidden"; location.replace("/admin/"); }
  const NEW_PAGES = ["home", "jobs", "job", "prep"];
  // [키, 이름, 주소, 대표 전용, 묶음] 묶음: main = PC 위쪽·휴대폰 탭, more = 더보기
  const MENU = [
    ["home", "홈", "/admin/", 0, "main"],
    ["jobs", "건", "/admin/jobs.html", 0, "main"],
    ["schedule", "일정", "/schedule/", 0, "main"],
    ["quote", "견적서", "/quote/", 1, "main"],
    ["contract", "계약", "/contract/admin.html", 0, "main"],
    ["mail", "메일", "/mail/", 1, "main"],
    ["prep", "자재", "/admin/prep.html", 0, "more"],
    ["ledger", "장부", "/ledger/", 1, "more"],
    ["stats", "통계", "/stats/", 1, "more"],
    ["proposals", "제안서", "/proposals/", 1, "more"],
    ["workorder", "작업지시서", "/workorder/", 1, "more"],
    ["staff", "근로계약", "/staff/", 1, "more"],
    ["people", "직원 관리", "/admin/#people", 1, "more"]
  ];
  const cur = MENU.find(m => m[0] === page);

  if(staff){
    if(cur && cur[3]){ location.replace("/admin/?denied=" + encodeURIComponent(cur[1])); return; }
    LS.s("tl_pin", STAFF_PIN);
    document.documentElement.dataset.role = "staff";
    const of = window.fetch.bind(window);
    window.fetch = function(url, opt){
      try{
        if(String(url).indexOf(EP_ID) >= 0 && opt && typeof opt.body === "string"){
          const b = JSON.parse(opt.body);
          if(b && b.action){ b.sess = user.sess; delete b.pin; opt = Object.assign({}, opt, { body: JSON.stringify(b) }); }
        }
      }catch(e){}
      return of(url, opt);
    };
  }else if(user){
    document.documentElement.dataset.role = "owner";
  }

  function save(u){
    const keep = { sess:u.sess, exp:u.exp, email:u.email, name:u.name, role:u.role, checked:Date.now() };
    LS.s("tl_user", JSON.stringify(keep));
    if(u.role === "대표" && u.pin) LS.s("tl_pin", u.pin);
    if(u.role !== "대표") LS.s("tl_pin", STAFF_PIN);
  }
  function logout(){
    LS.s("tl_user", null);
    LS.s("tl_pin", null); LS.s("tl_pin_v", null);   // 로그아웃하면 관리자 비밀번호도 지움
    LS.s("tl_sched_quotes", null); LS.s("tl_sched_cache", null);
    try{ Object.keys(localStorage).filter(k => k.startsWith("tl_c_")).forEach(k => localStorage.removeItem(k)); }catch(e){}
    location.href = "/admin/";
  }
  async function call(body){
    const b = Object.assign({}, body);
    if(user){ b.sess = user.sess; delete b.pin; }
    else if(!b.pin && LS.g("tl_pin")) b.pin = LS.g("tl_pin");
    const r = await fetch(ENDPOINT, { method:"POST", headers:{ "Content-Type":"text/plain;charset=utf-8" }, body: JSON.stringify(b) });
    return r.json();
  }
  /* 입금 여부는 지출 장부(계약보충 extras)가 기준. 대표 화면에서 읽고, 입금 확인은 장부와 계약 서버 양쪽에 같이 씀 */
  const LEDGER = "https://script.google.com/macros/s/AKfycbxQ3PcUoyJs9t2awb8TAfD2-7T_Ov4vpXLXpr8VPOAfQVD0uO_4rpuvrcFEPLz2nJnQ/exec";
  async function ledgerExtras(){
    const pin = LS.g("tl_pin"); if(staff || !pin) return null;
    try{
      const r = await fetch(LEDGER, { method:"POST", headers:{ "Content-Type":"text/plain;charset=utf-8" }, body: JSON.stringify({ action:"load", pin }) });
      const j = await r.json(); return j.ok ? (j.extras || {}) : null;
    }catch(e){ return null; }
  }
  const todayKST = () => new Intl.DateTimeFormat("sv-SE", { timeZone:"Asia/Seoul", year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date());
  // extras: ledgerExtras() 결과(없으면 장부는 건드리지 않음 — 세금계산서·메모를 덮어쓰지 않으려고)
  async function setPaid(id, paid, extras){
    if(extras){
      const x = extras[id] || {}, d = { id, taxInvoice: !!x.taxInvoice, memo: x.memo || "", paid: !!paid, paidDate: paid ? (x.paidDate || todayKST()) : "" };
      const r = await fetch(LEDGER, { method:"POST", headers:{ "Content-Type":"text/plain;charset=utf-8" }, body: JSON.stringify({ action:"saveExtra", pin: LS.g("tl_pin"), data: d }) });
      const j = await r.json(); if(!j.ok) return { ok:false, error: "장부에 저장하지 못했습니다. " + (j.error || "") };
      extras[id] = { taxInvoice: d.taxInvoice, memo: d.memo, paid: d.paid, paidDate: d.paidDate };
    }
    return call({ action:"update", id, field:"paid", value: !!paid });
  }
  // 장부를 불러왔으면 장부만 기준(장부 화면에서 결제 취소한 것도 반영), 못 불러왔으면 계약 서버 기록
  const isPaid = (it, extras) => extras ? !!(extras[it.id] && extras[it.id].paid) : !!it.paid;
  const paidDate = (it, extras) => extras ? ((extras[it.id] && extras[it.id].paidDate) || "") : (it.paid || "");

  /* 화면별 '마지막으로 받은 내용' 보관: 다음에 열 때 먼저 보여 주고 뒤에서 새로 받음.
     로그인한 사람이 바뀌면 안 씀, 로그아웃하면 지움(tl_c_ 로 시작) */
  const who = () => user ? user.email : "pin";
  const memo = {
    get(k){ try{ const c = JSON.parse(LS.g("tl_c_" + k) || "null"); return c && c.u === who() ? c.v : null; }catch(e){ return null; } },
    set(k, v){ try{ localStorage.setItem("tl_c_" + k, JSON.stringify({ u: who(), at: Date.now(), v })); }catch(e){} }
  };

  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" })[c]); }

  /* 알림: 아래쪽에 잠깐 */
  let toastT;
  function toast(msg, kind){
    let t = document.getElementById("tlToast");
    if(!t){ t = document.createElement("div"); t.id = "tlToast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg; t.className = "tl-toast show" + (kind ? " " + kind : "");
    clearTimeout(toastT); toastT = setTimeout(() => { t.className = "tl-toast" + (kind ? " " + kind : ""); }, kind === "bad" ? 4200 : 2200);
  }
  /* 아래에서 올라오는 시트 */
  function sheet(html, opts){
    let d = document.getElementById("tlSheet");
    if(!d){
      d = document.createElement("dialog"); d.id = "tlSheet"; d.className = "tl-sheet"; document.body.appendChild(d);
      d.addEventListener("click", e => { if(e.target === d || e.target.closest("[data-close]")) close(); });
    }
    function close(){ d.classList.add("out"); setTimeout(() => { d.classList.remove("out"); d.close(); }, 180); }
    d.innerHTML = `<div class="tl-sh-in"><span class="tl-grab" aria-hidden="true"></span>${opts && opts.title ? `<div class="tl-sh-t">${esc(opts.title)}</div>` : ""}${html}</div>`;
    d.showModal(); return { el: d, close };
  }
  window.TL = { user, staff, page, ENDPOINT, MENU, save, logout, call, LS, ledgerExtras, setPaid, isPaid, paidDate, toast, sheet, esc, memo };

  /* 역할이 바뀌었거나 사용 중지됐는지 10분에 한 번 확인 */
  // 대표 기기는 관리자 비밀번호가 바뀌면(PIN_V) 바로 확인해서 새 값을 받음
  const PIN_V = "3";   // 11/14 17:39 무작위 값으로 교체
  if(user && (!(Date.now() - (user.checked || 0) < 6e5) || (user.role === "대표" && LS.g("tl_pin_v") !== PIN_V))){
    call({ action:"me" }).then(j => {
      if(!j) return;
      if(!j.ok && (j.error === "sess")){ logout(); return; }
      if(j.ok){
        const changed = j.role !== user.role, newPin = !!j.pin && j.pin !== LS.g("tl_pin");
        save(Object.assign({}, user, { name:j.name, role:j.role, pin:j.pin }));
        if(j.pin) LS.s("tl_pin_v", PIN_V);
        if(changed || newPin) location.reload();
      }
    }).catch(() => {});
  }

  if(page === "none") return;

  /* 글꼴·공통 스타일·화면 전환 */
  const head = document.head || document.documentElement;
  const link = (href, extra) => { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; if(extra) Object.assign(l, extra); head.appendChild(l); };
  link("https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css", { crossOrigin:"anonymous" });
  if(NEW_PAGES.indexOf(page) < 0) document.documentElement.classList.add("tl-legacy");
  document.documentElement.style.setProperty("--tlbar-h", "56px");
  const ICON = {
    home:'<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/>',
    jobs:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h8M8 17h5"/>',
    schedule:'<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    more:'<circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/>',
    plus:'<path d="M12 5v14M5 12h14"/>'
  };
  const svg = k => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;
  const CSS = `
@view-transition{navigation:auto}
::view-transition-old(root),::view-transition-new(root){animation-duration:.22s;animation-timing-function:cubic-bezier(.2,.8,.2,1)}
::view-transition-old(root){animation-name:tl-out}
::view-transition-new(root){animation-name:tl-in}
@keyframes tl-out{to{opacity:0}}
@keyframes tl-in{from{opacity:0;transform:translateY(6px)}}
.tlbar{view-transition-name:tl-top}.tltabs{view-transition-name:tl-tabs}
:root{--tb-bg:rgba(255,255,255,.86);--tb-ink:#191F28;--tb-sub:#4E5968;--tb-line:rgba(0,0,0,.06);--tb-acc:#1F3A2E;--tb-fill:#F2F3F5;--tb-card:#fff}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--tb-bg:rgba(22,23,26,.86);--tb-ink:#ECEDEF;--tb-sub:#B3BAC2;--tb-line:rgba(255,255,255,.07);--tb-acc:#A6CDB6;--tb-fill:#232529;--tb-card:#1A1B1E}
  :root:not([data-theme="light"]) .tlbar .tl-logo .l{display:none}:root:not([data-theme="light"]) .tlbar .tl-logo .d{display:block}}
:root[data-theme="dark"]{--tb-bg:rgba(22,23,26,.86);--tb-ink:#ECEDEF;--tb-sub:#B3BAC2;--tb-line:rgba(255,255,255,.07);--tb-acc:#A6CDB6;--tb-fill:#232529;--tb-card:#1A1B1E}
:root[data-theme="dark"] .tlbar .tl-logo .l{display:none}:root[data-theme="dark"] .tlbar .tl-logo .d{display:block}
.tlbar,.tltabs,.tl-sheet,.tl-toast{font-family:"Pretendard Variable",Pretendard,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;letter-spacing:-.01em;-webkit-font-smoothing:antialiased}
.tlbar{position:fixed;top:0;left:0;right:0;z-index:30;height:56px;display:flex;align-items:center;gap:18px;padding:0 max(20px,env(safe-area-inset-left,0px));
  background:var(--tb-bg);-webkit-backdrop-filter:saturate(1.6) blur(16px);backdrop-filter:saturate(1.6) blur(16px);border-bottom:1px solid var(--tb-line);color:var(--tb-ink);font-size:15px;line-height:1}
.tlbar a{color:inherit;text-decoration:none}
.tlbar .tl-logo{display:flex;align-items:center;flex:0 0 auto}
.tlbar .tl-logo img{height:24px;width:auto;display:block}.tlbar .tl-logo .d{display:none}
.tlbar .tl-menu{flex:1;min-width:0;display:flex;gap:2px;align-items:center}
.tlbar .tl-menu a,.tlbar .tl-menu button{white-space:nowrap;padding:10px 12px;border-radius:10px;color:var(--tb-sub);font-weight:600;font-size:15px;background:none;border:0;cursor:pointer;font-family:inherit}
.tlbar .tl-menu a:hover,.tlbar .tl-menu button:hover{color:var(--tb-ink);background:var(--tb-fill)}
.tlbar .tl-menu a[aria-current=page]{color:var(--tb-ink);background:var(--tb-fill)}
.tlbar .tl-right{flex:0 0 auto;display:flex;align-items:center;gap:8px}
.tlbar .tl-new{display:inline-flex;align-items:center;gap:4px;border:0;border-radius:10px;background:var(--tb-acc);color:#fff;font-weight:600;font-size:14px;padding:9px 12px 9px 9px;cursor:pointer;font-family:inherit}
:root:not([data-theme="light"]) .tlbar .tl-new{color:var(--tb-card)}
.tlbar .tl-new svg{width:18px;height:18px}
.tlbar .tl-me{border:0;background:var(--tb-fill);color:var(--tb-ink);border-radius:999px;height:36px;min-width:36px;padding:0 12px;font-weight:600;font-size:14px;cursor:pointer;font-family:inherit}
.tlbar-sp{height:56px}
nav.tlbar button,nav.tltabs button{flex:0 0 auto;width:auto;margin:0;border-bottom-width:0;box-shadow:none;line-height:1}
nav.tltabs{border-bottom:0;gap:0}
.tltabs{display:none}
@media (max-width:760px){
  .tlbar{height:52px;padding:0 max(16px,env(safe-area-inset-left,0px));gap:10px}
  .tlbar .tl-menu{display:none}.tlbar .tl-right{margin-left:auto}
  .tlbar-sp{height:52px}
  .tltabs{display:grid;grid-template-columns:repeat(var(--n,4),1fr);position:fixed;left:0;right:0;bottom:0;z-index:30;background:var(--tb-bg);
    -webkit-backdrop-filter:saturate(1.6) blur(16px);backdrop-filter:saturate(1.6) blur(16px);border-top:1px solid var(--tb-line);padding:6px 6px calc(6px + env(safe-area-inset-bottom,0px))}
  .tltabs a,.tltabs button{display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 0;color:var(--tb-sub);text-decoration:none;font-size:12px;font-weight:600;background:none;border:0;cursor:pointer;font-family:inherit;-webkit-tap-highlight-color:transparent;transition:transform .12s}
  .tltabs a:active,.tltabs button:active{transform:scale(.92)}
  .tltabs [aria-current=page]{color:var(--tb-ink)}
  .tltabs [aria-current=page] svg{stroke-width:2.3}
  html body{padding-bottom:calc(84px + env(safe-area-inset-bottom,0px))!important}
}
.tl-toast{position:fixed;left:50%;bottom:calc(28px + env(safe-area-inset-bottom,0px));transform:translate(-50%,20px);opacity:0;pointer-events:none;z-index:60;
  background:#191F28;color:#fff;border-radius:14px;padding:13px 18px;font-size:15px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.18);transition:opacity .2s,transform .25s cubic-bezier(.2,.8,.2,1);max-width:calc(100vw - 32px)}
.tl-toast.show{opacity:1;transform:translate(-50%,0)}
.tl-toast.bad{background:#D4343C}
@media (max-width:760px){.tl-toast{bottom:calc(92px + env(safe-area-inset-bottom,0px))}}
.tl-sheet{border:0;padding:0;margin:auto auto 0;width:100%;max-width:520px;border-radius:22px 22px 0 0;background:var(--tb-card);color:var(--tb-ink);max-height:86dvh;animation:tl-up .26s cubic-bezier(.2,.8,.2,1)}
.tl-sheet.out{animation:tl-down .18s ease-in forwards}
.tl-sheet::backdrop{background:rgba(0,0,0,.36)}
@media (min-width:761px){.tl-sheet{margin:auto;border-radius:22px}}
@keyframes tl-up{from{transform:translateY(40px);opacity:0}}
@keyframes tl-down{to{transform:translateY(40px);opacity:0}}
.tl-sh-in{padding:10px 20px calc(20px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:6px}
.tl-grab{width:40px;height:5px;border-radius:9px;background:var(--tb-line);margin:0 auto 6px;display:block;filter:brightness(.6)}
.tl-sh-t{font-size:19px;font-weight:700;padding:6px 4px 8px}
.tl-sh-in .tl-item{display:flex;align-items:center;gap:14px;padding:15px 8px;border-radius:14px;color:var(--tb-ink);text-decoration:none;font-size:17px;font-weight:600;background:none;border:0;width:100%;text-align:left;cursor:pointer;font-family:inherit}
.tl-sh-in .tl-item:hover,.tl-sh-in .tl-item:active{background:var(--tb-fill)}
.tl-sh-in .tl-item small{display:block;font-size:14px;font-weight:500;color:var(--tb-sub);margin-top:2px}
.tl-sh-in .tl-ico{width:42px;height:42px;border-radius:12px;background:var(--tb-fill);display:flex;align-items:center;justify-content:center;flex:0 0 auto;font-size:19px}
.tl-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.tl-grid a{display:flex;flex-direction:column;align-items:center;gap:8px;padding:14px 4px;border-radius:16px;color:var(--tb-ink);text-decoration:none;font-size:15px;font-weight:600;transition:transform .12s,background .15s}
.tl-grid a:active{transform:scale(.95);background:var(--tb-fill)}
.tl-grid .tl-ico{width:52px;height:52px;border-radius:16px;background:var(--tb-fill);display:flex;align-items:center;justify-content:center;font-size:22px}
.tl-sh-in .tl-acct{display:flex;justify-content:space-between;align-items:center;padding:14px 8px 4px;border-top:1px solid var(--tb-line);margin-top:6px;font-size:15px;color:var(--tb-sub)}
.tl-sh-in .tl-acct button{border:0;background:var(--tb-fill);color:var(--tb-ink);border-radius:10px;padding:10px 14px;font-weight:600;cursor:pointer;font-family:inherit}
[data-role="staff"] .owner-only{display:none!important}
@media print{.tlbar,.tlbar-sp,.tltabs,.tl-toast{display:none!important}}`;
  const st = document.createElement("style"); st.textContent = CSS; head.appendChild(st);
  if(NEW_PAGES.indexOf(page) < 0) link("/admin/skin.css?v=" + V);

  const items = MENU.filter(m => !(staff && m[3]));
  const activeKey = () => page === "home" && location.hash === "#people" ? "people" : page === "job" ? "jobs" : page;
  const MORE_ICON = { quote:"₩", contract:"✎", mail:"✉", prep:"▦", ledger:"≡", stats:"↗", proposals:"❖", workorder:"✦", staff:"☺", people:"⚙", schedule:"◷" };

  function openMore(){
    const list = items.filter(m => m[4] === "more" || (["quote", "contract", "mail"].indexOf(m[0]) >= 0));
    const html = `<div class="tl-grid">${list.map(m => `<a href="${m[2]}"><span class="tl-ico">${MORE_ICON[m[0]] || "•"}</span>${m[1]}</a>`).join("")}</div>` + acct();
    bindAcct(sheet(html, { title:"전체 메뉴" }));
  }
  function openNew(){
    const html = `<a class="tl-item" href="/quote/"><span class="tl-ico">₩</span><span>새 견적서<small>견적을 만들어 PDF·메일로 보냄</small></span></a>
      <a class="tl-item" href="/contract/admin.html#h-new"><span class="tl-ico">✎</span><span>계약 링크<small>견적을 불러와 서명 링크를 만듦</small></span></a>
      <a class="tl-item" href="/mail/"><span class="tl-ico">✉</span><span>메일 쓰기<small>안내 메일·서류 첨부</small></span></a>`;
    sheet(html, { title:"새로 만들기" });
  }
  function acct(){
    return user ? `<div class="tl-acct"><span>${esc(user.name || user.email)} · ${user.role === "대표" ? "대표" : "직원"}</span><button type="button" data-logout>로그아웃</button></div>`
                : `<div class="tl-acct"><span>로그인하지 않음</span><a class="tl-item" style="width:auto;padding:10px 14px" href="/admin/">로그인</a></div>`;
  }
  function bindAcct(s){ const b = s.el.querySelector("[data-logout]"); if(b) b.onclick = logout; }

  function bar(){
    if(document.querySelector(".tlbar")) return;
    const main = items.filter(m => m[4] === "main"), more = items.filter(m => m[4] === "more");
    const nav = document.createElement("nav");
    nav.className = "tlbar"; nav.setAttribute("aria-label", "관리 메뉴");
    const initial = user ? (user.name || user.email || "?").trim().slice(0, user.name ? 3 : 1) : "로그인";
    nav.innerHTML =
      `<a class="tl-logo" href="/admin/" aria-label="관리 홈"><img class="l" src="/img/logo-head.png" alt="TREELAND"><img class="d" src="/img/logo-head-light.png" alt=""></a>` +
      `<div class="tl-menu">${main.map(m => `<a href="${m[2]}" data-k="${m[0]}">${m[1]}</a>`).join("")}${more.length ? `<button type="button" data-more>더보기</button>` : ""}</div>` +
      `<div class="tl-right">${user && !staff ? `<button type="button" class="tl-new" data-new>${svg("plus")}만들기</button>` : ""}<button type="button" class="tl-me" data-acct>${esc(initial)}</button></div>`;
    const tabs = document.createElement("nav");
    tabs.className = "tltabs"; tabs.setAttribute("aria-label", "탭");
    const T = [["home", "홈", "/admin/"], ["jobs", "건", "/admin/jobs.html"], ["schedule", "일정", "/schedule/"]];
    tabs.innerHTML = T.map(t => `<a href="${t[2]}" data-k="${t[0]}">${svg(t[0])}${t[1]}</a>`).join("") + `<button type="button" data-more>${svg("more")}더보기</button>`;
    tabs.style.setProperty("--n", T.length + 1);
    const sp = document.createElement("div"); sp.className = "tlbar-sp";
    document.body.insertBefore(sp, document.body.firstChild);
    document.body.insertBefore(nav, document.body.firstChild);
    document.body.appendChild(tabs);
    nav.addEventListener("click", e => {
      if(e.target.closest("[data-new]")) openNew();
      else if(e.target.closest("[data-more]")) openMore();
      else if(e.target.closest("[data-acct]")){ if(!user){ location.href = "/admin/"; return; } bindAcct(sheet(acct(), { title:"계정" })); }
    });
    tabs.addEventListener("click", e => { if(e.target.closest("[data-more]")) openMore(); });
    const mark = () => {
      const k = activeKey();
      document.querySelectorAll(".tlbar [data-k], .tltabs [data-k]").forEach(x => { if(x.dataset.k === k) x.setAttribute("aria-current", "page"); else x.removeAttribute("aria-current"); });
      const moreActive = more.some(m => m[0] === k) || ["quote", "contract", "mail"].indexOf(k) >= 0;
      tabs.querySelector("[data-more]").toggleAttribute("aria-current", moreActive);
      const mb = nav.querySelector("[data-more]"); if(mb){ mb.style.color = more.some(m => m[0] === k) ? "var(--tb-ink)" : ""; }
    };
    mark(); window.addEventListener("hashchange", mark);

    // 페이지마다 따로 있던 이동 링크 줄은 감춤 (메뉴로 통일)
    const paths = MENU.map(m => m[2].replace(/#.*$/, "")).concat(["/admin", "/ledger", "/stats"]);
    const groups = new Map();
    document.querySelectorAll("a[href]").forEach(x => {
      if(x.closest(".tlbar, .tltabs") || !x.closest("header, nav")) return;
      if(paths.indexOf(x.getAttribute("href")) < 0) return;
      const p = x.parentElement; groups.set(p, (groups.get(p) || 0) + 1);
    });
    groups.forEach((n, p) => { if(n >= 2 && p !== document.body) p.hidden = true; });
    // 예전 화면 머리글의 작은 "TREELAND" 글자는 메뉴 로고와 겹쳐서 지움 (안에 든 시각 표시 등은 그대로)
    document.querySelectorAll("header .brand").forEach(b => { [...b.childNodes].forEach(n => { if(n.nodeType === 3 && /TREELAND/.test(n.textContent)) n.textContent = n.textContent.replace(/\s*TREELAND\s*/, ""); }); if(!b.textContent.trim() && !b.children.length) b.hidden = true; });
    // 로그인했으면 관리자 비밀번호 칸 숨김 (비밀번호는 로그인할 때 자동으로 들어감)
    if(user && LS.g("tl_pin")){
      const pin = document.getElementById("pin");
      if(pin){ const box = pin.closest("#pinBox, .pinbox, .pin-sec, section, .card, .login, form"); if(box && !box.querySelector("#newForm, #list, #board")) box.classList.add("tl-pin-hidden"); }
      const ps = document.createElement("style"); ps.textContent = ".tl-pin-hidden{display:none!important}"; head.appendChild(ps);
    }
  }
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", bar); else bar();
})();

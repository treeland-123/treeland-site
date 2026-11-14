/* 트리랜드 관리 공통: 로그인 상태, 위쪽 메뉴, 직원 권한
   각 관리 페이지 <head>에 <script src="/admin/auth.js" data-page="키"></script>
   - 로그인 안 했으면: 예전처럼 관리자 비밀번호로 동작 (메뉴만 붙음)
   - 대표: 로그인할 때 서버가 비밀번호를 내려줘 예전 화면이 그대로 열림
   - 직원: 계약 서버 요청에 비밀번호 대신 로그인 정보가 붙고, 금액은 서버가 빼고 보냄.
           대표 전용 화면은 홈으로 돌려보냄 */
(function(){
  "use strict";
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
  if(!user && LS.g("tl_pin") === STAFF_PIN) LS.s("tl_pin", null);

  const me = document.currentScript;
  const embed = /[?&]embed=1/.test(location.search) || window.top !== window;
  const page = embed ? "none" : ((me && me.dataset.page) || "");
  // [키, 이름, 주소, 대표 전용]
  const MENU = [
    ["home", "홈", "/admin/", 0],
    ["schedule", "일정", "/schedule/", 0],
    ["contract", "계약", "/contract/admin.html", 0],
    ["quote", "견적서", "/quote/", 1],
    ["mail", "메일", "/mail/", 1],
    ["workorder", "작업지시서", "/workorder/", 1],
    ["proposals", "제안서", "/proposals/", 1],
    ["stats", "통계", "/stats/", 1],
    ["ledger", "장부", "/ledger/", 1],
    ["staff", "근로계약", "/staff/", 1],
    ["people", "직원 관리", "/admin/#people", 1]
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
    if(staff || LS.g("tl_pin") === STAFF_PIN) LS.s("tl_pin", null);
    LS.s("tl_sched_quotes", null);
    location.href = "/admin/";
  }
  async function call(body){
    const b = Object.assign({}, body);
    if(user){ b.sess = user.sess; delete b.pin; }
    else if(!b.pin && LS.g("tl_pin")) b.pin = LS.g("tl_pin");
    const r = await fetch(ENDPOINT, { method:"POST", headers:{ "Content-Type":"text/plain;charset=utf-8" }, body: JSON.stringify(b) });
    return r.json();
  }
  window.TL = { user, staff, page, ENDPOINT, MENU, save, logout, call, LS };

  /* 역할이 바뀌었거나 사용 중지됐는지 10분에 한 번 확인 */
  if(user && !(Date.now() - (user.checked || 0) < 6e5)){
    call({ action:"me" }).then(j => {
      if(!j) return;
      if(!j.ok && (j.error === "sess")){ logout(); return; }
      if(j.ok){
        const changed = j.role !== user.role;
        save(Object.assign({}, user, { name:j.name, role:j.role }));
        if(changed) location.reload();
      }
    }).catch(() => {});
  }

  const CSS = `
.tlbar{position:fixed;top:0;left:0;right:0;z-index:30;height:52px;display:flex;align-items:center;gap:14px;
  padding:0 max(16px,env(safe-area-inset-left,0px));background:var(--tlb-bg);border-bottom:1px solid var(--tlb-line);
  font-family:"Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo",sans-serif;font-size:14px;line-height:1;color:var(--tlb-ink)}
.tlbar a{color:inherit;text-decoration:none}
.tlbar .tl-logo{display:flex;align-items:center;flex:0 0 auto}
.tlbar .tl-logo img{height:24px;width:auto;display:block}
.tlbar .tl-logo .d{display:none}
.tlbar .tl-menu{flex:1;min-width:0;display:flex;gap:2px;overflow-x:auto;scrollbar-width:none;-webkit-mask-image:linear-gradient(90deg,#000 92%,transparent)}
.tlbar .tl-menu::-webkit-scrollbar{display:none}
.tlbar .tl-menu a{white-space:nowrap;padding:9px 10px;border-radius:6px;color:var(--tlb-sub)}
.tlbar .tl-menu a:hover{color:var(--tlb-ink);background:var(--tlb-soft)}
.tlbar .tl-menu a[aria-current=page]{color:var(--tlb-ink);font-weight:700;box-shadow:inset 0 -2px 0 var(--tlb-acc);border-radius:0}
.tlbar .tl-me{flex:0 0 auto;display:flex;align-items:center;gap:8px;color:var(--tlb-sub);font-size:13px}
.tlbar .tl-me b{color:var(--tlb-ink);font-weight:500;max-width:7em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tlbar .tl-me .tl-role{font-size:11.5px;border:1px solid var(--tlb-line);border-radius:999px;padding:3px 8px}
.tlbar .tl-me button,.tlbar .tl-me a.in{font:inherit;font-size:13px;background:none;border:1px solid var(--tlb-line);color:var(--tlb-ink);border-radius:6px;padding:6px 10px;cursor:pointer}
.tlbar-sp{height:52px}
:root{--tlb-bg:#fff;--tlb-ink:#1a1a19;--tlb-sub:#6b6b66;--tlb-line:#e4e4df;--tlb-soft:#f3f3ef;--tlb-acc:#23392f}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--tlb-bg:#1a1a18;--tlb-ink:#ececea;--tlb-sub:#a3a39e;--tlb-line:#33332f;--tlb-soft:#262624;--tlb-acc:#9fc3ae}
  :root:not([data-theme="light"]) .tlbar .tl-logo .l{display:none} :root:not([data-theme="light"]) .tlbar .tl-logo .d{display:block}}
:root[data-theme="dark"]{--tlb-bg:#1a1a18;--tlb-ink:#ececea;--tlb-sub:#a3a39e;--tlb-line:#33332f;--tlb-soft:#262624;--tlb-acc:#9fc3ae}
:root[data-theme="dark"] .tlbar .tl-logo .l{display:none} :root[data-theme="dark"] .tlbar .tl-logo .d{display:block}
@media (max-width:600px){.tlbar{gap:8px}.tlbar .tl-logo img{height:20px}.tlbar .tl-me b,.tlbar .tl-me .tl-role{display:none}}
[data-role="staff"] .owner-only{display:none!important}
@media print{.tlbar,.tlbar-sp{display:none!important}}`;

  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" })[c]); }
  function bar(){
    if(document.querySelector(".tlbar")) return;
    const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    const items = MENU.filter(m => !(staff && m[3]));
    const role = user ? (user.role === "대표" ? "대표" : "직원") : "";
    const nav = document.createElement("nav");
    nav.className = "tlbar"; nav.setAttribute("aria-label", "관리 메뉴");
    nav.innerHTML =
      `<a class="tl-logo" href="/admin/" aria-label="관리 홈"><img class="l" src="/img/logo-head.png" alt="TREELAND"><img class="d" src="/img/logo-head-light.png" alt=""></a>` +
      `<div class="tl-menu">${items.map(m => `<a href="${m[2]}" data-k="${m[0]}">${m[1]}</a>`).join("")}</div>` +
      `<div class="tl-me">${user ? `<b title="${esc(user.email)}">${esc(user.name || user.email)}</b><span class="tl-role">${role}</span><button type="button" id="tlOut">로그아웃</button>` : `<a class="in" href="/admin/">로그인</a>`}</div>`;
    const sp = document.createElement("div"); sp.className = "tlbar-sp";
    document.body.insertBefore(sp, document.body.firstChild);
    document.body.insertBefore(nav, document.body.firstChild);
    const out = nav.querySelector("#tlOut"); if(out) out.onclick = logout;
    const mark = () => {
      const k = page === "home" && location.hash === "#people" ? "people" : page;
      nav.querySelectorAll(".tl-menu a").forEach(x => { if(x.dataset.k === k) x.setAttribute("aria-current", "page"); else x.removeAttribute("aria-current"); });
      const a = nav.querySelector('[aria-current="page"]'); if(a) a.scrollIntoView({ inline:"center", block:"nearest" });
    };
    mark(); window.addEventListener("hashchange", mark);
    // 페이지마다 따로 있던 이동 링크 줄은 감춤 (위 메뉴로 통일)
    const paths = MENU.map(m => m[2].replace(/#.*$/, "")).concat(["/admin", "/ledger", "/stats"]);
    const groups = new Map();
    document.querySelectorAll("a[href]").forEach(x => {
      if(x.closest(".tlbar") || !x.closest("header, nav")) return;
      const h = x.getAttribute("href");
      if(paths.indexOf(h) < 0) return;
      const p = x.parentElement; groups.set(p, (groups.get(p) || 0) + 1);
    });
    groups.forEach((n, p) => { if(n >= 2 && p !== document.body) p.hidden = true; });
  }
  if(page !== "none"){
    document.documentElement.style.setProperty("--tlbar-h", "52px");   // 각 페이지의 sticky 요소가 메뉴 아래에 붙도록
    if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", bar); else bar();
  }
})();

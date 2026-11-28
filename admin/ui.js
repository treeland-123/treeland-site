/* 트리랜드 관리 — 새 화면 공통 도구 (날짜·금액 표기, 캐시, 상태, 움직임) */
(function(){
  "use strict";
  const WD = ["일","월","화","수","목","금","토"];
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" })[c]);
  const won = n => Number(n || 0).toLocaleString("ko-KR");
  const man = n => { n = Number(n || 0); if(n >= 10000){ const m = n / 10000; return (Number.isInteger(m) ? m : m.toFixed(1)).toLocaleString("ko-KR") + "만원"; } return won(n) + "원"; };
  const seoulKey = (off = 0) => new Intl.DateTimeFormat("sv-SE", { timeZone:"Asia/Seoul", year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date(Date.now() + off * 864e5));
  /* "2026-11-24T14:00" · "2026-11-24 14:00" · ISO(Z) → 서울 기준 날짜 조각 */
  function parts(v){
    v = String(v ?? "").replace(/^'/, "");
    if(/Z$/.test(v)){ const d = new Date(v); if(!isNaN(d)) v = new Intl.DateTimeFormat("sv-SE", { timeZone:"Asia/Seoul", year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hour12:false }).format(d).replace(" ", "T"); }
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/); if(!m) return null;
    const hasT = m[4] && !(m[4] === "00" && m[5] === "00");
    return { key:`${m[1]}-${m[2]}-${m[3]}`, y:+m[1], m:+m[2], d:+m[3], wd: WD[new Date(+m[1], +m[2] - 1, +m[3]).getDay()], h: hasT ? +m[4] : null, mi: hasT ? +m[5] : null };
  }
  const dayDiff = key => Math.round((new Date(key + "T00:00:00") - new Date(seoulKey() + "T00:00:00")) / 864e5);
  const timeKo = p => p.h == null ? "" : `${p.h < 12 ? "오전" : "오후"} ${p.h % 12 || 12}${p.mi ? ":" + String(p.mi).padStart(2, "0") : "시"}`;
  /* 사람이 읽는 날짜: 오늘 오후 2시 / 내일 / 목요일 / 11월 24일 (월) */
  function dayWord(p){
    const d = dayDiff(p.key);
    if(d === 0) return "오늘"; if(d === 1) return "내일"; if(d === -1) return "어제";
    if(d > 1 && d < 7) return `${p.wd}요일`;
    return `${p.m}월 ${p.d}일 (${p.wd})`;
  }
  const rel = v => { const p = parts(v); if(!p) return String(v || ""); const t = timeKo(p); return dayWord(p) + (t ? " " + t : ""); };
  /* 목록 왼쪽 날짜 칸: 큰 글씨 한 줄 + 작은 글씨 한 줄 */
  function whenCell(v, label){
    const p = parts(v); if(!p) return `<span class="when">—</span>`;
    const d = dayDiff(p.key);
    const top = d === 0 ? "오늘" : d === 1 ? "내일" : `${p.m}/${p.d} ${p.wd}`;
    return `<span class="when">${esc(top)}<span>${esc([label, timeKo(p)].filter(Boolean).join(" "))}</span></span>`;
  }
  const short = v => { const p = parts(v); return p ? `${p.m}/${p.d}` : ""; };
  const telHref = t => String(t || "").replace(/[^0-9+]/g, "");
  function telShow(t){ const d = telHref(t); if(/^01\d{8,9}$/.test(d)) return d.length === 10 ? `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}` : `${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7)}`; if(/^02\d{7,8}$/.test(d)) return d.length === 9 ? `02-${d.slice(2,5)}-${d.slice(5)}` : `02-${d.slice(2,6)}-${d.slice(6)}`; return String(t || ""); }
  const normName = n => String(n || "").replace(/^\s*(주식회사|유한회사|\(주\)|㈜)\s*/, "").replace(/\s*(주식회사|\(주\)|㈜)\s*$/, "").replace(/\s+/g, "");

  /* 건 상태 (용어표 고정) */
  const SIGNED = it => it.status === "서명완료";
  function stage(it){
    if(it.halt) return ["설치 중단", "bad"];
    if(it.archived) return ["보관", "gray"];
    if(it.status === "서명대기") return ["서명 대기", "wait"];
    if(it.doneOut) return ["회수 완료", "gray"];
    if(it.doneIn) return ["설치 완료", "ok"];
    return ["설치 예정", "acc"];
  }
  const dueKey = key => { const d = new Date(key + "T00:00:00"); d.setDate(d.getDate() + 3); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
  function payWaiting(list, extras){
    const t = seoulKey();
    return list.filter(it => SIGNED(it) && !it.halt && !it.archived && !TL.isPaid(it, extras) && (it.doneIn || (((parts(it.install) || {}).key) || "9") < t));
  }

  /* 캐시: 이 기기에 마지막 내용 저장 → 다음에 열 때 바로 보여줌 */
  const cache = {
    get(k){ try{ const c = JSON.parse(localStorage.getItem("tl_c_" + k) || "null"); return c && c.u === (TL.user ? TL.user.email : "pin") ? c : null; }catch(e){ return null; } },
    set(k, v){ try{ localStorage.setItem("tl_c_" + k, JSON.stringify(Object.assign({ u: TL.user ? TL.user.email : "pin", at: Date.now() }, v))); }catch(e){} }
  };
  /* 숫자 올라가기 — 처음 그릴 때만 */
  function countUp(el, to){
    to = Number(to) || 0;
    if(matchMedia("(prefers-reduced-motion: reduce)").matches || to === 0){ el.textContent = to; return; }
    const t0 = performance.now(), dur = Math.min(700, 300 + to * 25);
    (function f(t){ const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(to * e); if(k < 1) requestAnimationFrame(f); })(t0);
  }
  /* 목록 차례로 나타나기 */
  function rise(container){ [...container.children].slice(0, 14).forEach((c, i) => { c.style.setProperty("--i", i); c.classList.add("rise"); }); }
  const skRows = n => Array.from({ length: n }, () => `<div class="row"><span class="sk line" style="width:52px"></span><span style="display:flex;flex-direction:column;gap:8px"><span class="sk line" style="width:60%"></span><span class="sk line" style="width:40%;height:12px"></span></span><span class="sk line" style="width:56px;height:26px;border-radius:999px"></span></div>`).join("");

  /* ---------- 데이터: 건 전체 + 장부 입금 + 견적 + 기록 (홈·건 목록 공통) ---------- */
  const QUOTE_EP = "https://script.google.com/macros/s/AKfycbxigaA0T_E9v7DG9AhjUxlCUysyDrREY3pVBPrC7twXq0D0HsipphzPJAEFkqudnrM0TQ/exec";
  async function quoteList(){
    const pin = TL.LS.g("tl_pin"); if(TL.staff || !pin) return [];
    try{
      const q = a => fetch(QUOTE_EP, { method:"POST", headers:{ "Content-Type":"text/plain;charset=utf-8" }, body: JSON.stringify({ action:a, pin }) }).then(r => r.json());
      let j = await q("brief");   // 견적 내용 없이 가벼운 목록 (견적 서버 v5). 예전 서버면 전체 목록
      if(!j.ok && j.error === "bad_action") j = await q("list");
      return (j.quotes || []).map(x => ({ no:x.no, cust:x.cust, total:x.total, at:x.at, sentAt:x.sentAt }));
    }catch(e){ return []; }
  }
  async function loadAll(opt){
    opt = opt || {};
    const owner = !TL.staff;
    const [j, q, x, a] = await Promise.all([
      TL.call({ action:"jobs", all:true }),
      owner && opt.quotes ? quoteList() : [],
      owner ? TL.ledgerExtras() : null,
      owner && TL.user && opt.log ? TL.call({ action:"log" }).catch(() => null) : null
    ]);
    if(!j.ok){ const e = new Error(j.error === "bad_action" ? "서버가 아직 예전 버전입니다." : j.error === "pin" ? "로그인이 필요합니다." : (j.error || "불러오지 못했습니다.")); e.code = j.error; throw e; }
    const prev = cache.get("all") || {};
    const d = { all: j.items || [], staff: j.staff || [], quotes: opt.quotes ? q : (prev.quotes || []), extras: x, log: a && a.ok ? (a.log || []) : (prev.log || []), bank: j.bank || "", storeLink: j.storeLink || "" };
    cache.set("all", d); return d;
  }
  function events(list){   // 아직 끝나지 않은 설치·회수를 날짜순으로
    const out = [];
    list.forEach(it => {
      const a = parts(it.install), b = parts(it.retrieve);
      if(a && !it.doneIn) out.push({ kind:"in", p:a, it });
      if(b && it.status === "서명완료" && !it.doneOut) out.push({ kind:"out", p:b, it });
    });
    return out.sort((x, y) => (x.p.key + String(x.p.h ?? 99).padStart(2, "0")).localeCompare(y.p.key + String(y.p.h ?? 99).padStart(2, "0")));
  }
  /* 단계별 묶음 (홈 카드와 건 목록 필터가 같은 기준을 씀) */
  function groups(d){
    const all = d.all || [], owner = !TL.staff, me = TL.user && TL.user.email;
    const live = all.filter(x => !x.archived && !x.halt);
    const byIn = (a, b) => ((parts(a.install) || {}).key || "9").localeCompare((parts(b.install) || {}).key || "9");
    const byOut = (a, b) => ((parts(a.retrieve) || {}).key || "9").localeCompare((parts(b.retrieve) || {}).key || "9");
    const t = seoulKey();
    const G = {};
    G.sign = live.filter(x => x.status === "서명대기").sort(byIn);
    G.install = live.filter(x => SIGNED(x) && !x.doneIn).sort(byIn);
    G.week = G.install.filter(x => { const p = parts(x.install); if(!p) return false; const dd = dayDiff(p.key); return dd <= 6 && dd >= -14; });
    G.late = G.week.filter(x => dayDiff(parts(x.install).key) < 0);
    G.pay = owner ? payWaiting(live, d.extras).sort(byIn) : [];
    G.over = G.pay.filter(x => { const p = parts(x.install); return p && dueKey(p.key) < t; });
    // 입금 완료: 장부 기준, 최근 입금 순
    G.paid = owner ? live.filter(x => SIGNED(x) && TL.isPaid(x, d.extras)).sort((a, b) => String(TL.paidDate(b, d.extras)).localeCompare(String(TL.paidDate(a, d.extras)))) : [];
    G.ret = live.filter(x => SIGNED(x) && !x.doneOut && parts(x.retrieve)).sort(byOut);
    G.ret2w = G.ret.filter(x => dayDiff(parts(x.retrieve).key) <= 13);
    G.done = all.filter(x => x.doneOut && !x.archived).sort(byOut);
    G.halt = all.filter(x => x.halt && !x.archived);
    // 세금계산서: 설치 끝난 계좌이체·현금 건 (카드 결제는 카드 영수증이 증빙이라 제외). 할 일 = 미등록·요청함·발행 대기
    const TORD = { none:0, req:1, ready:2, done:3 };
    G.tax = owner ? live.filter(x => SIGNED(x) && x.doneIn && x.pay !== "카드 결제")
      .map(x => ({ x, s: taxState(x, d.extras) })).sort((a, b) => TORD[a.s.k] - TORD[b.s.k] || (b.s.days || 0) - (a.s.days || 0)).map(o => o.x) : [];
    G.taxTodo = G.tax.filter(x => taxState(x, d.extras).k !== "done");
    G.taxDone = G.tax.length - G.taxTodo.length;
    G.archived = all.filter(x => x.archived);
    G.mine = live.filter(x => me && x.crew === me && !x.doneOut).sort(byIn);
    G.live = all.filter(x => !x.archived);
    if(owner){
      const conQ = new Set(all.map(x => String(x.qno || "")).filter(Boolean)), conN = new Set(all.map(x => normName(x.name)).filter(Boolean));
      const cutoff = Date.now() - 30 * 864e5;
      G.quote = (d.quotes || []).filter(x => { const tm = new Date(x.sentAt || x.at).getTime(); return tm >= cutoff && !conQ.has(String(x.no)) && !conN.has(normName(x.cust)); });
    }else G.quote = [];
    return G;
  }
  const jobUrl = it => `/admin/job.html?id=${encodeURIComponent(it.id)}`;
  /* 세금계산서 상태: 발행 완료(장부 체크) > 발행 대기(정보 있음) > 요청함 n일째 > 미등록 */
  function taxState(it, extras){
    const t = it.tax || {}, ex = extras && extras[it.id];
    if(ex && ex.taxInvoice) return { k:"done", label:"발행 완료", cls:"ok" };
    if(t.kind === "person" && t.phone) return { k:"ready", label:"현금영수증 발행 대기", cls:"ret", person:true };
    // 발행 대기 = 사업자등록증을 받았거나, 상호·업종·사업자번호를 다 받았고 받을 이메일이 있음
    const biz = String(t.biz || it.biz || "").replace(/\D/g, ""), email = t.email || it.email;
    if(email && (t.doc || (biz.length === 10 && (t.name || it.name) && t.item))) return { k:"ready", label:"발행 대기", cls:"ret" };
    if(t.req){ const n = Math.max(0, -dayDiff(String(t.req).slice(0, 10))); return { k:"req", label: n ? `요청 ${n}일째` : "오늘 요청함", cls: n >= 3 ? "bad" : "wait", days:n }; }
    return { k:"none", label:"미등록", cls:"bad" };
  }
  // 홈택스에 옮겨 적을 발행 정보 (공급가액 = 계약 임대료, 운임 포함)
  function taxInfoText(it){
    const t = it.tax || {}, n = Number(it.price) || 0, v = Math.round(n * 0.1), p = parts(it.install), day = p ? p.key : "";
    if(t.kind === "person") return [`[현금영수증 발행 정보] ${it.name || ""}`, `휴대폰: ${t.phone}`, `거래일: ${day}`, `금액: ${won(n + v)}원 (공급가액 ${won(n)} + 부가세 ${won(v)})`].join("\n");
    return [`[세금계산서 발행 정보] ${it.name || ""}`, t.doc ? `사업자등록증: ${t.doc}` : "",
      `상호: ${t.name || it.name || ""}`, `사업자등록번호: ${t.biz || it.biz || ""}`, `대표자: ${t.rep || it.rep || ""}`, t.item ? `업종: ${t.item}` : "",
      `이메일: ${t.email || it.email || ""}`, t.addr ? `주소: ${t.addr}` : "",
      `작성일자: ${day}`, `품목: 크리스마스트리 대여·설치`, `공급가액: ${won(n)}원`, `세액: ${won(v)}원`, `합계: ${won(n + v)}원`].filter(Boolean).join("\n");
  }
  function taxReqText(it, url){
    return ["안녕하세요, 트리랜드입니다.", `${it.name ? it.name + " " : ""}트리 설치 건 세금계산서 발행을 위해 아래 링크에서 사업자등록증을 올리거나 사업자 정보를 넣어 주세요.`, "사업자가 아니시면 같은 링크에서 현금영수증 받을 번호를 넣어 주시면 됩니다.", "", url].join("\n");
  }
  /* 미결제 재안내: 입금 기한(설치일+3일)이 지난 날 수와 1차/2차(기한 후 7일 이상) */
  function overdue(it){
    const p = parts(it.install); if(!p) return null;
    const due = dueKey(p.key), over = -dayDiff(due);
    return over >= 1 ? { due, over, level: over >= 7 ? 2 : 1 } : null;
  }
  // 카드 결제 안내 줄 (대표님 양식 11/21): 스토어 링크는 건마다 새로 만들어 넣으므로 「(링크)」 자리만, 예약결제 옵션 = 그 현장 견적번호
  function cardLines(it){ const q = String(it.qno || "").replace(/^'/, ""); return ["결제 링크: (링크)", ...(q ? [`+옵션에서 「예약결제 ${q}」를 선택해주세요+`] : [])]; }
  function remindText(it, o){   // o: { bank, storeLink, taxUrl, extras }
    const od = overdue(it) || { due:"", level:1 }, n = Number(it.price) || 0, total = n + Math.round(n * 0.1);
    const dp = parts(od.due), dueTxt = dp ? `${dp.m}월 ${dp.d}일` : "";
    const card = it.pay === "카드 결제", nm = it.name ? it.name + " " : "";
    const pay = [`결제 금액: ${won(total)}원 (부가세 포함)`, ...(card ? cardLines(it, o.storeLink) : [`입금 계좌: ${o.bank || "(계좌)"}`])];
    const s = taxState(it, o.extras);
    const tax = !card && o.taxUrl && s.k !== "ready" && s.k !== "done" ? ["", "세금계산서 발행을 위해 아래 링크에서 사업자 정보를 등록해 주세요.", o.taxUrl] : [];
    const head = od.level === 2
      ? ["안녕하세요, 트리랜드입니다.", `${nm}트리 설치 건 대금이 기한(${dueTxt})에서 7일이 지나도록 확인되지 않아 다시 안내드립니다.`]
      : ["안녕하세요, 트리랜드입니다.", `${nm}트리 설치 건 결제 관련해 다시 연락드립니다.`, `${dueTxt}까지로 안내드린 금액이 아직 확인되지 않아 한 번 더 안내드립니다.`];
    const tail = od.level === 2
      ? ["계약서 제6조에 따라 설치 완료일로부터 3일 이내 결제 조건이며, 처리 일정이 따로 있으시면 회신 부탁드립니다."]
      : [`이미 ${card ? "결제" : "입금"}하셨다면 ${card ? "결제일" : "입금일과 입금자명"}을 알려 주세요. 바로 확인하겠습니다.`];
    return [...head, "", ...pay, "", ...tail, ...tax].join("\n");
  }
  // 복사: 휴대폰이 막으면 글 상자를 띄워 길게 눌러 복사
  async function copyText(text, title, okMsg){
    try{ await navigator.clipboard.writeText(text); TL.toast(okMsg || "복사했습니다"); return true; }
    catch(e){
      const sh = TL.sheet(`<textarea readonly style="width:100%;min-height:220px;font:inherit;font-size:15px;line-height:1.5;border:0;background:var(--fill);border-radius:12px;padding:12px">${esc(text)}</textarea><p class="hint" style="margin-top:8px">길게 눌러 전체 선택 → 복사</p>`, { title: title || "복사" });
      const ta = sh.el.querySelector("textarea"); ta.focus(); ta.select(); return false;
    }
  }

  /* 목록 한 줄. mode: in(설치일 기준) / out(회수일 기준) / pay */
  function rowHtml(it, mode, d){
    const st = stage(it), crew = (d && d.staff || []).find(s => s.email === it.crew);
    let when, chip = st;
    // 상태 칩이 설치/회수를 말해 주므로 날짜 칸에는 시각만. 입금 대기 목록은 날짜가 설치일이라 '설치'를 붙임
    if(mode === "out") when = whenCell(it.retrieve, "");
    else when = whenCell(it.install, mode === "pay" ? "설치" : "");
    if(mode === "pay"){
      const p = parts(it.install), od = p && dueKey(p.key) < seoulKey();
      chip = [od ? "기한 지남" + (it.remind && it.remind.n ? ` · 재안내 ${it.remind.n}회` : "") : "입금 대기", od ? "bad" : "wait"];
    }
    if(mode === "out" && !it.doneOut) chip = ["회수 예정", "ret"];
    const line = [it.place, mode === "pay" ? (it.pay || "결제 방법 미정") : it.size, crew ? "담당 " + (crew.name || crew.email) : ""].filter(Boolean).join(" · ");
    // 견적 번호 · 금액 (대표만). 누르면 견적서가 아래에서 올라옴 (11/27)
    const qno = String(it.qno || "").replace(/^'/, ""), q = qno && !TL.staff && d && d.quotes ? d.quotes.find(x => x.no === qno) : null;
    // 금액은 계약서 임대료(부가세 포함) 기준 = 결제 안내 금액. 견적서는 계약 뒤에 고쳐 저장될 수 있어서 금액이 다르면 따로 표시 (11/28 연세대 신촌)
    const price = Number(it.price) || 0, ctot = price ? price + Math.round(price * 0.1) : 0;
    // 견적 합계 = 임대료면 '부가세 빼고 발행' 견적 → 부가세 없이 임대료가 결제 금액
    const qt = q ? Number(q.total) || 0 : 0, noVat = !!price && qt === price;
    const amt = noVat ? ` · ${won(price)}원 (부가세 없음)` : ctot ? ` · ${won(ctot)}원` : q ? ` · ${won(qt)}원` : "";
    const diff = ctot && qt && qt !== ctot && qt !== price ? ` <em class="qdiff">견적서 ${won(qt)}원과 다름</em>` : "";
    const qline = qno && !TL.staff ? `<span class="qlink" data-quote="${esc(qno)}" data-qname="${esc(it.name || "")}" data-qpdf="${esc(it.qpdf || "")}" role="button" tabindex="0">견적 ${esc(qno)}${amt}${diff}</span>` : "";
    return `<a class="row" href="${jobUrl(it)}">${when}<span class="what"><b>${esc(it.name || it.place || "(상호 미입력)")}</b><span>${esc(line)}</span>${qline}</span><span class="end"><span class="chip ${chip[1]}">${esc(chip[0])}</span></span></a>`;
  }
  function quoteRow(x){
    return `<a class="row" href="/quote/?open=${encodeURIComponent(x.no)}" data-quote="${esc(x.no)}" data-qname="${esc(x.cust || "")}" data-qcontract="1">${whenCell(x.sentAt || x.at, "보냄")}<span class="what"><b>${esc(x.cust || "(상호 없음)")}</b><span>견적 No. ${esc(x.no)} · ${man(x.total)}</span></span><span class="end"><span class="chip gray">견적</span></span></a>`;
  }

  /* ---------- 견적서 보기 (11/27): 아래에서 올라오는 창. 계약에 붙은 견적서 PDF가 있으면 그것, 없으면 견적서 화면 기록을 그려서 보여 줌 ---------- */
  function quoteSheet(no, o){
    o = o || {};
    const m = String(o.pdf || "").match(/\/d\/([\w-]{20,})|[?&]id=([\w-]{20,})|^([\w-]{25,})$/), fid = m && (m[1] || m[2] || m[3]);
    const src = fid ? `https://drive.google.com/file/d/${fid}/preview` : `/quote/?view=${encodeURIComponent(no)}`;
    const acts = [
      fid ? `<a class="btn sub sm" href="https://drive.google.com/file/d/${fid}/view" target="_blank" rel="noopener">PDF 열기</a>` : "",
      o.contract ? `<a class="btn sm" href="/contract/admin.html?q=${encodeURIComponent(no)}">계약서 만들기</a>` : "",
      `<a class="btn sub sm" href="/quote/?open=${encodeURIComponent(no)}">견적서 화면에서 고치기</a>`,
      `<button type="button" class="btn sub sm" data-close>닫기</button>`
    ].join("");
    const sh = TL.sheet(`<div class="qv"><iframe src="${src}" title="견적서 ${esc(no)}"></iframe></div><div class="btns qv-btns">${acts}</div>`, { title: `견적서 ${no}${o.name ? " · " + o.name : ""}${fid ? " (고객에게 보낸 PDF)" : ""}` });
    const f = sh.el.querySelector("iframe"), fit = () => { if(f.isConnected) f.style.height = Math.round(f.clientWidth * 1123 / 794) + "px"; };
    fit(); requestAnimationFrame(fit); setTimeout(fit, 250);
  }
  // 목록 어디서든 [data-quote]를 누르면 견적서 창 (줄 링크로 넘어가지 않음)
  document.addEventListener("click", e => {
    const q = e.target.closest("[data-quote]"); if(!q || TL.staff) return;
    e.preventDefault(); e.stopPropagation();
    quoteSheet(q.dataset.quote, { name: q.dataset.qname, pdf: q.dataset.qpdf, contract: !!q.dataset.qcontract });
  }, true);

  /* ---------- 필요 자재: 계약의 트리 구성 + 추가 장식에서 만듦 (사이트 기준 수량) ---------- */
  const BOX = { "1.95m 슬림":3, "2.3m":5, "2.3m 스노우":5, "2.9m":8 };
  function parseTrees(size){
    return String(size || "").split(/,\s*(?![^()]*\))/).map(s => {
      const m = s.match(/(1\.35m|1\.95m(?: 슬림)?|2\.3m(?: 스노우)?|2\.9m)\s*(스탠다드|프리미엄)?\s*트리\s*(\d+)\s*대(?:\s*\(([^)]*)\))?/);
      if(!m) return null;
      const sz = m[1] === "1.95m" ? "1.95m 슬림" : m[1];
      return { size: sz, tier: sz === "1.35m" ? "" : (m[2] || ""), qty: +m[3] || 1, place: m[4] || "" };
    }).filter(Boolean);
  }
  /* 오너먼트는 색상별 세트(1세트 80개). 1.95m·2.3m 스탠다드 1 · 프리미엄 1.5, 2.9m 스탠다드 2 (프리미엄은 확인) */
  const SETS = { "1.95m 슬림":[1, 1.5], "2.3m":[1, 1.5], "2.3m 스노우":[1, 1.5], "2.9m":[2, null] };
  function setsOf(t){ const s = SETS[t.size]; if(!s) return null; const v = t.tier === "프리미엄" ? s[1] : t.tier === "스탠다드" ? s[0] : null; return v == null ? null : v * t.qty; }
  // 계약의 장식 색상: 한 가지면 모든 트리, 여러 그루면 "2.3m 스노우 레드 & 골드, 2.3m 화이트 & 샴페인"처럼 트리 순서대로
  function colorOf(it, i, n){
    const raw = String(it.color || "").trim(); if(!raw) return "색상 미정";
    const parts = raw.split(/\s*,\s*/).map(x => x.replace(/^\d\.\d+m(\s*(슬림|스노우))?\s*/, "").trim()).filter(Boolean);
    if(n > 1 && parts.length === n) return parts[i];
    return parts.length === 1 ? parts[0] : raw;
  }
  const setTxt = n => (Math.round(n * 10) / 10).toString();
  function materials(it){
    const groups = [], trees = parseTrees(it.size);
    trees.forEach((t, i) => {
      const q = t.qty, x = n => n * q, tag = trees.length > 1 ? `${i + 1}. ` : "";
      const name = `${t.size}${t.tier ? " " + t.tier : ""} 트리 ${q}대${t.place ? " · " + t.place : ""}`;
      const rows = [[`${tag}트리 본체`, `${t.size}${t.tier ? " " + t.tier : ""} ${q}대`]];
      const prem = t.tier === "프리미엄", std = t.tier === "스탠다드";
      if(t.size === "1.35m"){
        rows.push([`${tag}오너먼트`, "단일 구성(프리미엄 장식)"], [`${tag}상단 별`, "기본 별"]);
      }else{
        const col = colorOf(it, i, trees.length), st = setsOf(t);
        if(t.size.startsWith("2.3m") && (prem || std)) rows.push([`${tag}오너먼트 ${x(prem ? 120 : 80)}개`, `${col} ${setTxt(st)}세트`]);
        else rows.push([`${tag}오너먼트`, st != null ? `${col} ${setTxt(st)}세트` : t.tier ? `${col} · 세트 수 확인` : "구성(스탠다드·프리미엄) 확인"]);
        if(BOX[t.size] && (prem || std)) rows.push([`${tag}하단 상자 ${x(BOX[t.size] * (prem ? 2 : 1))}개`, ""]);
        else rows.push([`${tag}하단 상자`, "개수 확인"]);
        rows.push([`${tag}트리 스커트${prem ? " 150cm" : std ? " 122cm" : ""}`, q > 1 ? `${q}개` : ""]);
        rows.push([prem ? `${tag}리모컨 LED 별 + 리모컨` : `${tag}상단 별`, prem ? "" : std ? "기본 별" : ""]);
        if(prem) rows.push([`${tag}벨벳 리본 · 솔방울 · 베리`, "프리미엄 전용 장식"]);
      }
      groups.push({ title: name, rows });
    });
    if(!trees.length && it.size) groups.push({ title: it.size, rows: [["트리·장식", "계약 문구를 확인하세요"]] });
    const add = String(it.addons || "").split(/\n+/).map(s => s.trim()).filter(s => s && !/^(견적서와 같습니다|없음|-)$/.test(s));
    if(add.length) groups.push({ title: "추가 장식·소품", rows: add.map(a => [a, ""]) });
    return groups;
  }

  /* 자재 합계: 여러 현장을 합쳐 셀 수 있는 것만 숫자로, 나머지는 '확인' 목록 */
  function matTotals(items){
    const T = new Map(), check = [], addons = new Map();
    const put = (k, n, sub, who) => { const o = T.get(k) || { k, n:0, sub:sub || "", who:[] }; o.n += n; if(who && !o.who.includes(who)) o.who.push(who); T.set(k, o); };
    items.forEach(it => {
      const who = it.name || it.place || "(상호 없음)", trees = parseTrees(it.size);
      if(!trees.length && it.size) check.push([who, "트리 구성 문구를 읽지 못함: " + it.size]);
      trees.forEach((t, i) => {
        const q = t.qty, prem = t.tier === "프리미엄", std = t.tier === "스탠다드", col = colorOf(it, i, trees.length);
        put(`${t.size}${t.tier ? " " + t.tier : ""} 트리`, q, "대", who);
        if(t.size === "1.35m"){ put(`1.35m 단일 구성 장식 · ${col}`, q, "세트", who); put("상단 별 (기본)", q, "개", who); return; }
        if(!prem && !std){ check.push([who, `${t.size} (${col}) 구성(스탠다드·프리미엄)이 없어 오너먼트 세트·상자·스커트 수량 확인`]); return; }
        const st = setsOf(t);
        if(st != null) put(`오너먼트 ${col}`, st, "세트", who);
        else check.push([who, `${t.size} ${t.tier} 오너먼트 세트 수 확인 (${col})`]);
        if(BOX[t.size]) put("하단 상자", q * BOX[t.size] * (prem ? 2 : 1), "개", who);
        put(`트리 스커트 ${prem ? "150cm" : "122cm"}`, q, "개", who);
        put(prem ? "리모컨 LED 별 + 리모컨" : "상단 별 (기본)", q, "개", who);
        if(prem) put("벨벳 리본 · 솔방울 · 베리", q, "세트", who);
      });
      String(it.addons || "").split(/\n+/).map(s => s.trim()).filter(s => s && !/^(견적서와 같습니다|없음|-)$/.test(s)).forEach(s => {
        const o = addons.get(s) || { k:s, who:[] }; o.who.push(who); addons.set(s, o);
      });
    });
    T.forEach(o => { if(/^오너먼트 /.test(o.k)) o.n = Math.round(o.n * 10) / 10; });
    const order = r => r.sub === "대" ? 0 : /^오너먼트/.test(r.k) ? 1 : /상자/.test(r.k) ? 2 : /스커트/.test(r.k) ? 3 : /별/.test(r.k) ? 4 : 5;
    const rows = [...T.values()].sort((x, y) => order(x) - order(y) || x.k.localeCompare(y.k));
    return { rows, check, addons: [...addons.values()] };
  }

  window.UI = { quoteSheet, WD, esc, won, man, parts, dayDiff, seoulKey, timeKo, rel, whenCell, short, telHref, telShow, normName, stage, SIGNED, dueKey, payWaiting, cache, countUp, rise, skRows, loadAll, quoteList, events, groups, jobUrl, rowHtml, quoteRow, taxState, taxInfoText, taxReqText, copyText, overdue, cardLines, remindText, BOX, parseTrees, materials, matTotals };
})();

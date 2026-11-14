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
      const r = await fetch(QUOTE_EP, { method:"POST", headers:{ "Content-Type":"text/plain;charset=utf-8" }, body: JSON.stringify({ action:"list", pin }) });
      const j = await r.json(); return (j.quotes || []).map(x => ({ no:x.no, cust:x.cust, total:x.total, at:x.at, sentAt:x.sentAt }));
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
    const d = { all: j.items || [], staff: j.staff || [], quotes: opt.quotes ? q : (prev.quotes || []), extras: x, log: a && a.ok ? (a.log || []) : (prev.log || []) };
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
    G.ret = live.filter(x => SIGNED(x) && !x.doneOut && parts(x.retrieve)).sort(byOut);
    G.ret2w = G.ret.filter(x => dayDiff(parts(x.retrieve).key) <= 13);
    G.done = all.filter(x => x.doneOut && !x.archived).sort(byOut);
    G.halt = all.filter(x => x.halt && !x.archived);
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
  /* 목록 한 줄. mode: in(설치일 기준) / out(회수일 기준) / pay */
  function rowHtml(it, mode, d){
    const st = stage(it), crew = (d && d.staff || []).find(s => s.email === it.crew);
    let when, chip = st;
    // 상태 칩이 설치/회수를 말해 주므로 날짜 칸에는 시각만. 입금 대기 목록은 날짜가 설치일이라 '설치'를 붙임
    if(mode === "out") when = whenCell(it.retrieve, "");
    else when = whenCell(it.install, mode === "pay" ? "설치" : "");
    if(mode === "pay"){
      const p = parts(it.install), od = p && dueKey(p.key) < seoulKey();
      chip = [od ? "기한 지남" : "입금 대기", od ? "bad" : "wait"];
    }
    if(mode === "out" && !it.doneOut) chip = ["회수 예정", "acc"];
    const line = [it.place, mode === "pay" ? (it.pay || "결제 방법 미정") : it.size, crew ? "담당 " + (crew.name || crew.email) : ""].filter(Boolean).join(" · ");
    return `<a class="row" href="${jobUrl(it)}">${when}<span class="what"><b>${esc(it.name || it.place || "(상호 미입력)")}</b><span>${esc(line)}</span></span><span class="end"><span class="chip ${chip[1]}">${esc(chip[0])}</span></span></a>`;
  }
  function quoteRow(x){
    return `<a class="row" href="/quote/">${whenCell(x.sentAt || x.at, "보냄")}<span class="what"><b>${esc(x.cust || "(상호 없음)")}</b><span>견적 No. ${esc(x.no)} · ${man(x.total)}</span></span><span class="end"><span class="chip gray">견적</span></span></a>`;
  }

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
  function materials(it){
    const groups = [], trees = parseTrees(it.size);
    trees.forEach((t, i) => {
      const q = t.qty, x = n => n * q, tag = trees.length > 1 ? `${i + 1}. ` : "";
      const name = `${t.size}${t.tier ? " " + t.tier : ""} 트리 ${q}대${t.place ? " · " + t.place : ""}`;
      const rows = [[`${tag}트리 본체`, `${t.size}${t.tier ? " " + t.tier : ""} ${q}대`]];
      const prem = t.tier === "프리미엄", std = t.tier === "스탠다드";
      if(t.size === "1.35m"){
        rows.push([`${tag}오너먼트`, "단일 구성(프리미엄 장식)"], [`${tag}상단 별`, ""]);
      }else{
        if(t.size.startsWith("2.3m") && (prem || std)) rows.push([`${tag}오너먼트 ${x(prem ? 120 : 80)}개`, "2.3m 기준 수량"]);
        else rows.push([`${tag}오너먼트`, t.tier ? "" : "구성(스탠다드·프리미엄) 확인"]);
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
      trees.forEach(t => {
        const q = t.qty, prem = t.tier === "프리미엄", std = t.tier === "스탠다드";
        put(`${t.size}${t.tier ? " " + t.tier : ""} 트리`, q, "대", who);
        if(t.size === "1.35m"){ put("1.35m 단일 구성 장식", q, "세트", who); put("상단 별 (기본)", q, "개", who); return; }
        if(!prem && !std){ check.push([who, `${t.size} 구성(스탠다드·프리미엄)이 없어 오너먼트·상자·스커트 수량 확인`]); return; }
        if(t.size.startsWith("2.3m")) put("오너먼트 (2.3m)", q * (prem ? 120 : 80), "개", who);
        else put(`오너먼트 (${t.size} ${t.tier})`, q, "세트", who);
        if(BOX[t.size]) put("하단 상자", q * BOX[t.size] * (prem ? 2 : 1), "개", who);
        put(`트리 스커트 ${prem ? "150cm" : "122cm"}`, q, "개", who);
        put(prem ? "리모컨 LED 별 + 리모컨" : "상단 별 (기본)", q, "개", who);
        if(prem) put("벨벳 리본 · 솔방울 · 베리", q, "세트", who);
      });
      String(it.addons || "").split(/\n+/).map(s => s.trim()).filter(s => s && !/^(견적서와 같습니다|없음|-)$/.test(s)).forEach(s => {
        const o = addons.get(s) || { k:s, who:[] }; o.who.push(who); addons.set(s, o);
      });
    });
    const order = r => r.sub === "대" ? 0 : /^오너먼트/.test(r.k) ? 1 : /상자/.test(r.k) ? 2 : /스커트/.test(r.k) ? 3 : /별/.test(r.k) ? 4 : 5;
    const rows = [...T.values()].sort((x, y) => order(x) - order(y) || x.k.localeCompare(y.k));
    return { rows, check, addons: [...addons.values()] };
  }

  window.UI = { WD, esc, won, man, parts, dayDiff, seoulKey, timeKo, rel, whenCell, short, telHref, telShow, normName, stage, SIGNED, dueKey, payWaiting, cache, countUp, rise, skRows, loadAll, quoteList, events, groups, jobUrl, rowHtml, quoteRow, BOX, parseTrees, materials, matTotals };
})();

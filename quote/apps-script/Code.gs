/**
 * 트리랜드 견적 서버 (Apps Script, 계정 hongjs100418@gmail.com — 계약·장부·통계와 같은 계정)
 * - 견적서 발행 페이지(treeland.kr/quote/)의 발행 내역을 드라이브 시트 「트리랜드 견적」에 저장 → 모든 기기에서 같은 목록
 * - 견적 번호(내부 관리번호)는 여기서 매김 → 기기가 달라도 겹치지 않음
 * - 견적서 메일 발송: Gmail의 '다른 주소에서 메일 보내기'에 등록된 info@treeland.kr을 발신자로 보냄
 * - 비밀번호: 따로 없음. 계약 서버에 schedule 액션으로 물어보고 맞으면 6시간 캐시 (장부·통계와 같은 방식)
 * - 재배포: 배포 → 배포 관리 → 연필 → 버전: 새 버전 (새 배포 금지, 주소 바뀜)
 */
const CONTRACT_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxSKXLeVZoI-Qx2rieXI_f4DjKdf7jNzI9S_vtBrJJnqMYjOBvzs9TUHxQK7Ko0h-9oDg/exec';
const FROM = 'info@treeland.kr';
const FROM_NAME = '트리랜드';
const COLS = ['no', 'cust', 'email', 'total', 'savedAt', 'sentAt', 'sentTo', 'state'];

function doGet() { return out({ ok: true, service: 'treeland-quote' }); }

function doPost(e) {
  let b = {};
  try { b = JSON.parse(e.postData.contents || '{}'); } catch (x) { return out({ error: 'bad_json' }); }
  if (!checkPin(b.pin)) return out({ error: 'pin' });
  try {
    switch (b.action) {
      case 'list': return out({ ok: true, quotes: list(), next: peekNo(b.year) });
      case 'reserve': return out({ ok: true, no: reserveNo(b.year) });
      case 'save': return out(save(b.quote));
      case 'delete': return out(remove(b.no));
      case 'send': return out(send(b));
      case 'check': return out({ ok: true, aliasReady: aliasReady() });
      default: return out({ error: 'bad_action' });
    }
  } catch (err) { return out({ error: 'server', message: String(err && err.message || err) }); }
}

function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function checkPin(pin) {
  if (!pin) return false;
  const key = 'pin_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(pin)));
  const cache = CacheService.getScriptCache();
  if (cache.get(key)) return true;
  try {
    const r = UrlFetchApp.fetch(CONTRACT_ENDPOINT, { method: 'post', contentType: 'text/plain;charset=utf-8', payload: JSON.stringify({ action: 'schedule', pin: String(pin) }), muteHttpExceptions: true, followRedirects: true });
    const j = JSON.parse(r.getContentText());
    if (j && !j.error) { cache.put(key, '1', 21600); return true; }
  } catch (x) {}
  return false;
}

/* ---------- 시트 ---------- */
function sheet() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('SHEET_ID'), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (x) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create('트리랜드 견적');
    props.setProperty('SHEET_ID', ss.getId());
    const sh = ss.getSheets()[0]; sh.setName('견적'); sh.getRange(1, 1, 1, COLS.length).setValues([COLS]);
    sh.setFrozenRows(1);
  }
  return ss.getSheetByName('견적');
}
function rows() {
  const sh = sheet(); const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, COLS.length).getValues().map(v => { const o = {}; COLS.forEach((c, i) => { o[c] = v[i]; }); return o; });
}
function list() {
  return rows().map(r => {
    let state = null; try { state = r.state ? JSON.parse(r.state) : null; } catch (x) {}
    return { no: String(r.no), cust: r.cust, email: r.email, total: Number(r.total) || 0, at: iso(r.savedAt), sentAt: iso(r.sentAt), sentTo: r.sentTo, state: state };
  }).sort((a, b) => (b.at || '').localeCompare(a.at || ''));
}
function iso(v) { if (!v) return ''; if (v instanceof Date) return v.toISOString(); return String(v); }

/* ---------- 견적 번호 (연도-세 자리) ---------- */
function maxNo(year) {
  const y = String(year || new Date().getFullYear());
  let m = Number(PropertiesService.getScriptProperties().getProperty('SEQ_' + y) || 0);
  rows().forEach(r => { const k = /^(\d{4})-(\d+)$/.exec(String(r.no)); if (k && k[1] === y) m = Math.max(m, Number(k[2])); });
  if (y === '2026') m = Math.max(m, 2);   // 2026-001 원엔드, 2026-002 시밀러는 채팅에서 발행
  return m;
}
const fmtNo = (y, n) => `${y}-${String(n).padStart(3, '0')}`;
function peekNo(year) { const y = String(year || new Date().getFullYear()); return fmtNo(y, maxNo(y) + 1); }
function reserveNo(year) {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const y = String(year || new Date().getFullYear()); const n = maxNo(y) + 1;
    PropertiesService.getScriptProperties().setProperty('SEQ_' + y, String(n));
    return fmtNo(y, n);
  } finally { lock.releaseLock(); }
}

/* ---------- 저장·삭제 ---------- */
function upsert(q) {
  const sh = sheet(); const n = sh.getLastRow() - 1;
  const data = n > 0 ? sh.getRange(2, 1, n, 1).getDisplayValues() : [];
  const idx = data.findIndex(v => String(v[0]) === String(q.no));
  const prev = idx > -1 ? sh.getRange(idx + 2, 1, 1, COLS.length).getValues()[0] : null;
  const val = c => q[c] !== undefined ? q[c] : (prev ? prev[COLS.indexOf(c)] : '');
  const vals = COLS.map(c => c === 'state' && q.state !== undefined ? JSON.stringify(q.state) : val(c));
  if (idx > -1) sh.getRange(idx + 2, 1, 1, COLS.length).setValues([vals]); else sh.appendRow(vals);
  sh.getRange(2, 1, Math.max(1, sh.getLastRow() - 1), 1).setNumberFormat('@');
}
function save(q) {
  if (!q || !q.no) return { error: 'no_quote' };
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    upsert({ no: String(q.no), cust: q.cust || '', email: q.email || '', total: Number(q.total) || 0, savedAt: q.at || new Date().toISOString(), state: q.state || null });
    const k = /^(\d{4})-(\d+)$/.exec(String(q.no));
    if (k) { const p = PropertiesService.getScriptProperties(); if (Number(k[2]) > Number(p.getProperty('SEQ_' + k[1]) || 0)) p.setProperty('SEQ_' + k[1], k[2]); }
    return { ok: true };
  } finally { lock.releaseLock(); }
}
function remove(no) {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sh = sheet(); const n = sh.getLastRow() - 1; if (n < 1) return { ok: true };
    const data = sh.getRange(2, 1, n, 1).getDisplayValues();
    const idx = data.findIndex(v => String(v[0]) === String(no));
    if (idx > -1) sh.deleteRow(idx + 2);
    return { ok: true };
  } finally { lock.releaseLock(); }
}

/* ---------- 메일 ---------- */
function aliasReady() { return GmailApp.getAliases().indexOf(FROM) > -1; }
// 메일 서명 (텍스트·HTML). 로고는 treeland.kr/quote/mail-logo.png 를 받아 메일 본문에 직접 넣음(cid)
const SIGN_TEXT = '─────────────────\n트리랜드 TREELAND\nT. 070-4571-7467 ｜ E. info@treeland.kr\nwww.treeland.kr';
const SIGN_HTML = '<div style="margin-top:22px;padding-top:16px;border-top:1px solid #d9d9d4;font-family:\'Malgun Gothic\',sans-serif">'
  + '<img src="cid:tlLogo" alt="TREELAND" width="170" style="display:block;width:170px;height:auto;margin:0 0 10px">'
  + '<div style="font-size:13px;font-weight:700;color:#1f3d30">트리랜드 TREELAND</div>'
  + '<div style="font-size:12px;color:#666;margin-top:3px">T. 070-4571-7467 ｜ E. <a href="mailto:info@treeland.kr" style="color:#666;text-decoration:none">info@treeland.kr</a></div>'
  + '<div style="font-size:12px;margin-top:2px"><a href="https://www.treeland.kr" style="color:#1f3d30">www.treeland.kr</a></div></div>';
function logoBlob() {
  try { return UrlFetchApp.fetch('https://treeland.kr/quote/mail-logo.png').getBlob().setName('treeland-logo.png'); } catch (x) { return null; }
}
function send(b) {
  const to = String(b.to || '').trim();
  if (!/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(to)) return { error: 'bad_email' };
  if (!b.pdf) return { error: 'no_pdf' };
  if (!aliasReady()) return { error: 'alias', message: 'Gmail에 ' + FROM + ' 보내는 주소가 등록되어 있지 않습니다.' };
  const blob = Utilities.newBlob(Utilities.base64Decode(b.pdf), 'application/pdf', b.filename || '트리랜드_견적서.pdf');
  const body = String(b.body || '').replace(/\s+$/, '');
  const esc = t => t.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const html = body.split('\n').map(l => `<div>${l ? esc(l) : '&nbsp;'}</div>`).join('');
  const logo = logoBlob();
  const opt = { from: FROM, name: FROM_NAME, replyTo: FROM, attachments: [blob],
    htmlBody: `<div style="font-family:'Malgun Gothic',sans-serif;font-size:14px;line-height:1.7;color:#222">${html}${logo ? SIGN_HTML : SIGN_HTML.replace(/<img[^>]*>/, '')}</div>` };
  if (logo) opt.inlineImages = { tlLogo: logo };
  if (b.copySelf) opt.bcc = FROM;
  GmailApp.sendEmail(to, String(b.subject || '[트리랜드] 견적서'), body + '\n\n' + SIGN_TEXT, opt);
  const sentAt = new Date().toISOString();
  if (b.quote && b.quote.no) {
    const lock = LockService.getScriptLock(); lock.waitLock(10000);
    try { upsert({ no: String(b.quote.no), cust: b.quote.cust || '', email: to, total: Number(b.quote.total) || 0, savedAt: b.quote.at || sentAt, sentAt: sentAt, sentTo: to, state: b.quote.state || null }); }
    finally { lock.releaseLock(); }
  }
  return { ok: true, sentAt: sentAt };
}

/* ---------- 편집기에서 한 번 실행: 시트 만들기 + 권한 승인 + 보내는 주소 확인 ---------- */
function setup() {
  Logger.log('sheet: ' + sheet().getParent().getUrl());
  Logger.log('aliases: ' + JSON.stringify(GmailApp.getAliases()));
  Logger.log('info@treeland.kr 준비: ' + aliasReady());
}

/**
 * 트리랜드 근로계약 서버 (Apps Script 「트리랜드 근로계약」, 계정 hongjs100418@gmail.com)
 * - 알바(일용·단시간) 전자 근로계약: 관리 화면 treeland.kr/staff/
 * - 알바 서명 화면은 이 웹 앱이 직접 띄움(웹앱주소?id=...) — 알바에게 트리랜드를 드러내지 않기 위해 treeland.kr을 쓰지 않음
 * - 파일 2개: Code.gs, Sign.html (Sign.html은 저장소 staff/apps-script/build_sign.py로 생성)
 * - 데이터: 드라이브 시트 「트리랜드 근로계약」(처음 실행 때 자동 생성, 스크립트 속성 SHEET_ID)
 *           서명본 PDF: 드라이브 폴더 「트리랜드 근로계약 서명본」(자동 생성, 스크립트 속성 FOLDER_ID) — 비공개
 * - 비밀번호: 따로 없음. 계약 서버(전자계약)에 schedule 액션으로 물어보고 맞으면 6시간 캐시 (장부·통계와 같은 방식)
 * - 주민등록번호는 시트에만 저장(근로내용확인신고·일용근로소득 지급명세서용). 계약서 PDF에는 넣지 않음
 * - 재배포: 배포 → 배포 관리 → 연필 → 버전: 새 버전 (새 배포 금지, 주소 바뀜)
 */
const CONTRACT_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxSKXLeVZoI-Qx2rieXI_f4DjKdf7jNzI9S_vtBrJJnqMYjOBvzs9TUHxQK7Ko0h-9oDg/exec';
const COLS = ['id', 'created', 'status', 'dates', 'start', 'end', 'breakMin', 'place', 'job', 'wage', 'payDay', 'memo',
  'name', 'tel', 'rrn', 'bank', 'account', 'holder', 'signedAt', 'hash', 'ua', 'pdfId', 'pdfUrl', 'actual', 'allow', 'payType', 'unit', 'rate', 'qty', 'items', 'paidAt'];   // paidAt: 임금 지급 완료 시각. allow: 예전 내부 수당(안 씀). payType: hour(시급)·piece(건당)
const PUBLIC = ['id', 'dates', 'start', 'end', 'breakMin', 'place', 'job', 'wage', 'payDay', 'payType', 'unit', 'rate', 'qty', 'items'];

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.id) {
    const t = HtmlService.createTemplateFromFile('Sign');
    t.data = JSON.stringify(getPublic(p.id)).replace(/</g, '\\u003c');
    return t.evaluate().setTitle('근로계약서').addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  return out({ ok: true, service: 'staff' });
}

function doPost(e) {
  let b = {};
  try { b = JSON.parse(e.postData.contents || '{}'); } catch (x) { return out({ error: 'bad_json' }); }
  try {
    if (b.action === 'sign') return out(sign(b));
    if (!checkPin(b.pin)) return out({ error: 'pin' });
    switch (b.action) {
      case 'list': return out({ ok: true, items: readAll() });
      case 'create': return out(create(b.contract || {}));
      case 'direct': return out(createDirect(b.contract || {}, b.from));   // 기존 근무자: 서명 없이 바로 등록 (11/25)
      case 'cancel': return out(setStatus(b.id, '링크중지'));
      case 'resume': return out(setStatus(b.id, '서명대기'));
      case 'delete': return out(remove(b.id));
      case 'actual': return out(saveActual(b.id, b.actual));
      case 'paid': return out(setPaid(b.id, b.on));
      default: return out({ error: 'bad_action' });
    }
  } catch (err) { return out({ error: 'server', message: String(err && err.message || err) }); }
}

function signUrl(id) { return ScriptApp.getService().getUrl() + '?id=' + id; }

/** 서명 화면(google.script.run)에서 호출 */
function signFromPage(b) { return sign(b || {}); }

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

/* ---------- 저장소 ---------- */
function props() { return PropertiesService.getScriptProperties(); }

function sheet() {
  let id = props().getProperty('SHEET_ID'), ss;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (x) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create('트리랜드 근로계약');
    props().setProperty('SHEET_ID', ss.getId());
    const sh = ss.getSheets()[0];
    sh.setName('계약');
    sh.getRange(1, 1, 1, COLS.length).setValues([COLS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('A:Z').setNumberFormat('@'); // 주민번호·계좌·날짜가 숫자나 날짜로 바뀌지 않게 전부 텍스트
  }
  return ss.getSheetByName('계약');
}

function folder() {
  const id = props().getProperty('FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (x) {} }
  const f = DriveApp.createFolder('트리랜드 근로계약 서명본');
  props().setProperty('FOLDER_ID', f.getId());
  return f;
}

function readAll() {
  const sh = sheet(), n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, COLS.length).getDisplayValues().map(toObj).map((o) => Object.assign(o, { url: signUrl(o.id) })).reverse();
}
function toObj(r) { const o = {}; COLS.forEach((c, i) => { o[c] = r[i]; }); return o; }
function findRow(id) {
  if (!id) return 0;
  const sh = sheet(), n = sh.getLastRow();
  if (n < 2) return 0;
  const ids = sh.getRange(2, 1, n - 1, 1).getDisplayValues();
  for (let i = 0; i < ids.length; i++) if (ids[i][0] === String(id)) return i + 2;
  return 0;
}
function rowObj(r) { return toObj(sheet().getRange(r, 1, 1, COLS.length).getDisplayValues()[0]); }
function setCells(r, o) {
  const sh = sheet();
  Object.keys(o).forEach((k) => { const c = COLS.indexOf(k); if (c >= 0) sh.getRange(r, c + 1).setValue(String(o[k] == null ? '' : o[k])); });
}

/* ---------- 액션 ---------- */
function newId() {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 12; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function create(c) {
  const dates = String(c.dates || '').split(',').map((s) => s.trim()).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s)).sort();
  if (!dates.length) return { error: 'dates' };
  if (!/^\d{2}:\d{2}$/.test(c.start || '') || !/^\d{2}:\d{2}$/.test(c.end || '')) return { error: 'time' };
  // 임금: 시급(hour) 또는 건당(piece, 2026-11-16). 건당은 작업 내역 줄마다 건당 금액 × 건수(items JSON), 최저임금 미달 차액 지급 조항이 계약서에 들어감
  const piece = c.payType === 'piece';
  const wage = piece ? 0 : Math.round(Number(c.wage) || 0);
  const items = piece ? (Array.isArray(c.items) ? c.items : []).slice(0, 20).map((x) => ({ t: String(x && x.t || '').trim().slice(0, 40), rate: Math.round(Number(x && x.rate) || 0), qty: Math.round(Number(x && x.qty) || 0) })) : [];
  if (!piece && wage < 10320) return { error: 'wage' }; // 2026년 최저시급
  if (piece && (!items.length || items.some((x) => !x.t || !(x.rate > 0) || !(x.qty > 0)))) return { error: 'piece' };
  const total = items.reduce((s, x) => s + x.rate * x.qty, 0);
  const id = newId();
  const row = { id: id, created: Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm'), status: '서명대기', dates: dates.join(','), start: c.start, end: c.end,
    breakMin: Math.max(0, Math.round(Number(c.breakMin) || 0)), place: c.place || '', job: c.job || '', wage: wage, payDay: c.payDay || '', memo: c.memo || '',
    payType: piece ? 'piece' : 'hour', unit: '', rate: piece ? total : '', qty: piece ? 1 : '', items: piece ? JSON.stringify(items) : '' };   // rate×qty = 합계 (예전 방식과 같은 계산)
  const sh = sheet();
  sh.appendRow(COLS.map((k) => String(row[k] == null ? '' : row[k])));
  return { ok: true, id: id, url: signUrl(id) };
}

// 기존 근무자 바로 등록 (2026-11-25, 대표님 결정): 예전에 서명한 계약(from)의 인적사항·계좌를 그대로 가져와 새 계약을 '서명완료'로 만듦.
// 서명·서명본 PDF는 없음(ua에 표시). 근무일·임금 조건 검사는 create와 같음
function createDirect(c, from) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const fr = findRow(from); if (!fr) return { error: 'from' };
    const w = rowObj(fr); if (w.status !== '서명완료' || !w.name || !w.rrn) return { error: 'from' };
    const r = create(c); if (!r.ok) return r;
    const row = findRow(r.id); if (!row) return { error: 'server' };
    setCells(row, { status: '서명완료', name: w.name, tel: w.tel, rrn: w.rrn, bank: w.bank, account: w.account, holder: w.holder,
      signedAt: Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss'), ua: '서명 없이 등록 (기존 근무자 · ' + String(from) + ')' });
    return { ok: true, id: r.id };
  } finally { lock.releaseLock(); }
}

function getPublic(id) {
  const r = findRow(id);
  if (!r) return { ok: false, error: 'not_found' };
  const o = rowObj(r);
  if (o.status === '링크중지') return { ok: false, error: 'stopped' };
  if (o.status === '서명완료') return { ok: true, signed: true, name: o.name };
  const c = {}; PUBLIC.forEach((k) => { c[k] = o[k]; });
  return { ok: true, contract: c };
}

function sign(b) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const r = findRow(b.id);
    if (!r) return { error: 'not_found' };
    const o = rowObj(r);
    if (o.status === '서명완료') return { error: 'already' };
    if (o.status === '링크중지') return { error: 'stopped' };
    const w = b.worker || {};
    if (!w.name || !w.tel || !/^\d{6}-?\d{7}$/.test(String(w.rrn || '')) || !w.account || !b.pdf) return { error: 'missing' };
    const day = o.dates.split(',')[0];
    const file = folder().createFile(Utilities.newBlob(Utilities.base64Decode(b.pdf), 'application/pdf', '근로계약서_' + day + '_' + w.name + '.pdf'));
    setCells(r, { status: '서명완료', name: w.name, tel: w.tel, rrn: String(w.rrn).replace(/^(\d{6})-?(\d{7})$/, '$1-$2'), bank: w.bank || '', account: w.account,
      holder: w.holder || w.name, signedAt: Utilities.formatDate(new Date(b.signedAt || Date.now()), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss'), hash: b.hash || '', ua: String(b.ua || '').slice(0, 300),
      pdfId: file.getId(), pdfUrl: file.getUrl() });
    try { notifySigned(rowObj(r), file); } catch (x) {}   // 메일 실패해도 서명은 그대로 완료
    return { ok: true };
  } finally { lock.releaseLock(); }
}

/* ---------- 서명 알림 메일 (2026-11-16): 대표에게만. 주민번호·계좌번호는 넣지 않음 ---------- */
const NOTIFY_TO = 'info@treeland.kr';
function notifySigned(o, file) {
  const wd = '일월화수목금토', won = (n) => Number(n || 0).toLocaleString('ko-KR');
  const dates = String(o.dates || '').split(',').filter(Boolean).sort();
  const day = (s) => { const d = new Date(s + 'T00:00:00+09:00'); return (d.getMonth() + 1) + '/' + d.getDate() + '(' + wd[d.getDay()] + ')'; };
  const toMin = (t) => { const p = String(t || '0:0').split(':').map(Number); return p[0] * 60 + p[1]; };
  let span = toMin(o.end) - toMin(o.start); if (span <= 0) span += 1440;
  const hours = Math.max(0, span - (Number(o.breakMin) || 0)) / 60;
  let pay;
  if (o.payType === 'piece') {
    let items = []; try { items = JSON.parse(o.items || '[]'); } catch (x) {}
    const total = items.reduce((s, x) => s + (Number(x.rate) || 0) * (Number(x.qty) || 0), 0) || (Number(o.rate) || 0) * (Number(o.qty) || 0);
    pay = '건당\n' + items.map((x) => '  - ' + x.t + ' ' + won(x.rate) + '원 × ' + x.qty + '건 = ' + won(x.rate * x.qty) + '원').join('\n') + '\n  합계 ' + won(total) + '원';
  } else {
    const dayPay = Math.round((Number(o.wage) || 0) * hours);
    pay = '시급 ' + won(o.wage) + '원 · 1일 ' + won(dayPay) + '원 · 총 ' + won(dayPay * dates.length) + '원 (' + dates.length + '일)';
  }
  const body = [o.name + '님이 근로계약서에 서명했습니다.', '',
    '연락처: ' + o.tel,
    '근무일: ' + dates.map(day).join(', '),
    '근무 시간: ' + o.start + ' ~ ' + o.end + ' (하루 ' + (Math.round(hours * 100) / 100) + '시간)',
    '장소: ' + o.place, '업무: ' + o.job,
    '임금: ' + pay,
    '지급: ' + (o.payDay || '근로일 당일'),
    o.memo ? '내부 메모: ' + o.memo : '', '',
    '서명본 PDF를 첨부했습니다. 주민번호·계좌는 근로계약 관리 화면에서 확인하세요.',
    'https://treeland.kr/staff/'].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
  MailApp.sendEmail({ to: NOTIFY_TO, subject: '[근로계약 서명] ' + o.name + ' · ' + dates.map(day).join(', '), body: body, name: '근로계약 알림', attachments: [file.getBlob()] });
}
// 편집기에서 한 번 실행: 메일 보내기 권한 승인 + 시험 메일
function notifyTest() { MailApp.sendEmail(NOTIFY_TO, '[근로계약 알림] 시험 메일', '알바가 근로계약서에 서명하면 이 주소로 알림이 옵니다.'); }

function setStatus(id, st) {
  const r = findRow(id);
  if (!r) return { error: 'not_found' };
  if (rowObj(r).status === '서명완료') return { error: 'signed' };
  setCells(r, { status: st });
  return { ok: true };
}

function remove(id) {
  const r = findRow(id);
  if (!r) return { error: 'not_found' };
  const o = rowObj(r);
  if (o.pdfId) { try { DriveApp.getFileById(o.pdfId).setTrashed(true); } catch (x) {} }
  sheet().deleteRow(r);
  return { ok: true };
}

// 실근무 기록(내부용): 근로일별 실제 시작·종료·휴게, 결근, 추가 근로일. 서명한 계약서 PDF는 그대로 둠
// actual = { 'yyyy-MM-dd': { start, end, breakMin, note, wage?, piece? } 또는 { off:true, note } } — 계약과 다른 날만 저장. wage·piece는 추가한 날의 그날 시급·건별 작업
function saveActual(id, a) {
  const r = findRow(id);
  if (!r) return { error: 'not_found' };
  if (rowObj(r).status !== '서명완료') return { error: 'not_signed' };
  const hm = /^\d{2}:\d{2}$/, out = {};
  Object.keys(a || {}).forEach((d) => {
    const x = a[d] || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    if (x.off) { out[d] = { off: true, note: String(x.note || '').slice(0, 100) }; return; }
    if (!hm.test(x.start || '') || !hm.test(x.end || '')) return;
    const o = { start: x.start, end: x.end, breakMin: Math.max(0, Math.round(Number(x.breakMin) || 0)), note: String(x.note || '').slice(0, 100) };
    // 추가한 날(11/24): 그날 시급 또는 건별 작업 (내부 기록)
    const w = Math.round(Number(x.wage) || 0); if (w > 0 && w <= 1000000) o.wage = w;
    if (Array.isArray(x.piece)) {
      const p = x.piece.slice(0, 20).map((i) => ({ t: String(i && i.t || '').trim().slice(0, 40), rate: Math.round(Number(i && i.rate) || 0), qty: Math.round(Number(i && i.qty) || 0) }))
        .filter((i) => i.rate > 0 && i.rate <= 10000000 && i.qty > 0 && i.qty <= 999);
      if (p.length) { o.piece = p; delete o.wage; }
    }
    out[d] = o;
  });
  const sh = sheet();
  if (sh.getLastColumn() < COLS.length) sh.getRange(1, 1, 1, COLS.length).setValues([COLS]).setFontWeight('bold');
  setCells(r, { actual: Object.keys(out).length ? JSON.stringify(out) : '' });
  return { ok: true, actual: out };
}

// 임금 지급 완료 표시 (관리 화면 「지급 완료」). on=false면 취소
function setPaid(id, on) {
  const r = findRow(id);
  if (!r) return { error: 'not_found' };
  if (rowObj(r).status !== '서명완료') return { error: 'not_signed' };
  const sh = sheet();
  if (sh.getLastColumn() < COLS.length) sh.getRange(1, 1, 1, COLS.length).setValues([COLS]).setFontWeight('bold');
  const v = on ? Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm') : '';
  setCells(r, { paidAt: v });
  return { ok: true, paidAt: v };
}

/** 처음 한 번 편집기에서 실행: 시트·폴더를 만들고 권한을 승인받음 */
function setup() { sheet(); folder(); Logger.log('시트 ' + props().getProperty('SHEET_ID') + ' / 폴더 ' + props().getProperty('FOLDER_ID')); }

/**
 * 트리랜드 통계 서버 (Apps Script, 계정 hongjs100418@gmail.com — 계약·장부와 같은 계정)
 * - GA4(속성 559412298)에서 날짜·유입 경로별 방문과 문의 클릭을 읽어 옴 (Analytics Data API, 고급 서비스 AnalyticsData)
 * - 당근 광고 숫자, 실제 상담 기록은 드라이브 시트 「트리랜드 통계」에 저장
 * - 비밀번호: 따로 없음. 계약 서버(전자계약)에 schedule 액션으로 물어보고 맞으면 6시간 캐시 (장부와 같은 방식)
 * - 재배포: 배포 → 배포 관리 → 연필 → 버전: 새 버전 (새 배포 금지, 주소 바뀜)
 */
const PROPERTY_ID = '559412298';
const CONTRACT_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxSKXLeVZoI-Qx2rieXI_f4DjKdf7jNzI9S_vtBrJJnqMYjOBvzs9TUHxQK7Ko0h-9oDg/exec';
const DATA_START = '2026-10-18'; // 10/17 설치 확인용 방문은 제외
const EVENTS = { kakao_popup_open: 'popup_opens', kakao_click: 'kakao_clicks', phone_click: 'phone_clicks', email_click: 'email_clicks', company_pdf_click: 'pdf_clicks' };
const AD_COLS = ['date', 'ad', 'impressions', 'clicks', 'reactions', 'spend'];
const INQ_COLS = ['id', 'date', 'channel', 'source', 'note', 'status'];

function doGet() { return out({ ok: true, service: 'treeland-stats' }); }

function doPost(e) {
  let b = {};
  try { b = JSON.parse(e.postData.contents || '{}'); } catch (x) { return out({ error: 'bad_json' }); }
  if (!checkPin(b.pin)) return out({ error: 'pin' });
  try {
    switch (b.action) {
      case 'load': return out(load(b.start, b.end));
      case 'saveAd': return out(saveRow('당근광고', AD_COLS, b.row, ['date', 'ad']));
      case 'deleteAd': return out(deleteRow('당근광고', AD_COLS, b.row, ['date', 'ad']));
      case 'saveInquiry': {
        const r = Object.assign({}, b.row);
        if (!r.id) r.id = 'q' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyMMddHHmmss');
        return out(saveRow('상담', INQ_COLS, r, ['id']));
      }
      case 'deleteInquiry': return out(deleteRow('상담', INQ_COLS, b.row, ['id']));
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

/* ---------- GA4 ---------- */
function load(start, end) {
  const s = start && start > DATA_START ? start : DATA_START;
  const e = end || Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
  let ga = [], gaError = null;
  if (s <= e) { try { ga = gaRows(s, e); } catch (x) { gaError = String(x && x.message || x); } }
  return { ok: true, start: s, end: e, dataStart: DATA_START, ga: ga, gaError: gaError, ads: readRows('당근광고', AD_COLS), inquiries: readRows('상담', INQ_COLS), updatedAt: new Date().toISOString() };
}

function gaRows(start, end) {
  const prop = 'properties/' + PROPERTY_ID;
  const dims = [{ name: 'date' }, { name: 'sessionSource' }, { name: 'sessionMedium' }, { name: 'sessionCampaignName' }];
  const base = AnalyticsData.Properties.runReport({ dateRanges: [{ startDate: start, endDate: end }], dimensions: dims, metrics: [{ name: 'sessions' }, { name: 'activeUsers' }], limit: 10000 }, prop);
  const ev = AnalyticsData.Properties.runReport({
    dateRanges: [{ startDate: start, endDate: end }], dimensions: dims.concat([{ name: 'eventName' }]), metrics: [{ name: 'eventCount' }], limit: 10000,
    dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: Object.keys(EVENTS) } } }
  }, prop);
  const map = {};
  const keyOf = (d) => d.slice(0, 4).join('|');
  const get = (d) => {
    const k = keyOf(d);
    if (!map[k]) map[k] = { date: d[0].slice(0, 4) + '-' + d[0].slice(4, 6) + '-' + d[0].slice(6, 8), source: normSource(d[1], d[2]), source_raw: d[1], medium: d[2], campaign: d[3] === '(not set)' || d[3] === '(direct)' || d[3] === '(organic)' || d[3] === '(referral)' ? '' : d[3], sessions: 0, users: 0, popup_opens: 0, kakao_clicks: 0, phone_clicks: 0, email_clicks: 0, pdf_clicks: 0 };
    return map[k];
  };
  (base.rows || []).forEach((r) => { const d = r.dimensionValues.map((v) => v.value); const o = get(d); o.sessions += Number(r.metricValues[0].value); o.users += Number(r.metricValues[1].value); });
  (ev.rows || []).forEach((r) => { const d = r.dimensionValues.map((v) => v.value); const f = EVENTS[d[4]]; if (f) get(d)[f] += Number(r.metricValues[0].value); });
  return Object.keys(map).map((k) => map[k]).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
}

function normSource(src, medium) {
  const s = String(src || '').toLowerCase(), m = String(medium || '').toLowerCase();
  if (['daangn', 'instagram', 'card', 'proposal', 'kakao', 'naver_store', 'company_profile'].indexOf(s) > -1) return s;
  if (s === '(direct)') return 'direct';
  if (s.indexOf('instagram') > -1) return 'instagram';
  if (s.indexOf('daangn') > -1 || s.indexOf('karrot') > -1) return 'daangn';
  if (s.indexOf('kakao') > -1) return 'kakao';
  if (m === 'organic' || /google|naver|daum|bing|zum|yahoo/.test(s)) return 'search';
  return 'other';
}

/* ---------- 시트 ---------- */
function book() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('SHEET_ID'), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (x) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create('트리랜드 통계');
    props.setProperty('SHEET_ID', ss.getId());
    const a = ss.getSheets()[0]; a.setName('당근광고'); a.getRange(1, 1, 1, AD_COLS.length).setValues([AD_COLS]);
    const q = ss.insertSheet('상담'); q.getRange(1, 1, 1, INQ_COLS.length).setValues([INQ_COLS]);
  }
  return ss;
}
function sheet(name, cols) {
  const ss = book(); let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.getRange(1, 1, 1, cols.length).setValues([cols]); }
  return sh;
}
function readRows(name, cols) {
  const sh = sheet(name, cols); const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, cols.length).getDisplayValues().map((v) => { const o = {}; cols.forEach((c, i) => { o[c] = v[i]; }); return o; })
    .map((o) => { ['impressions', 'clicks', 'reactions', 'spend'].forEach((k) => { if (k in o) o[k] = Number(String(o[k]).replace(/,/g, '')) || 0; }); return o; });
}
function saveRow(name, cols, row, keys) {
  if (!row) return { error: 'no_row' };
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sh = sheet(name, cols); const n = sh.getLastRow() - 1;
    const vals = cols.map((c) => row[c] == null ? '' : row[c]);
    const data = n > 0 ? sh.getRange(2, 1, n, cols.length).getDisplayValues() : [];
    const idx = data.findIndex((v) => keys.every((k) => String(v[cols.indexOf(k)]) === String(row[k])));
    if (idx > -1) sh.getRange(idx + 2, 1, 1, cols.length).setValues([vals]); else sh.appendRow(vals);
    sh.getRange(2, 1, Math.max(1, sh.getLastRow() - 1), 1).setNumberFormat('@');
    return { ok: true, row: row };
  } finally { lock.releaseLock(); }
}
function deleteRow(name, cols, row, keys) {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sh = sheet(name, cols); const n = sh.getLastRow() - 1; if (n < 1) return { ok: true };
    const data = sh.getRange(2, 1, n, cols.length).getDisplayValues();
    const idx = data.findIndex((v) => keys.every((k) => String(v[cols.indexOf(k)]) === String(row[k])));
    if (idx > -1) sh.deleteRow(idx + 2);
    return { ok: true };
  } finally { lock.releaseLock(); }
}

/* ---------- 편집기에서 한 번 실행: 시트 만들고 10/17 당근 광고 숫자 넣기, GA 응답 확인 ---------- */
function setup() {
  const rows = [
    ['2026-10-17', '① 설치&대여&회수 (아르코)', 104, 2, 0, 402],
    ['2026-10-17', '② 트리 보관 고민 (솔그림 피아노)', 213, 1, 0, 201],
    ['2026-10-17', '③ 얼리버드 10/30 마감 (솔그림 그린)', 227, 2, 0, 387]
  ];
  rows.forEach((r) => saveRow('당근광고', AD_COLS, { date: r[0], ad: r[1], impressions: r[2], clicks: r[3], reactions: r[4], spend: r[5] }, ['date', 'ad']));
  Logger.log('sheet: ' + book().getUrl());
  const t = gaRows('2026-10-17', Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd'));
  Logger.log('ga rows: ' + t.length + ' ' + JSON.stringify(t.slice(0, 5)));
}

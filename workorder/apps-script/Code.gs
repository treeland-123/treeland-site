/**
 * 작업표 서버
 * - 직원:  …/exec?s=직원코드  → 그 현장 작업표 (회사명 표기 없음)
 * - 관리:  treeland.kr/workorder 가 POST로 호출 (계약 관리와 같은 비밀번호)
 * - 등록:  비공개 저장소 workorder-data 의 GitHub Actions 가 POST(register)
 */
const SHEET_NAME = '작업지시서';
const PHOTO_FOLDER = '작업지시서 사진';
const TAB = '현장목록';
const HEAD = ['아이디', '현장명', '설치일', '데이터(JSON)', '사진파일ID', '직원코드', '상태', '수정시각', '완성사진폴더ID', '완성사진수', '주소기한'];
const C = { id: 0, name: 1, date: 2, data: 3, photo: 4, code: 5, status: 6, updated: 7, doneDir: 8, doneN: 9, until: 10 };
const CONTRACT = 'https://script.google.com/macros/s/AKfycbxSKXLeVZoI-Qx2rieXI_f4DjKdf7jNzI9S_vtBrJJnqMYjOBvzs9TUHxQK7Ko0h-9oDg/exec';
const TZ = 'Asia/Seoul';

function props_() { return PropertiesService.getScriptProperties(); }
function ss_() {
  const p = props_();
  let id = p.getProperty('SHEET_ID'), ss;
  if (id) ss = SpreadsheetApp.openById(id);
  else { ss = SpreadsheetApp.create(SHEET_NAME); p.setProperty('SHEET_ID', ss.getId()); }
  if (!ss.getSheetByName(TAB)) { const sh = ss.insertSheet(TAB, 0); sh.appendRow(HEAD); sh.setFrozenRows(1); }
  return ss;
}
function sheet_() { return ss_().getSheetByName(TAB); }
function folder_() {
  const p = props_(), id = p.getProperty('PHOTO_FOLDER_ID');
  if (id) return DriveApp.getFolderById(id);
  const f = DriveApp.createFolder(PHOTO_FOLDER); p.setProperty('PHOTO_FOLDER_ID', f.getId()); return f;
}
function find_(col, val) {
  if (!val) return null;
  const v = sheet_().getDataRange().getValues();
  for (let r = 1; r < v.length; r++) if (String(v[r][col]) === String(val)) return { row: r + 1, v: v[r] };
  return null;
}
function ymd_(d) { return d ? Utilities.formatDate(new Date(d), TZ, 'yyyy-MM-dd') : ''; }
function today_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function addDays_(s, n) { const d = new Date(s + 'T12:00:00+09:00'); d.setDate(d.getDate() + n); return ymd_(d); }
function valid_(f) { return f && f.v[C.status] !== '중지' && f.v[C.code] && (!f.v[C.until] || today_() <= ymd_(f.v[C.until])); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function b64_(blob) { return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes()); }
function msg_(t) { return HtmlService.createHtmlOutput('<p style="font:16px sans-serif;padding:24px;line-height:1.6">' + t + '</p>').setTitle('작업표').addMetaTag('viewport', 'width=device-width,initial-scale=1'); }

/* 직원 화면 */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!p.s) return msg_('받은 작업표 주소로 들어오세요.');
  const f = find_(C.code, p.s);
  if (!valid_(f)) return msg_('닫힌 주소입니다. 새 주소를 받아 주세요.');
  const site = JSON.parse(f.v[C.data]);
  site.v = new Date(f.v[C.updated]).getTime();
  site.donePhotos = Number(f.v[C.doneN]) || 0;
  if (f.v[C.photo]) { try { site.photo = b64_(DriveApp.getFileById(f.v[C.photo]).getBlob()); } catch (err) {} }
  const html = HtmlService.createHtmlOutputFromFile('Index').getContent()
    .split('"@@DATA@@";').join('window.SITE=' + JSON.stringify(site) + ';window.TOKEN=' + JSON.stringify(p.s) + ';window.BASE=' + JSON.stringify(ScriptApp.getService().getUrl()) + ';');
  return HtmlService.createHtmlOutput(html).setTitle('작업표').addMetaTag('viewport', 'width=device-width,initial-scale=1');
}
function getVersion(code) {
  const f = find_(C.code, code);
  return valid_(f) ? new Date(f.v[C.updated]).getTime() : -1;
}
function addDonePhoto(code, base64, mime) {
  const f = find_(C.code, code);
  if (!valid_(f)) throw new Error('닫힌 주소');
  return savePhoto_(f, base64, mime);
}
function savePhoto_(f, base64, mime) {
  const sh = sheet_();
  let dir;
  try { dir = DriveApp.getFolderById(f.v[C.doneDir]); } catch (err) {
    dir = folder_().createFolder(f.v[C.name] + ' 완성'); sh.getRange(f.row, C.doneDir + 1).setValue(dir.getId());
  }
  const stamp = Utilities.formatDate(new Date(), TZ, 'yyMMdd_HHmmss');
  dir.createFile(Utilities.newBlob(Utilities.base64Decode(base64), mime || 'image/jpeg', f.v[C.name] + '_' + stamp + '.jpg'));
  const n = (Number(sh.getRange(f.row, C.doneN + 1).getValue()) || 0) + 1;
  sh.getRange(f.row, C.doneN + 1).setValue(n);
  return n;
}

/* 관리·등록 */
function doPost(e) {
  let b = {};
  try { b = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'body' }); }
  try {
    if (b.action === 'register') {
      if (!b.key || b.key !== props_().getProperty('REG_KEY')) return json_({ ok: false, error: 'key' });
      return json_(register_(b));
    }
    if (!checkPin_(b.pin)) return json_({ ok: false, error: 'pin' });
    switch (b.action) {
      case 'list': return json_({ ok: true, items: list_() });
      case 'get': return json_(get_(b.id));
      case 'link': return json_(link_(b.id, false));
      case 'relink': return json_(link_(b.id, true));
      case 'unlink': return json_(setCell_(b.id, C.code, ''));
      case 'status': return json_(setCell_(b.id, C.status, b.status));
      case 'done': return json_(doneFull_(b.id, b.file));
      case 'upload': { const f = find_(C.id, b.id); if (!f) return json_({ ok: false, error: 'id' }); return json_({ ok: true, n: savePhoto_(f, b.data, b.mime) }); }
    }
    return json_({ ok: false, error: 'action' });
  } catch (err) { return json_({ ok: false, error: String(err && err.message || err) }); }
}
function checkPin_(pin) {
  if (!pin) return false;
  if (String(pin) === props_().getProperty('ADMIN_PIN')) return true;
  const h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'wo:' + pin));
  const cache = CacheService.getScriptCache();
  if (cache.get('pin' + h)) return true;
  try {
    const r = UrlFetchApp.fetch(CONTRACT, { method: 'post', contentType: 'text/plain;charset=utf-8', payload: JSON.stringify({ action: 'list', pin: String(pin) }), muteHttpExceptions: true });
    const j = JSON.parse(r.getContentText());
    if (j && j.ok) { cache.put('pin' + h, '1', 21600); return true; }
  } catch (err) {}
  return false;
}
function register_(b) {
  const site = b.site || {}, id = String(b.id || ''), sh = sheet_(), now = new Date();
  if (!id || !site.name) return { ok: false, error: 'id/name' };
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    let f = find_(C.id, id), photoId = f ? f.v[C.photo] : '';
    if (b.photo) {
      if (photoId) { try { DriveApp.getFileById(photoId).setTrashed(true); } catch (err) {} }
      photoId = folder_().createFile(Utilities.newBlob(Utilities.base64Decode(b.photo), b.mime || 'image/jpeg', id + '.jpg')).getId();
    }
    const data = JSON.stringify(site);
    if (f) sh.getRange(f.row, 1, 1, 8).setValues([[id, site.name, site.date || '', data, photoId, f.v[C.code], f.v[C.status] || '설치 전', now]]);
    else sh.appendRow([id, site.name, site.date || '', data, photoId, '', '설치 전', now, '', 0, '']);
    return { ok: true, id: id };
  } finally { lock.releaseLock(); }
}
function list_() {
  const v = sheet_().getDataRange().getValues().slice(1);
  return v.map(r => {
    let s = {}; try { s = JSON.parse(r[C.data]); } catch (err) {}
    return { id: r[C.id], name: r[C.name], date: ymd_(r[C.date]), model: s.model || '', angle: s.angle || '', total: s.total || '',
      status: r[C.status], linked: !!r[C.code], open: valid_({ v: r }), done: Number(r[C.doneN]) || 0, updated: new Date(r[C.updated]).getTime() };
  }).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
}
function get_(id) {
  const f = find_(C.id, id); if (!f) return { ok: false, error: 'id' };
  const site = JSON.parse(f.v[C.data]);
  let photo = '';
  if (f.v[C.photo]) { try { photo = b64_(DriveApp.getFileById(f.v[C.photo]).getBlob()); } catch (err) {} }
  const done = [];
  if (f.v[C.doneDir]) {
    try {
      const it = DriveApp.getFolderById(f.v[C.doneDir]).getFiles();
      while (it.hasNext()) { const x = it.next(); let t = ''; try { const th = x.getThumbnail(); if (th) t = b64_(th); } catch (err) {} done.push({ file: x.getId(), name: x.getName(), thumb: t, at: x.getDateCreated().getTime() }); }
      done.sort((a, b) => a.at - b.at);
    } catch (err) {}
  }
  return { ok: true, id: id, site: site, photo: photo, status: f.v[C.status], code: f.v[C.code], open: valid_(f), until: ymd_(f.v[C.until]), updated: new Date(f.v[C.updated]).getTime(), done: done };
}
function link_(id, renew) {
  const f = find_(C.id, id); if (!f) return { ok: false, error: 'id' };
  const sh = sheet_();
  let code = f.v[C.code];
  if (!code || renew) {
    const c = 'abcdefghjkmnpqrstuvwxyz23456789'; code = '';
    for (let i = 0; i < 10; i++) code += c[Math.floor(Math.random() * c.length)];
  }
  const base = ymd_(f.v[C.date]) > today_() ? ymd_(f.v[C.date]) : today_();
  const until = addDays_(base, 3);
  sh.getRange(f.row, C.code + 1).setValue(code);
  sh.getRange(f.row, C.until + 1).setValue(until);
  return { ok: true, code: code, until: until, url: ScriptApp.getService().getUrl() + '?s=' + code };
}
function setCell_(id, col, val) {
  const f = find_(C.id, id); if (!f) return { ok: false, error: 'id' };
  sheet_().getRange(f.row, col + 1).setValue(val);
  return { ok: true };
}
function doneFull_(id, file) {
  const f = find_(C.id, id); if (!f) return { ok: false, error: 'id' };
  const x = DriveApp.getFileById(file);
  const ok = x.getParents().hasNext() && x.getParents().next().getId() === String(f.v[C.doneDir]);
  if (!ok) return { ok: false, error: 'file' };
  return { ok: true, name: x.getName(), data: b64_(x.getBlob()) };
}

/* 한 번만 실행: 등록 열쇠 저장, 새 탭 생성, 외부 호출 권한 승인 */
function setup2() {
  const p = props_();
  p.setProperty('REG_KEY', '@@REGKEY@@');
  sheet_(); folder_();
  UrlFetchApp.fetch('https://www.google.com', { muteHttpExceptions: true });
  console.log('ok ' + ScriptApp.getService().getUrl());
}

// 견적서 페이지(/quote/) 발행 흐름 회귀 테스트 — 휴대폰(아이폰 화면)·PC 두 환경
// 실행: node quote/tests/flow.test.mjs   (저장소 루트에서. 견적 서버는 가짜로 흉내 내므로 실제 데이터는 건드리지 않음)
// 확인하는 것: 열면 항상 새 견적 / 쓰던 견적 이어서 쓰기 / PDF·이미지·카톡 요약·메일 발행 시 내역 기록 /
//             복사 막힘·서버 장애 때도 내역 보존 / 다른 기기 발행분 / 연속 발행 시 덮어쓰기 없음 / 회사 서류 첨부
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const pw = require(execSync('npm root -g').toString().trim() + '/playwright');

const PORT = 8790, BASE = `http://localhost:${PORT}/quote/`;
const srv = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('../..', import.meta.url).pathname, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));

let pass = 0, fail = 0;
const ok = (cond, name, info) => { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name, info !== undefined ? JSON.stringify(info) : ''); } };

// 가짜 견적 서버: 번호 매김·저장·목록·메일·서류를 실제 서버처럼 상태를 가지고 응답
function fakeServer() {
  const S = { quotes: [], seq: 200, down: false, sent: [], calls: [] };
  S.route = async r => {
    const b = JSON.parse(r.request().postData() || '{}'); S.calls.push(b.action);
    if (S.down) return r.fulfill({ status: 500, body: 'down' });
    const next = () => '2026-' + String(S.seq + 1).padStart(3, '0');
    let res;
    switch (b.action) {
      case 'list': res = { ok: true, quotes: S.quotes, next: next() }; break;
      case 'reserve': S.seq++; res = { ok: true, no: '2026-' + String(S.seq).padStart(3, '0') }; break;
      case 'save': { const q = b.quote; S.quotes = [q, ...S.quotes.filter(x => x.no !== q.no)]; const n = +q.no.split('-')[1]; if (n > S.seq) S.seq = n; res = { ok: true }; break; }
      case 'send': { S.sent.push({ to: b.to, docs: b.docs || [] }); const q = b.quote; S.quotes = [{ ...q, sentAt: new Date().toISOString(), sentTo: b.to }, ...S.quotes.filter(x => x.no !== q.no)]; res = { ok: true, sentAt: new Date().toISOString() }; break; }
      case 'docList': res = { ok: true, docs: [{ key: 'biz', label: '사업자등록증' }, { key: 'bank', label: '통장사본' }] }; break;
      case 'docGet': res = { ok: true, name: '트리랜드_사업자등록증.pdf', type: 'application/pdf', b64: 'JVBERi0=' }; break;
      default: res = { ok: true };
    }
    r.fulfill({ status: 200, body: JSON.stringify(res) });
  };
  return S;
}

async function scenario(label, device, clipboard) {
  console.log(`\n[${label}]`);
  const b = await pw.chromium.launch();
  const ctx = await b.newContext({ ...(device ? pw.devices[device] : { viewport: { width: 1300, height: 900 } }), acceptDownloads: true });
  if (clipboard) await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://localhost:${PORT}` });
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  const srvS = fakeServer(); await pg.route('https://script.google.com/**', srvS.route);
  const wait = ms => pg.waitForTimeout(ms);
  const view = () => pg.evaluate(() => ({ cust: document.querySelector('#cust').value, no: document.querySelector('#qno').value,
    bar: document.querySelector('#editBar').hidden ? '' : document.querySelector('#editTxt').textContent,
    msg: document.querySelector('#actMsg').textContent, box: !document.querySelector('#copyBox').hidden,
    local: JSON.parse(localStorage.getItem('tl-quote-hist') || '[]').map(h => h.no + ':' + h.cust + (h.pending ? ':P' : '')) }));
  const open = async () => { await pg.goto(BASE); await wait(1800); };
  const issue = async btn => { if (btn === '#copyBtn') await pg.click(btn); else await Promise.all([pg.waitForEvent('download', { timeout: 20000 }), pg.click(btn)]); await wait(1200); };

  await open(); await pg.evaluate(() => { localStorage.clear(); localStorage.setItem('tl_pin', 'test'); }); await open();
  let v = await view();
  ok(v.cust === '' && v.no === '2026-201' && !v.bar, '처음 열면 빈 새 견적, 다음 번호', v);

  // 쓰던 견적 → 다시 열기 → 이어서 쓰기
  await pg.fill('#cust', '카페 쓰던중'); await wait(200); await open(); v = await view();
  ok(v.cust === '' && /쓰던 견적\(카페 쓰던중\)/.test(v.bar), '쓰던 견적이 있어도 새 견적으로 열고 이어서 쓰기 안내', v);
  await pg.click('#editBtn'); await wait(300); v = await view();
  ok(v.cust === '카페 쓰던중', '이어서 쓰기로 쓰던 내용 복원', v);

  // PDF 발행 → 내역 → 다시 열면 새 견적
  await issue('#pdfBtn'); v = await view();
  ok(srvS.quotes.some(q => q.cust === '카페 쓰던중'), 'PDF 저장 → 서버 발행 내역에 기록', srvS.quotes.map(q => q.no + q.cust));
  ok(/이미 발행한 견적/.test(v.bar), '발행 직후 "이미 발행한 견적" 안내', v.bar);
  const noA = v.no;
  await open(); v = await view();
  ok(v.cust === '' && v.no !== noA && /지난번 견적/.test(v.bar), '발행 후 다시 열면 새 번호 새 견적', v);

  // 연속 발행: 새 견적 B를 이미지로 → A는 그대로
  await pg.fill('#cust', '병원 B'); await issue('#pngBtn'); v = await view();
  const A = srvS.quotes.find(q => q.no === noA), B = srvS.quotes.find(q => q.cust === '병원 B');
  ok(A && A.cust === '카페 쓰던중' && B && B.no !== noA, '이미지 저장으로 B 발행, A는 덮어쓰지 않음', srvS.quotes.map(q => q.no + q.cust));

  // 새 견적 버튼(발행된 견적이면 묻지 않음) → 카톡 요약
  await pg.click('#newBtn'); await wait(300);
  await pg.fill('#cust', '학교 C'); await issue('#copyBtn'); v = await view();
  ok(srvS.quotes.some(q => q.cust === '학교 C'), '카톡 요약 → 발행 내역에 기록', srvS.quotes.map(q => q.cust));
  ok(clipboard ? /복사했습니다/.test(v.msg) && !v.box : v.box && /길게 눌러/.test(v.msg), clipboard ? '복사 성공 안내' : '복사가 막히면 글 상자를 띄움', v.msg);

  // 메일 + 회사 서류
  await pg.click('#newBtn'); await wait(300);
  await pg.fill('#cust', '기관 D'); await pg.fill('#custEmail', 'd@example.com'); await pg.click('#mailBtn'); await wait(300);
  await pg.check('#docBiz'); await pg.check('#docBank');
  ok(/사업자등록증과 통장사본도 함께 첨부드립니다/.test(await pg.inputValue('#mailBody')), '서류 체크 시 본문 한 줄 자동');
  await pg.click('#mailSend'); await wait(2500);
  ok(srvS.sent.length === 1 && srvS.sent[0].docs.join() === 'biz,bank', '메일 발송에 서류 두 개 첨부 요청', srvS.sent);
  ok(srvS.quotes.some(q => q.cust === '기관 D' && q.sentAt), '메일 발송 → 발행 내역에 보낸 기록', srvS.quotes.map(q => q.cust + (q.sentAt ? '(메일)' : '')));

  // 서버 장애 중 발행 → 이 기기에 보관 → 서버 복구 후 다시 열면 올라감
  await pg.click('#newBtn'); await wait(300);
  srvS.down = true; await pg.fill('#cust', '장애중 E'); await issue('#pdfBtn'); v = await view();
  ok(v.local.some(x => x.includes('장애중 E')), '서버가 안 될 때도 이 기기 내역에 보관', v.local);
  srvS.down = false; await open(); await wait(1500);
  ok(srvS.quotes.some(q => q.cust === '장애중 E'), '서버 복구 후 다시 열면 서버로 올라감', srvS.quotes.map(q => q.cust));

  // 다른 기기에서 발행한 견적이 화면에 남은 경우(이 기기 내역 비어 있음)
  await pg.evaluate(() => { const h = JSON.parse(localStorage.getItem('tl-quote-hist'))[0]; localStorage.setItem('tl-quote-draft', JSON.stringify({ ...h.state, cust: '' })); localStorage.removeItem('tl-quote-hist'); });
  await open(); await wait(1200); v = await view();
  ok(v.cust === '' && !srvS.quotes.some(q => q.no === v.no), '다른 기기 발행분이 남아 있어도 새 번호로 시작', v);

  // 발행 내역 '열기' 후 서버 목록이 늦게 와도 화면을 바꾸지 않음
  await pg.evaluate(() => document.querySelector('#hist [data-open]').click()); await wait(1500); v = await view();
  ok(v.cust !== '' && /이미 발행한 견적/.test(v.bar), '열기로 연 견적은 그대로 두고 경고만 표시', v);

  ok(errs.length === 0, '스크립트 오류 없음', errs);
  await b.close();
}

try {
  await scenario('PC · 복사 허용', null, true);
  await scenario('휴대폰(아이폰) · 복사 막힘', 'iPhone 13', false);
  await scenario('휴대폰(안드로이드) · 복사 허용', 'Pixel 7', true);
} finally { srv.kill(); }
console.log(`\n결과: 통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);

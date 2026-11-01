// 근로계약 공통: 서버 주소, 계산, 계약서 조항 (관리 화면·서명 화면이 같이 씀)
// 서버 주소가 비어 있으면 관리 화면은 미리보기 모드. 알바 서명 화면은 Apps Script가 직접 띄움(apps-script/Sign.html)
const STAFF_ENDPOINT = "";
const MIN_WAGE = 10320;   // 2026년 최저시급
// 알바에게는 트리랜드 브랜드를 드러내지 않음(대표님 지시, 2026-11-01): 사업주는 대표자 이름·사업자등록번호만 표기
const BOSS = { rep:"홍준서", biz:"360-69-00592" };

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const won = n => Number(n || 0).toLocaleString("ko-KR");
const WD = "일월화수목금토";
const dateList = v => String(v || "").split(",").map(s => s.trim()).filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s)).sort();
function fmtDay(s, short){
  const [y, m, d] = s.split("-").map(Number), w = WD[new Date(y, m-1, d).getDay()];
  return short ? `${m}/${d}(${w})` : `${y}년 ${m}월 ${d}일(${w})`;
}
const toMin = t => { const [h, m] = String(t || "0:0").split(":").map(Number); return h * 60 + m; };

// 하루 근로시간·임금. 종료가 시작보다 이르면 다음 날 새벽까지 일한 것으로 봄
function calc(c){
  const dates = dateList(c.dates);
  let span = toMin(c.end) - toMin(c.start); if(span <= 0) span += 1440;
  const work = Math.max(0, span - (Number(c.breakMin) || 0));
  const hours = work / 60, wage = Number(c.wage) || 0;
  const dayPay = Math.round(wage * hours);
  // 주(월~일)별 소정근로시간 합계의 최댓값 → 15시간 미만이면 주휴·연차 미적용
  const weeks = {};
  dates.forEach(s => { const d = new Date(s + "T00:00:00"); const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay() + 6) % 7)); const k = mon.toDateString(); weeks[k] = (weeks[k] || 0) + hours; });
  const maxWeek = Math.max(0, ...Object.values(weeks));
  return { dates, work, hours, dayPay, total: dayPay * dates.length, maxWeek, under15: maxWeek < 15 };
}
const hText = h => (Math.round(h * 100) / 100).toString().replace(/\.0+$/, "") + "시간";

// 계약서 조항. 각 항목은 [제목, [문단...]]
function terms(c){
  const k = calc(c);
  return [
    ["제1조 (근로계약기간 및 근로일)", [`근로일은 ${k.dates.map(s => fmtDay(s)).join(", ")}${k.dates.length > 1 ? ` (총 ${k.dates.length}일)` : ""}로 하며, 근로계약기간은 위 근로일로 한다. 근로일의 근로가 끝나면 본 계약은 종료된다.`]],
    ["제2조 (근무 장소)", [c.place || "-"]],
    ["제3조 (업무 내용)", [c.job || "-"]],
    ["제4조 (근로시간 및 휴게시간)", [`① 근로시간은 ${c.start}부터 ${c.end}까지로 하며, ` + (Number(c.breakMin) ? `휴게시간 ${c.breakMin}분을 제외한 실근로시간은 1일 ${hText(k.hours)}으로 한다. 휴게시간은 근로자가 자유롭게 이용한다.` : `실근로시간은 1일 ${hText(k.hours)}으로 한다.`), "② 사업주와 근로자는 합의하여 근로일과 근로시간을 변경할 수 있다."]],
    ["제5조 (임금)", [`① 시급은 금 ${won(c.wage)}원으로 하며, 1일 임금은 금 ${won(k.dayPay)}원, 총 임금은 금 ${won(k.total)}원(${k.dates.length}일분)으로 한다.`,
      `② 임금은 ${c.payDay || "근로일 당일"}에 근로자 명의의 예금 계좌로 지급한다.`,
      "③ 임금은 소득세 등 관계 법령에 따라 공제할 금액을 공제한 후 지급한다.",
      "④ 연장·야간·휴일근로가 발생하는 경우 관계 법령에 따라 임금을 지급한다."]],
    ["제6조 (휴일 및 휴가)", [k.under15
      ? "1주 소정근로시간이 15시간 미만이므로 근로기준법 제18조 제3항에 따라 주휴일과 연차유급휴가는 적용하지 아니한다."
      : "주휴일과 연차유급휴가는 근로기준법에서 정하는 바에 따른다."]],
    ["제7조 (사회보험)", ["① 근로자에게는 산업재해보상보험과 고용보험을 적용한다.", "② 국민연금과 국민건강보험은 관계 법령에서 정한 가입 요건에 해당하는 경우에 적용한다."]],
    ["제8조 (안전)", ["근로자는 사업주의 안전 지시에 따르며, 작업 중 다치거나 물품이 파손된 경우 즉시 사업주에게 알린다."]],
    ["제9조 (근로계약서 교부)", ["사업주는 근로계약을 체결함과 동시에 본 계약서를 근로자에게 교부한다(근로기준법 제17조). 교부는 전자문서로 할 수 있다."]],
    ["제10조 (기타)", ["본 계약에 정하지 아니한 사항은 근로기준법 등 관계 법령에 따른다."]],
  ];
}
const PREAMBLE = `${BOSS.rep}(이하 "사업주"라 한다)와 근로자(이하 "근로자"라 한다)는 다음과 같이 근로계약을 체결한다.`;

// 주민번호 → 생년월일·나이·외국인 여부
function rrnInfo(rrn, onDate){
  const m = String(rrn || "").match(/^(\d{2})(\d{2})(\d{2})-?(\d)\d{6}$/); if(!m) return null;
  const g = +m[4], cent = [1,2,5,6].includes(g) ? 1900 : [3,4,7,8].includes(g) ? 2000 : 1800;
  const y = cent + +m[1], mo = +m[2], d = +m[3];
  if(mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const on = onDate ? new Date(onDate + "T00:00:00") : new Date();
  let age = on.getFullYear() - y; if(on.getMonth() + 1 < mo || (on.getMonth() + 1 === mo && on.getDate() < d)) age--;
  return { birth: `${y}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}`, birthText: `${y}년 ${mo}월 ${d}일`, age, foreign: g >= 5 && g <= 8 };
}

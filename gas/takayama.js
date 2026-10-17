/*******************************************************
 * 高山専用の簡易日報
 *
 * 高山のカレンダー（yawata51）の予定に、商品見積の台帳（入力シート）から
 * 金額を当てた「下書き」を返す。画面で ✓ を押すと日報シートに高山の行が入る。
 * 商品見積の台帳は読むだけ（書き込まない）。
 *******************************************************/

var TK_STAFF = '高山';
var TK_CAL_ID = 'yawata51@gmail.com';
var TK_EST_SS_ID = '1Pqb_DY3utvxKhTCIb4PJ0yNGra3hi1aSyFOHrydmuY0'; // 商品見積SS

function tkMatch_(a, b) {
  if (!a || !b) return false;
  return a.indexOf(b) >= 0 || b.indexOf(a) >= 0;
}

/* 見積台帳（最後の1行だけ・最近240日） */
function tkEstimates_() {
  var out = [];
  try {
    var sh = SpreadsheetApp.openById(TK_EST_SS_ID).getSheetByName('入力');
    if (!sh || sh.getLastRow() < 2) return out;
    var v = sh.getRange(2, 1, sh.getLastRow() - 1, 24).getValues();
    var last = {};
    v.forEach(function (r, i) { var k = String(r[0] || ''); if (k) last[k] = i; });
    var limit = new Date(); limit.setDate(limit.getDate() - 240);
    var limitYmd = Utilities.formatDate(limit, 'Asia/Tokyo', 'yyyy-MM-dd');
    Object.keys(last).forEach(function (eNo) {
      var r = v[last[eNo]];
      var made = nippoYmd_(r[22] || r[1]);
      if (made && made < limitYmd) return;
      out.push({
        eNo: eNo,
        date: nippoYmd_(r[1]),
        cust: String(r[2] || '').trim(),
        norm: calNorm_(r[2]),
        proj: String(r[3] || '').trim(),
        total: Number(String(r[4]).replace(/[^\d.-]/g, '')) || 0,
        kind: String(r[8] || '').trim(),
        tan: String(r[9] || '').trim(),
        koji: nippoYmd_(r[11]),
        sumi: nippoYmd_(r[21]),
        seiyaku: nippoYmd_(r[23])
      });
    });
  } catch (e) {}
  return out;
}

/* その日の予定に一番合う見積 */
function tkPickEstimate_(ests, norm, ymd) {
  var c = ests.filter(function (e) { return tkMatch_(e.norm, norm); });
  if (!c.length) return null;
  var score = function (e) {
    if (e.koji === ymd || e.sumi === ymd) return 3;
    if (e.kind === 'sokubai' && e.date === ymd) return 3;
    if (e.seiyaku) return 2;
    return 1;
  };
  c.sort(function (a, b) { return (score(b) - score(a)) || ((b.seiyaku || b.date) > (a.seiyaku || a.date) ? 1 : -1); });
  return c[0];
}

function tkGuessKind_(title, est, ymd) {
  var t = String(title || '');
  if (/点検|✨/.test(t)) return '点検';
  if (/サ[】\]]|修理/.test(t)) return '修理';
  if (/現調|下見/.test(t)) return '現調';
  if (/集金/.test(t)) return '集金';
  if (est && (est.koji === ymd || est.sumi === ymd)) return '工事';
  if (est && est.kind === 'sokubai') return '配達';
  return 'お困りごと対応';
}

/** 下書き：その日の高山の予定＋金額の候補 */
function tkDraft_(ymd) {
  var res = { date: ymd, items: [], err: '' };
  try {
    // その日の日報（全員分）
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('日報') || SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    var rows = [];
    if (sheet.getLastRow() >= 2) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, 14).getValues().forEach(function (r) {
        if (nippoYmd_(r[0]) !== ymd) return;
        rows.push({ staff: String(r[1] || '').trim(), visit: calNorm_(r[3]), work: String(r[4] || ''), amount: r[11], people: String(r[13] || '') });
      });
    }
    var ests = tkEstimates_();
    var used = {};

    // ほかの人のカレンダー（同じお客様の予定があれば一緒に行った人）
    var otherCal = [];
    CHECK_CALENDARS.forEach(function (c) {
      if (c.name === TK_STAFF) return;
      try {
        var oc = CalendarApp.getCalendarById(c.id);
        if (!oc) return;
        oc.getEvents(new Date(ymd + 'T00:00:00+09:00'), new Date(ymd + 'T23:59:59+09:00')).forEach(function (ev) {
          if (ev.isAllDayEvent()) return;
          var nm = calCustomerName_(ev.getTitle());
          if (nm && nm.length >= 2) otherCal.push({ staff: c.name, norm: nm });
        });
      } catch (e) {}
    });

    var cal = CalendarApp.getCalendarById(TK_CAL_ID);
    var evs = cal ? cal.getEvents(new Date(ymd + 'T00:00:00+09:00'), new Date(ymd + 'T23:59:59+09:00')) : [];
    evs.forEach(function (ev, i) {
      if (ev.isAllDayEvent()) return;
      var title = String(ev.getTitle() || '');
      if (CAL_SKIP_WORDS.some(function (w) { return title.indexOf(w) >= 0; })) return;
      var norm = calCustomerName_(title);
      if (!norm || norm.length < 2) return;
      var est = tkPickEstimate_(ests, norm, ymd);
      if (est) used[est.eNo] = 1;
      var mine = rows.filter(function (r) { return r.staff === TK_STAFF && tkMatch_(r.visit, norm); });
      var withSet = {};
      rows.forEach(function (r) { if (r.staff !== TK_STAFF && tkMatch_(r.visit, norm)) withSet[r.staff] = 1; });
      otherCal.forEach(function (o) { if (tkMatch_(o.norm, norm)) withSet[o.staff] = 1; });
      var withList = Object.keys(withSet);
      var strong = est && (est.koji === ymd || est.sumi === ymd || (est.kind === 'sokubai' && est.date === ymd));
      res.items.push({
        key: 'ev' + i,
        time: Utilities.formatDate(ev.getStartTime(), 'Asia/Tokyo', 'HH:mm'),
        title: title,
        cust: est ? est.cust : norm,
        kind: tkGuessKind_(title, est, ymd),
        amount: strong ? Math.round(est.total / 1000) : '',
        hint: (est && !strong) ? ('見積候補：' + est.proj + '　' + Math.round(est.total / 1000) + '千円（' + (est.koji || est.date) + '）') : '',
        people: withList.length + 1,
        eNo: est ? est.eNo : '',
        proj: est ? est.proj : '',
        done: mine.length > 0,
        with: withList
      });
    });

    // 予定に無い「その場販売」（高山が売ったもの）
    ests.forEach(function (e) {
      if (used[e.eNo] || e.kind !== 'sokubai' || e.date !== ymd) return;
      if (e.tan && e.tan.indexOf(TK_STAFF) < 0) return;
      var mine = rows.some(function (r) { return r.staff === TK_STAFF && tkMatch_(r.visit, e.norm); });
      res.items.push({
        key: 'sk' + e.eNo, time: '', title: 'その場販売：' + e.proj, cust: e.cust,
        kind: '配達', amount: Math.round(e.total / 1000), people: 1,
        eNo: e.eNo, proj: e.proj, done: mine, with: []
      });
    });
  } catch (e) { res.err = String(e); }
  return res;
}

/** ✓ を押したら日報シートに高山の行を入れる */
function tkSave_(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('日報') || SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var list = data.rows || [];
  var n = 0;
  list.forEach(function (x) {
    var ymd = nippoYmd_(x.date);
    var name = String(x.visitName || '').trim();
    if (!ymd || !name) return;
    var amount = parseInt(x.workAmount, 10) || 0;
    var ppl = parseInt(x.people, 10) || 1;
    var per = amount > 0 ? Math.floor(amount / ppl) : 0;
    sheet.appendRow([
      ymd, TK_STAFF, '', name, String(x.workType || ''),
      parseInt(x.aircon, 10) || 0, 0, '', '', '',
      0, amount, per, ppl + '人',
      '', 0, '', '', '', String(x.memo || '高山日報（簡易）'), ''
    ]);
    n++;
  });
  return n;
}

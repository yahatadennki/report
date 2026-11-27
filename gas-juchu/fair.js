// ===== フェア来店記録（fair.html から使う） =====
// 受注日報SSの「フェア来店記録」シートに1来店1行。並びは店のExcel（2026年度フェア.xlsx）に合わせる。
// 予定（日時・担当）が入っていれば、その担当のGoogleカレンダーに予定を入れる（変えたら直す・消したら消す）。
const FAIR_SHEET_NAME = 'フェア来店記録';
const FAIR_HEADERS = ['来店日', '№', '区域', 'MD', '名前', 'ﾊﾟﾅｶｰﾄﾞ入会', 'パナカード用紙記入', '内容',
  'クレジット', '現金', '予定日', 'ｶﾞﾗﾎﾟﾝ', '受付', '時刻', '住所', '電話番号', 'マスタ', '送信ID', '顧客コード', 'カード区分',
  '予定担当', '予定日時', '予定時間', '予定の内容', 'カレンダーID', '記念品'];
const FAIR_COL_ID = 18;
const FAIR_STAFF_MAIL = {
  '高山': 'yawata51@gmail.com', '伊藤': 'yahata.itou@gmail.com', '服部': 'yahata.hattori@gmail.com',
  '石橋': 'yahata.ishibashi@gmail.com', '角井': 'yahata.kakui@gmail.com', '北沢': 'yahata.kitazawa@gmail.com',
  '宇留野': 'yahata.uruno@gmail.com'
};
const FAIR_KU = { 1: '①', 2: '②', 3: '③', 4: '④', 5: '⑤', 6: '⑥', 7: '⑦', 8: '⑧', 9: '⑨' };

function fairSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const old = ss.getSheetByName('フェア来店');           // 試作で作った空シートは片付ける
  if (old && old.getLastRow() <= 1) ss.deleteSheet(old);
  let sh = ss.getSheetByName(FAIR_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(FAIR_SHEET_NAME);
    sh.appendRow(FAIR_HEADERS);
    sh.setFrozenRows(1);
    sh.getRange('A:A').setNumberFormat('yyyy/mm/dd');
    sh.setColumnWidth(5, 120); sh.setColumnWidth(8, 320);
  }
  // 見出しが足りなければ足す（列を増やしたとき用）
  const head = sh.getRange(1, 1, 1, FAIR_HEADERS.length).getValues()[0];
  if (head.join('|') !== FAIR_HEADERS.join('|')) {
    sh.getRange(1, 1, 1, FAIR_HEADERS.length).setValues([FAIR_HEADERS]).setFontWeight('bold').setBackground('#ffff00');
    ['K', 'N', 'P', 'V'].forEach(function(c) { sh.getRange(c + ':' + c).setNumberFormat('@'); });
  }
  return sh;
}

function fairJson_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function fairYmd_(v) {
  return (v instanceof Date) ? Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd') : String(v || '').replace(/\//g, '-');
}
const FAIR_CHK = function(b) { return b ? '✓' : ''; };

// 「12/5(金) 14:00 工事」のような見やすい予定の文
function fairPlanText_(d) {
  if (!d.planDate) return d.planWhat || '';
  const p = d.planDate.split('-').map(Number);
  const dt = new Date(p[0], p[1] - 1, p[2]);
  return p[1] + '/' + p[2] + '(' + '日月火水木金土'[dt.getDay()] + ')' + (d.planTime ? ' ' + d.planTime : '') +
    (d.planWhat ? ' ' + d.planWhat : '') + (d.planStaff ? '（' + d.planStaff + '）' : '');
}

// doGet から呼ぶ。action=fairList&date=YYYY-MM-DD → その日の来店一覧
function fairGet_(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'fairMasterHead') {   // 顧客マスタの見出し（列の確認用・読むだけ）
    const s = SpreadsheetApp.openById(CUSTOMER_MASTER_SS_ID);
    const m = s.getSheetByName('顧客マスタ') || s.getSheetByName('顧客ﾏｽﾀ');
    return fairJson_(m.getRange(1, 1, 1, Math.min(m.getLastColumn(), 20)).getDisplayValues()[0]);
  }
  if (p.action === 'fairSheetUrl') {     // 記録シートを開くボタン用
    const sh = fairSheet_();
    return fairJson_({ url: sh.getParent().getUrl() + '#gid=' + sh.getSheetId() });
  }
  if (p.action === 'fairInfo') return fairInfoGet_();
  const g = giftGet_(p); if (g) return g;
  if (p.action !== 'fairList') return null;
  const date = String(p.date || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd'));
  const sh = fairSheet_();
  const lr = sh.getLastRow();
  if (lr < 2) return fairJson_([]);
  const rows = sh.getRange(2, 1, lr - 1, FAIR_HEADERS.length).getDisplayValues();
  const out = [];
  rows.forEach(function(r) {
    if (fairYmd_(r[0]) !== date) return;
    const dt = String(r[21] || '').split(' ');
    out.push({
      date: date, no: r[1], area: r[2], md: !!r[3], name: r[4], panaJoin: !!r[5], panaForm: !!r[6],
      memo: r[7], credit: !!r[8], cash: !!r[9], plan: r[10], garapon: r[11], staff: r[12], time: r[13],
      address: r[14], tel: r[15], inMaster: r[16] === '○', id: r[17], code: r[18], card: r[19],
      planStaff: r[20], planDate: dt[0] || '', planTime: dt[1] || '', planHours: r[22], planWhat: r[23], calOk: !!r[24], notGiven: r[25] === '未渡し'
    });
  });
  return fairJson_(out);
}

// カレンダーの予定を消す（見つからなければ何もしない）
function fairCalDelete_(staff, eventId) {
  if (!eventId) return;
  try {
    const cal = CalendarApp.getCalendarById(FAIR_STAFF_MAIL[staff] || '');
    const ev = cal && cal.getEventById(eventId);
    if (ev) ev.deleteEvent();
  } catch (e) { console.log('fair cal delete: ' + e); }
}

// カレンダーに予定を入れる。戻り値 { id, msg }
function fairCalCreate_(d) {
  const mail = FAIR_STAFF_MAIL[d.planStaff];
  if (!mail) return { id: '', msg: 'nostaff' };
  const cal = CalendarApp.getCalendarById(mail);
  if (!cal) return { id: '', msg: 'nocal' };
  const m = String(d.area || '').match(/(\d+)\s*区/);
  const title = '🎪' + (m ? (FAIR_KU[Number(m[1])] || '') : '') + d.name + ' 様' + (d.planWhat ? ' - ' + d.planWhat : '');
  const desc = ['【フェア来店】 ' + String(d.date || '').replace(/-/g, '/') + ' 受付 ' + (d.staff || '')];
  if (d.tel) desc.push('【電話】 ' + d.tel);
  if (d.card) desc.push('【カード】 ' + d.card);
  if (d.memo) desc.push('【内容】 ' + d.memo);
  const opt = { location: d.address || '', description: desc.join('\n') };
  const p = d.planDate.split('-').map(Number);
  let ev;
  if (d.planTime) {
    const t = d.planTime.split(':').map(Number);
    const st = new Date(p[0], p[1] - 1, p[2], t[0], t[1]);
    const h = parseFloat(d.planHours) || 1;
    ev = cal.createEvent(title, st, new Date(st.getTime() + h * 3600000), opt);
  } else {
    ev = cal.createAllDayEvent(title, new Date(p[0], p[1] - 1, p[2]), opt);   // 時刻なし＝終日
  }
  return { id: ev.getId(), msg: 'ok' };
}

// doPost から呼ぶ。fairVisit＝追加（同じ送信IDなら上書き＝あとから変更）／fairDelete＝取消
function fairPost_(data) {
  if (data && data.action === 'fairInfoSave') return fairInfoSave_(data);
  if (data && (data.action === 'fairGift' || data.action === 'fairGiftDelete')) return giftPost_(data);
  if (!data || (data.action !== 'fairVisit' && data.action !== 'fairDelete')) return null;
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = fairSheet_();
    const lr = sh.getLastRow();
    const sid = String(data.id || '');
    const hit = (sid && lr >= 2)
      ? sh.getRange(2, FAIR_COL_ID, lr - 1, 1).createTextFinder(sid).matchEntireCell(true).findNext()
      : null;
    const old = hit ? sh.getRange(hit.getRow(), 1, 1, FAIR_HEADERS.length).getDisplayValues()[0] : null;

    if (data.action === 'fairDelete') {
      if (hit) {
        fairCalDelete_(old[20], old[24]);
        sh.deleteRow(hit.getRow());
      }
      return fairJson_({ ok: true });
    }

    const date = data.date || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
    data.date = date;
    let row, no;
    if (hit) {
      row = hit.getRow();
      no = old[1];
    } else {
      // №＝その日の何組目か
      no = 1;
      if (lr >= 2) {
        const v = sh.getRange(2, 1, lr - 1, 2).getValues();
        v.forEach(function(r) { if (fairYmd_(r[0]) === date) no = Math.max(no, Number(r[1] || 0) + 1); });
      }
      row = lr + 1;
    }

    // ---- カレンダー ----
    const planDT = data.planDate ? (data.planDate + (data.planTime ? ' ' + data.planTime : '')) : '';
    const sig = [data.planStaff || '', planDT, data.planHours || '', data.planWhat || '', data.name || '', data.area || ''].join('|');
    const oldSig = old ? [old[20], old[21], old[22], old[23], old[4], old[2]].join('|') : '';
    let calId = old ? old[24] : '';
    let cal = '';
    if (!data.planDate || !data.planStaff) {
      if (calId) { fairCalDelete_(old[20], calId); calId = ''; cal = 'removed'; }
    } else if (sig !== oldSig || !calId) {
      if (calId) fairCalDelete_(old[20], calId);
      try {
        const r = fairCalCreate_(data);
        calId = r.id; cal = r.msg;
      } catch (e) {
        calId = ''; cal = 'error: ' + e.message;
        console.log('fair cal create: ' + e);
      }
    } else {
      cal = 'kept';
    }

    const vals = [[
      date.replace(/-/g, '/'), no, data.area || '', FAIR_CHK(data.md), data.name || '',
      FAIR_CHK(data.panaJoin), FAIR_CHK(data.panaForm), data.memo || '',
      FAIR_CHK(data.credit), FAIR_CHK(data.cash), fairPlanText_(data), data.garapon || '',
      data.staff || '', data.time || '', data.address || '', data.tel || '',
      data.inMaster ? '○' : '新規', sid, data.code || '', data.card || '',
      data.planDate ? (data.planStaff || '') : '', planDT, data.planDate && data.planTime ? (data.planHours || '1') : '',
      data.planWhat || '', calId, data.notGiven ? '未渡し' : ''
    ]];
    sh.getRange(row, 1, 1, FAIR_HEADERS.length).setValues(vals);
    return fairJson_({ ok: true, no: no, updated: !!hit, cal: cal });
  } finally {
    lock.releaseLock();
  }
}

// ===== 配達で記念品（来店していない人）=====
// 来店とは別のシート。来店お礼はがき・来店集計には入れない。
const GIFT_SHEET_NAME = 'フェア配達記念品';
const GIFT_HEADERS = ['日付', '№', '区域', '名前', '内容', '渡した人', '時刻', '住所', '電話番号', 'マスタ', '送信ID', '顧客コード', 'カード区分', '記念品'];
const GIFT_COL_ID = 11;

function giftSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(GIFT_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(GIFT_SHEET_NAME);
    sh.getRange(1, 1, 1, GIFT_HEADERS.length).setValues([GIFT_HEADERS]).setFontWeight('bold').setBackground('#bae6fd');
    sh.setFrozenRows(1);
    sh.getRange('A:A').setNumberFormat('yyyy/mm/dd');
    ['G', 'I'].forEach(function(c) { sh.getRange(c + ':' + c).setNumberFormat('@'); });
    sh.setColumnWidth(4, 120); sh.setColumnWidth(5, 280);
  }
  if (sh.getRange(1, GIFT_HEADERS.length).getValue() !== GIFT_HEADERS[GIFT_HEADERS.length - 1])
    sh.getRange(1, 1, 1, GIFT_HEADERS.length).setValues([GIFT_HEADERS]).setFontWeight('bold').setBackground('#bae6fd');
  return sh;
}

function giftGet_(p) {
  if (p.action === 'fairGiftSheetUrl') {
    const sh = giftSheet_();
    return fairJson_({ url: sh.getParent().getUrl() + '#gid=' + sh.getSheetId() });
  }
  if (p.action !== 'fairGiftList') return null;
  const date = String(p.date || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd'));
  const sh = giftSheet_();
  const lr = sh.getLastRow();
  if (lr < 2) return fairJson_([]);
  const out = [];
  sh.getRange(2, 1, lr - 1, GIFT_HEADERS.length).getDisplayValues().forEach(function(r) {
    if (fairYmd_(r[0]) !== date) return;
    out.push({ kind: 'gift', date: date, no: r[1], area: r[2], name: r[3], memo: r[4], staff: r[5], time: r[6],
      address: r[7], tel: r[8], inMaster: r[9] === '○', id: r[10], code: r[11], card: r[12], notGiven: r[13] === '未渡し' });
  });
  return fairJson_(out);
}

function giftPost_(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = giftSheet_();
    const lr = sh.getLastRow();
    const sid = String(data.id || '');
    const hit = (sid && lr >= 2)
      ? sh.getRange(2, GIFT_COL_ID, lr - 1, 1).createTextFinder(sid).matchEntireCell(true).findNext()
      : null;
    if (data.action === 'fairGiftDelete') {
      if (hit) sh.deleteRow(hit.getRow());
      return fairJson_({ ok: true });
    }
    const date = data.date || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
    let row, no;
    if (hit) {
      row = hit.getRow();
      no = sh.getRange(row, 2).getValue();
    } else {
      no = 1;
      if (lr >= 2) sh.getRange(2, 1, lr - 1, 2).getValues().forEach(function(r) {
        if (fairYmd_(r[0]) === date) no = Math.max(no, Number(r[1] || 0) + 1);
      });
      row = lr + 1;
    }
    sh.getRange(row, 1, 1, GIFT_HEADERS.length).setValues([[
      date.replace(/-/g, '/'), no, data.area || '', data.name || '', data.memo || '', data.staff || '', data.time || '',
      data.address || '', data.tel || '', data.inMaster ? '○' : '新規', sid, data.code || '', data.card || '', data.notGiven ? '未渡し' : ''
    ]]);
    return fairJson_({ ok: true, no: no, updated: !!hit });
  } finally {
    lock.releaseLock();
  }
}

// ===== 基本情報（招待状部数・記念品の数など）と残数 =====
const INFO_SHEET_NAME = 'フェア基本情報';
const INFO_KEYS = [['name', 'フェア名'], ['start', '開始日'], ['end', '終了日'], ['invites', '招待状部数'], ['gifts', '記念品の数']];

function infoSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(INFO_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(INFO_SHEET_NAME);
    sh.getRange(1, 1, 1, 2).setValues([['項目', '値']]).setFontWeight('bold').setBackground('#fde68a');
    sh.getRange(2, 1, INFO_KEYS.length, 1).setValues(INFO_KEYS.map(function(k) { return [k[1]]; }));
    sh.getRange('B:B').setNumberFormat('@');
    sh.setColumnWidth(1, 120); sh.setColumnWidth(2, 200);
  }
  return sh;
}
function infoRead_() {
  const v = infoSheet_().getRange(2, 2, INFO_KEYS.length, 1).getDisplayValues();
  const o = {};
  INFO_KEYS.forEach(function(k, i) { o[k[0]] = String(v[i][0] || '').replace(/\//g, '-'); });
  return o;
}

// 期間中（開始日〜終了日、未設定なら全部）の来店数・記念品を渡した数
function fairInfoGet_() {
  const info = infoRead_();
  const inRange = function(d) { return (!info.start || d >= info.start) && (!info.end || d <= info.end); };
  let raiten = 0, given = 0, notGiven = 0, giftRows = 0;
  const people = [];   // 重複チェック用：[種類, 日付, 名前, 顧客コード, 電話, 送信ID]
  const vs = fairSheet_(), vl = vs.getLastRow();
  if (vl >= 2) vs.getRange(2, 1, vl - 1, FAIR_HEADERS.length).getDisplayValues().forEach(function(r) {
    const d = fairYmd_(r[0]);
    if (!inRange(d)) return;
    raiten++;
    if (r[25] === '未渡し') notGiven++; else given++;
    people.push(['v', d, r[4], r[18], r[15], r[17]]);
  });
  const gs = giftSheet_(), gl = gs.getLastRow();
  if (gl >= 2) gs.getRange(2, 1, gl - 1, GIFT_HEADERS.length).getDisplayValues().forEach(function(r) {
    const d = fairYmd_(r[0]);
    if (!inRange(d)) return;
    giftRows++;
    if (r[13] === '未渡し') notGiven++; else given++;
    people.push(['g', d, r[3], r[11], r[8], r[10]]);
  });
  const total = Number(String(info.gifts).replace(/[^\d]/g, '')) || 0;
  return fairJson_({ ok: true, info: info, raiten: raiten, haitatsu: giftRows, given: given, notGiven: notGiven,
    remain: total ? total - given : null, people: people });
}

function fairInfoSave_(data) {
  const sh = infoSheet_();
  const d = data.info || {};
  sh.getRange(2, 2, INFO_KEYS.length, 1).setValues(INFO_KEYS.map(function(k) { return [String(d[k[0]] || '')]; }));
  return fairInfoGet_();
}

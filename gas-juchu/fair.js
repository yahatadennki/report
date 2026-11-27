// ===== フェア来店記録（fair.html から使う） =====
// 受注日報SSの「フェア来店記録」シートに1来店1行。並びは店のExcel（2026年度フェア.xlsx）に合わせる。
const FAIR_SHEET_NAME = 'フェア来店記録';
const FAIR_HEADERS = ['来店日', '№', '区域', 'MD', '名前', 'ﾊﾟﾅｶｰﾄﾞ入会', 'パナカード用紙記入', '内容',
  'クレジット', '現金', '予定日', 'ｶﾞﾗﾎﾟﾝ', '受付', '時刻', '住所', '電話番号', 'マスタ', '送信ID'];
const FAIR_COL_ID = 18;

function fairSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const old = ss.getSheetByName('フェア来店');           // 試作で作った空シートは片付ける
  if (old && old.getLastRow() <= 1) ss.deleteSheet(old);
  let sh = ss.getSheetByName(FAIR_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(FAIR_SHEET_NAME);
    sh.appendRow(FAIR_HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, FAIR_HEADERS.length).setFontWeight('bold').setBackground('#ffff00');
    sh.getRange('A:A').setNumberFormat('yyyy/mm/dd');
    sh.getRange('N:N').setNumberFormat('@');
    sh.getRange('P:P').setNumberFormat('@');
    sh.getRange('K:K').setNumberFormat('@');
    sh.setColumnWidth(5, 120); sh.setColumnWidth(8, 320);
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

// doGet から呼ぶ。action=fairList&date=YYYY-MM-DD → その日の来店一覧
function fairGet_(e) {
  const p = (e && e.parameter) || {};
  if (p.action !== 'fairList') return null;
  const date = String(p.date || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd'));
  const sh = fairSheet_();
  const lr = sh.getLastRow();
  if (lr < 2) return fairJson_([]);
  const rows = sh.getRange(2, 1, lr - 1, FAIR_HEADERS.length).getDisplayValues();
  const out = [];
  rows.forEach(function(r) {
    if (fairYmd_(r[0]) !== date) return;
    out.push({
      date: date, no: r[1], area: r[2], md: !!r[3], name: r[4], panaJoin: !!r[5], panaForm: !!r[6],
      memo: r[7], credit: !!r[8], cash: !!r[9], plan: r[10], garapon: r[11], staff: r[12], time: r[13],
      address: r[14], tel: r[15], inMaster: r[16] === '○', id: r[17]
    });
  });
  return fairJson_(out);
}

// doPost から呼ぶ。fairVisit＝追加（同じ送信IDなら上書き＝あとから変更）／fairDelete＝取消
function fairPost_(data) {
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

    if (data.action === 'fairDelete') {
      if (hit) sh.deleteRow(hit.getRow());
      return fairJson_({ ok: true });
    }

    const date = data.date || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
    let row, no;
    if (hit) {
      row = hit.getRow();
      no = sh.getRange(row, 2).getValue();
    } else {
      // №＝その日の何組目か
      no = 1;
      if (lr >= 2) {
        const v = sh.getRange(2, 1, lr - 1, 2).getValues();
        v.forEach(function(r) { if (fairYmd_(r[0]) === date) no = Math.max(no, Number(r[1] || 0) + 1); });
      }
      row = lr + 1;
    }
    const vals = [[
      date.replace(/-/g, '/'), no, data.area || '', FAIR_CHK(data.md), data.name || '',
      FAIR_CHK(data.panaJoin), FAIR_CHK(data.panaForm), data.memo || '',
      FAIR_CHK(data.credit), FAIR_CHK(data.cash), data.plan || '', data.garapon || '',
      data.staff || '', data.time || '', data.address || '', data.tel || '',
      data.inMaster ? '○' : '新規', sid
    ]];
    sh.getRange(row, 1, 1, FAIR_HEADERS.length).setValues(vals);
    return fairJson_({ ok: true, no: no, updated: !!hit });
  } finally {
    lock.releaseLock();
  }
}

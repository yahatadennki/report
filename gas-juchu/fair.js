// ===== フェア来店記録（fair.html から使う） =====
// 受注日報SSの「フェア来店」シートに1来店1行で記録する。
const FAIR_SHEET_NAME = 'フェア来店';
const FAIR_HEADERS = ['来店日', '時刻', '受付担当', '顧客名', '住所', '電話番号', '区', 'マスタ', 'メモ', '送信ID'];

function fairSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(FAIR_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(FAIR_SHEET_NAME);
    sh.appendRow(FAIR_HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, FAIR_HEADERS.length).setFontWeight('bold').setBackground('#fde68a');
  }
  return sh;
}

function fairJson_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// doGet から呼ぶ。action=fairList&date=YYYY-MM-DD → その日の来店一覧
function fairGet_(e) {
  const p = (e && e.parameter) || {};
  if (p.action !== 'fairList') return null;
  const date = String(p.date || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd'));
  const sh = fairSheet_();
  const lr = sh.getLastRow();
  if (lr < 2) return fairJson_([]);
  const rows = sh.getRange(2, 1, lr - 1, FAIR_HEADERS.length).getValues();
  const out = [];
  rows.forEach(function(r, i) {
    const d = (r[0] instanceof Date) ? Utilities.formatDate(r[0], 'Asia/Tokyo', 'yyyy-MM-dd') : String(r[0]);
    if (d !== date) return;
    out.push({
      row: i + 2,
      time: (r[1] instanceof Date) ? Utilities.formatDate(r[1], 'Asia/Tokyo', 'HH:mm') : String(r[1]),
      staff: String(r[2]), name: String(r[3]), address: String(r[4]), tel: String(r[5]),
      memo: String(r[8]), id: String(r[9])
    });
  });
  return fairJson_(out);
}

// doPost から呼ぶ。data.action が fairVisit / fairDelete のときだけ処理して結果を返す
function fairPost_(data) {
  if (!data || (data.action !== 'fairVisit' && data.action !== 'fairDelete')) return null;
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = fairSheet_();
    const lr = sh.getLastRow();
    const sid = String(data.id || '');
    const hit = (sid && lr >= 2)
      ? sh.getRange(2, 10, lr - 1, 1).createTextFinder(sid).matchEntireCell(true).findNext()
      : null;

    if (data.action === 'fairDelete') {
      if (hit) sh.deleteRow(hit.getRow());
      return fairJson_({ ok: true });
    }
    if (hit) return fairJson_({ ok: true, already: true });  // 送り直しは二重に入れない

    const now = new Date();
    sh.appendRow([
      data.date || Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd'),
      data.time || Utilities.formatDate(now, 'Asia/Tokyo', 'HH:mm'),
      data.staff || '', data.name || '', data.address || '', data.tel || '',
      data.ku || '', data.inMaster ? '○' : '新規', data.memo || '', sid
    ]);
    // 時刻・電話が数値や日付に化けないよう文字列に
    const r = sh.getLastRow();
    sh.getRange(r, 2).setNumberFormat('@').setValue(data.time || Utilities.formatDate(now, 'Asia/Tokyo', 'HH:mm'));
    sh.getRange(r, 6).setNumberFormat('@').setValue(data.tel || '');
    return fairJson_({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

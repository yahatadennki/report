/*******************************************************
 * お礼ハガキ訪問リスト
 * 業務日報の「工事」「配達」から自動でリストを作る。
 * 顧客マスタと名前で照合して住所・TEL・区を補完する。
 *******************************************************/

var HAGAKI_SHEET = 'お礼ハガキ';
var HAGAKI_DAYS  = 120;   // 何日前までの日報を対象にするか
var HAGAKI_KU_MARKS = { 1: '①', 4: '④', 5: '⑤', 6: '⑥', 7: '⑦', 8: '⑧', 9: '⑨' };

/* 対象にする作業内容（部分一致）。修理は含めない */
function isHagakiTarget_(workType) {
  var w = String(workType || '');
  return w.indexOf('工事') >= 0 || w.indexOf('配達') >= 0;
}

/* 名前の表記ゆれを吸収（様・☎】・空白・全角半角） */
function hagakiNormName_(s) {
  return String(s || '')
    .replace(/☎】|【|】|✨/g, '')
    .replace(/[①④⑤⑥⑦⑧⑨②③]/g, '')
    .replace(/\s|　/g, '')
    .replace(/様$/, '')
    .trim();
}

/* 「【Ｃ】」のような表記から A〜E だけ取り出す */
function hagakiRank_(v) {
  var s = String(v || '').replace(/[【】\s]/g, '')
    .replace(/[Ａ-Ｅ]/g, function(c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
    .toUpperCase();
  return /^[A-E]$/.test(s) ? s : '';
}

/* 顧客マスタを { byName:{正規化名:客}, all:[客...] } で返す */
function hagakiCustomerIndex_() {
  var idx = {};
  var all = [];
  try {
    var ss = SpreadsheetApp.openById(CUSTOMER_MASTER_SS_ID);
    var s = ss.getSheetByName('顧客マスタ') || ss.getSheetByName('顧客ﾏｽﾀ');
    if (!s) return idx;
    var d = s.getDataRange().getValues();
    for (var i = 1; i < d.length; i++) {
      var nm = String(d[i][1] || '').trim();
      if (!nm) continue;
      var key = hagakiNormName_(nm);
      var ku = String(d[i][8] || '').trim(); // I列 例:「1区 角井」
      var m = ku.match(/(\d+)\s*区/);
      var obj = {
        key: key,
        name: nm,
        tel: String(d[i][3] || '').trim(),
        address: [d[i][15], d[i][16]].filter(function(v) { return v; }).join(' '),
        ku: ku,
        kuMark: m ? (HAGAKI_KU_MARKS[Number(m[1])] || '') : '',
        rfm: hagakiRank_(d[i][10])   // K列 RFMランク
      };
      all.push(obj);
      if (!idx[key]) idx[key] = obj;        // 先勝ち（完全同名は最初の1件）
    }
  } catch (e) {}
  return { byName: idx, all: all };
}

/**
 * 日報の訪問先名から顧客を引く。
 * 完全一致 → 苗字だけの前方一致（該当1件のときだけ採用）の順。
 * 複数該当したら「要確認」を返す。
 */
function hagakiFindCustomer_(rawName, cust) {
  var k = hagakiNormName_(rawName);
  if (!k) return null;
  if (cust.byName[k]) return cust.byName[k];

  var hits = [];
  for (var i = 0; i < cust.all.length; i++) {
    if (cust.all[i].key.indexOf(k) === 0) {
      hits.push(cust.all[i]);
      if (hits.length > 1) break;
    }
  }
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) return { ambiguous: true };
  return null;
}

/* 日報の1行から、ハガキに書く「何をしたか」を組み立てる */
function hagakiWorkDetail_(r) {
  var work = String(r[4] || '').trim();
  var parts = [];
  var kouji = String(r[8] || '').trim();    // I列 工事種類
  var haitatsu = String(r[7] || '').trim(); // H列 配達商品
  if (kouji) parts.push(kouji.replace(/\n/g, '・'));
  if (haitatsu) parts.push(haitatsu.replace(/\n/g, '・'));
  var detail = parts.join(' / ');
  return detail ? (work + '：' + detail) : work;
}

function hagakiYmd_(v) {
  return nippoYmd_(v);
}

/**
 * お礼ハガキシートを最新化する。
 * ・日報から工事/配達を拾って追加
 * ・既にある行はチェック状態・訪問日・メモを保持
 */
function updateHagakiList() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var nippo = ss.getSheetByName('日報') || ss.getSheets()[0];
  var last = nippo.getLastRow();
  if (last < 2) return 0;

  var sh = ss.getSheetByName(HAGAKI_SHEET);
  if (!sh) {
    sh = ss.insertSheet(HAGAKI_SHEET);
  }

  var HEAD = ['工事日', '区', 'RFM', '顧客名', '住所', 'TEL', '内容', '工事担当', '訪問済', '訪問日', 'メモ', 'KEY'];
  // 見出しが今の形と違えば作り直す（列を増やしたときにズレないように）
  var curHead = sh.getLastColumn() >= HEAD.length
    ? sh.getRange(1, 1, 1, HEAD.length).getValues()[0].join('\t') : '';
  if (curHead !== HEAD.join('\t')) {
    sh.clear();
    sh.clearConditionalFormatRules();
    try { sh.showColumns(1, Math.max(sh.getMaxColumns(), HEAD.length)); } catch (e) {}
    sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD])
      .setFontWeight('bold').setBackground('#f4b400').setFontColor('#000');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 80);   // 工事日
    sh.setColumnWidth(2, 40);   // 区
    sh.setColumnWidth(3, 50);   // RFM
    sh.setColumnWidth(4, 130);  // 顧客名
    sh.setColumnWidth(5, 240);  // 住所
    sh.setColumnWidth(6, 110);  // TEL
    sh.setColumnWidth(7, 260);  // 内容
    sh.setColumnWidth(8, 90);   // 工事担当
    sh.setColumnWidth(9, 60);   // 訪問済
    sh.setColumnWidth(10, 80);  // 訪問日
    sh.setColumnWidth(11, 180); // メモ
    sh.hideColumns(12);
  }

  /* 既存行を KEY で覚える（チェック状態を消さないため） */
  var existing = {};
  var eLast = sh.getLastRow();
  if (eLast >= 2) {
    var ev = sh.getRange(2, 1, eLast - 1, HEAD.length).getValues();
    for (var i = 0; i < ev.length; i++) {
      var k = String(ev[i][11] || '');
      if (k) existing[k] = { done: ev[i][8], visitDate: ev[i][9], memo: ev[i][10] };
    }
  }

  var cust = hagakiCustomerIndex_();
  var limit = new Date();
  limit.setDate(limit.getDate() - HAGAKI_DAYS);
  var limitYmd = Utilities.formatDate(limit, 'Asia/Tokyo', 'yyyy-MM-dd');

  var vals = nippo.getRange(2, 1, last - 1, 21).getValues();
  var rows = [];
  var seen = {};

  for (var r = 0; r < vals.length; r++) {
    var row = vals[r];
    if (!isHagakiTarget_(row[4])) continue;
    var ymd = hagakiYmd_(row[0]);
    if (!ymd || ymd < limitYmd) continue;

    var rawName = String(row[3] || '').trim();
    if (!rawName) continue;
    var key = ymd + '|' + hagakiNormName_(rawName);
    if (seen[key]) continue;   // 同日同名の重複行はまとめる
    seen[key] = true;

    var c = hagakiFindCustomer_(rawName, cust);
    var hit = (c && !c.ambiguous) ? c : null;
    var prev = existing[key] || {};

    var dd = new Date(ymd + 'T00:00:00+09:00');
    var wd = ['日', '月', '火', '水', '木', '金', '土'][dd.getDay()];

    rows.push([
      (dd.getMonth() + 1) + '/' + dd.getDate() + '(' + wd + ')',
      hit ? hit.kuMark : '',                    // 区
      hit ? hit.rfm : '',                       // RFMランク
      (hit ? hit.name : rawName.replace(/☎】/g, '')) + ' 様',
      hit ? hit.address : (c && c.ambiguous ? '⚠️ 同姓が複数：要確認' : '⚠️ 顧客マスタに無し'),
      hit ? hit.tel : '',
      hagakiWorkDetail_(row),
      String(row[1] || '').trim(),
      prev.done === true ? true : false,
      prev.visitDate || '',
      prev.memo || '',
      key
    ]);
  }

  /* 新しい順に並べる */
  rows.sort(function(a, b) { return a[11] < b[11] ? 1 : (a[11] > b[11] ? -1 : 0); });

  if (sh.getLastRow() >= 2) {
    sh.getRange(2, 1, sh.getLastRow() - 1, HEAD.length).clearContent()
      .clearDataValidations().setBackground(null).setFontLine('none');
  }
  if (!rows.length) return 0;

  sh.getRange(2, 1, rows.length, 1).setNumberFormat('@'); // 「8/6(木)」を日付に変換させない
  sh.getRange(2, 1, rows.length, HEAD.length).setValues(rows);
  sh.getRange(2, 9, rows.length, 1).insertCheckboxes();
  sh.getRange(2, 1, rows.length, HEAD.length).setVerticalAlignment('middle');
  sh.getRange(2, 2, rows.length, 2).setHorizontalAlignment('center');
  sh.getRange(2, 2, rows.length, 1).setFontSize(12);

  /* 訪問済にチェックが入ったら行をグレーにする */
  var rule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$I2=TRUE')
    .setBackground('#eeeeee').setFontColor('#999999')
    .setRanges([sh.getRange(2, 1, rows.length, 11)])
    .build();

  /* 顧客マスタに無い行は住所セルを赤く */
  var warn = SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains('⚠️')
    .setBackground('#fce8e6').setFontColor('#c5221f')
    .setRanges([sh.getRange(2, 5, rows.length, 1)])
    .build();

  /* 優良客(Aランク)は目立たせる */
  var rankA = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('A')
    .setBackground('#fff2cc').setFontColor('#b06000').setBold(true)
    .setRanges([sh.getRange(2, 3, rows.length, 1)])
    .build();

  sh.setConditionalFormatRules([rankA, warn, rule]);

  return rows.length;
}

/* 未訪問だけを配列で返す（Webページ用） */
function getHagakiPending_() {
  // 毎回作り直すと重いので15分に1回だけ最新化する
  try {
    var props = PropertiesService.getScriptProperties();
    var last = Number(props.getProperty('HAGAKI_LAST_BUILD') || 0);
    if (Date.now() - last > 15 * 60 * 1000) {
      updateHagakiList();
      props.setProperty('HAGAKI_LAST_BUILD', String(Date.now()));
    }
  } catch (e) { updateHagakiList(); }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(HAGAKI_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, 12).getValues();
  var out = [];
  for (var i = 0; i < v.length; i++) {
    if (v[i][8] === true) continue;
    out.push({
      date: String(v[i][0]),
      ku: String(v[i][1] || ''),
      rfm: String(v[i][2] || ''),
      name: String(v[i][3] || ''),
      address: String(v[i][4] || ''),
      tel: String(v[i][5] || ''),
      work: String(v[i][6] || ''),
      staff: String(v[i][7] || ''),
      key: String(v[i][11] || '')
    });
  }
  return out;
}

/* Webページから「訪問済」を書き戻す */
function markHagakiDone_(key, memo) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(HAGAKI_SHEET);
  if (!sh || sh.getLastRow() < 2) return false;
  var keys = sh.getRange(2, 12, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < keys.length; i++) {
    if (String(keys[i][0]) === String(key)) {
      var row = i + 2;
      sh.getRange(row, 9).setValue(true);
      sh.getRange(row, 10).setValue(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'M/d'));
      if (memo) sh.getRange(row, 11).setValue(memo);
      return true;
    }
  }
  return false;
}

/* 未訪問リストを LINE に流す（週1回想定） */
function sendHagakiReminder() {
  var list = getHagakiPending_();
  if (!list.length) return;
  var lines = list.slice(0, 40).map(function(x, i) {
    return (i + 1) + '. ' + (x.ku ? x.ku + ' ' : '') + x.name + '（' + x.date + '）\n　　' + x.address;
  });
  var msg = '🌻【お礼ハガキ 未訪問リスト】' + list.length + '件\n\n' + lines.join('\n');
  if (list.length > 40) msg += '\n\n…ほか' + (list.length - 40) + '件';
  try { hagakiPushLine_(msg); } catch (e) {
    try { MailApp.sendEmail('yawata51@gmail.com', 'お礼ハガキ 未訪問リスト', msg); } catch (e2) {}
  }
}

/* オーナーのLINEへ送る（業務日報まとめと同じ方式） */
function hagakiPushLine_(msg) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('LINE_CHANNEL_ACCESS_TOKEN');
  var to = props.getProperty('OWNER_LINE_USER_ID');
  if (!token || !to) throw new Error('LINE未設定');
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({ to: to, messages: [{ type: 'text', text: msg.slice(0, 4900) }] }),
    muteHttpExceptions: true
  });
}

/* 週1トリガー（月曜 8:30） */
function お礼ハガキ週次トリガー設定() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'sendHagakiReminder') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendHagakiReminder')
    .timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).nearMinute(30)
    .inTimezone('Asia/Tokyo').create();
}

/*******************************************************
 * 銘板（型番シール）読み取り
 * 点検で撮った銘板写真をAIに読ませ、お客様ごとの保有家電として貯める。
 * 10年を超えたものは自動で買換見込みになる。
 *******************************************************/

var MEIBAN_SHEET = '保有家電';
var MEIBAN_TAG = '銘板';
var MEIBAN_KAIKAE_YEARS = 10;   // 何年で買換見込みとするか

/* ---- シート ---- */
function meibanSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(MEIBAN_SHEET);
  var HEAD = ['登録日', '顧客名', '区', '種別', 'メーカー', '型番', '製造年', '経過年',
              '設置場所', '状態', '撮影者', '写真', 'メモ', 'ランク', 'いつ頃', '見込メモ'];
  if (!sh) {
    sh = ss.insertSheet(MEIBAN_SHEET);
    sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD])
      .setFontWeight('bold').setBackground('#1a3a5c').setFontColor('#fff');
    sh.setFrozenRows(1);
    [80, 130, 40, 90, 110, 140, 70, 70, 100, 90, 80, 60, 180, 70, 100, 200]
      .forEach(function(w, i) { sh.setColumnWidth(i + 1, w); });
  }
  // 古いシートには「いつ頃」「見込メモ」の列が無いので足す
  if (sh.getLastColumn() < HEAD.length) {
    sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD])
      .setFontWeight('bold').setBackground('#1a3a5c').setFontColor('#fff');
    sh.setColumnWidth(14, 70); sh.setColumnWidth(15, 100); sh.setColumnWidth(16, 200);
  }
  return sh;
}

/* 「2016」「2016年」「H28」などから西暦4桁を取り出す */
function meibanYear_(v) {
  var s = String(v || '');
  var m = s.match(/(19|20)\d{2}/);
  if (m) return Number(m[0]);
  var h = s.match(/H(\d{1,2})/i);          // 平成
  if (h) return 1988 + Number(h[1]);
  var r = s.match(/R(\d{1,2})/i);          // 令和
  if (r) return 2018 + Number(r[1]);
  return null;
}

/**
 * 見込商品の写真1枚をAIに読ませる。
 * 写真から 種別・メーカー・型番・製造年・設置場所 を、
 * 備考から ランク(A/B/C)・時期 を判断させる。
 * 読めなければ null。
 */
function readMeiban_(dataUrl, memo) {
  var key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!key) throw new Error('ANTHROPIC_API_KEY が未設定です');

  var parts = String(dataUrl).split(',');
  var mime = parts[0].split(':')[1].split(';')[0];
  var b64 = parts[1];
  memo = String(memo || '').trim();

  var prompt =
    'これは家電製品の写真です（銘板＝型番シールが写っていることが多い）。\n' +
    'スタッフが「そのうち買い替えそうなお客様の家電」として撮ったものです。\n\n' +
    '■ 写真から読み取ること（写っている文字だけ。推測で補わない。読めなければ空文字）\n' +
    '  kind  … 種別。エアコン/冷蔵庫/洗濯機/テレビ/給湯器/照明/換気扇/レンジ/ドアホン/その他 から選ぶ\n' +
    '  maker … メーカー名\n' +
    '  model … 型番\n' +
    '  year  … 製造年。西暦4桁。和暦しか無ければ西暦に直す（H28→2016、R3→2021）\n' +
    '  place … 設置場所。写真から分かれば リビング/台所/寝室/洗面所/トイレ/玄関/廊下/屋外 など。分からなければ空文字\n\n' +
    '■ スタッフの備考から判断すること\n' +
    '  備考：' + (memo ? '「' + memo + '」' : '（記入なし）') + '\n' +
    '  rank … A / B / C のどれか\n' +
    '     A ＝ 買換予定。買い替える意思がある（例「来年変えたい」「そろそろ替える」「見積が欲しい」）\n' +
    '     B ＝ 気になる。不調・古い・関心はあるが、まだ決めていない（例「調子が悪い」「音がうるさい」「古い」）\n' +
    '     C ＝ 壊れたら。壊れるまで使う（例「壊れたら」「まだ使える」「当分いい」）\n' +
    '     備考が無いときは B にする。\n' +
    '  timing … rank が A のときだけ、買い替え時期。\n' +
    '     すぐにでも/3ヶ月以内/半年以内/来年の春前/来年の夏前/来年の冬前/1年以上先/未定 から選ぶ。\n' +
    '     A でない、または備考に時期が書いていなければ空文字。\n\n' +
    '次のJSONだけを返してください（説明文は不要）:\n' +
    '{"kind":"","maker":"","model":"","year":"","place":"","rank":"","timing":""}\n' +
    '写真から何も読み取れない場合も、rank と timing は備考から判断して入れてください。';

  var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({
      model: 'claude-opus-4-8',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mime, data: b64 } },
          { type: 'text', text: prompt }
        ]
      }]
    }),
    muteHttpExceptions: true
  });

  if (res.getResponseCode() !== 200) {
    throw new Error('AI応答エラー ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 200));
  }
  var txt = JSON.parse(res.getContentText()).content[0].text;
  var m = txt.match(/\{[\s\S]*\}/);
  if (!m) return null;
  var o = JSON.parse(m[0]);
  o._read = !!(o.model || o.maker || o.kind);   // 写真から何か読めたか
  return o;
}

/* 顧客マスタから 区マーク を引く（お礼ハガキと同じ仕組みを使う） */
function meibanKuMark_(name) {
  try {
    var cust = hagakiCustomerIndex_();
    var hit = hagakiFindCustomer_(name, cust);
    return (hit && !hit.ambiguous) ? hit.kuMark : '';
  } catch (e) { return ''; }
}

/**
 * 日報に付いてきた銘板写真を読み取って「保有家電」に追加する。
 * 日報の送信を待たせないよう、裏（トリガー）で動かす。
 */
function processMeibanQueue() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'processMeibanQueue') ScriptApp.deleteTrigger(t);
  });

  var props = PropertiesService.getScriptProperties();
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) {}
  var q;
  try {
    q = JSON.parse(props.getProperty('MEIBAN_QUEUE') || '[]');
    props.setProperty('MEIBAN_QUEUE', '[]');
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
  if (!q.length) return;

  var sh = meibanSheet_();
  var thisYear = new Date().getFullYear();
  var rows = [];

  q.forEach(function(fileId) {
    var file = null;
    try {
      file = DriveApp.getFileById(fileId);
      var job = JSON.parse(file.getBlob().getDataAsString());
      var ku = meibanKuMark_(job.visitName);
      (job.photos || []).forEach(function(p) {
        try {
          var r = readMeiban_(p.data, p.note);
          if (!r || !r._read) {
            rows.push([new Date(), job.visitName, ku, '', '', '', '', '', '', '⚠️読取失敗',
                       job.staff, p.url || '', '写真から型番を読めませんでした',
                       (r && r.rank) || 'B', (r && r.timing) || '', p.note || '']);
            return;
          }
          var y = meibanYear_(r.year);
          var age = y ? thisYear - y : '';
          var status = (y && age >= MEIBAN_KAIKAE_YEARS) ? '買換見込み' : (y ? '使用中' : '製造年不明');
          rows.push([new Date(), job.visitName, ku, r.kind || '', r.maker || '', r.model || '',
                     y || '', age, r.place || '', status, job.staff, p.url || '', '',
                     r.rank || 'B', r.timing || '', p.note || '']);
        } catch (er) {
          rows.push([new Date(), job.visitName, ku, p.kind || '', '', '', '', '', p.place || '', '⚠️エラー',
                     job.staff, p.url || '', String(er).slice(0, 120), '', '', p.note || '']);
        }
      });
    } catch (e) {
    } finally {
      try { if (file) file.setTrashed(true); } catch (e2) {}
    }
  });

  if (rows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    meibanFormat_(sh);
  }

  var remain = JSON.parse(props.getProperty('MEIBAN_QUEUE') || '[]');
  if (remain.length) ScriptApp.newTrigger('processMeibanQueue').timeBased().after(1000).create();
}

/* 買換見込みの行を目立たせる */
function meibanFormat_(sh) {
  if (sh.getLastRow() < 2) return;
  var n = sh.getLastRow() - 1;
  var rule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('買換見込み')
    .setBackground('#fff2cc').setFontColor('#b06000').setBold(true)
    .setRanges([sh.getRange(2, 10, n, 1)])
    .build();
  var warn = SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains('⚠️')
    .setBackground('#fce8e6').setFontColor('#c5221f')
    .setRanges([sh.getRange(2, 10, n, 1)])
    .build();
  // ランク（N列）：A=買換予定は赤、B=気になるは黄、C=壊れたらはグレー
  var rk = sh.getRange(2, 14, n, 1);
  var rA = SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('A')
    .setBackground('#fce8e6').setFontColor('#c5221f').setBold(true).setRanges([rk]).build();
  var rB = SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('B')
    .setBackground('#fff2cc').setFontColor('#b06000').setRanges([rk]).build();
  var rC = SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('C')
    .setBackground('#eceff1').setFontColor('#546e7a').setRanges([rk]).build();
  sh.setConditionalFormatRules([rule, warn, rA, rB, rC]);
}

/* 日報送信時に呼ぶ：銘板写真をキューに積んで、あとで読ませる */
function queueMeiban_(visitName, staff, photos) {
  if (!photos || !photos.length) return;
  var folder = getOrCreateFolder_('銘板読取キュー');
  var f = folder.createFile(Utilities.newBlob(
    JSON.stringify({ visitName: visitName, staff: staff, photos: photos }),
    'application/json', 'meiban_' + Date.now() + '.json'));
  var props = PropertiesService.getScriptProperties();
  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e) {}
  try {
    var q = JSON.parse(props.getProperty('MEIBAN_QUEUE') || '[]');
    q.push(f.getId());
    props.setProperty('MEIBAN_QUEUE', JSON.stringify(q));
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
  ScriptApp.newTrigger('processMeibanQueue').timeBased().after(1000).create();
}

/* 買換見込みの一覧（画面・通知用） */
function getKaikaeMikomi_() {
  var sh = meibanSheet_();
  if (sh.getLastRow() < 2) return [];
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, 16).getValues();
  var out = [];
  v.forEach(function(r) {
    if (String(r[9]) !== '買換見込み') return;
    out.push({ name: String(r[1] || ''), ku: String(r[2] || ''), kind: String(r[3] || ''),
               maker: String(r[4] || ''), model: String(r[5] || ''),
               year: r[6], age: r[7], place: String(r[8] || '') });
  });
  out.sort(function(a, b) { return (b.age || 0) - (a.age || 0); });
  return out;
}

/**
 * 保有家電の一覧（アプリ用）。顧客マスタから住所・電話も足す。
 * 絞り込みは画面側でやるので、ここでは全部返す。
 */
function getKadenList_() {
  var sh = meibanSheet_();
  if (sh.getLastRow() < 2) return [];
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, 16).getValues();
  var cust = hagakiCustomerIndex_();
  var thisYear = new Date().getFullYear();
  var out = [];

  for (var i = 0; i < v.length; i++) {
    var name = String(v[i][1] || '').trim();
    if (!name) continue;
    var year = Number(v[i][6]) || null;
    var hit = hagakiFindCustomer_(name, cust);
    var c = (hit && !hit.ambiguous) ? hit : null;
    out.push({
      row: i + 2,
      name: c ? c.name : name,
      ku: String(v[i][2] || (c ? c.kuMark : '')),
      kind: String(v[i][3] || ''),
      maker: String(v[i][4] || ''),
      model: String(v[i][5] || ''),
      year: year,
      age: year ? thisYear - year : null,
      place: String(v[i][8] || ''),
      status: String(v[i][9] || ''),
      tel: c ? c.tel : '',
      address: c ? c.address : '',
      rfm: c ? c.rfm : '',
      staff: String(v[i][10] || '')
    });
  }
  out.sort(function(a, b) { return (b.age || -1) - (a.age || -1); });
  return out;
}

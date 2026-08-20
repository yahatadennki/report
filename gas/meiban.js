/*******************************************************
 * 銘板（型番シール）読み取り
 * 点検で撮った銘板写真をAIに読ませ、お客様ごとの保有家電として貯める。
 * 10年を超えたものは自動で買換見込みになる。
 *******************************************************/

var MEIBAN_SHEET = '保有家電';
var MEIBAN_TAG = '銘板';
var MEIBAN_KAIKAE_YEARS = 10;   // 何年で買換見込みとするか

var MIKOMI_SHEET = '見込';

/* ---- 見込シート（日報とは別タブ。あとで抽出しやすいように1行1件） ---- */
function mikomiSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(MIKOMI_SHEET);
  var HEAD = ['登録日', 'ランク', 'いつ頃', '顧客名', '区', 'RFM',
              '種別', 'メーカー', '型番', '製造年', '経過年', '設置場所',
              '気づいたこと', '撮影者', '写真', '状況'];
  var W    = [80, 60, 90, 140, 45, 55, 90, 100, 130, 70, 60, 90, 240, 70, 60, 90];
  if (!sh) {
    sh = ss.insertSheet(MIKOMI_SHEET);
    sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD])
      .setFontWeight('bold').setBackground('#1a3a5c').setFontColor('#fff')
      .setHorizontalAlignment('center');
    sh.setFrozenRows(1);
    sh.setFrozenColumns(4);
    W.forEach(function(w, i) { sh.setColumnWidth(i + 1, w); });
  }
  if (sh.getLastColumn() < HEAD.length) {
    sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD])
      .setFontWeight('bold').setBackground('#1a3a5c').setFontColor('#fff')
      .setHorizontalAlignment('center');
  }
  return sh;
}

/* 見込シートの件数を数える（その日 / その月）。報告書の「見込み」に使う */
function mikomiCount_(ymd) {
  var out = { day: 0, month: 0 };
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(MIKOMI_SHEET);
    if (!sh || sh.getLastRow() < 2) return out;
    var ym = String(ymd).slice(0, 7);
    sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(function(r) {
      if (!r[0]) return;
      var d = (r[0] instanceof Date)
        ? Utilities.formatDate(r[0], 'Asia/Tokyo', 'yyyy-MM-dd')
        : String(r[0]).slice(0, 10);
      if (d === ymd) out.day++;
      if (d.slice(0, 7) === ym) out.month++;
    });
  } catch (e) {}
  return out;
}

/* 見込シートの色分けと絞り込み（ランクA=赤 B=黄 C=グレー） */
function mikomiFormat_(sh) {
  if (sh.getLastRow() < 2) return;
  var n = sh.getLastRow() - 1;
  var rk = sh.getRange(2, 2, n, 1);
  var mk = function(t, bg, fc, bold) {
    return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(t)
      .setBackground(bg).setFontColor(fc).setBold(!!bold).setRanges([rk]).build();
  };
  sh.setConditionalFormatRules([
    mk('A', '#fce8e6', '#c5221f', true),
    mk('B', '#fff2cc', '#b06000', false),
    mk('C', '#eceff1', '#546e7a', false),
    SpreadsheetApp.newConditionalFormatRule().whenTextContains('済')
      .setBackground('#e6f4ea').setFontColor('#137333')
      .setRanges([sh.getRange(2, 16, n, 1)]).build()
  ]);
  try { if (sh.getFilter()) sh.getFilter().remove(); } catch (e) {}
  try { sh.getRange(1, 1, sh.getLastRow(), 16).createFilter(); } catch (e) {}
  // 新しいものが上に来るように、ランク→登録日 の順で並べる
  try { sh.getRange(2, 1, n, 16).sort([{ column: 2, ascending: true }, { column: 1, ascending: false }]); } catch (e) {}
}

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
    '     すぐにでも/3ヶ月以内/半年以内/年内/来年の春前/来年の夏前/来年の冬前/1年以上先/未定 から選ぶ。\n' +
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

/**
 * 写真が無い見込み（会話で聞いただけ）を、書いてもらった文章から読み取る。
 * 例）「年内には冷蔵庫変えたいなー」→ 種別=冷蔵庫 ランク=A いつ頃=年内
 */
function readMikomiMemo_(memo) {
  var key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!key) throw new Error('ANTHROPIC_API_KEY が未設定です');
  memo = String(memo || '').trim();
  if (!memo) return null;

  var prompt =
    'お客様先で聞いた「そのうち買い替えそうな家電」のメモです。写真はありません。\n' +
    'メモ：「' + memo + '」\n\n' +
    '次を判断してJSONだけ返してください（説明文は不要）:\n' +
    '  kind  … 種別。エアコン/冷蔵庫/洗濯機/テレビ/給湯器/照明/換気扇/レンジ/ドアホン/その他。分からなければ空文字\n' +
    '  place … 設置場所。メモに書いてあれば リビング/台所/寝室/洗面所/トイレ/玄関/廊下/屋外 など。無ければ空文字\n' +
    '  rank  … A / B / C\n' +
    '     A ＝ 買換予定。買い替える意思がある（例「年内に変えたい」「そろそろ替える」「見積が欲しい」）\n' +
    '     B ＝ 気になる。不調・古い・関心はあるが決めていない（例「調子が悪い」「古い」）\n' +
    '     C ＝ 壊れたら。壊れるまで使う（例「壊れたら」「まだ使える」）\n' +
    '  timing … rank が A のときだけ。\n' +
    '     すぐにでも/3ヶ月以内/半年以内/年内/来年の春前/来年の夏前/来年の冬前/1年以上先/未定 から選ぶ。\n' +
    '     A でない、または時期が書いていなければ空文字。\n\n' +
    '{"kind":"","place":"","rank":"","timing":""}';

  var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({
      model: 'claude-opus-4-8',
      max_tokens: 200,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
    }),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    throw new Error('AI応答エラー ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 200));
  }
  var txt = JSON.parse(res.getContentText()).content[0].text;
  var mm = txt.match(/\{[\s\S]*\}/);
  if (!mm) return null;
  var o = JSON.parse(mm[0]);
  o.maker = ''; o.model = ''; o.year = '';
  o._read = true;          // 写真が無いだけで、読み取り失敗ではない
  o._memoOnly = true;
  return o;
}

/**
 * 通常のメモ・要件から、買い替えの見込みが混じっていないか拾う。
 * 見込みが書かれていなければ null（＝行を作らない）。
 * 見込商品欄に書いてくれなくても取りこぼさないための保険。
 */
function readMikomiScan_(memo) {
  var key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!key) throw new Error('ANTHROPIC_API_KEY が未設定です');
  memo = String(memo || '').trim();
  if (memo.length < 6) return null;

  var prompt =
    '電器店スタッフが書いた訪問メモです。この中に「お客様の家電の買い替えの見込み」が\n' +
    '書かれているかどうかだけを見てください。\n\n' +
    'メモ：「' + memo + '」\n\n' +
    '■ 見込みとみなすもの\n' +
    '  お客様が家電の買い替え・購入について、意思や関心を口にしている。\n' +
    '  例）「年内に冷蔵庫を変えたい」「エアコンの調子が悪い」「そろそろテレビを替えたい」\n' +
    '■ 見込みとみなさないもの\n' +
    '  今回やった作業の報告、故障の修理内容、集金、世間話、次回の訪問予定など。\n' +
    '  すでに売れた・工事した商品のことも見込みではない。\n' +
    '  迷ったら found=false にしてください。取りこぼしより、間違って拾う方が困ります。\n\n' +
    '次のJSONだけ返してください（説明文は不要）:\n' +
    '{"found":true/false,"kind":"","place":"","rank":"","timing":"","why":""}\n' +
    '  kind   … 種別。エアコン/冷蔵庫/洗濯機/テレビ/給湯器/照明/換気扇/レンジ/ドアホン/その他\n' +
    '  place  … 設置場所。書いてあれば。無ければ空文字\n' +
    '  rank   … A=買換予定（意思あり） B=気になる（不調・関心） C=壊れたら\n' +
    '  timing … rank が A のときだけ。すぐにでも/3ヶ月以内/半年以内/年内/来年の春前/来年の夏前/来年の冬前/1年以上先/未定\n' +
    '  why    … 見込みと判断した部分をメモから短く抜き出す（40字以内）';

  var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({
      model: 'claude-opus-4-8',
      max_tokens: 300,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
    }),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) return null;
  var txt = JSON.parse(res.getContentText()).content[0].text;
  var mm = txt.match(/\{[\s\S]*\}/);
  if (!mm) return null;
  var o = JSON.parse(mm[0]);
  if (!o.found) return null;
  o.maker = ''; o.model = ''; o.year = '';
  o._read = true;
  o._fromMemo = true;
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

  var sh = mikomiSheet_();
  var cust = hagakiCustomerIndex_();
  var thisYear = new Date().getFullYear();
  var rows = [];

  q.forEach(function(fileId) {
    var file = null;
    try {
      file = DriveApp.getFileById(fileId);
      var job = JSON.parse(file.getBlob().getDataAsString());
      var ci = mikomiCustomer_(job.visitName, cust);
      (job.photos || []).forEach(function(p) {
        try {
          var r = p.scan ? readMikomiScan_(p.note)
                 : p.data ? readMeiban_(p.data, p.note)
                 : readMikomiMemo_(p.note);
          if (p.scan && !r) return;   // メモに見込みが書かれていなければ行を作らない
          if (!r || !r._read) {
            rows.push(mikomiRow_(job, p, ci, (r && r.rank) || 'B', (r && r.timing) || '',
                                 '', '', '', '', '', '', p.data ? '⚠️型番が読めず' : '⚠️内容が読めず'));
            return;
          }
          var y = meibanYear_(r.year);
          var age = y ? thisYear - y : '';
          rows.push(mikomiRow_(job, p, ci, r.rank || 'B', r.timing || '',
                               r.kind || '', r.maker || '', r.model || '', y || '', age,
                               r.place || '', r._fromMemo ? 'メモから拾った' : (r._memoOnly ? '会話で聞いた' : ''),
                               r.why || ''));
        } catch (er) {
          rows.push(mikomiRow_(job, p, ci, 'B', '', '', '', '', '', '', '',
                               '⚠️' + String(er).slice(0, 60)));
        }
      });
    } catch (e) {
    } finally {
      try { if (file) file.setTrashed(true); } catch (e2) {}
    }
  });

  if (rows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    mikomiFormat_(sh);
  }

  var remain = JSON.parse(props.getProperty('MEIBAN_QUEUE') || '[]');
  if (remain.length) ScriptApp.newTrigger('processMeibanQueue').timeBased().after(1000).create();
}


/* 顧客マスタから フルネーム・区・RFMランク を引く */
function mikomiCustomer_(name, cust) {
  try {
    var hit = hagakiFindCustomer_(name, cust);
    if (hit && !hit.ambiguous) {
      return { name: hit.name || name, ku: hit.kuMark || '', rfm: hit.rfm || '' };
    }
  } catch (e) {}
  return { name: name, ku: '', rfm: '' };
}

/* 見込シートの1行を作る（列の順番はここだけ見れば分かるようにする） */
function mikomiRow_(job, p, ci, rank, timing, kind, maker, model, year, age, place, note, why) {
  return [new Date(), rank, timing, ci.name || job.visitName, ci.ku, ci.rfm,
          kind, maker, model, year, age, place,
          why || p.note || '', job.staff, p.url || '', note || ''];
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

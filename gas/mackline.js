/**
 * マックライン シグナル通知（メール）
 * アプリ https://yahatadennki.github.io/report/mackline/ と同じ判定ロジック。
 *
 * ★通知＝「日足のトレンド方向に1時間足のMACDがクロスした時」＝そのままエントリーの合図
 *   検証：クロスした足で即入るのが最良（3通貨 +3,769pips）。
 *     高値更新を待つと高値づかみで成績が落ちる（−10pips）。
 *     時間が経ったクロスは追いかけない。
 *
 * 対象: ドル円・ドルスイス・ユーロドル（3年半の検証でプラスだった3通貨）
 */

var MACKLINE_MAIL_TO = 'yawata51@gmail.com';
var PAIRS = ['USD/JPY', 'USD/CHF', 'EUR/USD'];
var JP_NAME = { 'USD/JPY': 'ドル円', 'USD/CHF': 'ドルスイス', 'EUR/USD': 'ユーロドル' };

var PARAMS = {
  FLAT: 0.012,      // 傾きがこれ以下(%)なら「方向なし」
  SWING: 3,
  BUFFER: 3,        // 損切りを安値の少し下に置く幅(pips)
  FRESH: 2          // クロスした足で入るルールなので実質1本（念のため2）
};

// ===== 初期設定（APIキーの登録）=====
function マックライン初期設定() {
  PropertiesService.getScriptProperties().setProperty('TWELVE_KEY', 'fc1760c21c3747c6908db7184f0a45b5');
  return 'TWELVE_KEY 設定OK';
}

// ===== 指標 =====
function sma_(p, n) {
  var o = new Array(p.length).fill(null);
  if (p.length < n) return o;
  var s = 0;
  for (var i = 0; i < n; i++) s += p[i];
  o[n - 1] = s / n;
  for (var j = n; j < p.length; j++) { s += p[j] - p[j - n]; o[j] = s / n; }
  return o;
}
function ema_(p, n) {
  var k = 2 / (n + 1), o = new Array(p.length).fill(null), st = -1;
  for (var i = 0; i < p.length; i++) if (p[i] !== null) { st = i; break; }
  if (st < 0 || p.length - st < n) return o;
  var s = 0;
  for (var a = st; a < st + n; a++) s += p[a];
  o[st + n - 1] = s / n;
  for (var b = st + n; b < p.length; b++) if (p[b] !== null && o[b - 1] !== null) o[b] = p[b] * k + o[b - 1] * (1 - k);
  return o;
}
function macd_(c) {
  var f = ema_(c, 9), s = ema_(c, 20);
  var line = c.map(function(_, i) { return (f[i] !== null && s[i] !== null) ? f[i] - s[i] : null; });
  return { line: line, sig: ema_(line, 9) };
}
function slopeAt_(a, i) { var x = a[i], y = a[i - 3]; return (x != null && y) ? ((x - y) / y) * 100 : 0; }
function dirOf_(v) { return v > PARAMS.FLAT ? 'up' : v < -PARAMS.FLAT ? 'down' : 'flat'; }
function pipSize_(s) { return /JPY/i.test(s) ? 0.01 : 0.0001; }
function fmt_(v, s) { return v == null ? '---' : v.toFixed(/JPY/i.test(s) ? 3 : 5); }

// ===== データ取得 =====
function fetchCandles_(symbol, interval) {
  var key = PropertiesService.getScriptProperties().getProperty('TWELVE_KEY');
  var url = 'https://api.twelvedata.com/time_series?symbol=' + encodeURIComponent(symbol) +
            '&interval=' + interval + '&outputsize=400&apikey=' + key;
  var j = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText());
  if (!j.values) throw new Error(symbol + ' ' + interval + ': ' + (j.message || '取得失敗'));
  var v = j.values.slice().reverse();
  return {
    time:   v.map(function(x) { return x.datetime; }),
    closes: v.map(function(x) { return parseFloat(x.close); }),
    highs:  v.map(function(x) { return parseFloat(x.high); }),
    lows:   v.map(function(x) { return parseFloat(x.low); })
  };
}

// ===== 判定：日足の方向にMACDがクロスしたか（＝通知の対象）=====
function checkCross_(symbol) {
  var h1 = fetchCandles_(symbol, '1h');
  Utilities.sleep(400);
  var dy = fetchCandles_(symbol, '1day');

  var last = h1.closes.length - 1;
  var pip = pipSize_(symbol);

  // 日足の方向
  var dma = sma_(dy.closes, 20);
  var dDir = dirOf_(slopeAt_(dma, dma.length - 1));

  var m = macd_(h1.closes);
  // 直近の「最後のクロス」を探す（逆クロスが後に起きていれば前のは無効）
  var crossIdx = -1, crossDir = null;
  for (var i = last; i > Math.max(0, last - PARAMS.FRESH); i--) {
    var m0 = m.line[i], s0 = m.sig[i], m1 = m.line[i - 1], s1 = m.sig[i - 1];
    if (m0 == null || s0 == null || m1 == null || s1 == null) continue;
    if (m1 <= s1 && m0 > s0) { crossIdx = i; crossDir = 'up'; break; }
    if (m1 >= s1 && m0 < s0) { crossIdx = i; crossDir = 'down'; break; }
  }

  var out = { symbol: symbol, name: JP_NAME[symbol] || symbol, dDir: dDir, price: h1.closes[last], hit: false };
  if (dDir === 'flat' || crossIdx < 0 || crossDir !== dDir) return out;

  // クロス後につけた高値(安値)＝この後ここを抜けたらエントリー
  var trig = dDir === 'up' ? -Infinity : Infinity;
  for (var k = crossIdx; k <= last; k++) trig = dDir === 'up' ? Math.max(trig, h1.highs[k]) : Math.min(trig, h1.lows[k]);

  // 損切りの目安＝直近10本の逆側の極値
  var from = Math.max(0, last - 10), stopBase = dDir === 'up' ? Infinity : -Infinity;
  for (var q = from; q <= last; q++) {
    stopBase = dDir === 'up' ? Math.min(stopBase, h1.lows[q]) : Math.max(stopBase, h1.highs[q]);
  }
  var line = dDir === 'up' ? stopBase - PARAMS.BUFFER * pip : stopBase + PARAMS.BUFFER * pip;

  out.hit = true;
  out.dir = dDir;
  out.crossTime = h1.time[crossIdx];
  out.barsAgo = last - crossIdx;
  out.trigger = trig;
  out.stop = line;
  out.risk = Math.abs(h1.closes[last] - line) / pip;
  return out;
}

// ===== メール送信 =====
function pushMail_(subject, text) {
  MailApp.sendEmail({
    to: MACKLINE_MAIL_TO,
    subject: subject,
    body: text + '\n\n▼アプリで確認\nhttps://yahatadennki.github.io/report/mackline/\n'
  });
  return true;
}

// ===== メイン：15分ごとに実行。日足方向のクロスが出たら知らせる =====
function checkMackline() {
  var p = PropertiesService.getScriptProperties();
  var hits = [], status = [];

  PAIRS.forEach(function(sym) {
    try {
      var r = checkCross_(sym);
      if (r.hit) {
        // 同じクロスで何度も送らない（クロスの時刻をキーに1回だけ）
        var key = 'CROSS_' + sym.replace('/', '');
        if (p.getProperty(key) !== r.crossTime) {
          p.setProperty(key, r.crossTime);
          hits.push(
            '■ ' + r.name + '　' + (r.dir === 'up' ? '買い' : '売り') + '\n' +
            '　日足：' + (r.dir === 'up' ? '上昇' : '下落') + 'トレンド\n' +
            '　クロス：' + r.crossTime + (r.barsAgo ? '（' + r.barsAgo + '本前）' : '（今）') + '\n' +
            (r.barsAgo === 0
              ? '　▶ 今すぐ ' + fmt_(r.price, sym) + ' で' + (r.dir === 'up' ? '買い' : '売り') + '\n' +
                '　　損切り：' + fmt_(r.stop, sym) + '（' + r.risk.toFixed(1) + 'pips）'
              : '　※' + r.barsAgo + '本前のクロスなので見送り（追いかけない）')
          );
        }
      }
      status.push(r.name + '：' + (r.hit ? 'クロスあり' : (r.dDir === 'flat' ? '日足方向なし' : '待ち')));
    } catch (e) {
      status.push(sym + '：エラー ' + e);
    }
  });

  if (hits.length) {
    var head = hits.length === 1
      ? hits[0].split('\n')[0].replace('■ ', '').trim()
      : hits.length + '件のクロス';
    pushMail_('📈 マックライン｜' + head,
      '【MACDクロス＝エントリーの合図】\n' +
      '検証の結果、クロスした足で即入るのが最も成績が良い形でした。\n' +
      '（高値更新を待つと高値づかみになり成績が落ちます／時間が経ったクロスは追いかけません）\n\n' +
      hits.join('\n\n'));
  }
  return status.join(' / ');
}

// ===== テスト送信（クロスの有無に関係なく今の状態を送る）=====
function テスト送信() {
  var out = [];
  PAIRS.forEach(function(sym) {
    try {
      var r = checkCross_(sym);
      var t = '■ ' + r.name + '\n' +
              '　日足：' + (r.dDir === 'up' ? '↑上昇' : r.dDir === 'down' ? '↓下落' : '→方向なし') + '\n' +
              '　現在値：' + fmt_(r.price, sym) + '\n';
      if (r.hit) {
        t += '　★' + (r.dir === 'up' ? '買い' : '売り') + '方向のクロスあり（' + r.crossTime + '）\n' +
             '　▶ ' + fmt_(r.trigger, sym) + ' を' + (r.dir === 'up' ? '上' : '下') + '抜けたらエントリー\n' +
             '　　損切り目安：' + fmt_(r.stop, sym) + '（' + r.risk.toFixed(1) + 'pips）';
      } else {
        t += '　クロス待ち';
      }
      out.push(t);
    } catch (e) { out.push('■ ' + sym + '：エラー ' + e); }
  });
  var msg = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'M月d日 HH:mm') + ' 時点\n\n' + out.join('\n\n');
  pushMail_('📈 マックライン｜テスト送信', msg);
  Logger.log(msg);
  return msg;
}

// ===== トリガー設定：15分ごと =====
function トリガー設定() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'checkMackline') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('checkMackline').timeBased().everyMinutes(15).create();
  return 'OK: 15分ごとにチェックします';
}

// ※Webエンドポイントは コード.js の doGet に mackline_* として追加している

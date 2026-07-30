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
// ★通知モード： 'ishin'（維新流＝教材どおり／既定） | 'claude'（MACDクロスで即入る）
var MACKLINE_MODE = 'ishin';
// ★通知はドル円だけ。維新流で PF2.18・勝率47%・最大DD242pips と最も安定していたため。
//   他の通貨は維新流では負ける（ユーロドル-518 / ドルスイス-1154 / ドルカナダ-779 / ユーロ円-313）
var PAIRS = ['USD/JPY'];
var JP_NAME = { 'USD/JPY': 'ドル円', 'EUR/USD': 'ユーロドル', 'GBP/USD': 'ポンドドル', 'USD/CHF': 'ドルスイス' };

var PARAMS = {
  FLAT: 0.012,      // 傾きがこれ以下(%)なら「方向なし」
  SWING: 3,
  BUFFER: 3,        // 損切りを安値の少し下に置く幅(pips)
  FRESH: 2,         // クロスした足で入るルールなので実質1本（念のため2）
  NEAR_TH: 0.15     // 「クロス間近」の判定：MACDとシグナルの差が直近20本平均の15%以下
                    // 検証：この水準で予告すると3時間以内に約8割クロスする（週7回程度）
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
  var f = ema_(c, 12), s = ema_(c, 26);   // ★検証で(9,20,9)より+841pips良かったため標準設定(12,26,9)
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

// 日足はその日のうちは変わらないのでキャッシュする（無料枠 8req/分 を超えないため）
function fetchDailyCached_(symbol) {
  var cache = CacheService.getScriptCache();
  var key = 'DAILY_' + symbol.replace('/', '') + '_' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd');
  var hit = cache.get(key);
  if (hit) {
    try { return JSON.parse(hit); } catch (e) {}
  }
  var d = fetchCandles_(symbol, '1day');
  // 20MAの判定に必要な分だけ残して軽くする（Cacheは100KB上限）
  var keep = 60;
  var slim = {
    closes: d.closes.slice(-keep), highs: d.highs.slice(-keep), lows: d.lows.slice(-keep), time: d.time.slice(-keep)
  };
  try { cache.put(key, JSON.stringify(slim), 21600); } catch (e) {}   // 6時間
  return slim;
}

// ===== 判定：日足の方向にMACDがクロスしたか（＝通知の対象）=====
function checkCross_(symbol) {
  var h1 = fetchCandles_(symbol, '1h');
  Utilities.sleep(400);
  var dy = fetchDailyCached_(symbol);

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

  var out = { symbol: symbol, name: JP_NAME[symbol] || symbol, dDir: dDir, price: h1.closes[last], hit: false, near: false };

  // ── クロス間近の判定（まだクロスしていないが差が縮まっている）──
  if (dDir !== 'flat') {
    var hNow = (m.line[last] != null && m.sig[last] != null) ? m.line[last] - m.sig[last] : null;
    var hPrev = (m.line[last - 1] != null && m.sig[last - 1] != null) ? m.line[last - 1] - m.sig[last - 1] : null;
    if (hNow != null && hPrev != null) {
      // 直近20本の差の平均（大きさの基準）
      var a = 0, cnt = 0;
      for (var z = Math.max(0, last - 20); z <= last; z++) {
        if (m.line[z] != null && m.sig[z] != null) { a += Math.abs(m.line[z] - m.sig[z]); cnt++; }
      }
      var avg = cnt ? a / cnt : 0;
      // 日足の方向へ向かって縮小中か（買いなら差がマイナス側から0へ近づく）
      var approaching = dDir === 'up' ? (hNow < 0 && hNow > hPrev) : (hNow > 0 && hNow < hPrev);
      if (approaching && avg > 0 && Math.abs(hNow) <= avg * PARAMS.NEAR_TH) {
        out.near = true;
        out.nearRatio = Math.abs(hNow) / avg;
        out.time = h1.time[last];
      }
    }
  }

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

// ===== 維新流の判定（仕様書10章フロー）=====
//  STEP1 4時間足の環境（F1方向明確・F3長短一致）
//  STEP2 1時間足の収束→拡散（トレンドの根元）
//  STEP3 グランビル①②のみ
//  STEP4 MACD(9,20,9)が上位足方向
//  STEP5 20MAが水平気味 ＋ 20MAに絡んだ付近の高値を更新＝確定
function checkIshin_(symbol) {
  var h1 = fetchCandles_(symbol, '1h');
  Utilities.sleep(400);
  var h4 = fetchCandles_(symbol, '4h');
  var last = h1.closes.length - 1, pip = pipSize_(symbol);
  var out = { symbol: symbol, name: JP_NAME[symbol] || symbol, price: h1.closes[last], state: 'WAIT', ng: [] };

  function sma(a, n) { return sma_(a, n); }
  function slope(a, i) { return slopeAt_(a, i); }

  // STEP1: 4時間足
  var e20 = sma(h4.closes, 20), e75 = sma(h4.closes, 75);
  var L4 = h4.closes.length - 1;
  var d4 = dirOf_(slope(e20, L4)), d4b = dirOf_(slope(e75, L4));
  if (d4 === 'flat') { out.ng.push('F1 4時間足の方向が不明'); return out; }
  if (d4 !== d4b) { out.ng.push('F3 4時間足の20MAと75MAが不一致'); return out; }
  var trend = d4;
  out.trend = trend;

  var ma20 = sma(h1.closes, 20), ma75 = sma(h1.closes, 75);
  var d20 = dirOf_(slope(ma20, last));

  // F2
  if (trend === 'up' ? d20 === 'down' : d20 === 'up') { out.ng.push('F2 1時間足20MAが逆向き'); return out; }

  // STEP2: 収束→拡散
  var sp = [], ab = [];
  for (var i = 0; i < h1.closes.length; i++) {
    sp[i] = (ma20[i] != null && ma75[i] != null) ? ma20[i] - ma75[i] : null;
    ab[i] = sp[i] == null ? null : Math.abs(sp[i]);
  }
  var rootAgo = -1;
  for (var k = last; k > Math.max(5, last - 18); k--) {
    if (ab[k] == null || ab[k - 1] == null || ab[k - 2] == null) continue;
    if (ab[k - 1] < ab[k - 2] && ab[k - 1] < ab[k]) {
      var mx = 0;
      for (var q = Math.max(0, k - 30); q <= k; q++) if (ab[q] != null) mx = Math.max(mx, ab[q]);
      if (mx > 0 && ab[k - 1] / mx <= 0.5) { rootAgo = last - (k - 1); break; }
    }
  }
  var expanding = trend === 'up' ? (sp[last] > sp[last - 1]) : (sp[last] < sp[last - 1]);
  if (!(rootAgo >= 0 && rootAgo <= 16 && expanding)) { out.ng.push('収束→拡散の根元でない'); return out; }
  out.rootAgo = rootAgo;

  // STEP3: グランビル①②
  var sideNow = h1.closes[last] > ma20[last] ? 1 : -1;
  var sidePrev = h1.closes[last - 1] > ma20[last - 1] ? 1 : -1;
  var g1 = false;
  if (trend === 'up' ? (sidePrev < 0 && sideNow > 0) : (sidePrev > 0 && sideNow < 0)) {
    for (var z = Math.max(1, last - 8); z < last; z++) {
      if (dirOf_(slope(ma20, z)) === (trend === 'up' ? 'down' : 'up')) { g1 = true; break; }
    }
  }
  var g2 = false;
  if (d20 === trend && (trend === 'up' ? h1.closes[last] > ma20[last] : h1.closes[last] < ma20[last])) {
    for (var y = Math.max(1, last - 10); y <= last; y++) {
      if (ma20[y] == null) continue;
      if (trend === 'up' ? h1.lows[y] <= ma20[y] : h1.highs[y] >= ma20[y]) { g2 = true; break; }
    }
  }
  if (!g1 && !g2) { out.ng.push('グランビル①②に該当しない'); return out; }
  out.gv = g2 ? 2 : 1;

  // STEP4: MACD
  var m = macd9_(h1.closes);   // ★維新流は(9,20,9)
  var m0 = m.line[last], s0 = m.sig[last], m1 = m.line[last - 1], s1 = m.sig[last - 1];
  var gc = (m1 <= s1 && m0 > s0), dc = (m1 >= s1 && m0 < s0);
  var macdOK = trend === 'up' ? (gc || m0 > s0) : (dc || m0 < s0);
  if (!macdOK) { out.ng.push('MACDが上位足方向でない'); return out; }
  out.cross = gc ? 'GC' : dc ? 'DC' : '';

  // STEP5: 確定ライン（20MAに絡んだ付近の高値）
  var touch = -1;
  for (var t2 = last; t2 >= Math.max(0, last - 30); t2--) {
    if (ma20[t2] == null) break;
    if (h1.lows[t2] <= ma20[t2] && h1.highs[t2] >= ma20[t2]) { touch = t2; break; }
  }
  if (touch < 0 || touch > last - 1) { out.ng.push('20MAに絡んだ地点が見当たらない'); return out; }
  var lv = trend === 'up' ? -Infinity : Infinity, st = trend === 'up' ? Infinity : -Infinity;
  for (var w = touch; w <= last - 1; w++) {
    lv = trend === 'up' ? Math.max(lv, h1.highs[w]) : Math.min(lv, h1.lows[w]);
    st = trend === 'up' ? Math.min(st, h1.lows[w]) : Math.max(st, h1.highs[w]);
  }
  out.trigger = lv;
  out.entry = trend === 'up' ? lv + PARAMS.BUFFER * pip : lv - PARAMS.BUFFER * pip;
  out.stop  = trend === 'up' ? st - PARAMS.BUFFER * pip : st + PARAMS.BUFFER * pip;
  out.risk  = Math.abs(out.entry - out.stop) / pip;
  out.dir = trend;
  out.time = h1.time[last];
  out.state = (trend === 'up' ? h1.highs[last] > lv : h1.lows[last] < lv) ? 'ENTRY' : 'SETUP';
  return out;
}
// 維新流用のMACD(9,20,9)
function macd9_(c) {
  var f = ema_(c, 9), s = ema_(c, 20);
  var line = c.map(function(_, i) { return (f[i] !== null && s[i] !== null) ? f[i] - s[i] : null; });
  return { line: line, sig: ema_(line, 9) };
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
  if (MACKLINE_MODE === 'ishin') return checkMacklineIshin_();
  return checkMacklineClaude_();
}

// ── 維新流モード（既定）：準備(SETUP)と確定(ENTRY)で知らせる ──
function checkMacklineIshin_() {
  var p = PropertiesService.getScriptProperties();
  var hits = [], setups = [], status = [];
  PAIRS.forEach(function(sym) {
    try {
      var r = checkIshin_(sym);
      var key = 'ISHIN_' + sym.replace('/', '') + '_' + r.state;
      if (r.state === 'ENTRY' || r.state === 'SETUP') {
        var stamp = r.state + '_' + (r.trigger ? r.trigger.toFixed(4) : '');
        if (p.getProperty(key) !== stamp) {
          p.setProperty(key, stamp);
          var body =
            '■ ' + r.name + '　' + (r.dir === 'up' ? '買い' : '売り') +
            '（グランビル' + (r.gv === 2 ? '②・最重視' : '①') + '）\n' +
            '　4時間足：' + (r.dir === 'up' ? '上昇' : '下落') + '／収束から' + r.rootAgo + '本（根元）\n' +
            '　現在値：' + fmt_(r.price, sym) + '\n' +
            '　確定ライン：' + fmt_(r.trigger, sym) + '\n' +
            '　指値：' + fmt_(r.entry, sym) + '　損切り：' + fmt_(r.stop, sym) + '（' + r.risk.toFixed(1) + 'pips）';
          if (r.state === 'ENTRY') hits.push(body); else setups.push(body);
        }
      } else {
        ['ISHIN_' + sym.replace('/', '') + '_ENTRY', 'ISHIN_' + sym.replace('/', '') + '_SETUP']
          .forEach(function(k) { p.deleteProperty(k); });
      }
      status.push(r.name + '：' + r.state + (r.ng.length ? '(' + r.ng[0] + ')' : ''));
      Utilities.sleep(9000);
    } catch (e) { status.push(sym + '：エラー ' + e); }
  });

  if (hits.length) {
    pushMail_('🔥 維新流｜' + hits[0].split('\n')[0].replace('■ ', '').trim(),
      '【確定＝エントリー】\n20MAの方向を確定させる高値を更新しました。\n\n' + hits.join('\n\n'));
  }
  if (setups.length) {
    pushMail_('⏳ 維新流｜準備：' + setups[0].split('\n')[0].replace('■ ', '').trim(),
      '【準備サイン】\n環境・収束→拡散・グランビル・MACDはすべて揃いました。\nあとは確定ライン（高安値）を更新したらエントリーです。\n\n' + setups.join('\n\n'));
  }
  return status.join(' / ');
}

// ── クロード流モード：MACDクロスで即入る ──
function checkMacklineClaude_() {
  var p = PropertiesService.getScriptProperties();
  var hits = [], nears = [], status = [];

  PAIRS.forEach(function(sym) {
    try {
      var r = checkCross_(sym);

      // ── クロス間近の予告（同じ足で1回だけ）──
      if (r.near && !r.hit) {
        var nkey = 'NEAR_' + sym.replace('/', '');
        if (p.getProperty(nkey) !== r.time) {
          p.setProperty(nkey, r.time);
          nears.push(
            '■ ' + r.name + '　' + (r.dDir === 'up' ? '買い' : '売り') + '方向のクロスが近い\n' +
            '　日足：' + (r.dDir === 'up' ? '上昇' : '下落') + 'トレンド\n' +
            '　現在値：' + fmt_(r.price, sym) + '\n' +
            '　MACDとシグナルの差が残り' + (r.nearRatio * 100).toFixed(0) + '%まで縮小'
          );
        }
      }

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
      Utilities.sleep(9000);   // 無料枠 8req/分 を超えないよう通貨ごとに待つ
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

  // クロス間近の予告（確定メールとは別に送る）
  if (nears.length) {
    var nhead = nears.length === 1
      ? nears[0].split('\n')[0].replace('■ ', '').trim()
      : nears.length + '件がクロス間近';
    pushMail_('⏳ マックライン｜' + nhead,
      '【まだ入りません。クロス間近の予告です】\n' +
      '検証では、この状態から3時間以内に約8割がクロスします（2割は外れます）。\n' +
      'チャートを開いて構えておき、★クロス確定のメールが来てから入ってください。\n\n' +
      nears.join('\n\n'));
  }
  return status.join(' / ');
}

// ===== テスト送信（クロスの有無に関係なく今の状態を送る）=====
function テスト送信() {
  if (MACKLINE_MODE === 'ishin') {
    var o = [];
    PAIRS.forEach(function(sym) {
      try {
        var r = checkIshin_(sym);
        var t = '■ ' + r.name + '　現在値 ' + fmt_(r.price, sym) + '\n';
        if (r.state === 'ENTRY' || r.state === 'SETUP') {
          t += '　' + (r.state === 'ENTRY' ? '🔥 確定（エントリー）' : '⏳ 準備（確定待ち）') +
               '　' + (r.dir === 'up' ? '買い' : '売り') + '／グランビル' + (r.gv === 2 ? '②' : '①') + '\n' +
               '　確定ライン ' + fmt_(r.trigger, sym) + '／指値 ' + fmt_(r.entry, sym) +
               '／損切り ' + fmt_(r.stop, sym) + '（' + r.risk.toFixed(1) + 'pips）';
        } else {
          t += '　見送り：' + (r.ng.length ? r.ng.join('、') : '条件待ち');
        }
        o.push(t);
      } catch (e) { o.push('■ ' + sym + '：エラー ' + e); }
      Utilities.sleep(9000);
    });
    var msg2 = '【維新流モード】' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'M月d日 HH:mm') + ' 時点\n\n' + o.join('\n\n');
    pushMail_('📈 維新流｜テスト送信', msg2);
    Logger.log(msg2);
    return msg2;
  }
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
        t += r.near ? '　⏳ クロス間近（残り' + (r.nearRatio * 100).toFixed(0) + '%）' : '　クロス待ち';
      }
      out.push(t);
    } catch (e) { out.push('■ ' + sym + '：エラー ' + e); }
    Utilities.sleep(9000);
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

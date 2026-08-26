/**
 * MACライン シグナル通知（メール）  ※MACDのラインが由来なので K は付けない
 * アプリ https://yahatadennki.github.io/report/mackline/ と同じ判定ロジック。
 *
 * ★通知＝「日足・4時間足・1時間足の3つが同じ方向 ＋ 1時間足が直近の高安値を更新した時」
 *   ①日足20MAの向き ②4時間足MACDも同じ向き ③1時間足MACDがその向きへクロス
 *   ④クロスから6本以内に、1時間足が直近スイング高値(安値)を更新 → ここでエントリー
 *
 *   検証(2023/1〜2026/7・6通貨・スプレッド込み)
 *     旧：クロスした足で即入る            −1,539pips 勝率33% 週3.4回
 *     ＋高値更新を待つ                    +1,697pips 勝率39% 週1.8回
 *     ＋4時間足も同方向（＝現行）  924件  +3,038pips 勝率42% 週0.8回
 *       ドル円+1,521 ユーロ円+978 ユーロドル+663 ポンドドル+450 ドルスイス−78 ドルカナダ−495
 *   ・待ち本数は4/6/8/12のどれでも成立するため6本を採用
 *   ・損切りは1時間足の直近10本の逆側の極値±3pips。15分足に変えても総額はほぼ変わらない
 *     （4通貨1年半：1時間足+2,136 / 15分足+1,827〜+2,150。通貨ごとに逆転しノイズ範囲）
 *   ・4時間足は維新流の判定で既に取得済みのキャッシュを使うのでAPI消費は増えない
 */

var MACKLINE_MAIL_TO = 'yawata51@gmail.com';
// ★通知モード： 'ishin'（維新流＝教材どおり／既定） | 'claude'（MACDクロスで即入る）
var MACKLINE_MODE = 'ishin';
// ★通知する組み合わせ
//   維新流   : 6通貨。サインだけで機械的に入るのではなく、自分で選ぶ前提の一覧として出す
//     3年半の検証（スプレッド込み）：ドル円 PF1.85 +1,916 ／ ユーロ円 PF1.14 +329
//     ユーロドル PF0.99 −97 ／ ポンドドル PF0.99 −156 ／ ドルカナダ PF0.91 −378 ／ ドルスイス PF0.84 −573
//     ※単体でプラスなのはドル円とユーロ円だけ。他4通貨は参考として通知する
//   クロード流 : 同じ6通貨。3年半の検証（スプレッド込み）
//     ドル円 PF1.32 +2,615 ／ ユーロドル PF1.20 +1,242 ／ ドルスイス PF1.14 +55
//     ポンドドル PF1.03 −270 ／ ユーロ円 PF1.01 −459 ／ ドルカナダ PF0.90 −1,785
//     ※単体でプラスなのはドル円・ユーロドル・ドルスイス
var ISHIN_PAIRS  = ['USD/JPY', 'EUR/JPY', 'EUR/USD', 'GBP/USD', 'USD/CAD', 'USD/CHF'];
var CLAUDE_PAIRS = ['USD/JPY', 'EUR/JPY', 'EUR/USD', 'GBP/USD', 'USD/CAD', 'USD/CHF'];
var PAIRS = ISHIN_PAIRS;   // 旧コードの互換用
var JP_NAME = { 'USD/JPY': 'ドル円', 'EUR/USD': 'ユーロドル', 'GBP/USD': 'ポンドドル',
                'USD/CHF': 'ドルスイス', 'USD/CAD': 'ドルカナダ', 'EUR/JPY': 'ユーロ円' };

var PARAMS = {
  FLAT: 0.012,      // 傾きがこれ以下(%)なら「方向なし」
  SWING: 3,
  BUFFER: 3,        // 損切りを安値の少し下に置く幅(pips)
  FRESH: 7,         // クロスから何本まで高安値更新を待つか（6本＋現在の足）
  ARM: 6,           // 同上（検証で4〜12本のどれでも成立。6本を採用）
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
  // 無料枠は8回/分。実際に取りに行った時だけ待つ（キャッシュに当たった分は待たない）
  Utilities.sleep(8000);
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

// 1時間足・4時間足を「その足が確定するまで」キャッシュする
//   6通貨×2種類を毎回取りに行くと無料枠（800回/日・8回/分）を超えるため。
//   キーに足の区切りを入れてあるので、新しい足になった最初の実行だけ取りに行く。
//   → 1時間足=1日24回/通貨、4時間足=1日6回/通貨。6通貨でも合計180回/日程度に収まる。
function fetchTFCached_(symbol, interval) {
  var cache = CacheService.getScriptCache();
  var now = new Date();
  var bucket;
  if (interval === '4h') {
    var h = Number(Utilities.formatDate(now, 'Asia/Tokyo', 'H'));
    bucket = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyyMMdd') + '_' + Math.floor(h / 4);
  } else {
    bucket = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyyMMddHH');
  }
  var key = 'TF_' + interval + '_' + symbol.replace('/', '') + '_' + bucket;
  var hit = cache.get(key);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var d = fetchCandles_(symbol, interval);
  var keep = 200;   // MACDや20/75MAの判定に十分な本数だけ残す（Cacheは100KB上限）
  var slim = {
    closes: d.closes.slice(-keep), highs: d.highs.slice(-keep), lows: d.lows.slice(-keep), time: d.time.slice(-keep)
  };
  try { cache.put(key, JSON.stringify(slim), 21600); } catch (e) {}
  return slim;
}

// ===== 判定：日足の方向にMACDがクロスしたか（＝通知の対象）=====
function checkCross_(symbol) {
  var h1 = fetchTFCached_(symbol, '1h');
  Utilities.sleep(400);
  var dy = fetchDailyCached_(symbol);
  // 4時間足は維新流の判定と同じキャッシュを使うので、ここで取っても追加のAPI消費はない
  var h4 = fetchTFCached_(symbol, '4h');

  var last = h1.closes.length - 1;
  var pip = pipSize_(symbol);

  // 日足の方向
  var dma = sma_(dy.closes, 20);
  var dDir = dirOf_(slopeAt_(dma, dma.length - 1));

  // 4時間足のMACDの向き（シグナルより上か下か）
  var m4 = macd_(h4.closes), l4 = h4.closes.length - 1;
  var h4Dir = (m4.line[l4] == null || m4.sig[l4] == null) ? 'flat'
            : (m4.line[l4] > m4.sig[l4] ? 'up' : 'down');

  var m = macd_(h1.closes);
  // 直近の「最後のクロス」を探す（逆クロスが後に起きていれば前のは無効）
  var crossIdx = -1, crossDir = null;
  for (var i = last; i > Math.max(0, last - PARAMS.FRESH); i--) {
    var m0 = m.line[i], s0 = m.sig[i], m1 = m.line[i - 1], s1 = m.sig[i - 1];
    if (m0 == null || s0 == null || m1 == null || s1 == null) continue;
    if (m1 <= s1 && m0 > s0) { crossIdx = i; crossDir = 'up'; break; }
    if (m1 >= s1 && m0 < s0) { crossIdx = i; crossDir = 'down'; break; }
  }

  var out = { symbol: symbol, name: JP_NAME[symbol] || symbol, dDir: dDir, h4Dir: h4Dir,
              price: h1.closes[last], hit: false, near: false, armed: false };

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
  // ★4時間足のMACDも同じ向きでなければ狙わない（検証で +1,697 → +3,882pips）
  if (h4Dir !== dDir) { out.armReason = 'h4'; return out; }
  // クロスから離れすぎた（6本超）ものは追いかけない
  var barsAgo = last - crossIdx;
  if (barsAgo > PARAMS.ARM) { out.armReason = 'old'; return out; }

  out.armed = true;                 // 構えは成立。あとは高安値の更新待ち
  out.dir = dDir;
  out.crossTime = h1.time[crossIdx];
  out.barsAgo = barsAgo;

  // ★直近の確定スイング高値(安値)＝ここを終値で抜けたらエントリー
  //   確定させるため左右SWING本ぶん内側は見ない
  var sw = PARAMS.SWING, trig = null;
  for (var k = last - sw - 1; k >= Math.max(sw, last - 60); k--) {
    var isSw = true;
    for (var j = k - sw; j <= k + sw; j++) {
      if (j === k) continue;
      if (dDir === 'up' ? h1.highs[j] >= h1.highs[k] : h1.lows[j] <= h1.lows[k]) { isSw = false; break; }
    }
    if (isSw) { trig = dDir === 'up' ? h1.highs[k] : h1.lows[k]; break; }
  }
  if (trig == null) { out.armReason = 'noswing'; return out; }
  out.trigger = trig;

  // 損切りの目安＝直近10本の逆側の極値
  var from = Math.max(0, last - 10), stopBase = dDir === 'up' ? Infinity : -Infinity;
  for (var q = from; q <= last; q++) {
    stopBase = dDir === 'up' ? Math.min(stopBase, h1.lows[q]) : Math.max(stopBase, h1.highs[q]);
  }
  var line = dDir === 'up' ? stopBase - PARAMS.BUFFER * pip : stopBase + PARAMS.BUFFER * pip;
  out.stop = line;
  out.risk = Math.abs(h1.closes[last] - line) / pip;

  // 更新したか（終値ベース）
  out.hit = dDir === 'up' ? (h1.closes[last] > trig) : (h1.closes[last] < trig);
  return out;
}

// ===== 維新流の判定（仕様書10章フロー）=====
//  STEP1 4時間足の環境（F1方向明確・F3長短一致）
//  STEP2 1時間足の収束→拡散（トレンドの根元）
//  STEP3 グランビル①②のみ
//  STEP4 MACD(9,20,9)が上位足方向
//  STEP5 20MAが水平気味 ＋ 20MAに絡んだ付近の高値を更新＝確定
function checkIshin_(symbol) {
  var h1 = fetchTFCached_(symbol, '1h');
  Utilities.sleep(400);
  var h4 = fetchTFCached_(symbol, '4h');
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
// 送信元を特定するための印。このスクリプトから出たメールには必ず末尾に付く。
//   印が無いメールが届いたら、それは別のスクリプトが送っている。
// ★このファイルから送ったメールか判別するための印。仕様を変えたら日付も変える
var MAIL_TAG = '[src:himawari-gas/mackline.js 2026-08-25 パーフェクトMACD版]';

function pushMail_(subject, text) {
  MailApp.sendEmail({
    to: MACKLINE_MAIL_TO,
    subject: subject,
    body: text + '\n\n▼アプリで確認\nhttps://yahatadennki.github.io/report/mackline/\n\n' + MAIL_TAG + '\n'
  });
  return true;
}

// ===== 相場が開いているか（日本時間で判定） =====
// 為替は土曜早朝にクローズし、月曜早朝にオープンする。
// 夏時間／冬時間で1時間ずれるため、広め（土6:00〜月7:00）に止めておく。
function marketOpen_() {
  // スクリプトのタイムゾーン設定に依存しないよう、日本時間の壁時計をUTCとして読み直す
  var jst = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH');
  var d = new Date(jst.slice(0, 10) + 'T' + jst.slice(11) + ':00:00Z');
  var day = d.getUTCDay();     // 0=日 1=月 … 6=土
  var hour = d.getUTCHours();

  if (day === 6 && hour >= 6) return false;   // 土曜6時以降
  if (day === 0) return false;                // 日曜は終日
  if (day === 1 && hour < 7) return false;    // 月曜7時前
  return true;
}

// ===== メイン：15分ごとに実行。日足方向のクロスが出たら知らせる =====
// ★両モードを毎回チェックする（維新流＝ドル円 / クロード流＝ドル円・ユーロドル・ドルスイス）
function checkMackline() {
  // 相場が閉まっている間は判定もメール送信もしない（土日に通知が飛ぶのを防ぐ）
  if (!marketOpen_()) {
    Logger.log('市場クローズ中のためスキップ');
    return '市場クローズ中';
  }

  var a = '', b = '', c = '';
  try { a = checkMacklineIshin_(); }   catch (e) { a = '維新流エラー ' + e; }
  try { b = checkMacklineClaude_(); }  catch (e) { b = 'クロード流エラー ' + e; }
  try { c = checkMacklineReverse_(); } catch (e) { c = '逆張りエラー ' + e; }
  return '【維新流】' + a + '　／　【クロード流】' + b + '　／　【逆張り(ドル円)】' + c;
}

// ── 維新流モード（既定）：準備(SETUP)と確定(ENTRY)で知らせる ──
function checkMacklineIshin_() {
  var p = PropertiesService.getScriptProperties();
  var hits = [], setups = [], status = [];
  ISHIN_PAIRS.forEach(function(sym) {
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
      Utilities.sleep(500);    // 待ちは fetchCandles_ 側で入れているのでここは短く
    } catch (e) { status.push(sym + '：エラー ' + e); }
  });

  if (hits.length) {
    pushMail_('🔥 維新流｜' + hits[0].split('\n')[0].replace('■ ', '').trim(),
      '【確定＝エントリー】\n20MAの方向を確定させる高値を更新しました。\n\n' + hits.join('\n\n'));
  }
  // 準備(SETUP)のメールはユーザー指示により送らない。エントリー確定時のみ通知する
  //   （状態の記録は残してあるので、必要になったらここを戻すだけで復活する）
  return status.join(' / ');
}

// ── クロード流モード：MACDクロスで即入る ──
function checkMacklineClaude_() {
  var p = PropertiesService.getScriptProperties();
  var hits = [], nears = [], status = [];

  CLAUDE_PAIRS.forEach(function(sym) {
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
            '　日足：' + (r.dir === 'up' ? '上昇' : '下落') + '　4時間足MACD：同じ向き\n' +
            '　1時間足クロス：' + r.crossTime + '（' + r.barsAgo + '本前）\n' +
            '　直近の' + (r.dir === 'up' ? '高値' : '安値') + ' ' + fmt_(r.trigger, sym) + ' を更新\n' +
            '　▶ ' + fmt_(r.price, sym) + ' で' + (r.dir === 'up' ? '買い' : '売り') + '\n' +
            '　　損切り：' + fmt_(r.stop, sym) + '（' + r.risk.toFixed(1) + 'pips）'
          );
        }
      }
      status.push(r.name + '：' + (r.hit ? '更新でエントリー' : r.armed ? '構え中（更新待ち）'
        : (r.dDir === 'flat' ? '日足方向なし' : r.armReason === 'h4' ? '4時間足が逆' : '待ち')));
      Utilities.sleep(500);    // 待ちは fetchCandles_ 側で入れているのでここは短く
    } catch (e) {
      status.push(sym + '：エラー ' + e);
    }
  });

  if (hits.length) {
    var head = hits.length === 1
      ? hits[0].split('\n')[0].replace('■ ', '').trim()
      : hits.length + '件のクロス';
    pushMail_('📈 パーフェクトMACD｜' + head,
      '【日足・4時間足・1時間足がそろい、高安値を更新＝エントリーの合図】\n' +
      '①日足の向き ②4時間足MACDも同じ向き ③1時間足MACDがその向きへクロス\n' +
      '④クロスから6本以内に1時間足が直近の高安値を更新 ← いまここ\n' +
      '検証(2023/1〜2026/7・6通貨)：924件 +3,038pips 勝率42%。\n' +
      'クロスした足で即入る旧ルールは同じ期間で −1,539pips でした。\n\n' +
      hits.join('\n\n'));
  }

  // クロス間近の予告（確定メールとは別に送る）
  // クロス間近の予告メールはユーザー指示により送らない。クロス確定時のみ通知する
  //   （near判定と記録は残してあるので、必要になったらここを戻すだけで復活する）
  return status.join(' / ');
}

// ── 逆張り（ドル円のみ）：日足に逆らう方向へMACDが転換し、その後1時間足の高安値を更新したら知らせる ──
//   検証(2024-01〜2026-07・スプレッド0.5込み)：175件 勝率47% PF1.37 最大DD616 +2,178pips
//   ・年別 +1,281 / +737 / +160 と直近3年すべてプラス
//   ・待ち本数は6/12/24本のどれでも成立（+1,491〜+2,178）。ここでは12本を採用
//   ・利確は損切り幅×1.5が最良。トレーリングはドル円だけ良く他5通貨で全滅したため使わない
var REV_PAIR = 'USD/JPY';
var REV_WAIT_BARS = 12;      // クロスから1時間足で何本まで更新を待つか
var REV_TP_RATIO  = 1.5;     // 利確＝損切り幅×これ

function checkMacklineReverse_() {
  var p = PropertiesService.getScriptProperties();
  var sym = REV_PAIR, name = JP_NAME[sym] || sym, pip = pipSize_(sym);
  var key = 'REV_ARM_' + sym.replace('/', '');

  var h1 = fetchTFCached_(sym, '1h');       // クロード流と同じキャッシュを使うので追加取得なし
  var dy = fetchDailyCached_(sym);
  var last = h1.closes.length - 1;
  var dma = sma_(dy.closes, 20);
  var dDir = dirOf_(slopeAt_(dma, dma.length - 1));

  var raw = p.getProperty(key), arm = null;
  if (raw) { try { arm = JSON.parse(raw); } catch (e) { arm = null; } }

  // ── 待機中：高安値を更新したか見る ──
  if (arm) {
    // キャッシュは常に直近200本なので本数では測れない。経過時間で判定する（1時間足12本＝12時間）
    if (Date.now() - arm.at > REV_WAIT_BARS * 60 * 60 * 1000) { p.deleteProperty(key); return '時間切れ'; }
    var broke = arm.dir === 'up' ? (h1.highs[last] > arm.level) : (h1.lows[last] < arm.level);
    if (!broke) return '更新待ち(' + fmt_(arm.level, sym) + ')';
    p.deleteProperty(key);

    // 損切り＝直近10本の逆側極値／利確＝その幅×1.5
    var from = Math.max(0, last - 10), ext = arm.dir === 'up' ? Infinity : -Infinity;
    for (var q = from; q <= last; q++) ext = arm.dir === 'up' ? Math.min(ext, h1.lows[q]) : Math.max(ext, h1.highs[q]);
    var stop = arm.dir === 'up' ? ext - PARAMS.BUFFER * pip : ext + PARAMS.BUFFER * pip;
    var price = h1.closes[last];
    var risk = Math.abs(price - stop) / pip;
    var tp = arm.dir === 'up' ? price + risk * REV_TP_RATIO * pip : price - risk * REV_TP_RATIO * pip;

    try {
      pushMail_('🔄 1時間足の転換｜' + name + '　' + (arm.dir === 'up' ? '買い' : '売り') + '　高安値を更新',
        '【日足には逆行、1時間足には順行するサインです】\n' +
        'MACDが転換し、その方向の直近高安値も更新しました。1時間足の勢いには乗っています。\n' +
        '検証(2024-01〜2026-07)：勝率47%・PF1.37・+2,178pips。利確は損切り幅の1.5倍。\n' +
        '※日足のトレンドには逆らうので、クロード流と反対のポジションになる場面があります。\n\n' +
        '■ ' + name + '　' + (arm.dir === 'up' ? '買い' : '売り') + '\n' +
        '　日足：' + (dDir === 'up' ? '上昇' : dDir === 'down' ? '下落' : '方向なし') + '（これに逆らう方向）\n' +
        '　MACD転換：' + arm.crossTime + '\n' +
        '　' + (arm.dir === 'up' ? '直近高値' : '直近安値') + ' ' + fmt_(arm.level, sym) + ' を更新しました\n' +
        '　現在値 ' + fmt_(price, sym) + '\n' +
        '　損切り ' + fmt_(stop, sym) + '（' + risk.toFixed(1) + 'pips）\n' +
        '　利確の目安 ' + fmt_(tp, sym) + '（' + (risk * REV_TP_RATIO).toFixed(1) + 'pips）');
    } catch (e) { Logger.log('逆張りメール送信に失敗: ' + e); }
    return '🔄 高値更新で通知';
  }

  // ── 待機なし：日足と逆方向のクロスが出ていたら、更新を待つ体勢に入る ──
  if (dDir === 'flat') return '日足の方向なし';
  var want = dDir === 'up' ? 'down' : 'up';       // 日足に逆らう方向
  var m = macd_(h1.closes);
  var m0 = m.line[last], s0 = m.sig[last], m1 = m.line[last - 1], s1 = m.sig[last - 1];
  if (m0 == null || s0 == null || m1 == null || s1 == null) return 'データ不足';
  var crossed = want === 'up' ? (m1 <= s1 && m0 > s0) : (m1 >= s1 && m0 < s0);
  if (!crossed) return '待ち';

  // 更新の基準＝確定済み（後続3本あり）の直近スイング
  var SWn = PARAMS.SWING, level = null;
  for (var k = last - SWn - 1; k >= Math.max(SWn, last - 200); k--) {
    var isSw = true;
    for (var j = k - SWn; j <= k + SWn; j++) {
      if (j === k) continue;
      if (want === 'up' ? h1.highs[j] >= h1.highs[k] : h1.lows[j] <= h1.lows[k]) { isSw = false; break; }
    }
    if (isSw) { level = want === 'up' ? h1.highs[k] : h1.lows[k]; break; }
  }
  if (level == null) return 'スイング無し';
  p.setProperty(key, JSON.stringify({ dir: want, level: level, at: Date.now(), crossTime: h1.time[last] }));
  return '転換を検知（' + fmt_(level, sym) + ' の更新待ち）';
}

// ===== テスト送信（クロスの有無に関係なく今の状態を送る）=====
function テスト送信() {
  var out = [];

  // ── 維新流（ドル円）──
  out.push('◆ 維新流（教材どおり・ドル円）');
  ISHIN_PAIRS.forEach(function(sym) {
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
      out.push(t);
    } catch (e) { out.push('■ ' + sym + '：エラー ' + e); }
    Utilities.sleep(500);    // 待ちは fetchCandles_ 側で入れているのでここは短く
  });

  // ── クロード流（ドル円・ユーロドル・ドルスイス）──
  out.push('◆ クロード流（MACDクロスで即入る）');
  CLAUDE_PAIRS.forEach(function(sym) {
    try {
      var r = checkCross_(sym);
      var t = '■ ' + r.name + '　現在値 ' + fmt_(r.price, sym) + '\n' +
              '　日足：' + (r.dDir === 'up' ? '↑上昇' : r.dDir === 'down' ? '↓下落' : '→方向なし') + '\n';
      if (r.hit && r.barsAgo === 0) {
        t += '　🔥 今クロス → ' + (r.dir === 'up' ? '買い' : '売り') +
             '　損切り ' + fmt_(r.stop, sym) + '（' + r.risk.toFixed(1) + 'pips）';
      } else if (r.near) {
        t += '　⏳ クロス間近（残り' + (r.nearRatio * 100).toFixed(0) + '%）';
      } else {
        t += '　クロス待ち';
      }
      out.push(t);
    } catch (e) { out.push('■ ' + sym + '：エラー ' + e); }
    Utilities.sleep(500);    // 待ちは fetchCandles_ 側で入れているのでここは短く
  });

  var msg = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'M月d日 HH:mm') + ' 時点\n\n' + out.join('\n\n');
  pushMail_('📈 MACライン｜テスト送信（両モード）', msg);
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

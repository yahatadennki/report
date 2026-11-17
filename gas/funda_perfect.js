// ═══════════════════════════════════════════════════════════════
//  円メーターのアプリに出す「パーフェクトMACD」（4通貨：ドル円・ユーロ円・ユーロドル・ポンドドル）
//    条件はメール版（mackline.js の perfectOrder_）と同じ：
//      ① 日足20MAの向き　② 4時間足MACDも同じ向き　③ 確定した1時間足でMACDがその向きへクロス
//      → 直近の確定スイング高値(安値)に逆指値。損切り＝直近10本の逆側の極値の3pips外。クロス確定から6時間有効
//      → クロスした足の終値ですでに抜けていれば「今すぐ」
//    メール版との違い（アプリの1時間足MACDの印・MT4のチャートと合わせるため）：
//      ・土日の足を外して計算する　・シグナルはMT4と同じ「MACDの9本単純平均」
//    メールは送らない。アプリに今の状態を返すだけ。
// ═══════════════════════════════════════════════════════════════
var PERFECT_PAIRS = [['USDJPY', 'USD/JPY'], ['EURJPY', 'EUR/JPY'], ['EURUSD', 'EUR/USD'], ['GBPUSD', 'GBP/USD']];

function fundaMs_(s) { return Date.parse(String(s).replace(' ', 'T') + 'Z'); }

// 足データから土日の足を外す。off＝「データの時刻表記 − 実際の時刻」のずれ（1時間足の最後の足＝今の1時間 から求める）
function fundaWeekdayBars_(h, off) {
  var o = { closes: [], highs: [], lows: [], time: [], at: [] };
  for (var i = 0; i < h.closes.length; i++) {
    var t = fundaMs_(h.time[i]) - off, d = new Date(t);
    var u = Number(Utilities.formatDate(d, 'America/New_York', 'u')), hr = Number(Utilities.formatDate(d, 'America/New_York', 'H'));
    if ((u === 5 && hr >= 17) || u === 6 || (u === 7 && hr < 17)) continue;
    o.closes.push(h.closes[i]); o.highs.push(h.highs[i]); o.lows.push(h.lows[i]); o.time.push(h.time[i]); o.at.push(t);
  }
  return o;
}

// MT4と同じMACD（シグナル＝MACDの9本単純平均）
function fundaMacdMt4_(c) {
  var line = macd_(c).line, st = 0;
  while (st < line.length && line[st] == null) st++;
  return { line: line, sig: new Array(st).fill(null).concat(sma_(line.slice(st), 9)) };
}

function fundaPerfectOne_(symbol) {
  var raw1 = fetchTFCached_(symbol, '1h');
  var dy = fetchDailyCached_(symbol);
  var raw4 = fetchTFCached_(symbol, '4h');
  var off = fundaMs_(raw1.time[raw1.time.length - 1]) - Math.floor(Date.now() / 3600000) * 3600000;
  var h1 = fundaWeekdayBars_(raw1, off), h4 = fundaWeekdayBars_(raw4, off);
  var pip = pipSize_(symbol), n1 = h1.closes.length;
  var last = n1 - 1, done = last - 1;
  // 今が土日（最後の足まで外れている）なら、残った足はすべて確定済み
  if (h1.time[last] !== raw1.time[raw1.time.length - 1]) { done = last; }

  var dma = sma_(dy.closes, 20), dd = dirOf_(slopeAt_(dma, dma.length - 1));
  var d = dd === 'up' ? 1 : dd === 'down' ? -1 : 0;
  var m4 = fundaMacdMt4_(h4.closes), l4 = h4.closes.length - 1;
  var d4 = (m4.line[l4] == null || m4.sig[l4] == null) ? 0 : (m4.line[l4] > m4.sig[l4] ? 1 : -1);

  // 確定した1時間足での最後のクロス
  var m = fundaMacdMt4_(h1.closes);
  var sg = function(i) { return (m.line[i] == null || m.sig[i] == null) ? 0 : (m.line[i] > m.sig[i] ? 1 : m.line[i] < m.sig[i] ? -1 : 0); };
  var d1 = sg(done), cx = -1;
  for (var i = done; i > 0 && d1; i--) { var pv = sg(i - 1); if (pv !== d1) { if (pv) cx = i; break; } }
  var out = { d: d, h4: d4, h1: d1, bars: cx >= 0 ? done - cx + 1 : null, price: raw1.closes[raw1.closes.length - 1], state: 'wait' };
  if (!d || !d1 || cx < 0) return out;
  if (d1 !== d || d4 !== d) return out;
  if (done - cx + 1 > ORDER_HOURS) { out.state = 'old'; return out; }   // クロスから6時間を過ぎた＝注文の期限切れ

  // 逆指値の値段＝クロスした足の時点で確定している直近の山(谷)
  var SWn = PARAMS.SWING, L = null;
  for (var k = cx - SWn - 1; k >= Math.max(SWn, cx - 60); k--) {
    var ok = true;
    for (var j = k - SWn; j <= k + SWn; j++) {
      if (j === k) continue;
      if (d > 0 ? h1.highs[j] >= h1.highs[k] : h1.lows[j] <= h1.lows[k]) { ok = false; break; }
    }
    if (ok) { L = d > 0 ? h1.highs[k] : h1.lows[k]; break; }
  }
  if (L == null) return out;

  // 損切り＝クロスした足までの10本の逆側の極値の3pips外
  var ext = d > 0 ? Infinity : -Infinity;
  for (var q = Math.max(0, cx - 9); q <= cx; q++) ext = d > 0 ? Math.min(ext, h1.lows[q]) : Math.max(ext, h1.highs[q]);
  var stop = d > 0 ? ext - PARAMS.BUFFER * pip : ext + PARAMS.BUFFER * pip;

  var now = d > 0 ? h1.closes[cx] > L : h1.closes[cx] < L;   // クロスした足ですでに抜けていた＝今すぐ
  var entry = now ? h1.closes[cx] : L;
  // クロスの後、逆指値の値段に届いたか／先に損切りの値段に届いたか
  var hit = now, dead = false;
  for (var z = cx + 1; z <= last; z++) {
    if (!hit && (d > 0 ? h1.highs[z] >= L : h1.lows[z] <= L)) hit = true;
    if (!hit && (d > 0 ? h1.lows[z] <= stop : h1.highs[z] >= stop)) dead = true;
  }
  out.state = dead ? 'dead' : 'signal';
  out.dir = d; out.now = now; out.hit = hit;
  out.level = L; out.stop = stop; out.entry = entry;
  out.risk = Math.round(Math.abs(entry - stop) / pip);
  out.until = new Date(h1.at[cx] + 3600000 + ORDER_HOURS * 3600000).toISOString();   // クロスの足が確定してから6時間
  return out;
}

function fundaPerfect_() {
  var out = {};
  PERFECT_PAIRS.forEach(function(x) {
    try { out[x[0]] = fundaPerfectOne_(x[1]); } catch (e) { out[x[0]] = { error: String(e).slice(0, 120) }; }
  });
  return out;
}

// 点検用：?action=funda_perfect_diag
function fundaPerfectDiag_() {
  return JSON.stringify(fundaPerfect_(), null, 1);
}

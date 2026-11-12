// ============================================================
// 円メーター（ファンダメンタルズ）— mackline/ のアプリが ?action=funda で読む
//   ① 日米の金利（米：財務省 / 日：財務省）から「円安要素・円高要素」を3つ数える
//   ② 今週の経済指標（アメリカ・日本）を日本時間と重要度つきで返す
//
//   メーターの3要素（どれも +1=円安 / 0 / −1=円高。合計 −3〜+3）
//     s2  : 日米2年金利の差の10営業日の変化（±0.05以上）… 金融政策の見通し
//     s10 : 日米10年金利の差の10営業日の変化（±0.05以上）
//     j10 : 日本10年金利の5営業日の変化（±0.03以上。上がる＝円高）
//   検証（2023/12〜2026/7・ドル円日足）：その後5日間の値動き
//     合計+2以上 112日 平均+56pips 上昇71% ／ −1〜+1 414日 +10pips 61% ／ −2以下 239日 −10pips 48%
//   入れなかったもの（関係が見られなかった）：VIXの水準、米10年金利だけの動き、金利差の大きさそのもの
// ============================================================
var FUNDA_URL = {
  ff: 'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
  jgbMonth: 'https://www.mof.go.jp/jgbs/reference/interest_rate/jgbcm.csv',
  jgbAll: 'https://www.mof.go.jp/jgbs/reference/interest_rate/data/jgbcm_all.csv',
  vix: 'https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv'
};

function fundaJson_() {
  var out = { at: new Date().toISOString() };
  out.rates = fundaCached_('FUNDA_RATES_V1', 3 * 3600, fundaRates_);
  // 経済指標はここでは取らない（GASからだと配信元に断られる）。アプリは mackline/cal.json を読む＝tools/cal.mjs が6時間ごとに作る
  try {
    var h1 = fetchTFCached_('USD/JPY', '1h');
    out.price = h1.closes[h1.closes.length - 1];
    out.macd = fundaMacd_(h1.closes);
  } catch (e) {}
  // ほかの通貨ペア（funda_pairs.js）。現在値は表示用
  try {
    out.pairs = fundaCached_('FUNDA_PAIRS_V1', 3 * 3600, fundaPairs_);
    [['EURJPY', 'EUR/JPY'], ['EURUSD', 'EUR/USD'], ['GBPUSD', 'GBP/USD']].forEach(function(x) {
      if (!out.pairs[x[0]]) return;
      try { var c = fetchTFCached_(x[1], '1h'); out.pairs[x[0]].price = c.closes[c.closes.length - 1]; out.pairs[x[0]].macd = fundaMacd_(c.closes); } catch (e) {}
    });
  } catch (e) {}
  try { var ai = fundaAiForApp_(); if (ai) out.ai = ai; } catch (e) {}   // AIの読み（お試し期間中だけ。funda_ai.js）
  return JSON.stringify(out);
}

// 1時間足のMACD(12,26,9)。確定した足だけで見る（最後の1本は作りかけなので外す）
//   dir：+1＝MACDがシグナルより上（ゴールデンクロス後）／−1＝下（デッドクロス後）
//   gap：MACD − シグナル（2本の線の開き。重なった時が0。値段の単位）
//   bars：クロスした足から数えて何本たったか（1＝直前の確定足でクロス）
function fundaMacd_(closes) {
  var c = closes.slice(0, -1), m = macd_(c), n = c.length - 1;
  var d = function(i) { return (m.line[i] == null || m.sig[i] == null) ? 0 : (m.line[i] > m.sig[i] ? 1 : -1); };
  var dir = d(n);
  if (!dir) return null;
  for (var i = n; i > 0; i--) if (d(i - 1) !== dir) return d(i - 1) ? { dir: dir, bars: n - i + 1, gap: m.line[n] - m.sig[n] } : null;
  return null;
}

// 取れたら覚えておき、取れなかった時は前回の値を返す
function fundaCached_(key, ttl, fn, errTtl) {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(key);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var p = PropertiesService.getScriptProperties();
  try {
    var v = fn();
    var s = JSON.stringify(v);
    cache.put(key, s, ttl);
    // 控え（プロパティは1件9KBまで。入らない時は★2以上だけ残す）
    if (s.length < 8500) p.setProperty(key, s);
    else if (v && v.list) p.setProperty(key, JSON.stringify({ list: v.list.filter(function(x) { return x.i >= 2; }) }));
    return v;
  } catch (e) {
    var old = p.getProperty(key), o;
    try { o = old ? JSON.parse(old) : null; } catch (e2) { o = null; }
    if (!o) o = {};
    o.error = String(e);
    cache.put(key, JSON.stringify(o), errTtl || 300);   // 失敗が続いても相手先を叩き続けない
    return o;
  }
}

function fundaGet_(url) {
  var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  if (r.getResponseCode() !== 200) throw new Error('取得できません ' + r.getResponseCode() + ' ' + url.slice(0, 60));
  return r;
}

// ── 日本の国債金利（財務省）→ { 'yyyy-MM-dd': [2年, 10年] } ──
function fundaParseJgb_(txt, into) {
  var base = { R: 2018, H: 1988, S: 1925 };
  txt.split(/\r?\n/).forEach(function(ln) {
    var c = ln.split(',');
    var m = /^([RHS])(\d+)\.(\d+)\.(\d+)$/.exec(c[0] || '');
    if (!m) return;
    var y2 = Number(c[2]), y10 = Number(c[10]);
    if (!isFinite(y2) || !isFinite(y10)) return;
    var d = (base[m[1]] + Number(m[2])) + '-' + ('0' + m[3]).slice(-2) + '-' + ('0' + m[4]).slice(-2);
    into[d] = [y2, y10];
  });
}
function fundaJgb_() {
  var p = PropertiesService.getScriptProperties();
  var hist = {};
  try { hist = JSON.parse(p.getProperty('FUNDA_JGB_HIST') || '{}'); } catch (e) { hist = {}; }
  var keys = Object.keys(hist).sort();
  var newest = keys.length ? keys[keys.length - 1] : '';
  var limit = Utilities.formatDate(new Date(Date.now() - 45 * 86400000), 'Asia/Tokyo', 'yyyy-MM-dd');
  // 控えが無い・古い時だけ、全期間のファイル(1MB超)から末尾を取り込む
  if (keys.length < 20 || newest < limit) {
    var all = fundaGet_(FUNDA_URL.jgbAll).getContentText('Shift_JIS');
    fundaParseJgb_(all.slice(-6000), hist);
  }
  fundaParseJgb_(fundaGet_(FUNDA_URL.jgbMonth).getContentText('Shift_JIS'), hist);   // 今月ぶん
  keys = Object.keys(hist).sort();
  var keep = {};
  keys.slice(-45).forEach(function(k) { keep[k] = hist[k]; });
  p.setProperty('FUNDA_JGB_HIST', JSON.stringify(keep));
  return keep;
}

// ── アメリカの国債金利（米財務省）→ { 'yyyy-MM-dd': [2年, 10年] } ──
function fundaUstYear_(year, into) {
  var url = 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/' + year +
    '/all?type=daily_treasury_yield_curve&field_tdr_date_value=' + year + '&page&_format=csv';
  var t = fundaGet_(url).getContentText().split(/\r?\n/);
  var h = t[0].split(',').map(function(s) { return s.replace(/"/g, ''); });
  var i2 = h.indexOf('2 Yr'), i10 = h.indexOf('10 Yr'), i5 = h.indexOf('5 Yr');
  if (i2 < 0 || i10 < 0) throw new Error('米金利の列が見つかりません');
  var cnt = 0;
  t.slice(1).forEach(function(ln) {
    var c = ln.split(',');
    var m = /^(\d+)\/(\d+)\/(\d+)$/.exec(c[0] || '');
    if (!m) return;
    var y2 = Number(c[i2]), y10 = Number(c[i10]);
    if (!isFinite(y2) || !isFinite(y10) || !c[i2] || !c[i10]) return;
    into[m[3] + '-' + m[1] + '-' + m[2]] = [y2, y10, i5 >= 0 && c[i5] ? Number(c[i5]) : y2]; cnt++;   // [2年, 10年, 5年]
  });
  return cnt;
}
function fundaUst_() {
  var y = Number(Utilities.formatDate(new Date(), 'America/New_York', 'yyyy'));
  var us = {}, n = 0;
  try { n = fundaUstYear_(y, us); } catch (e) { n = 0; }
  if (n < 20) fundaUstYear_(y - 1, us);   // 年明けは前の年も読む
  return us;
}

function fundaVix_() {
  var t = fundaGet_(FUNDA_URL.vix).getContentText().slice(-400).split(/\r?\n/).filter(function(s) { return /^\d+\/\d+\/\d+,/.test(s); });
  var c = t[t.length - 1].split(',');
  var m = /^(\d+)\/(\d+)\/(\d+)$/.exec(c[0]);
  return { v: Number(c[4]), date: m[3] + '-' + m[1] + '-' + m[2] };
}

function fundaRates_() {
  var jp = fundaJgb_(), us = fundaUst_();
  var jk = Object.keys(jp).sort(), uk = Object.keys(us).sort();
  if (jk.length < 12 || uk.length < 12) throw new Error('金利データが足りません（日' + jk.length + ' 米' + uk.length + '）');
  // 両方の営業日を1本の時間軸に並べ、休みの日は直前の値で埋める
  var seen = {}, days = [];
  jk.concat(uk).forEach(function(d) { if (!seen[d]) { seen[d] = 1; days.push(d); } });
  days.sort();
  var rows = [], lj = null, lu = null;
  days.forEach(function(d) {
    if (jp[d]) lj = jp[d];
    if (us[d]) lu = us[d];
    if (lj && lu) rows.push({ d: d, s2: lu[0] - lj[0], s10: lu[1] - lj[1], j10: lj[1] });
  });
  var n = rows.length - 1;
  if (n < 10) throw new Error('金利データが足りません');
  var r2 = function(v) { return Math.round(v * 1000) / 1000; };
  var sg = function(v, th) { return v > th ? 1 : v < -th ? -1 : 0; };
  var mk = function(key, back, th, flip) {
    var now = rows[n][key], prev = rows[n - back][key], chg = now - prev;
    return { key: key, now: r2(now), prev: r2(prev), chg: r2(chg), days: back, score: sg(flip ? -chg : chg, th) };
  };
  var f = [mk('s2', 10, 0.05, false), mk('s10', 10, 0.05, false), mk('j10', 5, 0.03, true)];
  var out = {
    usDate: uk[uk.length - 1], jpDate: jk[jk.length - 1],
    us2: us[uk[uk.length - 1]][0], us10: us[uk[uk.length - 1]][1],
    jp2: jp[jk[jk.length - 1]][0], jp10: jp[jk[jk.length - 1]][1],
    factors: f, score: f[0].score + f[1].score + f[2].score
  };
  try { out.vix = fundaVix_(); } catch (e) {}
  return out;
}

// ── 今週の経済指標（アメリカ・日本だけ）──
//   配信元は混んでいると 429 を返す（GASは共有IPなので特に当たりやすい）。
//   だめな時は fundaCached_ が前回の控えを返し、20分あけてから取り直す（15分ごとのトリガーが温める）。
//   実測：続けて叩くと断られる。1週間に1回取れれば足りるので、取れたら6時間は取りに行かない。
function fundaCalendar_() {
  var raw = null, lastErr = null;
  try { raw = fundaFfJson_(); } catch (e) { lastErr = e; }
  // 429（混雑）の時はXMLも同じく断られるので試さない。回数を重ねるほど断られやすくなる
  if (!raw && String(lastErr).indexOf(' 429 ') < 0) { try { raw = fundaFfXml_(); } catch (e) { lastErr = e; } }
  if (!raw) throw lastErr;
  var imp = { High: 3, Medium: 2, Low: 1 };
  var list = [];
  raw.forEach(function(e) {
    if (e.country !== 'USD' && e.country !== 'JPY') return;
    if (!e.t || isNaN(e.t.getTime())) return;
    list.push({ t: e.t.toISOString().slice(0, 16) + 'Z', c: e.country, i: imp[e.impact] || 0, n: e.title, f: e.forecast || '', p: e.previous || '' });
  });
  list.sort(function(x, y) { return x.t < y.t ? -1 : x.t > y.t ? 1 : 0; });
  return { list: list, got: new Date().toISOString().slice(0, 16) + 'Z' };
}
function fundaFfJson_() {
  return JSON.parse(fundaGet_(FUNDA_URL.ff).getContentText()).map(function(e) {
    return { title: e.title, country: e.country, impact: e.impact, forecast: e.forecast, previous: e.previous, t: new Date(e.date) };
  });
}
// XML版：日付は 月-日-年、時刻は GMT の 1:30pm 形式（All Day / Tentative は 0時扱い）
function fundaFfXml_() {
  var x = fundaGet_(FUNDA_URL.ff.replace('.json', '.xml')).getContentText();
  var out = [], re = /<event>([\s\S]*?)<\/event>/g, m;
  var tag = function(b, n) {
    var i = b.indexOf('<' + n + '>'), j = b.indexOf('</' + n + '>');
    if (i < 0 || j < 0) return '';
    return b.slice(i + n.length + 2, j).replace('<![CDATA[', '').replace(']]>', '').trim();
  };
  while ((m = re.exec(x))) {
    var b = m[1], d = /^(\d+)-(\d+)-(\d+)$/.exec(tag(b, 'date')), tm = /^(\d+):(\d+)(am|pm)$/i.exec(tag(b, 'time'));
    if (!d) continue;
    var h = 0, mi = 0;
    if (tm) { h = Number(tm[1]) % 12 + (/pm/i.test(tm[3]) ? 12 : 0); mi = Number(tm[2]); }
    out.push({ title: tag(b, 'title').replace(/&amp;/g, '&'), country: tag(b, 'country'), impact: tag(b, 'impact'), forecast: tag(b, 'forecast'), previous: tag(b, 'previous'),
      t: new Date(Date.UTC(Number(d[3]), Number(d[1]) - 1, Number(d[2]), h, mi)) });
  }
  if (!out.length) throw new Error('XMLに指標がありません');
  return out;
}

// 点検用：?action=funda_diag　金利の取得先の応答と、覚えている内容
//   （経済指標の配信元はここでは叩かない。点検で回数を使うと本番の取得が断られる）
function fundaDiag_() {
  var lines = [];
  [FUNDA_URL.jgbMonth, FUNDA_URL.vix].forEach(function(u) {
    try { var r = UrlFetchApp.fetch(u, { muteHttpExceptions: true }); lines.push(r.getResponseCode() + '  ' + r.getContentText().length + '字  ' + u); }
    catch (e) { lines.push('ERR ' + e + '  ' + u); }
  });
  var p = PropertiesService.getScriptProperties();
  ['FUNDA_RATES_V1', 'FUNDA_CAL_V1', 'FUNDA_JGB_HIST'].forEach(function(k) { var v = p.getProperty(k); lines.push(k + '：' + (v ? v.length + '字' : 'なし')); });
  var c = CacheService.getScriptCache().get('FUNDA_CAL_V1');
  try { var o = c ? JSON.parse(c) : null; lines.push('指標（いま返す内容）：' + (o ? ((o.list ? o.list.length + '件' : '0件') + (o.got ? ' 取得' + o.got : '') + (o.error ? ' ／ ' + o.error : '')) : '未取得')); } catch (e) {}
  return lines.join('\n');
}

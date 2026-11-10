// ═══════════════════════════════════════════════════════════════
//  円メーター：ドル円以外の通貨ペア（ユーロ円・ユーロドル・ポンドドル）の金利メーター
//    点数 = ①短い年限の金利差の5営業日変化（±0.05）＋②10年金利差の5営業日変化（±0.05）
//           ＋③相手国（右側の通貨）の10年金利の5営業日変化（±0.03。上がると通貨ペアは下がる）
//    +1 = その通貨ペアが上がりやすい ／ −1 = 下がりやすい。合計 −3〜+3
//    検証（日足 2023/1〜2026/7、その後5日。+2以上／−1〜+1／−2以下 の順に 平均pips・上昇した割合）
//      ユーロドル：+19・59% ／ −2・49% ／ −2・48%（全体 +4・51%）
//      ユーロ円　：+59・68% ／ +17・56% ／ +8・53%（全体 +22・57%）
//      ポンドドル：+30・58% ／ −8・47% ／ +9・50%（全体 +6・51%）
//    → どれも「上向き」は効くが、「下向き」はふだんと変わらない。
//  金利の出どころ：欧＝ECB（ユーロ圏AAA国債の利回り曲線 2年・10年）／英＝イングランド銀行（5年・10年）
// ═══════════════════════════════════════════════════════════════

// ── ユーロ圏（ECB）→ { 'yyyy-MM-dd': [2年, 10年] } ──
function fundaEcb_() {
  var url = 'https://data-api.ecb.europa.eu/service/data/YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_2Y+SR_10Y?format=csvdata&lastNObservations=30';
  var t = fundaGet_(url).getContentText().split(/\r?\n/);
  var h = t[0].split(',');
  var ik = h.indexOf('DATA_TYPE_FM'), it = h.indexOf('TIME_PERIOD'), iv = h.indexOf('OBS_VALUE');
  if (ik < 0 || it < 0 || iv < 0) throw new Error('ECBの列が見つかりません');
  var out = {};
  t.slice(1).forEach(function(ln) {
    var c = ln.split(',');
    var v = Number(c[iv]);
    if (!c[it] || !c[iv] || !isFinite(v)) return;
    var row = out[c[it]] || (out[c[it]] = [null, null]);
    if (c[ik] === 'SR_2Y') row[0] = v; else if (c[ik] === 'SR_10Y') row[1] = v;
  });
  Object.keys(out).forEach(function(d) { if (out[d][0] == null || out[d][1] == null) delete out[d]; });
  return out;
}

// ── イギリス（イングランド銀行）→ { 'yyyy-MM-dd': [5年, 10年] } ──
function fundaBoe_() {
  var from = Utilities.formatDate(new Date(Date.now() - 60 * 86400000), 'Europe/London', 'dd/MMM/yyyy');
  var url = 'https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=' + from +
    '&Dateto=now&SeriesCodes=IUDSNPY,IUDMNPY&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N';
  var mon = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
  var out = {};
  fundaGet_(url).getContentText().split(/\r?\n/).forEach(function(ln) {
    var c = ln.split(',');
    var m = /^(\d+) (\w+) (\d+)$/.exec(c[0] || '');
    if (!m || !mon[m[2]]) return;
    var a = Number(c[1]), b = Number(c[2]);
    if (!c[1] || !c[2] || !isFinite(a) || !isFinite(b)) return;
    out[m[3] + '-' + mon[m[2]] + '-' + ('0' + m[1]).slice(-2)] = [a, b];
  });
  return out;
}

// A＝左側の通貨の国、B＝右側の通貨の国。sa/sb＝短い年限の列、la/lb＝10年の列
function fundaPairCalc_(A, B, sa, sb, la, lb) {
  var ak = Object.keys(A).sort(), bk = Object.keys(B).sort();
  if (ak.length < 8 || bk.length < 8) throw new Error('金利データが足りません（' + ak.length + '・' + bk.length + '）');
  var seen = {}, days = [];
  ak.concat(bk).forEach(function(d) { if (!seen[d]) { seen[d] = 1; days.push(d); } });
  days.sort();
  var rows = [], la_ = null, lb_ = null;
  days.forEach(function(d) {
    if (A[d]) la_ = A[d];
    if (B[d]) lb_ = B[d];
    if (la_ && lb_) rows.push({ d: d, s: la_[sa] - lb_[sb], l: la_[la] - lb_[lb], b: lb_[lb] });
  });
  var n = rows.length - 1;
  if (n < 5) throw new Error('金利データが足りません');
  var r3 = function(v) { return Math.round(v * 1000) / 1000; };
  var mk = function(key, th, flip) {
    var now = rows[n][key], prev = rows[n - 5][key], chg = now - prev, v = flip ? -chg : chg;
    return { key: key, now: r3(now), prev: r3(prev), chg: r3(chg), days: 5, score: v >= th ? 1 : v <= -th ? -1 : 0 };
  };
  var f = [mk('s', 0.05, false), mk('l', 0.05, false), mk('b', 0.03, true)];
  var al = A[ak[ak.length - 1]], bl = B[bk[bk.length - 1]];
  return {
    aDate: ak[ak.length - 1], bDate: bk[bk.length - 1],
    aS: r3(al[sa]), aL: r3(al[la]), bS: r3(bl[sb]), bL: r3(bl[lb]),
    factors: f, score: f[0].score + f[1].score + f[2].score
  };
}

function fundaPairs_() {
  var jp = fundaJgb_(), us = fundaUst_();
  var eu = null, uk = null, errs = [];
  // 取れたら控えておき、取れなかった時（ECBは時々504を返す）は前回の控えで計算する
  var p = PropertiesService.getScriptProperties();
  var keep = function(key, fn, label) {
    try { var v = fn(); p.setProperty(key, JSON.stringify(v)); return v; }
    catch (e) { try { var b = JSON.parse(p.getProperty(key) || 'null'); if (b) return b; } catch (e2) {} errs.push(label + ' ' + e); return null; }
  };
  eu = keep('FUNDA_EU_HIST', fundaEcb_, '欧');
  uk = keep('FUNDA_UK_HIST', fundaBoe_, '英');
  var out = {};
  var put = function(name, fn) { try { out[name] = fn(); } catch (e) { errs.push(name + ' ' + e); } };
  // 米国の列：[2年, 10年, 5年]
  if (eu) put('EURJPY', function() { return fundaPairCalc_(eu, jp, 0, 0, 1, 1); });
  if (eu) put('EURUSD', function() { return fundaPairCalc_(eu, us, 0, 0, 1, 1); });
  if (uk) put('GBPUSD', function() { return fundaPairCalc_(uk, us, 0, 2, 1, 1); });
  if (!Object.keys(out).length) throw new Error(errs.join(' ／ '));
  if (errs.length) out.error = errs.join(' ／ ').slice(0, 300);
  return out;
}

// 点検用：?action=funda_pairs_diag
function fundaPairsDiag_() {
  var lines = [];
  var one = function(name, fn) { try { var o = fn(); var k = Object.keys(o).sort(); lines.push(name + '：' + k.length + '日ぶん　最新 ' + k[k.length - 1] + ' ' + JSON.stringify(o[k[k.length - 1]])); } catch (e) { lines.push(name + '：エラー ' + e); } };
  one('欧（ECB）', fundaEcb_);
  one('英（BOE）', fundaBoe_);
  one('米', fundaUst_);
  try { lines.push(JSON.stringify(fundaPairs_())); } catch (e) { lines.push('計算エラー ' + e); }
  return lines.join('\n');
}

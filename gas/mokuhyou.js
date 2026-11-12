/*******************************************************
 * スタッフ目標の達成状況（mokuhyou.html から呼ぶ）
 *
 * 日報と見込シートから、その月の成績をスタッフごとに集めてランクを付ける。
 *   工事スタッフ     … 工事売上（人数割り後の1人あたり）  4,000 / 6,000 千円
 *   サービススタッフ … 売上 3,000 / 6,000 / 8,000 / 10,000 千円（細かいものの配達があるため。GIGA・TERAはサービスだけ。ステップ1・2は2026-11-12に廃止）
 *   ひまわりスタッフ  … 点検 10件・アンケート 20件（1人あたり。ランクなし）
 *
 * ランクは「同じ単位が1,000倍ずつ上がる」形
 *   ⚡ VOLT → ⚡⚡ KILOVOLT → ⚡⚡⚡ MEGAVOLT
 *******************************************************/

var MK_RANKS = [
  { key: 'VOLT',     name: 'VOLT',     mark: '⚡',   color: '#ffb340' },
  { key: 'KILOVOLT', name: 'KILOVOLT', mark: '⚡⚡',  color: '#7bb4e8' },
  { key: 'MEGAVOLT', name: 'MEGAVOLT', mark: '⚡⚡⚡', color: '#bf94e8' },
  { key: 'GIGAVOLT', name: 'GIGAVOLT', mark: '⚡⚡⚡⚡', color: '#f07fa8' },  // サービスのみ
  { key: 'TERAVOLT', name: 'TERAVOLT', mark: '⚡⚡⚡⚡⚡', color: '#3cc6b4' }  // サービスのみ
];

/* 目標の数値。ここを直せば全部そろって変わる */
var MK_GOAL = {
  kouji:   { step: 4000, top: 6000, unit: '千円' },   // 工事売上（1人あたり）
  service: { step: 3000, top: 10000, levels: [3000, 6000, 8000, 10000], unit: '千円' },   // サービスの売上
  himawari:{ tenken: 10, enquete: 20 }                // ひまわり（1人あたり）
};

/**
 * ものさしの換算。
 * 役割が違っても、やった仕事が消えないようにするための決まり。
 *   工事スタッフが見込を見つけた      … 見込 1件   ＝ 工事売上 50千円ぶん
 */
var MK_CONV = {
  mikomiToKouji:   50    // 千円。見込1件はこれだけの売上と同じ
};

/**
 * 誰を何で見るか。役割が決まっている人はここに書く。
 *   'kouji'  … 工事売上で見る（工事スタッフ・発生業務の担当）
 *   'himawari' … 点検・アンケート（ランクなし）
 * ここに無い人は売上で見る（見込みは1件50千円で売上に足す）。
 */
var MK_ROLE = {
  '高山': 'kouji',
  '服部': 'kouji',
  '伊藤': 'service'     // サービススタッフ（売上 3,000/6,000/8,000/10,000）
};

/**
 * 販売手当（旧 +ALPHA）：工事スタッフが自分で販売したとき（ランクとは別の手当）
 *   工事スタッフは売るとき見積も自分で作る（担当者＝本人）。台帳で担当者が工事スタッフ・成約日がその月の見積の
 *   合計金額（税込）× 率 を手当にする。台帳は読むだけ（tkEstimates_ を使う）。
 *   率は給与のランク（4月・10月に判定したもの）で決まる：VOLT 1%／KILOVOLT以上 5%
 *   ★判定でランクが変わったら payRank を直す
 */
var MK_ALPHA = {
  staff: ['服部'],
  rates: { VOLT: 0.01, KILOVOLT: 0.05, MEGAVOLT: 0.05 },
  payRank: { '服部': 'VOLT' }
};
function mkAlphaRate_(name) { return MK_ALPHA.rates[MK_ALPHA.payRank[name] || 'VOLT']; }

function mkAlpha_(ym) {
  var out = {};
  var ests = [];
  try { ests = tkEstimates_(); } catch (e) { return out; }
  ests.forEach(function (e) {
    if (!e.seiyaku || e.seiyaku.slice(0, 7) !== ym) return;
    var who = MK_ALPHA.staff.filter(function (n) { return e.tan.indexOf(n) === 0; })[0];
    if (!who) return;
    if (!out[who]) out[who] = { sales: 0, n: 0, list: [] };
    out[who].sales += e.total;
    out[who].n++;
    out[who].list.push({ cust: e.cust, total: e.total, date: e.seiyaku });
  });
  Object.keys(out).forEach(function (k) {
    out[k].payRank = MK_ALPHA.payRank[k] || 'VOLT';
    out[k].rate = mkAlphaRate_(k);
    out[k].pay = Math.floor(out[k].sales * out[k].rate);
  });
  return out;
}

/* 段の基準（KILOVOLTから上）。levels が無ければ step・top の2段 */
function mkLevels_(goal) { return goal.levels || [goal.step, goal.top]; }

/* 数値からランクを決める */
function mkRank_(val, goal) {
  var lv = mkLevels_(goal), i = 0;
  while (i < lv.length && val >= lv[i]) i++;
  return MK_RANKS[i];
}

/* 次の段まであといくら */
function mkNext_(val, goal) {
  var lv = mkLevels_(goal);
  for (var i = 0; i < lv.length; i++) {
    if (val < lv[i]) return { target: lv[i], rest: lv[i] - val, rank: MK_RANKS[i + 1].name };
  }
  return { target: null, rest: 0, rank: null };
}

/* 「2026-08」形式。省略なら今月 */
function mkYm_(ym) {
  if (ym && /^\d{4}-\d{2}$/.test(ym)) return ym;
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM');
}

/**
 * その月のスタッフ別成績を返す。
 * { ym, staff:[{ name, kouji, mikomi, tenken, enquete, count, rank, next }] }
 */
function 目標の達成状況(ym) {
  ym = mkYm_(ym);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var byStaff = {}, order = [];

  function pick(name) {
    var st = String(name || '').trim() || '（担当未記入）';
    if (!byStaff[st]) {
      byStaff[st] = { name: st, kouji: 0, mikomi: 0, tenken: 0, enquete: 0, count: 0 };
      order.push(st);
    }
    return byStaff[st];
  }

  /* 日報から：工事売上（1人あたり）・点検件数・訪問件数 */
  var sh = ss.getSheetByName('日報');
  if (sh && sh.getLastRow() > 1) {
    var v = sh.getRange(2, 1, sh.getLastRow() - 1, 21).getValues();
    v.forEach(function(r) {
      if (nippoYmd_(r[0]).slice(0, 7) !== ym) return;
      var t = pick(r[1]);
      t.count++;
      // M列(12)＝人数割り後の1人あたり金額。無ければL列(11)の工事金額
      var per = Number(r[12]) || 0;
      t.kouji += per || (Number(r[11]) || 0);
      t.tenken += (Number(r[5]) || 0) + (Number(r[6]) || 0);   // エアコン点検＋他点検
    });
  }

  /* 見込シートから：見込みの記録件数（撮影者＝記録した人） */
  var ms = ss.getSheetByName(MIKOMI_SHEET);
  if (ms && ms.getLastRow() > 1) {
    var mv = ms.getRange(2, 1, ms.getLastRow() - 1, 16).getValues();
    mv.forEach(function(r) {
      var d = (r[0] instanceof Date)
        ? Utilities.formatDate(r[0], 'Asia/Tokyo', 'yyyy-MM')
        : String(r[0]).slice(0, 7);
      if (d !== ym) return;
      pick(r[13]).mikomi++;      // N列＝撮影者
    });
  }

  /* +ALPHA（工事スタッフの販売）。日報が無くても出す */
  var alpha = mkAlpha_(ym);
  Object.keys(alpha).forEach(function (k) { pick(k); });

  /* ランクを付ける。全員売上で見る（見込みは1件50千円で足す） */
  var staff = order.map(function(st) {
    var t = byStaff[st];
    t.kouji = Math.round(t.kouji);
    // 役割が決まっている人はそのものさし。決まっていなければ売上→見込みの順で見る
    var role = MK_ROLE[t.name] || 'kouji';   // 'kouji' | 'service'
    var useKouji = true;
    var goal = (role === 'service') ? MK_GOAL.service : MK_GOAL.kouji;

    // ★役割の外でやった仕事も、換算して足す（やったことが消えないように）
    var base = useKouji ? t.kouji : t.mikomi;   // 本来のものさしの分
    var add  = useKouji
      ? t.mikomi * MK_CONV.mikomiToKouji                       // 工事の人が見つけた見込 → 売上に換算
      : 0;
    var val = base + add;
    var rk = mkRank_(val, goal);
    var nx = mkNext_(val, goal);
    return {
      name: t.name,
      count: t.count,
      kouji: t.kouji,
      mikomi: t.mikomi,
      tenken: t.tenken,
      monosashi: '売上',
      value: val,
      base: base,                 // 本来のものさしぶん
      add: add,                   // 役割の外でやった分（換算後）
      addFrom: useKouji ? t.mikomi : t.kouji,   // 換算のもとの数
      addNote: !add ? '' : (useKouji
        ? '見込み' + t.mikomi + '件を換算（1件＝' + MK_CONV.mikomiToKouji + '千円）'
        : ''),
      unit: goal.unit,
      step: goal.step,
      top: goal.top,
      rank: rk.name,
      mark: rk.mark,
      color: rk.color,
      voltOnly: !!goal.voltOnly,
      nextTarget: nx.target,
      nextRank: nx.rank,
      levels: mkLevels_(goal),
      nextRest: nx.rest,
      pct: Math.min(100, Math.round(val / goal.top * 100)),
      alpha: alpha[t.name] || null      // +ALPHA { sales, n, pay, list }
    };
  });

  /* 上の段の人から並べる。同じ段なら数字の大きい順 */
  var ordRank = { TERAVOLT: -1, GIGAVOLT: 0, MEGAVOLT: 1, KILOVOLT: 2, VOLT: 3 };
  staff.sort(function(a, b) {
    if (ordRank[a.rank] !== ordRank[b.rank]) return ordRank[a.rank] - ordRank[b.rank];
    return b.pct - a.pct;
  });

  return { ym: ym, goal: MK_GOAL, alphaRates: MK_ALPHA.rates, staff: staff };
}

/* 画面用（mokuhyou.html から google.script.run で呼ぶ） */
function getMokuhyou(ym) {
  return 目標の達成状況(ym);
}

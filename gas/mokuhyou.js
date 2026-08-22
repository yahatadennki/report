/*******************************************************
 * スタッフ目標の達成状況（mokuhyou.html から呼ぶ）
 *
 * 日報と見込シートから、その月の成績をスタッフごとに集めてランクを付ける。
 *   工事スタッフ     … 工事売上（人数割り後の1人あたり）  4,000 / 6,000 千円
 *   サービス ステップ1 … 見込みの記録件数                  40 / 60 件
 *   ひまわりスタッフ  … 点検 10件・アンケート 20件（1人あたり。ランクなし）
 *
 * ランクは「同じ単位が1,000倍ずつ上がる」形
 *   ⚡ VOLT → ⚡⚡ KILOVOLT → ⚡⚡⚡ MEGAVOLT
 *******************************************************/

var MK_RANKS = [
  { key: 'VOLT',     name: 'VOLT',     mark: '⚡',   color: '#ffb340' },
  { key: 'KILOVOLT', name: 'KILOVOLT', mark: '⚡⚡',  color: '#7bb4e8' },
  { key: 'MEGAVOLT', name: 'MEGAVOLT', mark: '⚡⚡⚡', color: '#bf94e8' }
];

/* 目標の数値。ここを直せば全部そろって変わる */
var MK_GOAL = {
  kouji:   { step: 4000, top: 6000, unit: '千円' },   // 工事売上（1人あたり）
  mikomi:  { step: 40,   top: 60,   unit: '件'   },   // 見込みの記録
  himawari:{ tenken: 10, enquete: 20 }                // ひまわり（1人あたり）
};

/**
 * 誰を何で見るか。役割が決まっている人はここに書く。
 *   'kouji'  … 工事売上で見る（工事スタッフ・発生業務の担当）
 *   'mikomi' … 見込みの記録件数で見る（サービス ステップ1）
 *   'himawari' … 点検・アンケート（ランクなし）
 * ここに無い人は、工事売上があれば売上、無ければ見込み件数で自動判定する。
 */
var MK_ROLE = {
  '高山': 'kouji',
  '服部': 'kouji',
  '伊藤': 'mikomi'      // サービススタッフ。ステップ2に上がったら 'kouji' に変える
};

/* 数値からランクを決める */
function mkRank_(val, goal) {
  if (val >= goal.top)  return MK_RANKS[2];
  if (val >= goal.step) return MK_RANKS[1];
  return MK_RANKS[0];
}

/* 次の段まであといくら */
function mkNext_(val, goal) {
  if (val >= goal.top)  return { target: null, rest: 0 };
  if (val >= goal.step) return { target: goal.top,  rest: goal.top  - val };
  return                       { target: goal.step, rest: goal.step - val };
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

  /* ランクを付ける。工事売上がある人は売上、無ければ見込み件数で見る */
  var staff = order.map(function(st) {
    var t = byStaff[st];
    t.kouji = Math.round(t.kouji);
    // 役割が決まっている人はそのものさし。決まっていなければ売上→見込みの順で見る
    var role = MK_ROLE[t.name] || (t.kouji > 0 ? 'kouji' : 'mikomi');
    var useKouji = (role === 'kouji');
    var goal = useKouji ? MK_GOAL.kouji : MK_GOAL.mikomi;
    var val  = useKouji ? t.kouji : t.mikomi;
    var rk = mkRank_(val, goal);
    var nx = mkNext_(val, goal);
    return {
      name: t.name,
      count: t.count,
      kouji: t.kouji,
      mikomi: t.mikomi,
      tenken: t.tenken,
      monosashi: useKouji ? '工事売上' : '見込みの記録',
      value: val,
      unit: goal.unit,
      step: goal.step,
      top: goal.top,
      rank: rk.name,
      mark: rk.mark,
      color: rk.color,
      nextTarget: nx.target,
      nextRest: nx.rest,
      pct: Math.min(100, Math.round(val / goal.top * 100))
    };
  });

  /* 上の段の人から並べる。同じ段なら数字の大きい順 */
  var ordRank = { MEGAVOLT: 0, KILOVOLT: 1, VOLT: 2 };
  staff.sort(function(a, b) {
    if (ordRank[a.rank] !== ordRank[b.rank]) return ordRank[a.rank] - ordRank[b.rank];
    return b.pct - a.pct;
  });

  return { ym: ym, goal: MK_GOAL, staff: staff };
}

/* 画面用（mokuhyou.html から google.script.run で呼ぶ） */
function getMokuhyou(ym) {
  return 目標の達成状況(ym);
}

// 実績（1か月＝A4縦1枚）を jisseki.html に書き出す
// 入力: gyomu.csv（業務日報）, ledger.csv（商品見積の入力シート）, cal.json（calsum）
const fs = require('fs');
// 使い方: node tools/build-jisseki.js <フォルダ>  （フォルダに gyomu.csv・ledger.csv・cal.json・tpl.html を置く）
const S = (process.argv[2] || __dirname) + '/';
const OUT = 'C:/Users/KouichiTakayama/OneDrive/デスクトップ/himawari-report/jisseki.html';
const UNTIL = '2026-11-14';

function csv(t) {
  const rows = []; let r = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch == '"') { if (t[i + 1] == '"') { f += '"'; i++; } else q = false; } else f += ch; }
    else if (ch == '"') q = true; else if (ch == ',') { r.push(f); f = ''; }
    else if (ch == '\n') { r.push(f); rows.push(r); r = []; f = ''; } else if (ch != '\r') f += ch;
  }
  if (f || r.length) { r.push(f); rows.push(r); }
  return rows;
}
const ymd = v => { const m = String(v || '').match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/); return m ? m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0') : ''; };
const yen = v => Number(String(v || '').replace(/[^\d.-]/g, '')) || 0;
const sen = v => { let n = yen(v); if (n > 10000) n = n / 1000; return n; };
const who = t => /伊藤/.test(t) ? '伊藤' : /服部/.test(t) ? '服部' : /高山/.test(t) ? '高山' : /渡辺/.test(t) ? '渡辺' : '';
const fmt = n => Math.round(n).toLocaleString();

const nameKey = s => String(s || '').replace(/[☎✨★☆●○◆■▲✓]/g, '').replace(/^[^】]{0,4}】/, '').replace(/[①-⑨]/g, '')
  .replace(/[（(].*?[）)]/g, '').replace(/様.*$/, '').replace(/^(サ|工|配|修|現|見|高|仮)】/, '').replace(/[\s　]/g, '');
const SEIYAKU_FROM = '2026-08';   // 見積台帳に成約（成約日・工事日・工事済）を入れ始めた月

// ── 見積台帳 ──
const est = {}, items = {};
csv(fs.readFileSync(S + 'ledger.csv', 'utf8')).slice(1).forEach(r => {
  const no = String(r[0] || '').trim();
  if (!no || r[8] === 'invoice') return;
  const date = ymd(r[1]), sokubai = r[8] === 'sokubai';
  est[no] = { no, cust: nameKey(r[2]), total: yen(r[4]), tan: who(r[9]) || '空欄', made: ymd(r[22]) || date, koji: ymd(r[11]), sumi: ymd(r[21]),
    seiyaku: ymd(r[23]) || ymd(r[21]) || ymd(r[11]) || (sokubai ? date : ''), sokubai };
  try { items[no] = JSON.parse(r[5] || '[]'); } catch (e) { items[no] = []; }
});
const E = Object.values(est);
const ledgerFrom = E.map(x => x.made).filter(Boolean).sort()[0] || '';

// ── 日報 ──
const nip = csv(fs.readFileSync(S + 'gyomu.csv', 'utf8')).slice(1)
  .map(r => (!r[1] && r[2]) ? [r[0]].concat(r.slice(2)) : r)
  .filter(r => /^\d{4}-\d{2}-\d{2}/.test(r[0]) && /高山|伊藤|服部|渡辺/.test(r[1]));

// ── カレンダー ──
const cal = JSON.parse(fs.readFileSync(S + 'cal.json', 'utf8'));
const SKIP = ['在庫確認', '当日急ぎ', '片付け', '日報', '伝票', '準備', '予定あり', '予定有り', 'TEL】', '☎', '電話連絡', '連絡】', '見積り', '見積書', '発注', '入荷', '納期', '休', '会議', '打合せ', 'ミーティング', '朝礼', 'フェア準備', '口座', '買物'];
const went = {};
const addWent = (no, d, st) => (went[no + '|' + d] = went[no + '|' + d] || new Set()).add(st);
const byDay = {};
E.forEach(x => [x.koji, x.sumi].forEach(d => { if (d) (byDay[d] = byDay[d] || []).push(x); }));
cal.forEach(e => {
  (e.files || []).forEach(f => { const no = (f.title.match(/^(\d{6}-\d{6})/) || [])[1]; if (no) addWent(no, e.date, e.staff); });
  if (SKIP.some(w => e.title.includes(w))) return;
  const k = nameKey(e.title); if (k.length < 2) return;
  (byDay[e.date] || []).forEach(x => { if (x.cust.length >= 2 && (k.includes(x.cust) || x.cust.includes(k))) addWent(x.no, e.date, e.staff); });
});

// ── 商品の分類 ──
const CATS = [
  ['テレビ', /テレビ|TV|ビエラ|VIERA|REGZA|レグザ|ブラビア|AQUOS/i, /ドアホン|インターホン|アンテナ|壁掛|金具|台$|スタンド|チューナー|ケーブル/],
  ['エアコン', /エアコン/, /取付|取外|工事|移設|洗浄|クリーニング|リサイクル|カバー|配管|置台|架台/],
  ['冷蔵庫', /冷蔵庫|冷凍冷蔵/, /リサイクル|運搬|処分/],
  ['洗濯機', /洗濯/, /リサイクル|運搬|処分|パン|ホース|蛇口|ポンプ/],
  ['照明', /シーリング|照明|ライト|ダウンライト|ペンダント|LED灯|蛍光灯/, /工事|取付|取外|処分|スイッチ|リモコン|直管|プレート|ランプ$|電球/],
  ['電子レンジ', /レンジ|オーブン/, /台$|ラック|フード|幕板|トースター/],
  ['炊飯器', /炊飯/, /^$/],
  ['トースター', /トースター/, /^$/],
];
const PHOTO_RULE_FROM = '2026-06';   // 写真つき日報が始まった月（写真なし工事の半額はここから）
const COLORS = { 高山: '#7a1f2b', 伊藤: '#2f6fae', 服部: '#4a9e6e', 渡辺: '#c98a1b', 空欄: '#aaa' };

const months = [];
for (let d = new Date(2026, 10, 1); d >= new Date(2026, 1, 1); d.setMonth(d.getMonth() - 1))
  months.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));

function month(ym) {
  const hasLedger = ym >= ledgerFrom.slice(0, 7);
  const hasSeiyaku = ym >= SEIYAKU_FROM;
  const names = ['高山', '伊藤', '服部', '渡辺'].filter(st =>
    nip.some(r => r[1].trim() === st && r[0].startsWith(ym)) ||
    (st === '高山' && cal.some(e => e.staff === st && e.date.startsWith(ym))) ||
    E.some(x => x.tan === st && (x.made.startsWith(ym) || (hasSeiyaku && x.seiyaku.startsWith(ym)))));
  if (E.some(x => x.tan === '空欄' && (x.made.startsWith(ym) || (hasSeiyaku && x.seiyaku.startsWith(ym))))) names.push('空欄');
  const rows = names.map(st => {
    const nr = nip.filter(r => r[1].trim() === st && r[0].startsWith(ym));
    const useNippo = st === '高山' ? nr.length >= 10 : true;
    const calVisits = cal.filter(e => e.staff === st && e.date.startsWith(ym) && !SKIP.some(w => e.title.includes(w))).length;
    const mine = E.filter(x => x.tan === st && !x.sokubai && x.made.startsWith(ym));
    const won = mine.filter(x => x.seiyaku);
    const sold = E.filter(x => x.tan === st && x.seiyaku.startsWith(ym));
    const soku = sold.filter(x => x.sokubai);
    let kd = 0, kdFrom = '';
    if (st === '空欄') kdFrom = '';
    else if (useNippo) {
      kd = nr.reduce((a, r) => {
        if (/集金|見積/.test(r[4])) return a;
        const half = st !== '高山' && ym >= PHOTO_RULE_FROM && /工事/.test(r[4]) && !String(r[20] || '').trim();
        return a + sen(r[12]) * (half ? 0.5 : 1);
      }, 0);
      kdFrom = '日報';
    } else if (st === '高山') {
      Object.keys(went).forEach(k => {
        const [no, d] = k.split('|'), x = est[no], set = went[k];
        if (x && d.startsWith(ym) && set.has(st) && (x.koji === d || x.sumi === d)) kd += x.total / set.size / 1000;
      });
      kd += soku.reduce((a, x) => a + x.total / 1000, 0);
      kdFrom = 'カレンダー';
    }
    const units = {}; CATS.forEach(c => units[c[0]] = 0);
    sold.forEach(x => (items[x.no] || []).forEach(it => {
      if (it.cls !== 'shohin' || it.isSubtotal) return;
      const nm = String(it.name || ''), c = CATS.find(z => z[1].test(nm) && !z[2].test(nm));
      if (c) units[c[0]] += Number(it.qty) || 1;
    }));
    return {
      st, visits: st === '空欄' ? null : (useNippo ? nr.length : calVisits), visitsFrom: useNippo ? '日報' : 'カレンダー',
      sales: hasSeiyaku ? sold.reduce((a, x) => a + x.total, 0) / 1000 : null, soku: soku.length,
      kd: st === '空欄' || (kdFrom === 'カレンダー' && !hasSeiyaku) ? null : kd, kdFrom,
      estN: hasLedger ? mine.length : null, estSum: hasLedger ? mine.reduce((a, x) => a + x.total, 0) / 1000 : null,
      won: hasSeiyaku ? won.length : null, units
    };
  });
  return { ym, hasLedger, hasSeiyaku, rows };
}

function chart(m) {
  const per = c => c === '照明' ? 5 : 1;
  const tot = CATS.map(c => m.rows.reduce((a, r) => a + r.units[c[0]], 0));
  const maxSq = Math.max(4, ...CATS.map((c, i) => Math.ceil(tot[i] / per(c[0]))));
  const ROWS = maxSq + 1, M = Math.min(22, Math.floor(200 / ROWS)), L = 26, T = 18, B = 34, CW = 70, BW = 36;
  const W = L + CATS.length * CW + 6, H = T + ROWS * M + B;
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="商品の台数">`;
  for (let i = 0; i <= ROWS; i++) {
    const y = T + i * M;
    s += `<line x1="${L}" y1="${y}" x2="${W - 6}" y2="${y}" stroke="#e6e1d8"/>`;
    s += `<text x="${L - 5}" y="${T + (ROWS - i) * M + 4}" font-size="9" text-anchor="end" fill="#999">${i}</text>`;
  }
  CATS.forEach(([c], ci) => {
    const x = L + ci * CW + (CW - BW) / 2; let y = T + ROWS * M;
    m.rows.forEach(r => { const n = r.units[c]; if (!n) return; const h = n / per(c) * M; y -= h;
      s += `<rect x="${x}" y="${y}" width="${BW}" height="${h}" fill="${COLORS[r.st]}"/>`; });
    for (let k = 1; k * M < T + ROWS * M - y - 0.1; k++) { const yy = T + ROWS * M - k * M; s += `<line x1="${x}" y1="${yy}" x2="${x + BW}" y2="${yy}" stroke="#fff"/>`; }
    s += `<text x="${x + BW / 2}" y="${y - 4}" font-size="12" font-weight="700" text-anchor="middle" fill="#222">${tot[ci]}</text>`;
    s += `<text x="${x + BW / 2}" y="${T + ROWS * M + 14}" font-size="11" text-anchor="middle" fill="#444">${c}</text>`;
    if (per(c) > 1) s += `<text x="${x + BW / 2}" y="${T + ROWS * M + 27}" font-size="9.5" text-anchor="middle" fill="#c0392b" font-weight="700">1マス5台</text>`;
  });
  return s + '</svg>';
}

const cell = (v, sub) => '<td>' + (v == null ? '<span class="na">—</span>' : v) + (sub ? '<span class="s">' + sub + '</span>' : '') + '</td>';
function page(m) {
  const [y, mo] = m.ym.split('-');
  const partial = UNTIL.startsWith(m.ym) ? `<small>（${Number(UNTIL.slice(8))}日まで）</small>` : '';
  const label = st => st === '空欄' ? '担当欄なし' : st;
  const trs = m.rows.map(r => '<tr><th><i class="dot" style="background:' + COLORS[r.st] + '"></i>' + label(r.st) + '</th>' +
    cell(r.visits == null ? null : r.visits, r.visits != null && r.visitsFrom === 'カレンダー' ? 'カレンダー' : '') +
    cell(r.sales == null ? null : fmt(r.sales), r.soku ? 'その場' + r.soku + '件込' : '') +
    cell(r.kd == null ? null : fmt(r.kd), r.kdFrom === 'カレンダー' ? 'カレンダー' : '') +
    cell(r.estN) + cell(r.estSum == null ? null : fmt(r.estSum)) +
    cell(r.estN && r.won != null ? Math.round(r.won / r.estN * 100) + '%' : null, r.estN && r.won != null ? r.won + '/' + r.estN : '') + '</tr>').join('');
  const used = m.rows.filter(r => CATS.some(c => r.units[c[0]]));
  const legend = '<div class="legend">' + used.map(r => `<span><i style="background:${COLORS[r.st]}"></i>${label(r.st)}</span>`).join('') + '<span class="u">1マス＝1台（照明だけ1マス＝5台）</span></div>';
  const body = m.hasSeiyaku
    ? chart(m) + legend
    : '<p class="empty">見積台帳に成約を入れ始めたのは' + Number(SEIYAKU_FROM.slice(5)) + '月から。この月の商品・販売金額・成約率は記録がありません。' + (m.hasLedger ? '' : '<br>見積台帳は' + Number(ledgerFrom.slice(5, 7)) + '月からなので、見積件数・見積金額もありません。') + '</p>';
  return `<section class="page" id="m${m.ym}">
  <div class="hd"><h1>実績　${y}年${Number(mo)}月${partial}</h1><div class="sub">㈲ヤハタ電機商会<br>業務日報・カレンダー・見積台帳より</div></div>
  <div class="tw"><table>
  <colgroup><col class="c0"><col><col><col><col><col><col></colgroup>
  <tr><th></th><th>件数</th><th>販売金額<br>（成約）</th><th>工事配達<br>金額</th><th>見積件数</th><th>見積金額</th><th>成約率</th></tr>
  ${trs}
  </table></div>
  <h2>商品の台数（成約した見積）</h2>
  ${body}
  <p class="note">${NOTE}</p>
</section>`;
}
const NOTE = '金額は千円。<b>件数</b>＝業務日報の件数（日報が無い月の高山はカレンダーの訪問予定の数。社内の予定は除く）。<b>販売金額</b>＝その月に成約した見積の合計（成約日・工事済・工事日の順で月を分ける。成約の記録は8月から）。その場販売は販売にも工事配達にも全額入れる。<b>工事配達金額</b>＝業務日報の一人あたり売上（6月からは写真のない工事を半額、高山は全額）。日報が無い月の高山は、見積の工事日・工事済の日にカレンダーで行った分（添付の見積書かお客様名で照合）を、行った人数で割ったもの。<b>見積</b>＝その月に初めて作った見積（作った人＝台帳の担当）。<b>成約率</b>＝その月に作った見積のうち成約したもの。<b>商品の台数</b>＝その月に成約した見積の商品（作った人で色分け）。工事・部材・電球などは数えない。';

const data = months.map(month);
const nav = '<nav class="mnav">' + data.map(m => `<a href="#m${m.ym}">${Number(m.ym.slice(5))}月</a>`).join('') + '</nav>';
const tpl = fs.readFileSync(S + 'tpl.html', 'utf8');
const css = tpl.slice(tpl.indexOf('<style>'), tpl.indexOf('</style>')).replace(/\n  \.ct\{[^\n]*/, '') + `
  .page{min-height:auto}
  .page + .page{margin-top:22px}
  .dot{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px;vertical-align:0}
  .na{color:#bbb}
  .empty{font-size:12.5px;color:var(--soft);background:#faf8f4;border:1px dashed var(--line);padding:18px;text-align:center;margin:6px 0}
  .mnav{max-width:800px;margin:12px auto 0;display:flex;flex-wrap:wrap;gap:6px;padding:0 4px}
  .mnav a{font-size:13px;font-weight:700;color:var(--accent);background:#fff;border:1px solid var(--line);border-radius:999px;padding:4px 12px;text-decoration:none}
  @media print{.mnav{display:none}.page{break-after:page;page-break-after:always}.page + .page{margin-top:0}.chart{max-height:110mm}}
</style>`;
const head = tpl.slice(0, tpl.indexOf('<style>')).replace(/<title>.*?<\/title>/, '<title>実績（月ごと）｜ヤハタ電機商会</title>');
const gate = tpl.slice(tpl.indexOf('<div id="pinGate">'), tpl.indexOf('<div class="page">'));
const tail = tpl.slice(tpl.indexOf('<button class="print-btn"'));
fs.writeFileSync(OUT, head + css + '\n</head>\n<body>\n' + gate + nav + '\n' + data.map(page).join('\n') + '\n' + tail);
data.forEach(m => console.log(m.ym, m.rows.map(r => r.st + ':' + [r.visits, r.sales && fmt(r.sales), r.kd != null && fmt(r.kd), r.estN, r.estSum && fmt(r.estSum), r.won].join('/')).join('  ')));

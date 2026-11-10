// 今週の経済指標（米・日・欧・英）を取ってきて mackline/cal.json に書く。
//   使い方：node tools/cal.mjs            … 配信元から取る
//           node tools/cal.mjs 手元.json  … 手元のファイルから作る
//   取れなかった時は何も書かずに終わる（前回の cal.json がそのまま残る）。
import fs from 'node:fs';

const SRC = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const OUT = new URL('../mackline/cal.json', import.meta.url);
const IMP = { High: 3, Medium: 2, Low: 1 };

let raw;
try {
  if (process.argv[2]) raw = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  else {
    const res = await fetch(SRC);
    if (!res.ok) throw new Error('応答 ' + res.status);
    raw = await res.json();
  }
  if (!Array.isArray(raw) || !raw.length) throw new Error('中身が空');
} catch (e) {
  console.log('::warning::取得できませんでした（前回のまま）：' + e.message);
  process.exit(0);
}

const list = raw
  .filter(e => ['USD', 'JPY', 'EUR', 'GBP'].includes(e.country))
  .map(e => ({ d: new Date(e.date), e }))
  .filter(x => !isNaN(x.d))
  .map(({ d, e }) => ({ t: d.toISOString().slice(0, 16) + 'Z', c: e.country, i: IMP[e.impact] || 0, n: e.title, f: e.forecast || '', p: e.previous || '' }))
  .sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));

// 中身が同じなら書き直さない（無駄なコミットを作らない）
let old = null;
try { old = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { /* 初回 */ }
if (old && JSON.stringify(old.list) === JSON.stringify(list)) { console.log('::notice::取得できました。変更なし ' + list.length + '件'); process.exit(0); }
fs.writeFileSync(OUT, JSON.stringify({ list, got: new Date().toISOString().slice(0, 16) + 'Z' }));
console.log('::notice::書きました ' + list.length + '件');

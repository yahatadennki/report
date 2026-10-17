// 打合せカードの生成：node tools/build-cards.js（中身は tools/cards-data.js に1枚ずつ足す）
const fs=require('fs');
const path=require('path');const SP=__dirname+'/';
const D=path.join(__dirname,'..')+'/';
delete require.cache[require.resolve(SP+'cards-data.js')];
const CARDS=require(SP+'cards-data.js');
const WHO={
  himawari:{label:'ひまわりスタッフ',ic:'🌻',frame:'#f6b800',paper:'#fffdf5',bg:'#fff6d8',accent:'#d99400',ink:'#7a4d10',tint:'#fff1c2',soft:'#fff8dc'},
  service: {label:'サービススタッフ',ic:'🔧',frame:'#3d8fd6',paper:'#f7fbff',bg:'#e3f0fb',accent:'#2a6fb0',ink:'#164a7a',tint:'#d9ebfa',soft:'#eaf4fd'},
  koji:    {label:'工事スタッフ',ic:'⚙️',frame:'#4f9a3a',paper:'#f8fcf5',bg:'#e5f3dc',accent:'#3b7d2b',ink:'#2b5a1e',tint:'#dcefd2',soft:'#ecf7e6'},
  jimu:    {label:'事務スタッフ',ic:'📎',frame:'#8a5cc2',paper:'#fbf8ff',bg:'#efe6fa',accent:'#7446ad',ink:'#4a2a78',tint:'#e8dcf7',soft:'#f3ecfb'},
  all:     {label:'全員',ic:'⭐',frame:'#e0782c',paper:'#fffaf5',bg:'#fde9d9',accent:'#c9601a',ink:'#7a3a0e',tint:'#fde2cc',soft:'#fff1e6'}
};
const rep=(n,ic)=>Array(n).fill('<span>'+ic+'</span>').join('');
function frame(w){return '  <div class="frame"></div>\n  <div class="row-f t">'+rep(14,w.ic)+'</div>\n  <div class="row-f b">'+rep(14,w.ic)+'</div>\n  <div class="col-f l">'+rep(5,w.ic)+'</div>\n  <div class="col-f r">'+rep(5,w.ic)+'</div>\n';}
const css=w=>`
  :root{--ink:#3a2a10;--soft:#6f6658;--frame:${w.frame};--accent:${w.accent};--leaf:#4f8a2b;--brown:${w.ink};--paper:${w.paper};--bg:${w.bg};--tint:${w.tint};--softbg:${w.soft}}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font-family:"Hiragino Maru Gothic ProN","Hiragino Kaku Gothic ProN","Yu Gothic",system-ui,sans-serif;line-height:1.55}
  .page{width:257mm;height:181mm;margin:14px auto;position:relative;background:var(--paper);border-radius:6mm;box-shadow:0 3px 16px rgba(0,0,0,.12);padding:14mm 18mm 12mm;overflow:hidden;display:flex;flex-direction:column}
  .frame{position:absolute;inset:0;pointer-events:none;border:2.2mm solid var(--frame);border-radius:6mm}
  .row-f{position:absolute;left:0;right:0;display:flex;justify-content:space-around;font-size:7.5mm;line-height:1}
  .row-f.t{top:-1.2mm} .row-f.b{bottom:-1.4mm}
  .col-f{position:absolute;top:9mm;bottom:9mm;display:flex;flex-direction:column;justify-content:space-around;font-size:7mm;line-height:1}
  .col-f.l{left:-1.4mm} .col-f.r{right:-1.4mm}
  .top{display:flex;justify-content:space-between;align-items:center;font-size:3.4mm}
  .top .no{background:var(--brown);color:#fff;border-radius:999px;padding:.5mm 4mm;font-weight:700;letter-spacing:.06em}
  .side{display:inline-block;color:#fff;border-radius:999px;font-weight:800;letter-spacing:.12em;padding:.6mm 5mm;font-size:3.6mm}
  .side.why{background:#ff7a59} .side.how{background:var(--accent)} .side.what{background:var(--leaf)}
  .front{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:6mm}
  .front h1{margin:0;font-size:11mm;line-height:1.3;color:var(--brown)}
  .front h1 em{font-style:normal;background:linear-gradient(transparent 60%,var(--tint) 60%)}
  .front .msg{font-size:7mm;font-weight:800;line-height:1.5;color:var(--brown);margin:0}
  .front .msg b{color:#e05a2a}
  .vs{display:flex;gap:8mm;align-items:center}
  .vs div{border-radius:5mm;padding:4mm 9mm;font-size:5mm;line-height:1.4}
  .vs .ng{background:#f0f0f0;color:#777} .vs .ok{background:var(--tint);color:var(--brown);font-weight:800}
  .vs .ar{font-size:7mm;color:var(--accent);padding:0;background:none}
  .front .one{font-size:4.6mm;color:var(--soft);margin:0}
  .back{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:7mm;margin-top:5mm}
  .box{background:#fff;border:.5mm solid var(--tint);border-radius:5mm;padding:6mm 7mm;display:flex;flex-direction:column}
  .box h2{margin:2.5mm 0 4mm;font-size:6.2mm;line-height:1.35;color:var(--brown)}
  .talk{background:var(--softbg);border-radius:3.5mm;padding:3mm 4.5mm;font-size:4.4mm;font-weight:700;color:var(--brown);line-height:1.7;margin:0 0 4mm}
  ul{margin:0 0 2mm;padding-left:5.5mm}
  li{font-size:4.4mm;margin:0 0 2.2mm}
  li b{color:var(--brown)}
  .memo{border:.7mm dashed var(--leaf);border-radius:4mm;padding:4mm 5mm;background:#f3faea;margin:0 0 4.5mm}
  .memo b{font-size:5mm;color:var(--leaf)}
  .memo p{margin:1.5mm 0 0;font-size:4.2mm}
  .gt{font-size:4.2mm;font-weight:700;margin:0 0 1.5mm}
  .print-btn{position:fixed;right:16px;bottom:16px;z-index:99;font-family:inherit;font-size:15px;font-weight:700;padding:12px 22px;border:none;border-radius:999px;background:var(--accent);color:#fff;box-shadow:0 3px 12px rgba(0,0,0,.25);cursor:pointer}
  .hint{text-align:center;font-size:13px;color:var(--soft);margin:10px 0 0}
  .hint a{color:var(--brown)}
  @media print{
    @page{size:257mm 182mm;margin:0}
    body{background:#fff}
    .page{margin:0;box-shadow:none;border-radius:0;page-break-after:always}
    .page:last-of-type{page-break-after:auto}
    .print-btn,.hint{display:none}
    *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  }`;
const col=c=>c==='leaf'?'var(--leaf)':c;
function card(c){
  const w=WHO[c.who];
  const label='打合せカード　'+w.label+' No.'+c.no;
  const html=`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=1010">
<title>打合せカード${c.no} ${c.title}｜ヤハタ電機商会</title>
<style>${css(w)}
</style>
</head>
<body>
<p class="hint">B5よこ・両面印刷（短辺とじ）。1枚目が表、2枚目が裏です。　<a href="cards.html">目次へ</a></p>

<div class="page">
${frame(w)}
  <div class="top"><span class="no">${label}</span><span></span></div>
  <div class="front">
    <h1><em>${c.title}</em></h1>
    <p class="msg">${c.why.msg}</p>
${c.why.ng?`    <div class="vs"><div class="ng">${c.why.ng}</div><div class="ar">→</div><div class="ok">${c.why.ok}</div></div>\n`:''}    <p class="one">${c.why.one}</p>
  </div>
</div>

<div class="page">
${frame(w)}
  <div class="top"><span class="no">${label}　${c.title}</span><span></span></div>
  <div class="back">
    <div class="box">
      <h2>${c.how.h}</h2>
${c.how.talk?`      <div class="talk">${c.how.talk.join('<br>')}</div>\n`:''}      <ul>${c.how.list.map(x=>'<li>'+x+'</li>').join('')}</ul>
    </div>
    <div class="box">
      <h2>${c.what.h}</h2>
${c.what.memo?`      <div class="memo"><b>${c.what.memo[0]}</b><p>${c.what.memo[1]||''}</p></div>\n`:''}${(c.what.groups||[]).map(g=>'      <p class="gt" style="color:'+col(g.c)+'">'+g.t+'</p>\n      <ul>'+g.items.map(x=>'<li>'+x+'</li>').join('')+'</ul>').join('\n')}
    </div>
  </div>
</div>

<button class="print-btn" onclick="window.print()">🖨️ 印刷する（B5よこ・両面）</button>
</body>
</html>
`;
  fs.writeFileSync(D+'card-'+c.who+'-'+c.no+'.html',html,'utf8');
}
CARDS.forEach(card);

// 目次（職種ごと）
const ORDER=['himawari','service','koji','jimu','all'];
const fname=c=>'card-'+c.who+'-'+c.no+'.html';
const sec=ORDER.filter(k=>k!=='all'||CARDS.some(c=>c.who==='all')).map(k=>{
  const w=WHO[k];const cs=CARDS.filter(c=>c.who===k).sort((a,b)=>a.no-b.no);
  const rows=cs.length?cs.map(c=>`      <a class="ci" href="${fname(c)}"><span class="n">No.${c.no}</span><span class="t">${c.title}</span></a>`).join('\n')
    :'      <p class="none">—</p>';
  return `  <section id="${k}" style="--f:${w.frame};--bg:${w.tint}">
    <h2><span class="ic">${w.ic}</span>${w.label}<span class="cnt">${cs.length}枚</span></h2>
    <div class="list">
${rows}
    </div>
  </section>`;}).join('\n');
const nav=ORDER.filter(k=>k!=='all'||CARDS.some(c=>c.who==='all')).map(k=>`<a href="#${k}" style="background:${WHO[k].frame}">${WHO[k].ic} ${WHO[k].label.replace('スタッフ','')}</a>`).join('');
fs.writeFileSync(D+'cards.html',`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>打合せカード 目次｜ヤハタ電機商会</title>
<style>
  :root{--paper:#f4f7fa;--card:#fff;--ink:#1c2530;--soft:#5a6a7a;--line:#d7e0e8}
  @media (prefers-color-scheme:dark){:root{--paper:#10161d;--card:#1a2028;--ink:#e8edf2;--soft:#a9b6c2;--line:#2c3844}}
  :root[data-theme="dark"]{--paper:#10161d;--card:#1a2028;--ink:#e8edf2;--soft:#a9b6c2;--line:#2c3844}
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--ink);font-family:"Yu Gothic Medium","Yu Gothic","Hiragino Kaku Gothic ProN",sans-serif;padding:28px 16px 60px;line-height:1.7}
  .wrap{max-width:760px;margin:0 auto}
  .pt-head{background:linear-gradient(135deg,#c9601a 0%,#8a3e0c 100%);color:#fff;border-radius:10px;padding:24px 26px;margin:0 0 14px}
  .pt-head h1{margin:0 0 4px;font-size:22px}
  .pt-head p{margin:0;font-size:13px;opacity:.88}
  .nav{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 6px}
  .nav a{color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:6px 14px;border-radius:999px}
  section{margin:26px 0 0;scroll-margin-top:12px}
  section h2{display:flex;align-items:center;gap:8px;font-size:17px;margin:0 0 10px;padding:8px 14px;border-radius:10px;background:var(--bg);color:#222;border-left:6px solid var(--f)}
  section h2 .ic{font-size:20px}
  section h2 .cnt{margin-left:auto;font-size:12px;color:#555;font-weight:400}
  .ci{display:flex;align-items:center;gap:12px;background:var(--card);border:1px solid var(--line);border-left:5px solid var(--f);border-radius:10px;padding:11px 16px;margin:0 0 8px;text-decoration:none;color:inherit}
  .ci .n{font-weight:700;color:var(--soft);font-size:13px;flex:0 0 3.6em}
  .ci .t{flex:1;font-weight:700;font-size:16px}
  .none{color:var(--soft);margin:0 0 0 16px}
</style>
</head>
<body>
<div class="wrap">
  <div class="pt-head"><h1>打合せカード 目次</h1><p>1枚1テーマ。B5よこ・両面で印刷して、打合せで使う。</p></div>
  <div class="nav">${nav}</div>
${sec.replace(/<section style=/g,(m,i)=>m)}
</div>
</body>
</html>
`,'utf8');
// 古いURL（No.のみ）は新しいカードへ
['card-1.html','card-2.html'].forEach((f,i)=>fs.writeFileSync(D+f,'<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta http-equiv="refresh" content="0;url=card-himawari-'+(i+1)+'.html"><title>打合せカード</title></head><body><a href="card-himawari-'+(i+1)+'.html">カードへ</a></body></html>','utf8'));
console.log('cards',CARDS.length);

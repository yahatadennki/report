// 現場サポート（manual.html）の一番下「打合せカード」欄に、訪問・配達・工事ごとに関係するカードを並べる。
// build-cards.js の最後に自動で動く。単独なら：node tools/sync-portal-cards.js
const fs=require('fs');const path=require('path');
const D=path.join(__dirname,'..')+'/';
delete require.cache[require.resolve('./cards-data.js')];
const CARDS=require('./cards-data.js');

// どのカードを、どのガイドに出すか（新しいカードも、この決まりで自動で入る）
const HOUMON_TITLES=['安心点検','招待状訪問','保証切れ前訪問'];
const SECTIONS={
  houmon:[
    {label:'🆘 お困りごと',pick:c=>c.who==='trouble'},
    {label:'🧽 点検＆お手入れ',pick:c=>c.who==='mente'},
    {label:'🚪 訪問',pick:c=>HOUMON_TITLES.includes(c.title)}],
  haitatsu:[
    {label:'📦 納品＆取扱説明',pick:c=>c.who==='nohin'},
    {label:'🚚 配達',pick:c=>['service','koji'].includes(c.who)&&/納品|配達/.test(c.title)}],
  koji:[
    {label:'⚙️ 工事',pick:c=>c.who==='koji'&&!/納品|配達/.test(c.title)}]};

const WHO={service:'サービス',koji:'工事'};
const short=(c,dup)=>c.title.replace(/^(納品＆取説|点検＆お手入れ)\s*/,'')+(dup&&WHO[c.who]?'（'+WHO[c.who]+'）':'');
const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
function block(key){
  const rows=SECTIONS[key].map(g=>{
    const cs=CARDS.filter(g.pick).sort((a,b)=>a.no-b.no);
    if(!cs.length)return '';
    return `    <div class="pchips__row"><span class="pchips__h">${g.label}</span>${cs.map(c=>`<a href="card-${c.who}-${c.no}.html">${esc(short(c,cs.filter(x=>x.title===c.title).length>1))}</a>`).join('')}</div>\n`;
  }).join('');
  return rows?`    <p class="pchips__t">${TITLE[key]}</p>\n${rows}`:'';
}
const TITLE={houmon:'🚪 訪問ガイドのカード',haitatsu:'🚚 配達ガイドのカード',koji:'⚙️ 工事ガイドのカード'};
const CSS=`
  /* 打合せカードのリンク（tools/sync-portal-cards.js が作る） */
  .pchips{max-width:780px;margin:10px auto 0;padding-top:2px;background:var(--card,#fff);border:1px solid var(--line,#d7e0e8);border-radius:10px;padding:10px 14px;}
  .pchips__t{margin:12px 0 4px;font-size:11.5px;font-weight:800;letter-spacing:.08em;color:var(--ink-soft,#4a5a6a);}
  .pchips__row{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:5px 0;}
  .pchips__h{font-size:12px;font-weight:800;margin-right:4px;min-width:7.5em;}
  .pchips a{font-size:12.5px;text-decoration:none;color:inherit;border:1px solid var(--line,#d7e0e8);border-radius:999px;padding:3px 10px;background:var(--paper,#f4f7fa);}
  .pchips a:hover{border-color:#2e75b6;color:#2e75b6;}
`;
const f=D+'manual.html';
let m=fs.readFileSync(f,'utf8');const crlf=m.includes('\r\n');m=m.replace(/\r\n/g,'\n');
if(!m.includes('.pchips{'))m=m.replace('</style>',CSS+'</style>');
// 一番下の「打合せカード」欄（目次ボタンのグリッドの直後）に1つだけ置く
m=m.replace(/  <!-- cards:(\w+) -->[\s\S]*?<!-- \/cards:\1 -->\n/g,'');
const h=m.indexOf('color:var(--ink-soft);">打合せカード</p>');if(h<0)throw new Error('打合せカードの見出しがない');
const g=m.indexOf('\n  </div>\n',h)+10;
const inner=Object.keys(TITLE).map(block).join('');
m=m.slice(0,g)+'  <!-- cards:all -->\n  <div class="pchips">\n'+inner+'  </div>\n  <!-- /cards:all -->\n'+m.slice(g);
fs.writeFileSync(f,crlf?m.replace(/\n/g,'\r\n'):m);
console.log('portal cards synced');

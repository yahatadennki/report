const el=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const size=b=>b<1048576?Math.round(b/1024)+' KB':(b/1048576).toFixed(1)+' MB';
const folders=[
 {id:'line',kind:'line',title:'公式LINE QRコード',hint:'@112akvoe ／ 読み取ると友だち追加ページが開きます',files:[
  {f:'line-qr.png',b:294662,label:'QRコードだけ',name:'ヤハタデンキ_公式LINE_QRコード.png',use:'チラシ・ハガキ・POPに'},
  {f:'line-qr-waku.png',b:134207,label:'吹き出しつき',name:'ヤハタデンキ_公式LINE_QRコード_吹き出し.png',use:'「お友だち登録お願いします！」の枠つき。そのまま貼れる'}]},
 {id:'logo',kind:'logo',title:'店のロゴ',hint:'PNG・PDF・EPS ／ 印刷屋さん用もあります',files:[
  {f:'logo-full.png',b:649870,label:'ロゴ＋住所・電話＋QR',name:'ヤハタデンキ_ロゴ_住所電話QRつき.png',use:'いちばん情報が多いもの（QR：HP・LINE）'},
  {f:'logo.png',b:484905,label:'ロゴ＋住所・電話',name:'ヤハタデンキ_ロゴ_住所電話.png',use:'QRなし'},
  {f:'logo-tel.png',b:400669,label:'ロゴ＋電話',name:'ヤハタデンキ_ロゴ_電話.png',use:'住所なし。商品券などに'},
  {f:'logo-full.pdf',b:1338010,label:'PDF（住所・電話・QR）',name:'ヤハタデンキ_ロゴ_住所電話QRつき.pdf',use:'印刷屋さん用',pv:'logo-full.png'},
  {f:'logo.eps',b:2431130,label:'EPS（ロゴ）',name:'ヤハタデンキ_ロゴ.eps',use:'印刷屋さん用（Illustrator）'},
  {f:'logo-map.eps',b:1690182,label:'EPS（地図つき）',name:'ヤハタデンキ_ロゴ_地図つき.eps',use:'印刷屋さん用（Illustrator）'}]},
 {id:'nigaoe',kind:'nigaoe',title:'スタッフの似顔絵',hint:'高山・石橋・角井・有田・栗盛 ／ 白い背景のPNG',files:[
  {f:'nigaoe-takayama.png',b:341873,label:'高山'},
  {f:'nigaoe-ishibashi.png',b:472983,label:'石橋'},
  {f:'nigaoe-sumii.png',b:236616,label:'角井'},
  {f:'nigaoe-arita.png',b:477464,label:'有田'},
  {f:'nigaoe-kurimori.png',b:471771,label:'栗盛'}].map(x=>({...x,name:'似顔絵_'+x.label+'.png',use:'お店のチラシ・POP・ハガキだけに使う'}))}
];
folders.forEach(g=>g.files.forEach(x=>{x.fmt=x.f.split('.').pop().toUpperCase();x.pv=x.pv||(/\.(png|jpe?g)$/i.test(x.f)?x.f:null)}));
let kind='all',active=null,busy=false;
el('counts').innerHTML='<span><strong>'+folders.length+'</strong>フォルダ</span><span><strong>'+folders.reduce((n,g)=>n+g.files.length,0)+'</strong>点を保管</span>';
function render(){
 const q=el('search').value.trim().toLowerCase(),list=folders.filter(g=>(kind==='all'||g.kind===kind)&&JSON.stringify(g).toLowerCase().includes(q));
 el('library').innerHTML=list.map((g,i)=>'<article class="card folder" style="--folder-color:'+['#38745a','#bd8630','#447e9b'][i%3]+'"><button class="paper-cover" data-group="'+g.id+'" aria-label="'+esc(g.title)+'を開く"><img loading="lazy" src="files/'+g.files[0].pv+'" alt="'+esc(g.title)+'"><span>'+g.files.length+' 点を保管</span></button><div class="card-body"><span class="badge">'+(i+1)+' ／ 保管フォルダ</span><h2>'+esc(g.title)+'</h2><p class="timing">'+esc(g.hint)+'</p><div class="actions"><button data-group="'+g.id+'">中から選ぶ →</button></div></div></article>').join('')||'<p class="empty">該当する素材はありません。</p>';
 document.querySelectorAll('[data-kind]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.kind===kind)));
}
function showFile(i){
 const f=active.files[i];
 el('versions').innerHTML=active.files.map((v,j)=>'<button data-file="'+j+'" aria-pressed="'+(i===j)+'">'+esc(v.label)+'</button>').join('');
 el('file-info').innerHTML='<p><b>'+esc(f.use)+'</b> ／ '+f.fmt+' ／ '+size(f.b)+'<br>'+esc(f.name)+'</p><button class="download" id="download">元ファイルを保存（'+f.fmt+'）</button><p id="download-status" role="status"></p>';
 el('pages').innerHTML=f.pv?'<figure><img src="files/'+f.pv+'" alt="'+esc(f.label)+'"><figcaption>'+(f.pv===f.f?'閲覧用画像 ・ 保存できないときは、長押しで「写真に追加」':'中身の見本（PNG）・ 保存されるのは'+f.fmt+'です')+'</figcaption></figure>':'<p class="noprev">📄 '+f.fmt+'ファイル（ここでは表示できません）<br>Illustratorなどで開きます。印刷屋さんにはこのファイルを渡してください。</p>';
 el('download').onclick=()=>save(f);
}
async function save(f){
 if(busy)return;busy=true;const b=el('download'),s=el('download-status');b.disabled=true;s.textContent='元ファイルを取得中…';
 try{const r=await fetch('files/'+f.f);if(!r.ok)throw Error();const blob=await r.blob(),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=f.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),60000);s.textContent='保存しました。保存先（ダウンロード）を確認してください。'}
 catch{s.textContent='保存できませんでした。通信を確認して、もう一度お試しください。'}finally{busy=false;b.disabled=false}
}
function openFolder(id){active=folders.find(g=>g.id===id);el('viewer-title').textContent=active.title;el('viewer-hint').textContent=active.hint;showFile(0);el('viewer').showModal()}
document.addEventListener('click',e=>{const g=e.target.closest('[data-group]');if(g)return openFolder(g.dataset.group);const v=e.target.closest('[data-file]');if(v)return showFile(+v.dataset.file);const k=e.target.closest('[data-kind]');if(k){kind=k.dataset.kind;render()}});
el('close').onclick=()=>el('viewer').close();
el('viewer').addEventListener('click',e=>{if(e.target===el('viewer'))el('viewer').close()});
el('search').addEventListener('input',render);
render();

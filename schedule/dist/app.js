function shortPrintRange(e){const fmt=s=>{const d=new Date(s+'T12:00:00');return (d.getMonth()+1)+'/'+d.getDate()+'('+'日月火水木金土'[d.getDay()]+')'};return e.start?fmt(e.start)+(e.end&&e.end!==e.start?'〜'+fmt(e.end):''):e.timing||'日程未定'}
function monthIncludes(e,m){if(!e.start)return e.month===m;if(!m)return false;const a=year+'-'+String(m).padStart(2,'0')+'-01',b=year+'-'+String(m).padStart(2,'0')+'-'+new Date(year,m,0).getDate();return e.start<=b&&(e.end||e.start)>=a}
const cats=['ヤハタデンキ(店)','チラシ作成','サービススタッフ','工事スタッフ','ひまわりスタッフ','事務スタッフ'];
cats.push('キャンペーン','エアコン');
const colors=['#367252','#b9862c','#428aa1','#826eab','#c78553','#698978','#168980','#315caa'];
const key='yahata-schedule-v1';let data={version:1,events:[]},category='all',editing=null,year=2026;
const $=id=>document.getElementById(id);
function seed(title,month,category,timing='',extra={}){data.events.push({id:crypto.randomUUID(),title,month,category,timing,repeat:'annual',years:{},...extra})}
seed('春フェア',3,0,'3月中旬・土日または金土の2日間',{gift:'銀鮭'});
seed('夏フェア',6,0,'6月末・金土日の3日間');
seed('秋フェア・芋煮会',9,0,'9月下旬・土日または金土の2日間',{gift:'田吾作煎餅',food:'芋煮会'});
seed('パナソニック冬フェア',11,0,'11月末・金土日の3日間',{details:'企画案：エアコンの割引、リフォーム商談会',games:'企画案：ビンゴ、輪投げ',food:'企画案：焼きそば、ポップコーン',notes:'企画内容は案です。開催日・数量は決まり次第入力。'});
[['春',4],['夏',7],['秋',10],['冬',1]].forEach(([s,m])=>seed('かわらばん '+s+'号',m,1,m+'月発行'));
[['春',1200],['夏',1200],['秋',200],['冬',1200]].forEach(([s,n])=>seed('おみせ誌 '+s+'号 発注',0,5,'発注時期未定',{copies:n}));
seed('春フェア 招待状発注',12,5,'翌年春フェアの2〜3か月前（12月〜1月）');
seed('夏フェア 招待状発注',3,5,'夏フェアの2〜3か月前（3〜4月）');
seed('カレンダー発注',8,5,'8月');
seed('ごぶさたハガキ・年賀状',1,1,'1月・準備と発送は前年',{copies:200,notes:'約200部'});
seed('ごぶさたハガキ・暑中見舞い',0,1,'夏・発送月未定',{copies:200,notes:'約200部'});
seed('年賀状の準備・発送',12,5,'翌年1月の年賀状の準備・発送',{copies:200});
seed('ひまわりスタッフ用チラシ配布',0,4,'時期・回数・部数未定');
try{const saved=localStorage.getItem(key);if(saved){const p=JSON.parse(saved);if(!valid(p))throw Error();data=p}}catch(e){alert('保存データを読み込めませんでした。バックアップを確認してください。現在は初期予定を表示しています。')}
function valid(p){return p&&p.version===1&&Array.isArray(p.events)&&p.events.every(e=>typeof e.id==='string'&&typeof e.title==='string'&&Number.isInteger(e.category)&&e.category>=0&&e.category<8&&Number.isInteger(e.month)&&e.month>=0&&e.month<=12&&['annual','once'].includes(e.repeat)&&e.years&&typeof e.years==='object')}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function effective(e){return {...e,...(e.years[year]||{})}}
function persist(next){try{localStorage.setItem(key,JSON.stringify(next));data=next;return true}catch(e){alert('保存できません。ブラウザーの保存容量や設定を確認してください。');return false}}
function toast(t){$('toast').textContent=t;$('toast').style.display='block';setTimeout(()=>$('toast').style.display='none',2500)}
function render(){const q=$('search').value.trim().toLowerCase();const entries=data.events.filter(e=>matchesStrategy(e)&&(e.repeat==='annual'||e.year===year)).map(effective).filter(e=>(category==='all'||e.category===category)&&JSON.stringify(e).toLowerCase().includes(q));$('total').textContent=entries.length+' 件';$('section').textContent=category==='all'?'すべての予定':cats[category];$('nav').innerHTML=['すべての予定',...cats].map((c,i)=>'<button data-cat="'+(i-1)+'" class="'+((i===0&&category==='all'||category===i-1)?'active':'')+'">'+c+'</button>').join('');$('months').innerHTML=[...Array.from({length:12},(_,i)=>i+1),0].map(m=>{const a=entries.filter(e=>monthIncludes(e,m));return '<section class="month"><div class="month-head"><h3>'+(m?m+'月':'時期未定')+'</h3><span>'+a.length+' 件</span></div>'+a.map(e=>'<button class="event" data-id="'+esc(e.id)+'" style="--accent:'+colors[e.category]+'"><span class="tag">'+cats[e.category]+' · '+esc(e.status||'未着手')+'</span><b>'+esc(e.title)+'</b><small>'+esc(e.start?e.start+(e.end?' 〜 '+e.end:''):e.timing||'日程未定')+'</small></button>').join('')+(a.length?'':'<div class="empty">予定はありません</div>')+'</section>'}).join('')}
$('nav').onclick=e=>{const b=e.target.closest('[data-cat]');if(b){category=+b.dataset.cat<0?'all':+b.dataset.cat;render()}};
$('months').onclick=e=>{const b=e.target.closest('[data-id]');if(b)openEditor(b.dataset.id)};
const form=$('form');form.elements.category.innerHTML=cats.map((c,i)=>'<option value="'+i+'">'+c+'</option>').join('');
function openEditor(id){editing=id||null;form.reset();const e=id?effective(data.events.find(e=>e.id===id)):{month:0,category:category==='all'?0:category,repeat:'once',status:'未着手'};for(const field of form.elements)if(field.name&&field.type!=='checkbox')field.value=e[field.name]??(field.name==='status'?'未着手':'');$('delete').hidden=!id;$('dialog').showModal()}
$('add').onclick=()=>openEditor();$('close').onclick=()=>$('dialog').close();
form.onsubmit=e=>{e.preventDefault();const values=Object.fromEntries(new FormData(form));if(!values.title.trim()){form.elements.title.focus();return}if(values.start&&values.end&&values.end<values.start){alert('終了日は開始日以降にしてください。');return}if(values.start&&+values.start.slice(0,4)!==year){alert('開始日の年を表示年に合わせてください。');return}values.month=values.start?+values.start.slice(5,7):+values.month;values.category=+values.category;const next=structuredClone(data);let item=next.events.find(e=>e.id===editing);if(!item){item={id:crypto.randomUUID(),years:{}};next.events.push(item)}for(const k of ['title','month','category','timing','repeat'])item[k]=values[k];item.strategyIds=new FormData(form).getAll('strategyIds');item.year=year;const detail={...values};for(const k of ['title','month','category','timing','repeat'])delete detail[k];delete detail.strategyIds;item.years[year]=detail;if(persist(next)){$('dialog').close();render();toast('予定を保存しました')}};
$('delete').onclick=()=>{if(confirm('この予定を削除しますか？ 毎年の予定の場合、すべての年の記録が削除されます。')){const next=structuredClone(data);next.events=next.events.filter(e=>e.id!==editing);if(persist(next)){$('dialog').close();render();toast('削除しました')}}};
$('year').onchange=()=>{const n=+$('year').value;if(Number.isInteger(n)&&n>=2000&&n<=2100){year=n;render()}else $('year').value=year};$('search').oninput=render;
$('export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='ヤハタデンキ-年間予定-'+year+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('バックアップを書き出しました')};
$('import').onclick=()=>$('file').click();$('file').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const p=JSON.parse(await f.text());if(!valid(p))throw Error();if(confirm('現在の予定をバックアップの内容に置き換えますか？')&&persist(p)){render();toast('読み込みました')}}catch(err){alert('対応するバックアップファイルを選択してください。')}e.target.value=''};
render();
let scheduleView='year';
const viewControls=document.createElement('div');viewControls.className='view-controls';
viewControls.innerHTML='<div class="view-tabs" role="group" aria-label="表示方法"><button data-view="year">年間一覧</button><button data-view="list">詳細一覧</button><button data-view="month">月別カード</button></div><span id="view-help"></span>';
$('months').before(viewControls);
const originalRender=render;
function eventButton(e){return '<button class="event" data-id="'+esc(e.id)+'" style="--accent:'+colors[e.category]+'"><b>'+esc(e.title)+'</b><small>'+esc(e.start?e.start+(e.end?' 〜 '+e.end:''):e.timing||'日程未定')+'</small><span class="tag">'+esc(e.status||'未着手')+'</span></button>'}
render=function(){
 originalRender();
 viewControls.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===scheduleView);b.setAttribute('aria-pressed',String(b.dataset.view===scheduleView))});
 $('months').classList.toggle('table-view',scheduleView!=='month');
 $('view-help').textContent=scheduleView==='year'?'横にスクロールして12月まで確認できます':scheduleView==='list'?'内容・数量・記念品もまとめて確認できます':'月ごとに予定を確認できます';
 if(scheduleView==='month')return;
 const q=$('search').value.trim().toLowerCase();
 const entries=data.events.filter(e=>matchesStrategy(e)&&(e.repeat==='annual'||e.year===year)).map(effective).filter(e=>(category==='all'||e.category===category)&&JSON.stringify(e).toLowerCase().includes(q));
 if(scheduleView==='year'){
 const months=[...Array.from({length:12},(_,i)=>i+1),0];
 const rows=cats.map((c,i)=>({c,i})).filter(r=>category==='all'||category===r.i);
 $('months').innerHTML='<div class="table-scroll" tabindex="0" role="region" aria-label="区分別の年間スケジュール"><table class="year-table"><caption>'+year+'年 年間スケジュール</caption><thead><tr><th scope="col">区分</th>'+months.map(m=>'<th scope="col">'+(m?m+'月':'時期未定')+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr><th scope="row" style="--accent:'+colors[r.i]+'">'+r.c+'</th>'+months.map(m=>{const a=entries.filter(e=>e.category===r.i&&monthIncludes(e,m));return '<td>'+ (a.length?a.map(eventButton).join(''):'<span class="no-event">—</span>')+'</td>'}).join('')+'</tr>').join('')+'</tbody></table></div>';
 }else{
 const detail=e=>[e.details,e.games&&'ゲーム：'+e.games,e.food&&'飲食：'+e.food].filter(Boolean).join('\n');
 const number=v=>v===''||v==null?'—':esc(v);
 $('months').innerHTML='<div class="table-scroll" tabindex="0" role="region" aria-label="予定の詳細一覧"><table class="detail-table"><caption>'+year+'年 予定の詳細一覧</caption><thead><tr>'+['月','区分・予定','内容','部数','招待状','来店数','記念品','状態'].map(t=>'<th scope="col">'+t+'</th>').join('')+'</tr></thead><tbody>'+entries.sort((a,b)=>(a.month||13)-(b.month||13)||a.category-b.category).map(e=>'<tr><th scope="row">'+(e.month?e.month+'月':'未定')+'</th><td><small>'+cats[e.category]+'</small>'+eventButton(e)+'</td><td class="detail-text">'+(esc(detail(e))||'—')+'</td><td>'+number(e.copies)+'</td><td>'+number(e.invitations)+'</td><td>'+number(e.visitors)+'</td><td>'+esc(e.gift||'—')+(e.giftCount?' / '+esc(e.giftCount)+'個':'')+'</td><td>'+esc(e.status||'未着手')+'</td></tr>').join('')+'</tbody></table>'+(entries.length?'':'<p class="empty">該当する予定はありません</p>')+'</div>';
 }
};
viewControls.onclick=e=>{const b=e.target.closest('[data-view]');if(b){scheduleView=b.dataset.view;render()}};
$('search').oninput=()=>render();
render();

/* Himawari fair workflow: additive migration, preserving user edits. */
function addHimawariSchedule(){
 const migration='himawari-fair-workflow-v1';
 if((data.appliedUpdates||[]).includes(migration))return;
 const next=structuredClone(data);
 const fairs=[
 {key:'spring',name:'春フェア',months:[2,3,3],periods:['2月中旬〜3月中旬ごろ','3月中旬〜下旬ごろ','3月下旬ごろから']},
 {key:'summer',name:'夏フェア',months:[5,6,7],periods:['5月末〜6月末ごろ','6月末〜7月上旬ごろ','7月上旬〜中旬ごろから']},
 {key:'autumn',name:'秋フェア',months:[8,9,10],periods:['8月下旬〜9月下旬ごろ','9月下旬〜10月上旬ごろ','10月上旬ごろから']},
 {key:'winter',name:'冬フェア',months:[10,11,12],periods:['10月末〜11月末ごろ','11月末〜12月上旬ごろ','12月上旬〜中旬ごろから']}
 ];
 const stages=[
 {name:'招待状作成＆配布',relative:'イベント前の4週間',details:'イベント前の4週間は、招待状の作成と配布を行う。'},
 {name:'片付け＆お礼ハガキ',relative:'イベント終了後の1週間',details:'イベント終了後の1週間は、片付けとお礼ハガキの作成・発送を行う。'},
 {name:'通常訪問＆未来店記念品',relative:'イベント終了後の2週目から',details:'イベント終了後の2週目から、通常訪問と未来店記念品のお届けを行う。'}
 ];
 for(const fair of fairs)for(const [i,stage] of stages.entries()){
 const id='himawari-'+fair.key+'-'+i;
 if(next.events.some(e=>e.id===id))continue;
 next.events.push({id,title:fair.name+'｜'+stage.name,month:fair.months[i],category:4,timing:stage.relative+'（'+fair.periods[i]+'・目安）',repeat:'annual',years:{},details:stage.details,notes:'対象：'+fair.name+'。月は開始時期の目安です。正確な日付はフェアの開催日・終了日が決まり次第入力してください。開催日を変更しても自動では連動しません。'});
 }
 next.appliedUpdates=[...(next.appliedUpdates||[]),migration];
 if(!persist(next))data=next;
}
addHimawariSchedule();
render();

/* A3 landscape print and category palette */
const categoryTints=['#e3f1e7','#fff2d3','#e3f2fa','#eee7fa','#fff0d9','#fbe6ed','#ddf3ef','#e3ebff'];
const categoryInks=['#24593b','#79550e','#235c7a','#60418a','#89510f','#843e59','#176d63','#2f5091'];
const printArea=document.createElement('section');printArea.id='print-area';document.body.append(printArea);
const printTools=document.createElement('div');printTools.className='print-tools';
printTools.innerHTML='<button id="print-a3">A3横 印刷プレビュー</button><span>区分ごとの色分け・年間一覧を印刷</span>';
viewControls.after(printTools);
const legend=document.createElement('div');legend.className='color-legend';
legend.innerHTML=cats.map((c,i)=>'<span style="--tint:'+categoryTints[i]+';--ink:'+categoryInks[i]+'">'+c+'</span>').join('');
printTools.after(legend);
const colorBaseRender=render;
render=function(){colorBaseRender();document.querySelectorAll('#months [data-id]').forEach(b=>{
 const e=data.events.find(e=>e.id===b.dataset.id);if(!e)return;
 b.style.setProperty('--accent',categoryInks[e.category]);b.style.background=categoryTints[e.category];b.style.color=categoryInks[e.category];
});
document.querySelectorAll('.year-table tbody tr').forEach(tr=>{
 const idx=cats.indexOf(tr.querySelector('th')?.textContent);if(idx<0)return;
 tr.querySelector('th').style.background=categoryTints[idx];tr.querySelector('th').style.color=categoryInks[idx];
});
document.querySelectorAll('.year-table thead th').forEach((th,i)=>{if(i>0&&i<13)th.style.background=i>=3&&i<=5?'#e5f0d8':i>=6&&i<=8?'#dff1f7':i>=9&&i<=11?'#f9e8d3':'#e9e7f6'});
};
function buildPrintSheet(){
 const q=$('search').value.trim().toLowerCase();
 const entries=data.events.filter(e=>matchesStrategy(e)&&(e.repeat==='annual'||e.year===year)).map(effective).filter(e=>(category==='all'||e.category===category)&&JSON.stringify(e).toLowerCase().includes(q));
 const months=[...Array.from({length:12},(_,i)=>i+1),0];
 const rows=cats.map((c,i)=>({c,i})).filter(r=>category==='all'||category===r.i);
 printArea.innerHTML='<div class="print-actions"><button id="print-now" class="primary">印刷する</button><button id="print-close">一覧に戻る</button><span>用紙：A3 ／ 横向き ／ 倍率：100% ／ 背景のグラフィック：オン ／ ヘッダーとフッター：オフ</span></div><article class="print-paper"><div class="print-heading"><div><small>ヤハタデンキ · 年間計画</small><h1>'+year+'年 年間スケジュール</h1></div><p>'+esc(category==='all'?'全8区分':cats[category])+' · '+entries.length+'件'+(q?' ／ 検索：'+esc($('search').value):'')+'</p></div>'+legend.outerHTML+'<table class="print-table"><thead><tr><th scope="col">担当区分</th>'+months.map(m=>'<th scope="col" class="season-'+(m>=3&&m<=5?'spring':m>=6&&m<=8?'summer':m>=9&&m<=11?'autumn':m?'winter':'none')+'">'+(m?m+'月':'時期未定')+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr style="--tint:'+categoryTints[r.i]+';--ink:'+categoryInks[r.i]+'"><th scope="row">'+r.c+'</th>'+months.map(m=>'<td>'+entries.filter(e=>e.category===r.i&&monthIncludes(e,m)).map(e=>'<div class="print-event"><b>'+esc(e.title)+'</b><small>'+esc(shortPrintRange(e))+'</small>'+((e.copies!==undefined&&e.copies!=='')?'<small>部数：'+esc(e.copies)+'</small>':'')+(e.gift?'<small>記念品：'+esc(e.gift)+'</small>':'')+'</div>').join('')+'</td>').join('')+'</tr>').join('')+'</tbody></table><p class="print-note">フェア日程は仮設定です。通常訪問は次の招待状配布開始前日までを目安に表示。ひまわりスタッフ：フェア前20稼働日＝招待状作成＆配布 ／ 終了後最初の1稼働日＝片付け ／ 片付け後〜次の招待状配布開始前日＝通常訪問・お礼ハガキ・未来店記念品。<br>予定が増えて1枚に収まらない場合は、印刷画面で倍率を調整するか担当区分を絞って印刷してください。</p></article>';
 $('print-now').onclick=()=>window.print();
 $('print-close').onclick=()=>{document.body.classList.remove('print-preview');$('print-a3').focus()};
}
$('print-a3').onclick=()=>{buildPrintSheet();document.body.classList.add('print-preview');window.scrollTo(0,0);$('print-now').focus()};
window.addEventListener('beforeprint',buildPrintSheet);
document.addEventListener('keydown',e=>{if(e.key==='Escape')document.body.classList.remove('print-preview')});
$('search').oninput=()=>render();
render();

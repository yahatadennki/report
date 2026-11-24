
const fairRules=[
 {key:'spring',title:'春フェア',m:3,kind:'mid',days:2},
 {key:'summer',title:'夏フェア',m:6,kind:'last',days:3},
 {key:'autumn',title:'秋フェア・芋煮会',m:9,kind:'last',days:2},
 {key:'winter',title:'パナソニック冬フェア',m:11,kind:'last',days:3}
];
function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function shift(s,n){const d=new Date(s+'T12:00:00');d.setDate(d.getDate()+n);return iso(d)}
function fairDates(rule,y){
 let end;
 if(rule.kind==='mid'){const d=new Date(y,2,15,12);d.setDate(d.getDate()-((d.getDay()+1)%7));return {start:iso(d),end:iso(new Date(y,2,d.getDate()+1,12))}}
 end=new Date(y,rule.m,0,12);end.setDate(end.getDate()-end.getDay());
 return {start:shift(iso(end),1-rule.days),end:iso(end)};
}
function resolvedFair(rule){
 const fair=data.events.find(e=>e.category===0&&(e.fairKey===rule.key||e.title===rule.title));
 const saved=fair?.years?.[year]||{};
 if(saved.start&&saved.dateMode!=='auto')return {start:saved.start,end:saved.end||saved.start,manual:true};
 return {...fairDates(rule,year),manual:false};
}
const oldEffective=effective;
effective=function(e){
 const v=oldEffective(e),saved=e.years[year]||{};
 const rule=fairRules.find(r=>e.fairKey===r.key||(e.category===0&&e.title===r.title));
 const staff=/^himawari-(spring|summer|autumn|winter)-([012])$/.exec(e.id);
 if(staff&&staff[2]==='2'){v.timing='片付け後〜次の招待状作成＆配布開始前日';v.details=(v.details||'').replace('イベント終了後の2週目から、','フェア翌日から次の招待状作成＆配布開始前日まで、');}
const linked=rule||staff||e.campaignRange;
 if(!linked)return v;
 if(saved.start&&saved.dateMode!=='auto')return {...v,dateMode:'manual'};
 let dates,label;
 if(rule){dates=resolvedFair(rule);label=dates.manual?'手動設定':'仮日程（曜日から自動計算）'}
 else if(staff){
 const r=fairRules.find(r=>r.key===staff[1]),f=resolvedFair(r),stage=+staff[2];
 if(stage===0){dates={start:backWorkday(f.start,20),end:backWorkday(f.start)};v.timing='フェア前20稼働日（水土日・祝日を除く）';v.details='20稼働日で招待状作成＆配布。水・土・日・祝日は休み。';}
 if(stage===1){const d=nextWorkday(f.end);dates={start:d,end:d};v.title=v.title.replace('片付け＆お礼ハガキ','片付け');v.timing='フェア後の最初の1稼働日';v.details='片付け1稼働日。お礼ハガキは通常訪問期間に実施。';}
 if(stage===2){
 const idx=fairRules.indexOf(r),nextRule=fairRules[(idx+1)%4];
 const next=idx===3?fairDates(nextRule,year+1):resolvedFair(nextRule);
 dates={start:nextWorkday(f.end)?nextWorkday(nextWorkday(f.end)):null,end:backWorkday(next.start,20)?backWorkday(backWorkday(next.start,20)):null};
 }
 if(!dates.start||!dates.end)return {...v,start:'',end:'',month:0,timing:'祝日データ未収録のため日付未確定',dateMode:'auto'};label='フェアに自動連動'+(f.manual?'':'（仮日程）');
 }else{dates={start:year+'-'+String(e.campaignRange[0]).padStart(2,'0')+'-01',end:iso(new Date(year,e.campaignRange[1],0,12))};label='毎年の指定期間'}
 return {...v,...dates,month:+dates.start.slice(5,7),dateMode:'auto',timing:label+' ／ '+v.timing,notes:(v.notes||'').replace('開催日を変更しても自動では連動しません。','')+'\n日付：'+label+(staff&&staff[2]==='2'?'。通常訪問は次のフェアの招待状期間の前日までを表示。':'')};
};
function addCampaigns(){
 const marker='campaign-aircon-v1';if((data.appliedUpdates||[]).includes(marker))return;
 const next=structuredClone(data);
 const seeds=[
 ['campaign-recycler','リサイクラー',6,10,11,'10〜11月のキャンペーン'],
 ['campaign-meitokukai','明德会',6,2,4,'2〜4月のキャンペーン'],
 ['aircon-super-early','超早期取付｜工事費無料',7,1,3,'エアコン超早期取付：工事費無料'],
 ['aircon-early','早期取付｜工事費半額',7,4,6,'エアコン早期取付：工事費半額'],
 ['aircon-clearance','在庫一掃セール｜15%引き',7,10,12,'エアコン在庫一掃セール：15%引き']
 ];
 for(const [id,title,cat,start,end,details]of seeds)if(!next.events.some(e=>e.id===id))next.events.push({id,title,category:cat,month:start,campaignRange:[start,end],repeat:'annual',years:{},timing:start+'〜'+end+'月',details});
 for(const r of fairRules){const e=next.events.find(e=>e.category===0&&e.title===r.title);if(e)e.fairKey=r.key}
 next.appliedUpdates=[...(next.appliedUpdates||[]),marker];if(!persist(next))data=next;
}
addCampaigns();
const dateControl=document.createElement('label');dateControl.className='wide';dateControl.innerHTML='日付の設定<select name="dateMode"><option value="auto">自動（フェア・指定期間に連動）</option><option value="manual">手動で指定</option></select><small>春・秋は土日、夏・冬は月末の金土日を仮設定。日付を直接変更すると手動になります。</small>';
form.querySelector('.fields').append(dateControl);
form.elements.start.oninput=form.elements.end.oninput=()=>{form.elements.dateMode.value='manual'};
const dateOpenEditor=openEditor;
openEditor=function(id){dateOpenEditor(id);const e=data.events.find(x=>x.id===id);const auto=e&&(e.fairKey||fairRules.some(r=>r.title===e.title&&e.category===0)||/^himawari-/.test(e.id)||e.campaignRange);dateControl.hidden=!auto;if(!auto)form.elements.dateMode.value='manual'};
const calendarButton=document.createElement('button');calendarButton.dataset.view='calendar';calendarButton.textContent='月間カレンダー';document.querySelector('.view-tabs').append(calendarButton);
const monthPicker=document.createElement('select');monthPicker.id='calendar-month';monthPicker.setAttribute('aria-label','カレンダーの月');monthPicker.innerHTML=Array.from({length:12},(_,i)=>'<option value="'+(i+1)+'">'+(i+1)+'月</option>').join('');monthPicker.value=String(new Date().getMonth()+1);monthPicker.onchange=()=>render();viewControls.append(monthPicker);
const calendarRender=render;
render=function(){
 calendarRender();monthPicker.hidden=scheduleView!=='calendar';
 if(scheduleView!=='calendar')return;
 $('view-help').textContent='日付を選ぶと予定を追加。予定名を押すと編集できます。';
 const m=+monthPicker.value,q=$('search').value.trim().toLowerCase();
 const events=data.events.filter(e=>matchesStrategy(e)&&(e.repeat==='annual'||e.year===year)).map(effective).filter(e=>(category==='all'||e.category===category)&&JSON.stringify(e).toLowerCase().includes(q));
 const start=new Date(year,m-1,1,12),offset=start.getDay(),count=new Date(year,m,0,12).getDate();
 let html='<div class="table-scroll"><table class="calendar-table"><caption>'+year+'年 '+m+'月</caption><thead><tr>'+['日','月','火','水','木','金','土'].map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>';
 for(let i=0;i<Math.ceil((count+offset)/7)*7;i++){if(i%7===0)html+='<tr>';const d=i-offset+1;if(d<1||d>count)html+='<td class="outside"></td>';else{const date=iso(new Date(year,m-1,d,12));html+='<td><button class="day-add" data-day="'+date+'">'+d+'</button>'+events.filter(e=>e.start&&e.start<=date&&(e.end||e.start)>=date&&(e.category!==4||isHimawariWorkday(date))).map(e=>'<button class="cal-event" data-id="'+esc(e.id)+'" style="background:'+categoryTints[e.category]+';color:'+categoryInks[e.category]+'">'+esc(e.title)+'</button>').join('')+'</td>'}if(i%7===6)html+='</tr>'}
 $('months').innerHTML=html+'</tbody></table></div><p class="foot">具体的な日付が未入力の予定は年間一覧で確認できます。仮日程を含みます。</p>';
};
const dateClick=$('months').onclick;$('months').onclick=e=>{const b=e.target.closest('[data-day]');if(b){openEditor();form.elements.start.value=b.dataset.day;form.elements.end.value=b.dataset.day;form.elements.month.value=+b.dataset.day.slice(5,7);form.elements.dateMode.value='manual'}else dateClick(e)};
$('search').oninput=()=>render();
const foot=document.querySelector('main>.foot');if(foot)foot.textContent='フェアは曜日に合わせた仮日程です。日付変更でひまわりスタッフの期間も連動します。期間のある予定は該当する各月に表示されます。';
render();

$('year').oninput=()=>{const raw=$('year').value,n=Number(raw);if(/^\d{4}$/.test(raw)&&n>=2000&&n<=2100){year=n;render()}};
$('year').onchange=()=>{const n=Number($('year').value);if(Number.isInteger(n)&&n>=2000&&n<=2100){year=n;render()}else $('year').value=year};
let printCategory='all';
const buildScopedPrint=buildPrintSheet;
buildPrintSheet=function(){
 const original=category;category=printCategory;
 try{buildScopedPrint()}finally{category=original}
 printArea.querySelector('.print-paper').classList.toggle('single-category',printCategory!=='all');if(printCategory!=='all')printArea.querySelectorAll('.color-legend span').forEach((s,i)=>{if(i!==printCategory)s.remove()});const label=document.createElement('label');label.className='print-target-label';label.textContent='印刷する項目';
 const select=document.createElement('select');select.setAttribute('aria-label','印刷する項目');
 select.innerHTML='<option value="all">すべての項目</option>'+cats.map((c,i)=>'<option value="'+i+'">'+c+'</option>').join('');
 select.value=String(printCategory);select.onchange=()=>{printCategory=select.value==='all'?'all':+select.value;buildPrintSheet()};
 label.append(select);printArea.querySelector('.print-actions').prepend(label);
 const note=document.createElement('p');note.className='print-note';note.textContent='ひまわりスタッフ：水・土・日・祝日休み。フェア当日を含めず20稼働日前から準備。祝日データ：2026・2027年（内閣府）。';printArea.querySelector('.print-paper').append(note);
};
window.removeEventListener('beforeprint',buildScopedPrint);
window.addEventListener('beforeprint',()=>{if(!document.body.classList.contains('print-preview'))printCategory=category;buildPrintSheet()});
$('print-a3').onclick=()=>{printCategory=category;buildPrintSheet();document.body.classList.add('print-preview');window.scrollTo(0,0);$('print-now').focus()};
const workdayRender=render;
render=function(){workdayRender();const n=document.querySelector('main>.foot');if(n)n.textContent='ひまわりスタッフ：水・土・日・祝日は休み。準備開始はフェア前20稼働日から。祝日データは2026・2027年対応。未収録の年にまたがる自動計算は時期未定。フェア日程は仮設定です。'};
$('search').oninput=()=>render();render();

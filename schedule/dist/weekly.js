
function monthWeeks(y,m){
 const last=new Date(y,m,0).getDate(),out=[];let day=1;
 while(day<=last){const start=iso(new Date(y,m-1,day,12)),dow=new Date(start+'T12:00:00').getDay();const endDay=Math.min(last,day+(7-dow)%7);out.push({start,end:iso(new Date(y,m-1,endDay,12))});day=endDay+1}return out;
}
function weeklyEntries(cat){
 const q=$('search').value.trim().toLowerCase();
 return data.events.filter(e=>matchesStrategy(e)&&(e.repeat==='annual'||e.year===year)).map(effective).filter(e=>e.category===cat&&JSON.stringify(e).toLowerCase().includes(q));
}
function weekOverlap(e,w){
 if(!e.start||e.start>w.end||(e.end||e.start)<w.start)return 0;
 let count=0;for(let d=e.start>w.start?e.start:w.start;d<=w.end&&d<=(e.end||e.start);d=shift(d,1))if(e.category!==4||isHimawariWorkday(d))count++;
 return count;
}
function weeklyTable(cat,print=false){
 const entries=weeklyEntries(cat);
 const item=(e,count)=>print?'<div class="weekly-item"><b>'+esc(e.title)+'</b>'+(cat===4&&count?'<small>稼働'+count+'日</small>':'')+'</div>':'<button class="weekly-item" data-id="'+esc(e.id)+'"><b>'+esc(e.title)+'</b>'+(cat===4&&count?'<small>稼働'+count+'日</small>':'')+'</button>';
 let out='<table class="weekly-table" style="--tint:'+categoryTints[cat]+';--ink:'+categoryInks[cat]+'"><caption>'+year+'年 '+cats[cat]+'｜週単位スケジュール</caption><thead><tr><th scope="col">月</th>'+[1,2,3,4,5,6].map(w=>'<th scope="col">第'+w+'週</th>').join('')+'<th scope="col">日付未定</th></tr></thead><tbody>';
 for(let m=1;m<=12;m++){
 const weeks=monthWeeks(year,m);
 out+='<tr><th scope="row">'+m+'月</th>'+Array.from({length:6},(_,i)=>{
 const w=weeks[i];if(!w)return '<td class="no-week">—</td>';
 const events=entries.map(e=>({e,count:weekOverlap(e,w)})).filter(o=>o.count>0);
 return '<td><span class="week-range">'+m+'/'+Number(w.start.slice(8))+'〜'+m+'/'+Number(w.end.slice(8))+'</span>'+events.map(o=>item(o.e,o.count)).join('')+'</td>'
 }).join('')+'<td>'+entries.filter(e=>!e.start&&e.month===m).map(e=>item(e,0)).join('')+'</td></tr>';
 }
 out+='</tbody></table>';
 const undated=entries.filter(e=>!e.start&&!e.month);
 if(undated.length)out+='<div class="weekly-undated"><b>時期未定</b>'+undated.map(e=>item(e,0)).join('')+'</div>';
 return out;
}
const weeklyBaseRender=render;
render=function(){
 weeklyBaseRender();
 const button=document.querySelector('[data-view="year"]');button.textContent=category==='all'?'月単位一覧':'週単位一覧';
 if(category==='all'||scheduleView!=='year')return;
 $('view-help').textContent='月曜〜日曜で区切り、月境界は分割。予定名を押すと編集できます。';
 $('months').innerHTML='<div class="table-scroll">'+weeklyTable(category)+'</div>';
 $('months').classList.add('table-view');
};
$('nav').onclick=e=>{const b=e.target.closest('[data-cat]');if(b){category=+b.dataset.cat<0?'all':+b.dataset.cat;scheduleView='year';render()}};
const monthlyPrint=buildPrintSheet;
buildPrintSheet=function(){
 monthlyPrint();
 if(printCategory==='all')return;
 const paper=printArea.querySelector('.print-paper');
 paper.classList.add('weekly-paper');
 paper.querySelector('h1').textContent=year+'年 '+cats[printCategory]+' 週間計画';
 const oldTable=paper.querySelector('.print-table');
 oldTable.outerHTML=weeklyTable(printCategory,true);
 const guide=document.createElement('p');guide.className='print-note';guide.textContent='週は月曜〜日曜。月をまたぐ週は月境界で分割表示しています。日付未定の予定は別欄に表示。ひまわりスタッフの稼働日数は水・土・日・祝日を除外。';
 paper.querySelector('.print-heading').after(guide);
};
$('search').oninput=()=>render();
render();

const periodLabel=document.createElement('label');periodLabel.className='period-picker';periodLabel.textContent='確認する月';
const periodSelect=document.createElement('select');periodSelect.setAttribute('aria-label','確認する月');periodSelect.innerHTML='<option value="0">年間（週単位）</option>'+Array.from({length:12},(_,i)=>'<option value="'+(i+1)+'">'+(i+1)+'月（日単位）</option>').join('');
periodLabel.append(periodSelect);viewControls.append(periodLabel);
periodSelect.onchange=()=>{const m=+periodSelect.value;if(m){monthPicker.value=String(m);scheduleView='calendar'}else scheduleView='year';render()};
const drilldownRender=render;
render=function(){
 drilldownRender();periodLabel.hidden=category==='all';
 if(category!=='all'){monthPicker.hidden=true;periodSelect.value=scheduleView==='calendar'?monthPicker.value:'0'}
 if(scheduleView==='calendar'&&category===4){
 $('view-help').textContent='日単位の予定。水・土・日・祝日は休み。予定を押すと詳細を確認できます。';
 document.querySelectorAll('.calendar-table [data-day]').forEach(b=>{
 const date=b.dataset.day,td=b.closest('td');
 if(!isHimawariWorkday(date)){td.classList.add('himawari-off');const badge=document.createElement('span');badge.className='rest-badge';badge.textContent=japanHolidays.has(date)?'祝日・休み':'休み';b.after(badge)}
 else if(!td.querySelector('.cal-event')){const text=document.createElement('span');text.className='day-empty';text.textContent='予定未登録';td.append(text)}
 });
 }
};
const drilldownNav=$('nav').onclick;
$('nav').onclick=e=>{if(e.target.closest('[data-cat]'))periodSelect.value='0';drilldownNav(e)};
$('search').oninput=()=>render();
render();

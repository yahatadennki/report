const strategyPersist=persist;
persist=function(next){return strategyPersist(migrateStrategies(next))};
const migrated=migrateStrategies(data);
if(migrated!==data)persist(migrated);

const strategyEffective=effective;
effective=function(e){
 const v=strategyEffective(e),saved=e.years?.[year]||{};
 if(!e.strategyDateLink||(saved.start&&saved.dateMode!=='auto'))return v;
 let start,end;
 if(e.strategyDateLink==='winter-prep'){
  const f=resolvedFair(fairRules[3]);start=backWorkday(f.start,20);end=backWorkday(f.start);
 }else if(e.strategyDateLink==='year-start'){
  const f=resolvedFair(fairRules[0]),prep=backWorkday(f.start,20);
  start=nextWorkday((year-1)+'-12-31');end=prep?backWorkday(prep):null;
 }
 return {...v,start:start||'',end:end||'',month:start?+start.slice(5,7):0,dateMode:'auto',timing:start&&end?'フェアに自動連動（店舗独自休業は未反映）':'祝日データ未収録のため日付未確定'};
};

const strategyPanel=document.createElement('section');strategyPanel.id='strategy-panel';
document.querySelector('.overview').before(strategyPanel);
function renderStrategyPanel(){
 const chosen=strategies.find(s=>s.id===selectedStrategy);
 const results=data.strategyResults?.[year]||{};
 const count=id=>data.events.filter(e=>(e.repeat==='annual'||e.year===year)&&strategyIds(e).includes(id)).length;
 strategyPanel.innerHTML='<div class="strategy-heading"><div><p class="eyebrow">目的から、年間の行動へ</p><h2>6つの戦略と年間計画</h2></div><button data-strategy="all" aria-pressed="'+(selectedStrategy==='all')+'">すべての戦略</button></div><div class="strategy-grid">'+strategies.map(s=>{
  const result=results[s.id],value=result==null||result===''?'実績未入力':esc(result)+s.unit;
  return '<button class="strategy-card '+(selectedStrategy===s.id?'selected':'')+'" data-strategy="'+s.id+'" aria-pressed="'+(selectedStrategy===s.id)+'"><span>'+s.name+'</span><strong>'+s.goal+'</strong><small>'+count(s.id)+'件の関連予定'+(s.metric?' ／ '+value:'')+'</small></button>';
 }).join('')+'</div>'+(chosen?'<article class="strategy-detail"><div><h3>'+chosen.name+'戦略</h3><p class="strategy-purpose">'+chosen.purpose+'</p><p>'+chosen.plan+'</p><p class="muted">'+chosen.detail+'</p></div>'+(chosen.metric?'<form id="strategy-result-form"><label>'+year+'年 '+chosen.metric+'（'+chosen.unit+'）<input name="result" type="number" min="0" step="1" placeholder="未入力" value="'+esc(results[chosen.id]??'')+'"></label><button type="submit">実績を保存</button><small>年間累計を入力。予定ごとの数値とは合算しません。</small></form>':'')+'</article>':'<p class="strategy-guide">戦略を選ぶと、下の予定一覧も連動します。担当区分・月と組み合わせて確認できます。</p>');
 const resultForm=$('strategy-result-form');
 if(resultForm)resultForm.onsubmit=e=>{
  e.preventDefault();const raw=resultForm.elements.result.value;
  if(raw!==''&&(!Number.isSafeInteger(Number(raw))||Number(raw)<0))return;
  const next=structuredClone(data);next.strategyResults??={};next.strategyResults[year]??={};next.strategyResults[year][chosen.id]=raw===''?null:Number(raw);
  if(persist(next)){render();toast('年間実績を保存しました')}
 };
}
strategyPanel.onclick=e=>{const b=e.target.closest('[data-strategy]');if(!b)return;selectedStrategy=b.dataset.strategy;category='all';scheduleView='year';render()};

const strategyFields=document.createElement('fieldset');strategyFields.className='wide strategy-fields';
strategyFields.innerHTML='<legend>関連する戦略（複数選択可）</legend>'+strategies.map(s=>'<label><input type="checkbox" name="strategyIds" value="'+s.id+'">'+s.name+'</label>').join('')+'<p id="event-purpose" class="muted"></p>';
form.querySelector('.fields').prepend(strategyFields);
function showEventPurpose(){const ids=[...strategyFields.querySelectorAll('input:checked')].map(i=>i.value);$('event-purpose').textContent=strategies.filter(s=>ids.includes(s.id)).map(s=>s.name+'：'+s.purpose).join(' ／ ')}
strategyFields.onchange=showEventPurpose;
const strategyOpenEditor=openEditor;
openEditor=function(id){
 strategyOpenEditor(id);const e=data.events.find(e=>e.id===id);
 const ids=e?strategyIds(e):selectedStrategy==='all'?[]:[selectedStrategy];
 strategyFields.querySelectorAll('input').forEach(i=>{i.checked=ids.includes(i.value)});showEventPurpose();
 if(e?.strategyDateLink){dateControl.hidden=false;form.elements.dateMode.value=e.years?.[year]?.dateMode||'auto';}
};
const strategyRender=render;
render=function(){
 strategyRender();renderStrategyPanel();
 const chosen=strategies.find(s=>s.id===selectedStrategy);
 if(chosen)$('section').textContent=chosen.name+'戦略 ／ '+(category==='all'?'すべての担当':cats[category]);
 document.querySelectorAll('#months [data-id]').forEach(b=>{
  const e=data.events.find(e=>e.id===b.dataset.id);if(!e)return;
  const names=strategies.filter(s=>strategyIds(e).includes(s.id)).map(s=>s.name);
  if(!names.length)return;
  const tag=document.createElement('span');tag.className='strategy-tags';tag.textContent=names.join('・');b.append(tag);
 });
};
const strategyPrint=buildPrintSheet;
buildPrintSheet=function(){strategyPrint();
 if(printCategory==='all'){
  const table=printArea.querySelector('.print-table'),items=[];
  table?.querySelectorAll('tbody tr').forEach(row=>{const cell=row.lastElementChild;cell.querySelectorAll('.print-event').forEach(event=>{const item=document.createElement('div');item.className='print-undated-item';item.textContent=row.firstElementChild.textContent+'｜'+event.innerText.replace(/\n/g,' ');items.push(item)});cell.remove()});
  table?.querySelector('thead tr')?.lastElementChild.remove();
  if(items.length){const section=document.createElement('section');section.className='print-undated';const title=document.createElement('b');title.textContent='時期未定（決まり次第、各予定で日付を設定）';section.append(title,...items);table.after(section)}
 }
 const s=strategies.find(s=>s.id===selectedStrategy);if(s){const note=document.createElement('p');note.className='print-note strategy-print-note';note.textContent='戦略：'+s.name+' ｜ 目的：'+s.purpose;printArea.querySelector('.print-heading').after(note)}};
$('search').oninput=()=>render();render();

/* Carry the selected calendar context and resolved fair dates across the two sites. */
(()=>{
 const base='https://yahata-flyer-library.yahatadennki.chatgpt.site/';
 const make=(id='')=>{const month=Number(document.getElementById('calendar-month')?.value)||new Date().getMonth()+1;const fairs=fairRules.map(r=>({...resolvedFair(r),title:r.title,month:r.m,note:resolvedFair(r).manual?'スケジュールで設定した日程':'曜日からの仮日程'}));return base+'?year='+year+'&month='+month+(id?'&item='+id:'')+'#plan='+encodeURIComponent(JSON.stringify({year,fairs}));};
 document.querySelectorAll('a[href^="'+base+'"]').forEach(a=>{a.className='library-link';a.innerHTML='<span>▧ チラシ・かわらばん</span><small>紙面と使う時期を見る →</small>';a.onclick=()=>{a.href=make()}});
 const related=document.createElement('a');related.className='library-related';related.textContent='この予定の配布物を見る →';document.querySelector('#dialog .modal-actions').prepend(related);
 const original=openEditor;openEditor=function(id){original(id);const title=form.elements.title.value;const type=/かわらばん/.test(title)?'newsletter':/フェア|招待状/.test(title)?'fair':/エアコン|取付/.test(title)?'aircon':/リサイクラー/.test(title)?'recycler':/ごぶさた|年賀/.test(title)?'return-postcard':null;related.hidden=!type;const target=new URL(make(type||''));const m=Number(form.elements.month.value);if(m>=1&&m<=12)target.searchParams.set('month',m);related.href=target.href};
 const q=new URLSearchParams(location.search),y=Number(q.get('year')),m=Number(q.get('month'));if(Number.isInteger(y)&&y>=2000&&y<=2100&&m>=1&&m<=12){year=y;$('year').value=y;category='all';scheduleView='calendar';monthPicker.value=String(m);render();}
})();

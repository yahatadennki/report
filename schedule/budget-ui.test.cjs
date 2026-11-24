const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const nodes=new Map();function node(id){if(!nodes.has(id))nodes.set(id,{value:id==='period'?'annual':'',innerHTML:'',textContent:'',hidden:false,open:false,style:{},selectedOptions:[{textContent:'年度全体'}],addEventListener(){},append(){},showModal(){this.open=true},close(){this.open=false}});return nodes.get(id)}
let saved=JSON.stringify({version:1,events:[{id:'fair',title:'冬フェア <確認>',month:11,repeat:'annual',years:{}}]});
const ctx={console,Date,Intl,URLSearchParams,structuredClone,location:{search:'?fy=2026'},localStorage:{getItem:()=>saved,setItem:(k,v)=>{saved=v}},document:{getElementById:node,createElement:()=>node('option'),querySelector:()=>null,body:{classList:{add(){},remove(){}}}},window:{addEventListener(){},scrollTo(){}},setTimeout(){},alert:s=>{throw Error(s)},confirm:()=>true};vm.createContext(ctx);vm.runInContext(fs.readFileSync('dist/budget-core.js','utf8')+'\n'+fs.readFileSync('dist/budget.js','utf8'),ctx);
assert(node('activity-list').innerHTML.includes('冬フェア &lt;確認&gt;'));
vm.runInContext("openBudget('fair@2026')",ctx);assert(node('editor').open);assert(node('cost-lines').innerHTML.includes('焼きそば'));
vm.runInContext("draft.lines=[{name:'焼きそば',price:150,quantity:100,times:1,actual:14000,area:'',memo:''}];",ctx);
node('cost-period').value='2026-11';node('activity-goal').value='来店100人';node('activity-result').value='次回は量を調整';node('activity-action').value='担当を決める';
// Simulate another tab editing an unrelated schedule before this tab saves its budget.
const latest=JSON.parse(saved);latest.events.push({id:'new',title:'別の予定',month:12,repeat:'annual',years:{}});saved=JSON.stringify(latest);
node('budget-form').onsubmit({preventDefault(){}});const result=JSON.parse(saved);assert.equal(result.events.length,2);assert.equal(result.budgets['fair@2026'].lines[0].actual,14000);assert(!node('editor').open);
node('meeting-review').value='配布費を確認';node('meeting-actions').value='来月発注';node('save-meeting').onclick();assert.equal(JSON.parse(saved).budgetMeetings['2026:annual'].actions,'来月発注');node('preview').onclick();assert(node('report-body').innerHTML.includes('15,000 円'));assert(node('report-body').innerHTML.includes('14,000 円'));assert(node('report-body').innerHTML.includes('来月発注'));assert(!node('report-body').innerHTML.includes('<確認>'));
console.log('Passed: budget editor, save without overwriting other schedules, meeting memo persistence, escaped report and totals');
const shared={version:1,events:[],budgets:{one:{lines:[]}}};let latestSaved={...shared,budgets:{newer:{lines:[]}}};
const bridge={data:shared,key:'key',year:2026,localStorage:{getItem:()=>JSON.stringify(latestSaved)},document:{createElement:()=>({}),querySelector:()=>({before(){},prepend(){}}),querySelectorAll:()=>[]},window:{addEventListener(){}},render(){},openEditor(){},effective:x=>x,valid:()=>true};
bridge.persist=next=>{latestSaved=next;bridge.data=next;return true};vm.createContext(bridge);vm.runInContext(fs.readFileSync('dist/budget-bridge.js','utf8'),bridge);
bridge.persist(structuredClone(shared));assert(latestSaved.budgets.newer,'Preserve budget saved by the other tab');
bridge.persist({version:1,events:[],budgets:{restored:{lines:[]}}});assert(latestSaved.budgets.restored,'Honor explicitly restored backup budgets');
console.log('Passed: calendar writes preserve latest budgets; backup import can replace them');
// Amounts typed with commas, full-width digits or 円 are stored as plain numbers.
vm.runInContext("openBudget('fair@2026')",ctx);
const typed=(field,value)=>{const target={value,dataset:{field},classList:{toggle(){}},closest:()=>({dataset:{line:'0'}})};node('cost-lines').oninput({target});return vm.runInContext('draft.lines[0].'+field,ctx)};
assert.equal(typed('price','1,500'),'1500');assert.equal(typed('quantity','１２０'),'120');assert.equal(typed('actual','14,000円'),'14000');assert.equal(typed('memo','1,500'),'1,500');
console.log('Passed: comma / full-width / 円 amount input');

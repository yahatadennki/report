/* Strategy is independent of staff category. Existing backups remain version 1. */
let selectedStrategy='all';
const strategies=[
 {id:'calendar',name:'カレンダー',purpose:'全顧客がいつでも電話番号を確認できるように。目にする機会を増やす。',goal:'全顧客へ接点をつくる',plan:'8月発注。できること1,650部＋パナソニック350部。Aランクには両方。',detail:'冬の招待状に1,100部（Aランク含む）／Cランク・ごぶさたへ350部をかわらばんと郵送／翌年の新規用200部。パナソニック350部はひまわりがAランクへ手渡し。'},
 {id:'aircon',name:'エアコン',purpose:'年間を通じた販売とエアコン点検で、お客様に安心を提供する。',goal:'年間120台以上',metric:'販売実績',unit:'台',target:120,plan:'1〜3月：工事費無料／4〜6月：工事費半額／10〜12月：15%引き。',detail:'販売企画と点検を年間予定に連動。点検は「面倒見」にも関連づけます。'},
 {id:'newsletter',name:'かわらばん',purpose:'地域のお客様との接点を増やし、新規顧客につなげる。',goal:'年間新規顧客200件増',metric:'新規顧客増の実績',unit:'件',target:200,plan:'4・7・10・1月、毎号20,000部。年間80,000部。',detail:'稲毛区・花見川区で毎号10,000部、中央区で毎号10,000部。発行に合わせて掲載内容・制作・配布を組みます。カレンダー同封350部がこの部数に含まれるかは未確認。'},
 {id:'care',name:'面倒見',purpose:'とことん面倒を見る。購入後も困ったときも頼れるお店に。',goal:'点検・訪問で安心を届ける',plan:'サービス：エアコン点検、1・5・7年保証切れ点検。',detail:'ひまわり：定期訪問、お買い上げ後訪問、招待状、未来店客記念品。訪問時期はフェアに合わせて調整。'},
 {id:'fair',name:'イベント（フェア）',purpose:'おもてなしと訪問のきっかけをつくり、お店にメリハリと盛り上がりを。',goal:'春・夏・秋・冬の年4回',plan:'春3月／夏6月／秋9月／冬11月。準備は20稼働日前から。',detail:'課題：マンネリ化、来場者の固定化、遠方からの来店の難しさ。改善案を各フェアの企画・振り返りに記録。片付けは各1稼働日、残りは通常訪問。'},
 {id:'apartment',name:'マンション',purpose:'エアコン・照明など、具体的なお困りごとから接点をつくる。',goal:'これから検討・着手',plan:'エアコン、照明、スイッチ・コンセント交換に特化した専用チラシ。',detail:'対象マンション、開始日、部数は未確定。「時期未定」の予定から具体化します。'}
];
function strategyIds(e){return Array.isArray(e.strategyIds)?e.strategyIds.filter(id=>strategies.some(s=>s.id===id)):[]}
function matchesStrategy(e){return selectedStrategy==='all'||strategyIds(e).includes(selectedStrategy)}
function inferredStrategies(e){
 const ids=new Set(),t=e.title||'';
 if(/カレンダー/.test(t))ids.add('calendar');
 if(/かわらばん/.test(t))ids.add('newsletter');
 if(/エアコン/.test(t)||e.category===7)ids.add('aircon');
 if(/フェア|招待状/.test(t)||/^himawari-/.test(e.id))ids.add('fair');
 if(e.category===4||/ごぶさた|年賀状|点検/.test(t))ids.add('care');
 if(/マンション/.test(t))ids.add('apartment');
 return [...ids];
}
function migrateStrategies(input){
 const marker='strategy-link-v1';
 if((input.appliedUpdates||[]).includes(marker))return input;
 const next=structuredClone(input);
 for(const e of next.events){
  if(!Array.isArray(e.strategyIds))e.strategyIds=inferredStrategies(e);
  if(/^かわらばん /.test(e.title)){if(e.copies==null)e.copies=20000;e.details=(e.details?e.details+'\n':'')+'毎号：稲毛区・花見川区10,000部、中央区10,000部。年間新規200件増を目指す。';}
  if(e.title==='カレンダー発注'){if(e.copies==null)e.copies=2000;e.details=(e.details?e.details+'\n':'')+'できることカレンダー1,650部、パナソニックカレンダー350部。合計2,000部。';}
  const staff=/^himawari-\w+-([12])$/.exec(e.id);
  if(staff&&staff[1]==='1'){e.title=e.title.replace('片付け＆お礼ハガキ','片付け');e.timing='フェア後の最初の1稼働日';e.details='フェア後の片付けを1稼働日。お礼ハガキは通常訪問期間に行う。';}
 }
 const seeds=[
  ['calendar-invitations','できることカレンダー｜冬招待状へ同封',4,0,['calendar','fair','care'],1100,'Aランク分を含む1,100部。冬フェアの招待状と一緒に届ける。','winter-prep'],
  ['calendar-mail','できることカレンダー＋かわらばん｜郵送',5,0,['calendar','newsletter','care'],350,'Cランク（招待状なし）＋ごぶさたへ350部を郵送。発送日未定。'],
  ['calendar-new','できることカレンダー｜翌年新規用を確保',5,0,['calendar'],200,'翌年の新規のお客様用に200部保管。確保する時期は未定。'],
  ['calendar-panasonic','パナソニックカレンダー｜Aランクへ手渡し',4,0,['calendar','care'],350,'ひまわりスタッフがAランクへ350部を手渡し。できることカレンダーも招待状1,100部の内数として届く。配布日未定。'],
  ['care-aircon','エアコン点検',2,0,['aircon','care'],null,'お客様に安心を提供する点検。対象・日程は決まり次第入力。'],
  ['care-warranty','1・5・7年保証切れ点検',2,0,['care'],null,'購入日と保証条件を確認して対象・点検日を設定。'],
  ['care-after-sale','お買い上げ後訪問',4,0,['care'],null,'購入後の使い方・困りごとの確認。訪問日未定。'],
  ['apartment-flyer','マンション専用チラシ｜企画・作成',1,0,['apartment','aircon'],null,'未着手。エアコン・照明・スイッチ・コンセント交換に特化。対象・開始日・部数を検討。'],
  ['himawari-year-start','年初｜通常訪問＆お礼・未来店記念品',4,1,['care','fair'],null,'年初から春フェア準備前まで。店舗独自の年末年始休業は未設定。','year-start']
 ];
 for(const [id,title,category,month,strategyIds,copies,details,link] of seeds)if(!next.events.some(e=>e.id===id))next.events.push({id,title,category,month,strategyIds,details,...(copies==null?{}:{copies}),...(link?{strategyDateLink:link}:{}),repeat:'annual',years:{},timing:link?'フェアに連動':'時期未定'});
 next.appliedUpdates=[...(next.appliedUpdates||[]),marker];return next;
}

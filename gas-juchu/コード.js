// ★これを1回実行して権限を承認してください（見積書添付の修復用）
function 権限を承認する() {
  const folders = DriveApp.getFoldersByName('見積書(PDF)');
  const found = folders.hasNext();
  Logger.log('見積書(PDF)フォルダ: ' + (found ? '見つかりました → ' + folders.next().getId() : '見つかりません'));
  return found;
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📊 受注メニュー')
    .addItem('月次集計を作成', 'createMonthlyReport')
    .addItem('月次推移グラフを作成', 'createTrendChart')
    .addToUi();
}

function createTrendChart() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dataSheet = ss.getSheetByName('受注日報シート') || ss.getSheetByName('受注表') || ss.getSheetByName('受注日報') || ss.getSheets()[0];
  if (!dataSheet) { SpreadsheetApp.getUi().alert('シートが見つかりません'); return; }

  const data = dataSheet.getDataRange().getValues();
  const C_DATE = 0, C_STAFF = 2, C_TYPE = 3, C_SERVICE = 7, C_CONTENT = 14;

  // 月ごとに集計
  const monthMap = {};
  data.slice(1).forEach(function(row) {
    const dateVal = row[C_DATE];
    if (!dateVal) return;
    const d = dateVal instanceof Date ? dateVal : new Date(String(dateVal).replace(/-/g, '/'));
    if (isNaN(d.getTime())) return;
    const ym = Utilities.formatDate(d, 'Asia/Tokyo', 'yy/MM');
    if (!monthMap[ym]) monthMap[ym] = { total: 0, staff: {}, type: {}, aircon: 0 };
    const m = monthMap[ym];
    m.total++;
    const staff = String(row[C_STAFF] || '').trim();
    if (staff) m.staff[staff] = (m.staff[staff] || 0) + 1;
    const type = String(row[C_TYPE] || '').trim();
    if (type) m.type[type] = (m.type[type] || 0) + 1;
    const service = String(row[C_SERVICE] || '');
    const content = String(row[C_CONTENT] || '');
    if (service.includes('エアコン点検') || content.includes('エアコン点検')) m.aircon++;
  });

  const months = Object.keys(monthMap).sort();
  if (months.length === 0) { SpreadsheetApp.getUi().alert('データが見つかりません'); return; }

  // 全担当者・種類を収集
  const allStaff = [], allTypes = [];
  months.forEach(function(ym) {
    Object.keys(monthMap[ym].staff).forEach(function(s){ if (allStaff.indexOf(s) < 0) allStaff.push(s); });
    Object.keys(monthMap[ym].type).forEach(function(t){ if (allTypes.indexOf(t) < 0) allTypes.push(t); });
  });
  allStaff.sort(); allTypes.sort();

  // シート作成
  const sheetName = '月次推移';
  let rep = ss.getSheetByName(sheetName);
  if (rep) { rep.getCharts().forEach(function(c){ rep.removeChart(c); }); rep.clearContents(); }
  else { rep = ss.insertSheet(sheetName); }

  // === 総件数テーブル ===
  rep.getRange(1, 1).setValue('月次推移集計');
  rep.getRange(1, 1).setFontWeight('bold').setFontSize(12);

  // 総件数
  rep.getRange(3, 1).setValue('📊 月別 総受注件数').setFontWeight('bold');
  rep.getRange(4, 1).setValue('月');
  rep.getRange(4, 2).setValue('件数');
  months.forEach(function(ym, i) { rep.getRange(5 + i, 1).setValue(ym); rep.getRange(5 + i, 2).setValue(monthMap[ym].total); });
  const totalEnd = 5 + months.length - 1;

  // 担当者別テーブル（月×担当者）
  const staffTop = 8 + months.length;
  rep.getRange(staffTop, 1).setValue('👤 担当者別 月次推移').setFontWeight('bold');
  rep.getRange(staffTop + 1, 1).setValue('月');
  allStaff.forEach(function(s, i) { rep.getRange(staffTop + 1, 2 + i).setValue(s); });
  months.forEach(function(ym, i) {
    rep.getRange(staffTop + 2 + i, 1).setValue(ym);
    allStaff.forEach(function(s, j) { rep.getRange(staffTop + 2 + i, 2 + j).setValue(monthMap[ym].staff[s] || 0); });
  });
  const staffEnd = staffTop + 2 + months.length - 1;

  // 種類別テーブル
  const typeTop = staffEnd + 3;
  rep.getRange(typeTop, 1).setValue('📞 種類別 月次推移').setFontWeight('bold');
  rep.getRange(typeTop + 1, 1).setValue('月');
  allTypes.forEach(function(t, i) { rep.getRange(typeTop + 1, 2 + i).setValue(t); });
  months.forEach(function(ym, i) {
    rep.getRange(typeTop + 2 + i, 1).setValue(ym);
    allTypes.forEach(function(t, j) { rep.getRange(typeTop + 2 + i, 2 + j).setValue(monthMap[ym].type[t] || 0); });
  });
  const typeEnd = typeTop + 2 + months.length - 1;

  // エアコン点検
  const airTop = typeEnd + 3;
  rep.getRange(airTop, 1).setValue('❄️ エアコン点検 月次推移').setFontWeight('bold');
  rep.getRange(airTop + 1, 1).setValue('月');
  rep.getRange(airTop + 1, 2).setValue('件数');
  months.forEach(function(ym, i) { rep.getRange(airTop + 2 + i, 1).setValue(ym); rep.getRange(airTop + 2 + i, 2).setValue(monthMap[ym].aircon); });

  rep.setColumnWidth(1, 90);

  // === グラフ作成 ===
  // 総件数グラフ
  rep.insertChart(rep.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(rep.getRange(4, 1, months.length + 1, 2))
    .setPosition(1, 5, 0, 0)
    .setOption('title', '月別 総受注件数').setOption('width', 480).setOption('height', 320)
    .build());

  // 担当者別グラフ
  rep.insertChart(rep.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(rep.getRange(staffTop + 1, 1, months.length + 1, allStaff.length + 1))
    .setPosition(staffTop, 5, 0, 0)
    .setOption('title', '担当者別 月次推移').setOption('width', 480).setOption('height', 320)
    .build());

  // 種類別グラフ
  rep.insertChart(rep.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(rep.getRange(typeTop + 1, 1, months.length + 1, allTypes.length + 1))
    .setPosition(typeTop, 5, 0, 0)
    .setOption('title', '種類別 月次推移').setOption('width', 480).setOption('height', 320)
    .build());

  ss.setActiveSheet(rep);
  SpreadsheetApp.getUi().alert('月次推移グラフを作成しました（' + months.length + 'ヶ月分）');
}

function createMonthlyReport() {
  const ui = SpreadsheetApp.getUi();
  const today = new Date();
  const defaultMonth = Utilities.formatDate(today, 'Asia/Tokyo', 'yy/MM');
  const response = ui.prompt(
    '集計月を入力',
    'yy/MM 形式で入力してください（例: ' + defaultMonth + '）',
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;

  const input = response.getResponseText().trim();
  const match = input.match(/^(\d{2})\/(\d{2})$/);
  if (!match) {
    ui.alert('形式が正しくありません。yy/MM で入力してください（例: 26/04）');
    return;
  }
  generateReport(2000 + parseInt(match[1]), parseInt(match[2]));
}

function extractArea(address) {
  if (!address || String(address).trim() === '') return '不明';
  const addr = String(address).trim();
  let m = addr.match(/区\s*([^\d０-９\-－ー\s]+)/);
  if (m && m[1]) return m[1].replace(/[\d\-－ー].*$/, '').trim() || '不明';
  m = addr.match(/市\s*([^\d０-９\-－\s]+)/);
  if (m && m[1]) return m[1].replace(/[\d\-－].*$/, '').trim() || '不明';
  return addr.replace(/[\d\-－ー].*$/, '').trim().slice(0, 15) || '不明';
}

function generateReport(year, month) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dataSheet = ss.getSheetByName('受注日報シート') || ss.getSheetByName('受注表') || ss.getSheetByName('受注日報') || ss.getSheets()[0];
  if (!dataSheet) { SpreadsheetApp.getUi().alert('シートが見つかりません'); return; }

  const data = dataSheet.getDataRange().getValues();
  const monthStr = ('0' + month).slice(-2);
  const C_DATE = 0, C_STAFF = 2, C_TYPE = 3, C_ADDR = 5, C_SERVICE = 7, C_CONTENT = 14;

  const rows = data.slice(1).filter(function(row) {
    const dateVal = row[C_DATE];
    if (!dateVal) return false;
    const d = dateVal instanceof Date ? dateVal : new Date(String(dateVal).replace(/-/g, '/'));
    if (isNaN(d.getTime())) return false;
    return Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM') === year + '-' + monthStr;
  });
  if (rows.length === 0) { SpreadsheetApp.getUi().alert(year + '年' + month + '月のデータが見つかりません'); return; }

  const staffCount = {}, typeCount = {}, areaCount = {};
  let airconCount = 0;
  const dayNames = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];
  const dayCount = {};
  dayNames.forEach(function(d) { dayCount[d] = 0; });
  rows.forEach(function(row) {
    const staff = String(row[C_STAFF] || '').trim();
    if (staff) staffCount[staff] = (staffCount[staff] || 0) + 1;
    const type = String(row[C_TYPE] || '').trim();
    if (type) typeCount[type] = (typeCount[type] || 0) + 1;
    const service = String(row[C_SERVICE] || ''), content = String(row[C_CONTENT] || '');
    if (service.includes('エアコン点検') || content.includes('エアコン点検')) airconCount++;
    const dateVal = row[C_DATE];
    const d = dateVal instanceof Date ? dateVal : new Date(String(dateVal).replace(/-/g, '/'));
    if (!isNaN(d.getTime())) dayCount[dayNames[d.getDay()]]++;
    const area = extractArea(String(row[C_ADDR] || ''));
    areaCount[area] = (areaCount[area] || 0) + 1;
  });

  const shortYear = String(year).slice(-2);
  const sheetName = shortYear + monthStr + '集計';
  let rep = ss.getSheetByName(sheetName);
  if (rep) { rep.getCharts().forEach(function(c){ rep.removeChart(c); }); rep.clearContents(); rep.clearFormats(); }
  else { rep = ss.insertSheet(sheetName); }

  const staffEntries = Object.entries(staffCount).sort(function(a,b){return b[1]-a[1];});
  const typeEntries  = Object.entries(typeCount).sort(function(a,b){return b[1]-a[1];});
  const areaEntries  = Object.entries(areaCount).sort(function(a,b){return b[1]-a[1];});
  const areaTop15    = areaEntries.slice(0, 15);

  // --- レイアウト構築（行位置を記録） ---
  const out = [], pos = {};
  function push(row) { out.push(row); }
  function blank() { out.push(['', '']); }

  pos.title = out.length; push([year + '年' + month + '月 受注集計', '']);
  blank();
  pos.total = out.length; push(['総受注件数：' + rows.length + '件', '']);
  blank();

  pos.staffSec = out.length; push(['👤 担当者別 受注件数', '']);
  pos.staffHead = out.length; push(['担当者', '件数']);
  pos.staffData = out.length;
  staffEntries.forEach(function(e){ push([e[0], e[1]]); });
  blank(); blank();

  pos.typeSec = out.length; push(['📞 種類別 受注件数', '']);
  pos.typeHead = out.length; push(['種類', '件数']);
  pos.typeData = out.length;
  typeEntries.forEach(function(e){ push([e[0], e[1]]); });
  blank(); blank();

  pos.airconSec = out.length; push(['❄️ エアコン点検', '']);
  pos.airconHead = out.length; push(['エアコン点検件数', airconCount]);
  blank(); blank();

  pos.daySec = out.length; push(['📅 曜日別 受注件数', '']);
  pos.dayHead = out.length; push(['曜日', '件数']);
  pos.dayData = out.length;
  dayNames.forEach(function(d){ push([d, dayCount[d]]); });
  blank(); blank();

  pos.areaSec = out.length; push(['🗺️ 地区別 受注件数', '']);
  pos.areaHead = out.length; push(['地区', '件数']);
  pos.areaData = out.length;
  areaTop15.forEach(function(e){ push([e[0], e[1]]); });
  if (areaEntries.length > 15) {
    blank();
    areaEntries.slice(15).forEach(function(e){ push([e[0], e[1]]); });
  }

  // --- データ書き込み ---
  const totalRows = out.length;
  rep.getRange(1, 1, totalRows, 2).setValues(out);
  rep.setColumnWidth(1, 200);
  rep.setColumnWidth(2, 80);

  // --- 色・スタイル適用 ---
  // タイトル行
  rep.getRange(pos.title + 1, 1, 1, 2)
    .setBackground('#1c4587').setFontColor('#ffffff')
    .setFontWeight('bold').setFontSize(14).setHorizontalAlignment('center');

  // 総受注件数行
  rep.getRange(pos.total + 1, 1, 1, 2)
    .setBackground('#cfe2f3').setFontWeight('bold').setFontSize(11);

  // セクションヘッダー（オレンジ）
  [pos.staffSec, pos.typeSec, pos.airconSec, pos.daySec, pos.areaSec].forEach(function(r) {
    rep.getRange(r + 1, 1, 1, 2).setBackground('#e69138').setFontColor('#ffffff').setFontWeight('bold');
  });

  // テーブルヘッダー（薄黄）
  [pos.staffHead, pos.typeHead, pos.airconHead, pos.dayHead, pos.areaHead].forEach(function(r) {
    rep.getRange(r + 1, 1, 1, 2).setBackground('#fff2cc').setFontWeight('bold');
  });

  // 曜日行の色（日曜=薄ピンク、土曜=薄青）
  rep.getRange(pos.dayData + 1, 1, 1, 2).setBackground('#f4cccc');           // 日曜日
  rep.getRange(pos.dayData + 7, 1, 1, 2).setBackground('#cfe2f3');           // 土曜日

  // --- グラフ作成 ---
  function makeChart(type, headRow, count, title, posRow, posCol) {
    rep.insertChart(rep.newChart()
      .setChartType(type)
      .addRange(rep.getRange(headRow + 1, 1, count + 1, 2))
      .setPosition(posRow, posCol, 0, 0)
      .setOption('title', title).setOption('width', 420).setOption('height', 300)
      .build());
  }

  if (staffEntries.length > 0) makeChart(Charts.ChartType.COLUMN, pos.staffHead, staffEntries.length, '担当者別 受注件数', pos.staffSec + 1, 4);
  if (typeEntries.length > 0)  makeChart(Charts.ChartType.PIE,    pos.typeHead,  typeEntries.length,  '種類別 受注件数',   pos.typeSec  + 1, 4);
  makeChart(Charts.ChartType.COLUMN, pos.dayHead, 7, '曜日別 受注件数', pos.daySec + 1, 4);
  if (areaTop15.length > 0)    makeChart(Charts.ChartType.BAR,    pos.areaHead,  areaTop15.length,    '地区別 受注件数（上位15）', pos.areaSec + 1, 4);

  ss.setActiveSheet(rep);
  SpreadsheetApp.getUi().alert(year + '年' + month + '月の集計シートを作成しました（' + rows.length + '件）');
}

// スコープ認証用（GASエディタから一度だけ手動実行してください）
function authorize() {
  DriveApp.getRootFolder();
  ScriptApp.getOAuthToken();
  console.log('認証OK');
}

// ウェブアプリとしてHTMLを配信
function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'search') {
    const results = searchCustomer(e.parameter.query);
    return ContentService.createTextOutput(JSON.stringify(results))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // 全顧客リスト（フロント側で商品見積と同じ即時絞り込みをするため）
  if (e && e.parameter && e.parameter.action === 'customers') {
    const ss = SpreadsheetApp.openById(CUSTOMER_MASTER_SS_ID);
    const s = ss.getSheetByName('顧客マスタ') || ss.getSheetByName('顧客ﾏｽﾀ');
    if (!s) return ContentService.createTextOutput('[]').setMimeType(ContentService.MimeType.JSON);
    const d = s.getDataRange().getValues();
    const out = d.slice(1).filter(function(r) { return r[1]; }).map(function(r) {
      return {
        name: String(r[1] || ''),
        kana: String(r[2] || ''),
        tel:  String(r[3] || ''),
        tels: [r[3], r[4], r[5], r[6], r[7]].map(function(t) { return String(t || '').replace(/[-\s]/g, ''); }).filter(String).join(','),
        address: String(r[15] || '') + String(r[16] || ''),
        ku: String(r[8] || '')        // I列「担当者」例：1区 角井 → 区番号の判定に使う
      };
    });
    return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
  }
  if (e && e.parameter && e.parameter.action === 'listEstimates') {
    try {
      const folders = DriveApp.getFoldersByName('見積書(PDF)');
      if (!folders.hasNext()) {
        return ContentService.createTextOutput('[]').setMimeType(ContentService.MimeType.JSON);
      }
      const folder = folders.next();
      const files = folder.getFiles();
      const list = [];
      while (files.hasNext()) {
        const f = files.next();
        list.push({ id: f.getId(), name: f.getName(), date: f.getDateCreated().toISOString() });
      }
      list.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
      return ContentService.createTextOutput(JSON.stringify(list)).setMimeType(ContentService.MimeType.JSON);
    } catch(err) {
      return ContentService.createTextOutput(JSON.stringify({ error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('受注日報 - ヤハタ電機商会')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

// データ受信・保存
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    console.log('受信データ: 添付ID=' + data.添付ファイルID + ' 訪問担当メール=' + data.訪問担当メール + ' 訪問日時=' + data.訪問日時);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("受注日報シート") || ss.getSheetByName("受注表") || ss.getSheetByName("受注日報") || ss.getSheets()[0];
    
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        '日付', '登録時刻', '担当', '種類', '顧客名', '住所', '電話番号', 
        'サービス種別', '業者種別', '商品区分', '商品詳細', 
        '訪問日時', '訪問担当', '予定時間', '内容', '見込商品', 'カレンダーID'
      ]);
    }
    
    let 見込商品文字列 = '';
    if (data.見込商品 && data.見込商品.length > 0) {
      見込商品文字列 = data.見込商品.map(item => {
        return `${item.location || ''}/${item.product || ''}/${item.content || ''}`;
      }).join('｜');
    }

    // 改行を除去して1行にまとめる
    const 内容テキスト = (data.内容 || '').split('\r\n').join(' ').split('\r').join(' ').split('\n').join(' ');
    
    const rowData = [
      data.日付, data.登録時刻, data.担当, data.種類, data.顧客名,
      data.住所 || '', data.電話番号 || '', data.サービス種別 || '',
      data.業者種別 || '', data.商品区分 || '', data.商品詳細 || '', 
      data.訪問日時 || '', data.訪問担当 || '', data.予定時間 || '', 
      内容テキスト, 見込商品文字列, ''
    ];
    sheet.appendRow(rowData);

    if (data.訪問日時 && data.訪問担当メール && data.予定時間) {
      try {
        const calendar = CalendarApp.getCalendarById(data.訪問担当メール);

        if (calendar) {
          const startTime = new Date(data.訪問日時.replace(/-/g, '/'));
          let durationHours = 1;
          const match = data.予定時間.match(/(\d+(\.\d+)?)/);
          if (match) durationHours = parseFloat(match[1]);
          const endTime = new Date(startTime.getTime() + (durationHours * 60 * 60 * 1000));

          let prefix = (data.内容 && data.内容.includes('エアコン点検')) ? '✨' : '';
          // 修理・エアコンクリーニングは担当に関係なく【サ】マーク＋ミカン色
          const isServiceJob = (data.サービス種別 === '修理' || data.サービス種別 === 'エアコンクリーニング');
          let title = prefix + (data.区マーク || '') + (isServiceJob ? 'サ】' : '') + data.顧客名 + ' 様';
          if (data.サービス種別) title += ' - ' + data.サービス種別;
          else if (data.業者種別) title += ' - 業者(' + data.業者種別 + ')';

          const descriptionParts = ['【顧客名】 ' + data.顧客名 + ' 様', '【受注種類】 ' + data.種類];
          if (data.電話番号) descriptionParts.push('【電話】 ' + data.電話番号);
          if (data.サービス種別) descriptionParts.push('【サービス】 ' + data.サービス種別);
          if (data.業者種別) descriptionParts.push('【業者】 ' + data.業者種別);
          if (data.商品区分) descriptionParts.push('【商品】 ' + data.商品区分 + ' ' + (data.商品詳細 || ''));
          if (data.内容) descriptionParts.push('【内容】 ' + data.内容);
          if (見込商品文字列) {
            const 見込表示 = data.見込商品.map(function(item) {
              return item.location + '/' + item.product + ': ' + (item.content || '');
            }).join('\n');
            descriptionParts.push('【見込商品】\n' + 見込表示);
          }
          descriptionParts.push('---');
          descriptionParts.push('受注担当: ' + data.担当 + ' (' + data.登録時刻 + ' 受付)');

          let eventId = '';
          if (data.添付ファイルID) {
            // 見積書添付あり → Advanced Calendar Serviceでイベント作成
            const calEvent = {
              summary: title,
              location: data.住所 || '',
              description: descriptionParts.join('\n'),
              start: { dateTime: Utilities.formatDate(startTime, 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ss+09:00"), timeZone: 'Asia/Tokyo' },
              end:   { dateTime: Utilities.formatDate(endTime,   'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ss+09:00"), timeZone: 'Asia/Tokyo' },
              attachments: [{ fileId: data.添付ファイルID, fileUrl: 'https://drive.google.com/file/d/' + data.添付ファイルID + '/view', title: data.添付ファイル || '見積書', mimeType: 'application/pdf' }]
            };
            if (isServiceJob) calEvent.colorId = '6'; // ミカン色（Tangerine）
            try {
              const resp = Calendar.Events.insert(calEvent, data.訪問担当メール, { supportsAttachments: true });
              eventId = resp.id || '';
            } catch(advErr) {
              const debugSheet = ss.getSheetByName('デバッグ') || ss.insertSheet('デバッグ');
              debugSheet.appendRow([new Date(), 'ADV ERROR', advErr.toString()]);
              const ev = calendar.createEvent(title, startTime, endTime, { location: data.住所 || '', description: descriptionParts.join('\n') });
              if (isServiceJob) ev.setColor(CalendarApp.EventColor.ORANGE);
              eventId = ev.getId();
            }
          } else {
            // 添付なし → CalendarApp
            const ev = calendar.createEvent(title, startTime, endTime, {
              location: data.住所 || '',
              description: descriptionParts.join('\n')
            });
            if (isServiceJob) ev.setColor(CalendarApp.EventColor.ORANGE);
            eventId = ev.getId();
          }
          sheet.getRange(sheet.getLastRow(), 17).setValue(eventId);
        }
      } catch (calendarError) {
        console.log('カレンダー作成エラー: ' + calendarError.toString());
      }
    }

    // ☎ 電話連絡 → 受注担当者のカレンダーに2件（当日21:00・翌日9:00、各30分）
    if (data.電話連絡 && data.受注担当メール) {
      try {
        const phoneCal = CalendarApp.getCalendarById(data.受注担当メール);
        if (phoneCal) {
          const cleanName = String(data.顧客名 || '').replace(/^☎】/, '').trim();
          const base = new Date(String(data.日付 || '').replace(/-/g, '/') + ' 00:00:00');
          if (!isNaN(base.getTime())) {
            const title = (data.区マーク || '') + '☎】' + cleanName + ' 様 電話連絡';
            const descParts = ['【電話連絡】 ' + cleanName + ' 様'];
            if (data.電話番号) descParts.push('【電話】 ' + data.電話番号);
            if (data.内容) descParts.push('【内容】 ' + data.内容);
            descParts.push('---');
            descParts.push('受注担当: ' + data.担当 + ' (' + data.登録時刻 + ' 受付)');
            const desc = descParts.join('\n');
            const loc = data.住所 || '';
            const ids = [];

            // 当日 20:00-20:30
            const t1s = new Date(base); t1s.setHours(20, 0, 0, 0);
            const t1e = new Date(t1s.getTime() + 30 * 60 * 1000);
            ids.push(phoneCal.createEvent(title, t1s, t1e, { location: loc, description: desc }).getId());

            // 翌日 08:00-08:30
            const t2s = new Date(base); t2s.setDate(t2s.getDate() + 1); t2s.setHours(8, 0, 0, 0);
            const t2e = new Date(t2s.getTime() + 30 * 60 * 1000);
            ids.push(phoneCal.createEvent(title, t2s, t2e, { location: loc, description: desc }).getId());

            const cur = sheet.getRange(sheet.getLastRow(), 17).getValue();
            sheet.getRange(sheet.getLastRow(), 17).setValue([cur].concat(ids).filter(String).join(','));
          }
        }
      } catch (phoneCalErr) {
        console.log('電話連絡カレンダー作成エラー: ' + phoneCalErr.toString());
      }
    }

    return ContentService.createTextOutput("Success");

  } catch (err) {
    console.log('エラー発生: ' + err.toString());
    return ContentService.createTextOutput("Error: " + err.toString());
  }
}

// カナ正規化（半角カタカナ・ひらがな・全角カタカナ → すべて全角カタカナに統一）
function normalizeKana(str) {
  var result = str;
  result = result.replace(/ｶﾞ/g,'ガ').replace(/ｷﾞ/g,'ギ').replace(/ｸﾞ/g,'グ').replace(/ｹﾞ/g,'ゲ').replace(/ｺﾞ/g,'ゴ');
  result = result.replace(/ｻﾞ/g,'ザ').replace(/ｼﾞ/g,'ジ').replace(/ｽﾞ/g,'ズ').replace(/ｾﾞ/g,'ゼ').replace(/ｿﾞ/g,'ゾ');
  result = result.replace(/ﾀﾞ/g,'ダ').replace(/ﾁﾞ/g,'ヂ').replace(/ﾂﾞ/g,'ヅ').replace(/ﾃﾞ/g,'デ').replace(/ﾄﾞ/g,'ド');
  result = result.replace(/ﾊﾞ/g,'バ').replace(/ﾋﾞ/g,'ビ').replace(/ﾌﾞ/g,'ブ').replace(/ﾍﾞ/g,'ベ').replace(/ﾎﾞ/g,'ボ');
  result = result.replace(/ﾊﾟ/g,'パ').replace(/ﾋﾟ/g,'ピ').replace(/ﾌﾟ/g,'プ').replace(/ﾍﾟ/g,'ペ').replace(/ﾎﾟ/g,'ポ');
  result = result.replace(/ｳﾞ/g,'ヴ');
  var hw = 'ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ';
  var fw = 'ヲァィゥェォャュョッーアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン';
  for (var j = 0; j < hw.length; j++) {
    result = result.split(hw[j]).join(fw[j]);
  }
  result = result.replace(/ﾞ/g,'').replace(/ﾟ/g,'');
  result = result.replace(/[\u3041-\u3096]/g, function(ch) {
    return String.fromCharCode(ch.charCodeAt(0) + 96);
  });
  return result;
}

// 顧客検索（全カナ形式対応、電話番号1〜5対応、カナ前方一致、住所1・住所2検索対応）
// 顧客マスタは商品見積SS（本家）を直接参照（2026-07-19一本化。全アプリ共通）
const CUSTOMER_MASTER_SS_ID = '1Pqb_DY3utvxKhTCIb4PJ0yNGra3hi1aSyFOHrydmuY0'; // 商品見積SS（本家・2026-07-19移設）
function searchCustomer(query) {
  const ss = SpreadsheetApp.openById(CUSTOMER_MASTER_SS_ID);
  const s = ss.getSheetByName("顧客マスタ") || ss.getSheetByName("顧客ﾏｽﾀ");
  if (!s || !query) return [];
  
  const d = s.getDataRange().getValues();
  const cleanQuery = String(query).replace(/-|\s|　/g, "");
  const kanaQuery = normalizeKana(cleanQuery);
  const results = [];

  for (let i = 1; i < d.length; i++) {
    const rowName  = String(d[i][1]).replace(/\s|　/g, "");
    const rowKana  = normalizeKana(String(d[i][2]).replace(/\s|　/g, ""));
    const rowAddr1 = String(d[i][15]).replace(/\s|　/g, ""); // 住所１（P列 index 15）
    const rowAddr2 = String(d[i][16]).replace(/\s|　/g, ""); // 住所２（Q列 index 16）

    let telMatch = false;
    if (cleanQuery !== "") {
      for (let t = 3; t <= 7; t++) {
        const tel = String(d[i][t]).replace(/-/g, "");
        if (tel && tel.includes(cleanQuery)) {
          telMatch = true;
          break;
        }
      }
    }
    
    if (
      rowName.includes(cleanQuery) ||
      rowKana.startsWith(kanaQuery) ||
      telMatch ||
      rowAddr1.includes(cleanQuery) ||
      rowAddr2.includes(cleanQuery)
    ) {
      const fullAddress = [d[i][15], d[i][16]].filter(a => String(a).trim() !== "").join(" ");
      results.push({
        tel: d[i][3],
        name: d[i][1],
        address: fullAddress
      });
    }
  }
  return results;
}

// 受注データ保存（HTMLから直接呼び出し用）
function saveOrderData(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("受注日報シート") || ss.getSheetByName("受注表") || ss.getSheetByName("受注日報") || ss.getSheets()[0];
    
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        '日付', '登録時刻', '担当', '種類', '顧客名', '住所', '電話番号', 
        'サービス種別', '業者種別', '商品区分', '商品詳細', 
        '訪問日時', '訪問担当', '予定時間', '内容', '見込商品', 'カレンダーID'
      ]);
    }
    
    let 見込商品文字列 = '';
    if (data.見込商品 && data.見込商品.length > 0) {
      見込商品文字列 = data.見込商品.map(item => {
        return `${item.location || ''}/${item.product || ''}/${item.content || ''}`;
      }).join('｜');
    }

    // 改行を除去して1行にまとめる
    const 内容テキスト = (data.内容 || '').split('\r\n').join(' ').split('\r').join(' ').split('\n').join(' ');
    
    const rowData = [
      data.日付, data.登録時刻, data.担当, data.種類, data.顧客名,
      data.住所 || '', data.電話番号 || '', data.サービス種別 || '',
      data.業者種別 || '', data.商品区分 || '', data.商品詳細 || '', 
      data.訪問日時 || '', data.訪問担当 || '', data.予定時間 || '', 
      内容テキスト, 見込商品文字列, ''
    ];
    sheet.appendRow(rowData);

    if (data.訪問日時 && data.訪問担当メール && data.予定時間) {
      try {
        const calendar = CalendarApp.getCalendarById(data.訪問担当メール);
        
        if (calendar) {
          const startTime = new Date(data.訪問日時.replace(/-/g, '/'));
          let durationHours = 1;
          const match = data.予定時間.match(/(\d+(\.\d+)?)/);
          if (match) durationHours = parseFloat(match[1]);
          
          const endTime = new Date(startTime.getTime() + (durationHours * 60 * 60 * 1000));

          let prefix = (data.内容 && data.内容.includes('エアコン点検')) ? '✨' : '';
          let title = `${prefix}${data.区マーク || ""}${data.顧客名} 様`;
          if (data.サービス種別) {
            title += ` - ${data.サービス種別}`;
          } else if (data.業者種別) {
            title += ` - 業者(${data.業者種別})`;
          }

          const descriptionParts = [
            `【顧客名】 ${data.顧客名} 様`,
            `【受注種類】 ${data.種類}`
          ];
          if (data.電話番号) descriptionParts.push(`【電話】 ${data.電話番号}`);
          if (data.サービス種別) descriptionParts.push(`【サービス】 ${data.サービス種別}`);
          if (data.業者種別) descriptionParts.push(`【業者】 ${data.業者種別}`);
          if (data.商品区分) descriptionParts.push(`【商品】 ${data.商品区分} ${data.商品詳細 || ''}`);
          if (data.内容) descriptionParts.push(`【内容】 ${data.内容}`);
          
          if (見込商品文字列) {
            const 見込表示 = data.見込商品.map(item => {
              return `${item.location}/${item.product}: ${item.content || ''}`;
            }).join('\n');
            descriptionParts.push(`【見込商品】\n${見込表示}`);
          }
          
          descriptionParts.push('---');
          descriptionParts.push(`受注担当: ${data.担当} (${data.登録時刻} 受付)`);

          const event = calendar.createEvent(title, startTime, endTime, {
            location: data.住所 || '',
            description: descriptionParts.join('\n')
          });
          
          const lastRow = sheet.getLastRow();
          sheet.getRange(lastRow, 17).setValue(event.getId());
        }
      } catch (calendarError) {
        console.log('カレンダー作成エラー: ' + calendarError.toString());
      }
    }
    
    return { success: true };
    
  } catch (err) {
    console.log('エラー発生: ' + err.toString());
    return { success: false, error: err.toString() };
  }
}
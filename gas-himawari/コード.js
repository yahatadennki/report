function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🌻 日報メニュー')
    .addItem('📱 ひまわり日報アプリを開く', 'openHimawariApp')
    .addToUi();
}

function openHimawariApp() {
  const url = 'https://yawata51-dotcom.github.io/himawari-report/index.html';
  const html = HtmlService.createHtmlOutput(
    '<script>window.open("' + url + '"); google.script.host.close();</script>'
  ).setWidth(10).setHeight(10);
  SpreadsheetApp.getUi().showModalDialog(html, 'ひまわり日報アプリを開いています...');
}

function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var logSheet = ss.getSheetByName("デバッグログ");
  if (!logSheet) {
    logSheet = ss.insertSheet("デバッグログ");
    logSheet.getRange(1, 1, 1, 3).setValues([["時刻", "フィールド", "値"]]);
  }
  var logRow = logSheet.getLastRow() + 1;
  logSheet.getRange(logRow, 1).setValue(new Date().toLocaleString('ja-JP'));
  logSheet.getRange(logRow, 2).setValue("data.staff");
  logSheet.getRange(logRow, 3).setValue(data.staff || "(なし)");

  var logRow2 = logSheet.getLastRow() + 1;
  logSheet.getRange(logRow2, 1).setValue(new Date().toLocaleString('ja-JP'));
  logSheet.getRange(logRow2, 2).setValue("data.種類");
  logSheet.getRange(logRow2, 3).setValue(data.種類 || "(なし)");

  if (data.staff) {
    var now = new Date().toLocaleString('ja-JP');

    // 全データシートに書き込み
    var allSheet = ss.getSheetByName("全データ");
    if (!allSheet) {
      allSheet = ss.insertSheet("全データ");
      allSheet.getRange(1, 1, 1, 9).setValues([[
        "日にち", "担当者", "区域", "面談件数", "TEL", "ポスティング件数", "配布物", "備考", "受信時刻"
      ]]);
    }
    var row = allSheet.getLastRow() + 1;
    allSheet.getRange(row, 1).setValue(data.date);
    allSheet.getRange(row, 2).setValue(data.staff);
    allSheet.getRange(row, 3).setValue(data.areas);
    allSheet.getRange(row, 4).setValue(data.visits || 0);
    allSheet.getRange(row, 5).setValue(data.tels || 0);
    allSheet.getRange(row, 6).setValue(data.postings || 0);
    allSheet.getRange(row, 7).setValue(data.items);
    allSheet.getRange(row, 8).setValue(data.remarks);
    allSheet.getRange(row, 9).setValue(now);
    sortZendata();

  } else if (data.種類) {
    var orderSheet = ss.getSheetByName('受注');
    if (!orderSheet) {
      orderSheet = ss.insertSheet('受注');
      orderSheet.getRange(1, 1, 1, 9).setValues([[
        "日付", "登録時刻", "担当", "種類", "顧客名", "電話番号", "住所", "訪問日時", "受注内容"
      ]]);
    }
    var lastRow = orderSheet.getLastRow();
    orderSheet.getRange(lastRow + 1, 1).setValue(data.日付);
    orderSheet.getRange(lastRow + 1, 2).setValue(data.登録時刻);
    orderSheet.getRange(lastRow + 1, 3).setValue(data.担当);
    orderSheet.getRange(lastRow + 1, 4).setValue(data.種類);
    orderSheet.getRange(lastRow + 1, 5).setValue(data.顧客名);
    orderSheet.getRange(lastRow + 1, 6).setValue(data.電話番号 || '');
    orderSheet.getRange(lastRow + 1, 7).setValue(data.住所 || '');
    orderSheet.getRange(lastRow + 1, 8).setValue(data.訪問日時 || '');
    orderSheet.getRange(lastRow + 1, 9).setValue(data.内容 || '');
  }

  return ContentService.createTextOutput(JSON.stringify({result: 'success'}))
    .setMimeType(ContentService.MimeType.JSON);
}

function sortZendata() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('全データ');
  if (!sheet || sheet.getLastRow() < 3) return;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn())
    .sort({ column: 1, ascending: true });
}

function doGet(e) {
  return ContentService.createTextOutput('OK');
}
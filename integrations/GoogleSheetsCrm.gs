// Add this file to the existing EIT Landing — Leads Apps Script project.
// Keep the deployed doPost and the original A:O columns unchanged.
// Script Properties: EIT_SPREADSHEET_ID (existing), EIT_CRM_TOKEN (private).
// Run enableCrmSync once as the spreadsheet owner.
var EIT_CRM_URL_ = 'https://eit-lc-crm.vercel.app/api/leads/sheets';
var EIT_CRM_HEADERS_ = ['CRM статус', 'CRM ID', 'CRM проверено (UTC)', 'CRM ошибка'];

function enableCrmSync() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('EIT_CRM_TOKEN');
  if (!token || !props.getProperty('EIT_SPREADSHEET_ID')) throw new Error('Настройте EIT_CRM_TOKEN и EIT_SPREADSHEET_ID.');
  var check = UrlFetchApp.fetch(EIT_CRM_URL_, {headers: {Authorization: 'Bearer ' + token}, muteHttpExceptions: true});
  if (check.getResponseCode() !== 200 || JSON.parse(check.getContentText()).ok !== true) throw new Error('CRM не подтвердила подключение.');
  var triggers = ScriptApp.getProjectTriggers();
  if (!triggers.some(function(t) { return t.getHandlerFunction() === 'syncCrmLeads'; })) {
    ScriptApp.newTrigger('syncCrmLeads').timeBased().everyMinutes(5).create();
  }
  props.setProperty('EIT_CRM_ENABLED', 'true');
  syncCrmLeads();
  console.log('Google Sheets → CRM включено. Интервал проверки: 5 минут.');
}

function syncCrmLeads() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('EIT_CRM_ENABLED') !== 'true') return;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  var now = Date.now();
  try {
    if (Number(props.getProperty('EIT_CRM_LEASE_UNTIL') || 0) > now) return;
    props.setProperty('EIT_CRM_LEASE_UNTIL', String(now + 240000));
  } finally { lock.releaseLock(); }
  try {
    var book = SpreadsheetApp.openById(props.getProperty('EIT_SPREADSHEET_ID'));
    var sheet = book.getSheetByName('Leads');
    if (!sheet) throw new Error('Вкладка Leads не найдена.');
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
    var required = ['request_id','created_at','name','phone','course','schedule','locale','source','utm_source','utm_medium','utm_campaign','utm_content','utm_term','consent','status'];
    required.forEach(function(h) { if (headers.indexOf(h) < 0) throw new Error('Нет столбца ' + h); });
    EIT_CRM_HEADERS_.forEach(function(h) {
      if (headers.indexOf(h) >= 0) return;
      var col = headers.length + 1;
      if (col > sheet.getMaxColumns()) sheet.insertColumnAfter(sheet.getMaxColumns());
      sheet.getRange(1, col).setValue(h).setFontWeight('bold').setBackground('#e5efac').setWrap(true);
      sheet.setColumnWidth(col, h === 'CRM ошибка' ? 300 : h === 'CRM ID' ? 300 : 190);
      headers.push(h);
    });
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return;
    var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    var statusCol = headers.indexOf('CRM статус'), idCol = headers.indexOf('request_id');
    var cursor = Number(props.getProperty('EIT_CRM_CURSOR') || 0) % values.length;
    var batch = [], scanned = 0;
    for (; scanned < values.length && batch.length < 25; scanned++) {
      var index = (cursor + scanned) % values.length, cells = values[index];
      if (!cells[idCol] || ['Перенесено', 'Тест — пропущен'].indexOf(String(cells[statusCol])) >= 0) continue;
      var row = {};
      required.forEach(function(h) {
        var v = cells[headers.indexOf(h)];
        row[h] = v instanceof Date ? v.toISOString() : v;
      });
      batch.push({rowIndex: index + 2, row: row});
    }
    if (!batch.length) { props.setProperty('EIT_CRM_LAST_SUCCESS', new Date().toISOString()); return; }
    var response = UrlFetchApp.fetch(EIT_CRM_URL_, {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: {Authorization: 'Bearer ' + props.getProperty('EIT_CRM_TOKEN')},
      payload: JSON.stringify({spreadsheetId: book.getId(), rows: batch.map(function(x) { return x.row; })})
    });
    var payload;
    try { payload = JSON.parse(response.getContentText()); } catch (e) { payload = null; }
    if (response.getResponseCode() !== 200 || !payload || !payload.ok || !Array.isArray(payload.results) || payload.results.length !== batch.length) {
      batch.forEach(function(x) { eitCrmWriteResult_(sheet, headers, x, {status: 'error', message: 'CRM недоступна (HTTP ' + response.getResponseCode() + '). Повтор через 5 минут.'}); });
      throw new Error('CRM не подтвердила приём. Следующая попытка через 5 минут.');
    }
    batch.forEach(function(x, i) {
      var result = payload.results[i];
      if (String(result.requestId) !== String(x.row.request_id)) result = {status: 'error', message: 'Ответ CRM не соответствует строке. Повторите проверку.'};
      eitCrmWriteResult_(sheet, headers, x, result);
    });
    props.setProperty('EIT_CRM_CURSOR', String((cursor + scanned) % values.length));
    props.setProperty('EIT_CRM_LAST_SUCCESS', new Date().toISOString());
    console.log('Проверено строк: ' + batch.length + '. Результаты в столбцах CRM.');
  } finally { props.deleteProperty('EIT_CRM_LEASE_UNTIL'); }
}

function eitCrmWriteResult_(sheet, headers, entry, result) {
  // A row may have moved while the network request was running. Locate by ID.
  var requestCol = headers.indexOf('request_id') + 1;
  var current = sheet.getRange(entry.rowIndex, requestCol).getValue();
  var rowIndex = entry.rowIndex;
  if (String(current) !== String(entry.row.request_id)) {
    var found = sheet.getRange(2, requestCol, sheet.getLastRow() - 1, 1).createTextFinder(String(entry.row.request_id)).matchEntireCell(true).findNext();
    if (!found) return;
    rowIndex = found.getRow();
  }
  var state = result.status === 'imported' || result.status === 'existing' ? 'Перенесено' : result.status === 'skipped' ? 'Тест — пропущен' : 'Ошибка';
  var values = [state, result.leadId || '', new Date().toISOString(), result.message || ''];
  EIT_CRM_HEADERS_.forEach(function(h, i) {
    var s = String(values[i]).slice(0, 500);
    if (/^[=+\-@\t\r\n]/.test(s)) s = "'" + s;
    sheet.getRange(rowIndex, headers.indexOf(h) + 1).setValue(s);
  });
}

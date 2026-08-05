// Code.gs — CMU Alumni Document Tracker Backend (JSONP + Drive upload)

const HEADERS_RECV = [
  'id','เลขหนังสือรับ','ที่ (เลขจากหน่วยงาน)','วันที่ออกหนังสือ',
  'จาก','ถึง','เรื่อง','การปฏิบัติ','ผู้รับในสมาคม',
  'ได้รับวันที่','กำหนดตอบ','ประเภทเอกสาร','สถานะ','หมายเหตุ','ลิงก์ไฟล์','วันที่บันทึก'
];

const HEADERS_SEND = [
  'id','เลขที่ส่ง','วันที่ออก','ถึง','เรื่อง','รายละเอียด',
  'การปฏิบัติ','ผู้ส่ง','ผู้รับ','วันที่ส่ง','ช่องทางส่ง',
  'ประเภทเอกสาร','สถานะ','หมายเหตุ','ลิงก์ไฟล์','วันที่บันทึก'
];

const HEADERS_FINANCE = [
  'id','เลขที่เบิก','วันที่ขอเบิก','ผู้ขอเบิก','รายการ/เรื่อง','รายละเอียดการเบิกเงิน','จำนวนเงินที่ขอเบิก',
  'หมวดงบประมาณ','ผู้อนุมัติ','วันที่อนุมัติ','หลักฐานการอนุมัติ','สถานะ','วันที่จ่ายเงินจริง','วิธีจ่าย',
  'จ่ายให้','เลขบัญชีปลายทาง','จำนวนเงินที่จ่ายจริง','เลขที่ใบเสร็จ','หมายเหตุ','ลิงก์ไฟล์','วันที่บันทึก'
];

const HEADERS_CALENDAR = [
  'id','ชื่องาน','ประเภท','วันที่เริ่ม','วันที่สิ้นสุด',
  'เวลาเริ่ม','เวลาสิ้นสุด','สถานที่','ผู้รับผิดชอบ','หมายเหตุ','วันที่บันทึก'
];

const ROOT_FOLDER_NAME = 'เอกสาร สมาคมนักศึกษาเก่า มช.';

function getRootFolder() {
  const folders = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(ROOT_FOLDER_NAME);
}

function getSubFolder(type, subfolder) {
  const root = getRootFolder();
  const name = type === 'send' ? 'หนังสือส่ง' : (type === 'finance' ? 'การเงิน' : 'หนังสือรับ');
  const folders = root.getFoldersByName(name);
  const mainFolder = folders.hasNext() ? folders.next() : root.createFolder(name);
  if (!subfolder) return mainFolder;
  const subFolders = mainFolder.getFoldersByName(subfolder);
  if (subFolders.hasNext()) return subFolders.next();
  return mainFolder.createFolder(subfolder);
}

function getOrCreateSheet(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (!headers || headers.length === 0) return sheet;
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#351F5D')
      .setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}


function doPost(e) {
  try {
    const params = e.parameter;
    let result;
    if (params.action === 'uploadFile') {
      result = uploadFile(params.type, params.filename, params.mimetype, params.data, params.subfolder);
    } else {
      result = { ok: false, error: 'unknown action' };
    }
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  const params = e.parameter;
  const callback = params.callback || 'callback';
  let result;

  try {
    switch (params.action) {
      case 'getAll':
        result = getAll();
        break;
      case 'addRecv':
        result = addRecv(JSON.parse(params.row));
        break;
      case 'addSend':
        result = addSend(JSON.parse(params.row));
        break;
      case 'uploadFile':
        result = uploadFile(params.type, params.filename, params.mimetype, params.data, params.subfolder);
        break;
      case 'updateRecord':
        result = updateRecord(params.type, JSON.parse(params.row));
        break;
      case 'updateStatus':
        result = updateStatus(params.type, params.id, params.status);
        break;
      case 'delete':
        result = deleteRecord(params.id);
        break;
      case 'addFinance':
        result = addFinance(JSON.parse(params.row));
        break;
      case 'getAllFinance':
        result = getAllFinance();
        break;
      case 'updateFinance':
        result = updateFinance(JSON.parse(params.row));
        break;
      case 'deleteFinance':
        result = deleteFinance(params.id);
        break;
      case 'addCalendar':
        result = addCalendar(JSON.parse(params.row));
        break;
      case 'getAllCalendar':
        result = getAllCalendar();
        break;
      case 'updateCalendar':
        result = updateCalendar(JSON.parse(params.row));
        break;
      case 'deleteCalendar':
        result = deleteCalendar(params.id);
        break;
      default:
        result = { ok: false, error: 'unknown action' };
    }
  } catch(err) {
    result = { ok: false, error: err.message };
  }

  return ContentService
    .createTextOutput(callback + '(' + JSON.stringify(result) + ')')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function uploadFile(type, filename, mimetype, base64data, subfolder) {
  const folder = getSubFolder(type, subfolder);
  const blob = Utilities.newBlob(Utilities.base64Decode(base64data), mimetype, filename);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { ok: true, url: file.getUrl(), id: file.getId() };
}

function addRecv(r) {
  const sheet = getOrCreateSheet('หนังสือรับ', HEADERS_RECV);
  sheet.appendRow([
    r.id || Date.now().toString(),
    r.docno || '', r.ref_no || '', r.issue_date || '',
    r.from_org || '', r.to_org || '', r.subject || '',
    r.handler || '', r.receiver || '', r.received_date || '',
    r.deadline || '', r.doc_type || '', r.status || 'pend',
    r.note || '', r.file_url || '', new Date().toISOString()
  ]);
  return { ok: true };
}

function addSend(r) {
  const sheet = getOrCreateSheet('หนังสือส่ง', HEADERS_SEND);
  sheet.appendRow([
    r.id || Date.now().toString(),
    r.docno || '', r.issue_date || '', r.to_org || '',
    r.subject || '', r.detail || '', r.handler || '',
    r.sender || '', r.receiver_name || '', r.send_date || '',
    r.send_channel || '', r.doc_type || '', r.status || 'pend',
    r.note || '', r.file_url || '', new Date().toISOString()
  ]);
  return { ok: true };
}

function getAll() {
  const recvSheet = getOrCreateSheet('หนังสือรับ', HEADERS_RECV);
  const sendSheet = getOrCreateSheet('หนังสือส่ง', HEADERS_SEND);

  const recvData = recvSheet.getDataRange().getValues().slice(1).map(r => ({
    id: String(r[0]), type: 'recv',
    docno: r[1], ref_no: r[2], issue_date: r[3],
    from_org: r[4], to_org: r[5], subject: r[6],
    handler: r[7], receiver: r[8], received_date: r[9],
    deadline: r[10], doc_type: r[11], status: r[12], note: r[13], file_url: r[14]
  }));

  const sendData = sendSheet.getDataRange().getValues().slice(1).map(r => ({
    id: String(r[0]), type: 'send',
    docno: r[1], issue_date: r[2], to_org: r[3],
    subject: r[4], detail: r[5], handler: r[6],
    sender: r[7], receiver_name: r[8], send_date: r[9],
    send_channel: r[10], doc_type: r[11], status: r[12], note: r[13], file_url: r[14]
  }));

  const all = [...recvData, ...sendData]
    .filter(r => r.id)
    .sort((a, b) => {
      const da = a.type === 'recv' ? (a.received_date || a.issue_date || '') : (a.issue_date || a.send_date || '');
      const db = b.type === 'recv' ? (b.received_date || b.issue_date || '') : (b.issue_date || b.send_date || '');
      if (db !== da) return db > da ? 1 : -1;
      return b.id.localeCompare(a.id);
    });
  return { ok: true, records: all };
}

function updateRecord(type, r) {
  const name = type === 'send' ? 'หนังสือส่ง' : 'หนังสือรับ';
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) return { ok: false, error: 'Sheet not found' };
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(r.id)) {
      let rowValues;
      if (type === 'recv') {
        rowValues = [
          r.id, r.docno || '', r.ref_no || '', r.issue_date || '',
          r.from_org || '', r.to_org || '', r.subject || '',
          r.handler || '', r.receiver || '', r.received_date || '',
          r.deadline || '', r.doc_type || '', r.status || 'pend',
          r.note || '', r.file_url || '', data[i][15] || new Date().toISOString()
        ];
      } else {
        rowValues = [
          r.id, r.docno || '', r.issue_date || '', r.to_org || '',
          r.subject || '', r.detail || '', r.handler || '',
          r.sender || '', r.receiver_name || '', r.send_date || '',
          r.send_channel || '', r.doc_type || '', r.status || 'pend',
          r.note || '', r.file_url || '', data[i][15] || new Date().toISOString()
        ];
      }
      sheet.getRange(i + 1, 1, 1, rowValues.length).setValues([rowValues]);
      return { ok: true };
    }
  }
  return { ok: false, error: 'Record not found' };
}

function updateStatus(type, id, status) {
  const name = type === 'send' ? 'หนังสือส่ง' : 'หนังสือรับ';
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) return { ok: false, error: 'Sheet not found' };
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      sheet.getRange(i + 1, 13).setValue(status);
      return { ok: true };
    }
  }
  return { ok: false, error: 'Record not found' };
}

function deleteRecord(id) {
  ['หนังสือรับ', 'หนังสือส่ง'].forEach(name => {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
    if (!sheet) return;
    const data = sheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]) === String(id)) {
        sheet.deleteRow(i + 1);
        return;
      }
    }
  });
  return { ok: true };
}

// ===== FINANCE FUNCTIONS =====
function addFinance(r) {
  const sheet = getOrCreateSheet('การเงิน', HEADERS_FINANCE);
  sheet.appendRow([
    r.id || Date.now().toString(),
    r.docno || '', r.request_date || '', r.requester || '',
    r.title || '', r.detail || '', r.amount_request || '', r.category || '',
    r.approver || '', r.approve_date || '', r.approve_file_url || '', r.status || 'pend', r.pay_date || '',
    r.pay_method || '', r.payee || '', r.bank_account || '',
    r.amount_paid || '', r.receipt_no || '', r.note || '',
    r.file_url || '', new Date().toISOString()
  ]);
  return { ok: true };
}

function getAllFinance() {
  const sheet = getOrCreateSheet('การเงิน', HEADERS_FINANCE);
  const data = sheet.getDataRange().getValues().slice(1).map(r => ({
    id: String(r[0]), docno: r[1], request_date: r[2], requester: r[3],
    title: r[4], detail: r[5], amount_request: r[6], category: r[7], approver: r[8],
    approve_date: r[9], approve_file_url: r[10], status: r[11], pay_date: r[12], pay_method: r[13], payee: r[14],
    bank_account: r[15], amount_paid: r[16], receipt_no: r[17],
    note: r[18], file_url: r[19]
  })).filter(r => r.id);
  data.sort((a, b) => {
    const da = a.request_date || '';
    const db = b.request_date || '';
    if (db !== da) return db > da ? 1 : -1;
    return b.id.localeCompare(a.id);
  });
  return { ok: true, records: data };
}

function updateFinance(r) {
  const sheet = getOrCreateSheet('การเงิน', HEADERS_FINANCE);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(r.id)) {
      const rowValues = [
        r.id, r.docno || '', r.request_date || '', r.requester || '',
        r.title || '', r.detail || '', r.amount_request || '', r.category || '',
        r.approver || '', r.approve_date || '', r.approve_file_url || '', r.status || 'pend', r.pay_date || '',
        r.pay_method || '', r.payee || '', r.bank_account || '',
        r.amount_paid || '', r.receipt_no || '', r.note || '',
        r.file_url || '', data[i][20] || new Date().toISOString()
      ];
      sheet.getRange(i + 1, 1, 1, rowValues.length).setValues([rowValues]);
      return { ok: true };
    }
  }
  return { ok: false, error: 'Record not found' };
}

function deleteFinance(id) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('การเงิน');
  if (!sheet) return { ok: true };
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
  return { ok: true };
}

// ===== CALENDAR FUNCTIONS =====
function formatCalendarDate(value) {
  if (!value) return '';
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(value).slice(0, 10);
}

function formatCalendarTime(value) {
  if (!value) return '';
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'HH:mm');
  }
  return String(value).slice(0, 5);
}

function calendarRowValues(r, createdAt) {
  return [
    String(r.id || Date.now()),
    r.title || '',
    r.type || '',
    formatCalendarDate(r.date_start),
    formatCalendarDate(r.date_end),
    formatCalendarTime(r.time_start),
    formatCalendarTime(r.time_end),
    r.location || '',
    r.owner || '',
    r.note || '',
    createdAt || r.created_at || new Date().toISOString()
  ];
}

// ใช้ upsert เพื่อให้การส่งซ้ำหลังเน็ตหลุดไม่สร้างกิจกรรมซ้ำ
function upsertCalendar(r) {
  if (!r || !r.id) return { ok: false, error: 'Calendar id is required' };

  const lock = LockService.getDocumentLock();
  lock.waitLock(10000);
  try {
    const sheet = getOrCreateSheet('ปฏิทิน', HEADERS_CALENDAR);
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(r.id)) {
        const values = calendarRowValues(r, data[i][10]);
        sheet.getRange(i + 1, 1, 1, values.length).setValues([values]);
        SpreadsheetApp.flush();
        return { ok: true, id: String(r.id), updated: true };
      }
    }

    sheet.appendRow(calendarRowValues(r));
    SpreadsheetApp.flush();
    return { ok: true, id: String(r.id), created: true };
  } finally {
    lock.releaseLock();
  }
}

function addCalendar(r) {
  return upsertCalendar(r);
}

function updateCalendar(r) {
  return upsertCalendar(r);
}

function getAllCalendar() {
  const sheet = getOrCreateSheet('ปฏิทิน', HEADERS_CALENDAR);
  const records = sheet.getDataRange().getValues().slice(1).map(r => ({
    id: String(r[0] || ''),
    title: r[1] || '',
    type: r[2] || '',
    date_start: formatCalendarDate(r[3]),
    date_end: formatCalendarDate(r[4]),
    time_start: formatCalendarTime(r[5]),
    time_end: formatCalendarTime(r[6]),
    location: r[7] || '',
    owner: r[8] || '',
    note: r[9] || '',
    created_at: r[10] instanceof Date ? r[10].toISOString() : String(r[10] || '')
  })).filter(r => r.id);

  records.sort((a, b) => {
    const byDate = (a.date_start || '').localeCompare(b.date_start || '');
    if (byDate !== 0) return byDate;
    return (a.time_start || '').localeCompare(b.time_start || '');
  });
  return { ok: true, records: records };
}

function deleteCalendar(id) {
  if (!id) return { ok: false, error: 'Calendar id is required' };

  const lock = LockService.getDocumentLock();
  lock.waitLock(10000);
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ปฏิทิน');
    if (!sheet) return { ok: true, deleted: false };

    const data = sheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]) === String(id)) {
        sheet.deleteRow(i + 1);
        SpreadsheetApp.flush();
        return { ok: true, deleted: true };
      }
    }
    return { ok: true, deleted: false };
  } finally {
    lock.releaseLock();
  }
}

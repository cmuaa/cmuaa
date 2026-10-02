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
  const name = type === 'support' ? 'การสนับสนุนกิจกรรม' : type === 'send' ? 'หนังสือส่ง' : (type === 'finance' ? 'การเงิน' : 'หนังสือรับ');
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


// Registry.gs owns request validation and dispatch. Mutations only accept authenticated POST.
function doPost(e) {
  let result;
  try { result = registryDispatch(e.parameter || {}); }
  catch(err) { result = {ok:false,error:err.message}; }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const params = e.parameter || {};
  const callback = String(params.callback || 'callback');
  if (!/^[A-Za-z_$][\w$]*$/.test(callback)) return ContentService.createTextOutput('Invalid callback').setMimeType(ContentService.MimeType.TEXT);
  let result;
  try {
    if (!REGISTRY_READ_ACTIONS.includes(params.action)) throw new Error('การแก้ไขต้องใช้ POST พร้อมรหัสสำหรับบันทึก');
    result = registryDispatch(params);
  } catch(err) { result = {ok:false,error:err.message}; }
  return ContentService.createTextOutput(callback + '(' + JSON.stringify(result) + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function uploadFile(type, filename, mimetype, base64data, subfolder) {
  const allowedName = /\.(pdf|doc|docx|jpe?g|png)$/i.test(String(filename || ''));
  if (!allowedName) return { ok: false, error: 'Unsupported file type' };
  const bytes = Utilities.base64Decode(base64data);
  if (bytes.length > 10 * 1024 * 1024) return { ok: false, error: 'File exceeds 10 MB' };
  const folder = getSubFolder(type, subfolder);
  const blob = Utilities.newBlob(bytes, mimetype, filename);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { ok: true, url: file.getUrl(), id: file.getId() };
}

function validateDocumentRecord(type, r) {
  if (!r || !String(r.id || '').trim()) throw new Error('Document id is required');
  if (!String(r.subject || '').trim()) throw new Error('Document subject is required');
  if (type === 'recv') {
    if (!String(r.received_date || '').trim()) throw new Error('Received date is required');
    if (!String(r.from_org || '').trim()) throw new Error('Source organization is required');
  }
}

function addRecv(r) {
  validateDocumentRecord('recv', r);
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
  validateDocumentRecord('send', r);
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
    docno: r[1], ref_no: r[2], issue_date: formatCalendarDate(r[3]),
    from_org: r[4], to_org: r[5], subject: r[6],
    handler: r[7], receiver: r[8], received_date: formatCalendarDate(r[9]),
    deadline: formatCalendarDate(r[10]), doc_type: r[11], status: r[12], note: r[13], file_url: r[14], created_at: r[15] instanceof Date ? r[15].toISOString() : String(r[15] || '')
  }));

  const sendData = sendSheet.getDataRange().getValues().slice(1).map(r => ({
    id: String(r[0]), type: 'send',
    docno: r[1], issue_date: formatCalendarDate(r[2]), to_org: r[3],
    subject: r[4], detail: r[5], handler: r[6],
    sender: r[7], receiver_name: r[8], send_date: formatCalendarDate(r[9]),
    send_channel: r[10], doc_type: r[11], status: r[12], note: r[13], file_url: r[14], created_at: r[15] instanceof Date ? r[15].toISOString() : String(r[15] || '')
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
  validateDocumentRecord(type, r);
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
  const text = String(value).trim();
  // ข้อมูลใหม่จาก <input type="date"> จะอยู่ในรูป yyyy-MM-dd อยู่แล้ว
  const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];

  // รองรับข้อมูลเดิมที่ Sheets เก็บเป็นข้อความ Date เช่น
  // "Fri Aug 07 2026 00:00:00 GMT+0700 (...)" โดยห้าม slice ก่อน parse
  const parsed = new Date(text);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return text;
}

function formatCalendarTime(value) {
  if (!value) return '';
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'HH:mm');
  }
  const text = String(value).trim();
  const timeMatch = text.match(/^(\d{1,2}):(\d{2})/);
  if (timeMatch) return String(timeMatch[1]).padStart(2, '0') + ':' + timeMatch[2];

  const parsed = new Date(text);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'HH:mm');
  }
  return text;
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
  if (!String(r.title || '').trim()) return { ok: false, error: 'Calendar title is required' };
  const dateStart = formatCalendarDate(r.date_start);
  const dateEnd = formatCalendarDate(r.date_end);
  if (!dateStart) return { ok: false, error: 'Calendar start date is required' };
  if (dateEnd && dateEnd < dateStart) return { ok: false, error: 'Calendar end date must not be before start date' };
  const timeStart = formatCalendarTime(r.time_start);
  const timeEnd = formatCalendarTime(r.time_end);
  if ((!dateEnd || dateEnd === dateStart) && timeStart && timeEnd && timeEnd <= timeStart) {
    return { ok: false, error: 'Calendar end time must be after start time' };
  }

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

// การสนับสนุนกิจกรรม: a separate sheet leaves existing positional schemas intact.
const SUPPORT_HEADERS = ['id','หน่วยงาน','กิจกรรม','ปีที่บันทึก','ข้อมูลรายการ JSON','วันที่แก้ไข'];
function getAllSupport() {
  const sheet = getOrCreateSheet('การสนับสนุนกิจกรรม', SUPPORT_HEADERS);
  const records = sheet.getDataRange().getValues().slice(1).filter(r=>r[0]).map(r=>JSON.parse(r[4]));
  return {ok:true, records:records};
}
function saveSupport(r) {
  if (!r || typeof r.id !== 'string' || !r.id || !r.title || !r.agency) throw new Error('กรอกชื่อกิจกรรมและหน่วยงาน');
  if (!Number.isInteger(r.year) || r.year < 2400 || r.year > 2800) throw new Error('ปีที่บันทึกไม่ถูกต้อง');
  if (!Array.isArray(r.items) || !r.items.length) throw new Error('ไม่มีรายการที่สนับสนุน');
  if (!['รอพิจารณา','อนุมัติแล้ว','ไม่อนุมัติ'].includes(r.decision)) throw new Error('สถานะการพิจารณาไม่ถูกต้อง');
  if (!['รอดำเนินการ','ส่งมอบบางส่วน','เสร็จแล้ว','ยกเลิก'].includes(r.fulfilment)) throw new Error('สถานะการส่งมอบไม่ถูกต้อง');
  r.items.forEach(i=>{if (!i.description || !['เงิน','สิ่งของ','อาหาร','บริการ'].includes(i.kind) || !Number.isFinite(i.quantity) || i.quantity <= 0 || (i.unit_price !== null && (!Number.isFinite(i.unit_price) || i.unit_price < 0))) throw new Error('จำนวนหรือราคาของรายการย่อยไม่ถูกต้อง');});
  if (r.amount_request !== null && (!Number.isFinite(r.amount_request) || r.amount_request < 0)) throw new Error('ยอดที่ขอไม่ถูกต้อง');
  if (r.decision === 'ไม่อนุมัติ' && r.fulfilment === 'เสร็จแล้ว') throw new Error('รายการไม่อนุมัติไม่สามารถส่งมอบเสร็จแล้ว');
  if (!Array.isArray(r.finance_ids) || !Array.isArray(r.files)) throw new Error('ข้อมูลเอกสารเชื่อมโยงไม่ถูกต้อง');
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try {
    const sheet=getOrCreateSheet('การสนับสนุนกิจกรรม',SUPPORT_HEADERS);
    const rows=sheet.getDataRange().getValues();
    const records=rows.slice(1).filter(row=>row[0]).map(row=>JSON.parse(row[4]));
    r.finance_ids=[...new Set(r.finance_ids.map(String))];
    if(records.some(s=>s.id!==r.id && (s.finance_ids||[]).some(id=>r.finance_ids.includes(String(id))))) throw new Error('รายการการเงินนี้เชื่อมกับกิจกรรมอื่นแล้ว');
    if(r.document_id){const docs=getAll().records;if(!docs.some(d=>String(d.id)===r.document_id && d.type==='recv')) throw new Error('ไม่พบหนังสือรับที่เชื่อมไว้');}
    const finances=getAllFinance().records;
    if(r.finance_ids.some(id=>!finances.some(f=>String(f.id)===id))) throw new Error('ไม่พบรายการการเงินที่เชื่อมไว้');
    const index=rows.findIndex(row=>String(row[0])===r.id);
    if(index>0)r.created_at=JSON.parse(rows[index][4]).created_at;
    r.updated_at=new Date().toISOString();
    const json=JSON.stringify(r);if(json.length>45000)throw new Error('ข้อมูลยาวเกินไป กรุณาลดรายละเอียดหรือแนบไฟล์');
    const textCell=v=>/^[=+@-]/.test(String(v)) ? "'"+String(v) : String(v);
    const values=[r.id,textCell(r.agency),textCell(r.title),r.year,json,r.updated_at];
    if(index>0)sheet.getRange(index+1,1,1,values.length).setValues([values]);else sheet.appendRow(values);
    SpreadsheetApp.flush();return {ok:true,id:r.id};
  } finally {lock.releaseLock();}
}
function deleteSupport(id) {
  if(!id)throw new Error('ไม่พบรหัสรายการ');
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try{const sheet=getOrCreateSheet('การสนับสนุนกิจกรรม',SUPPORT_HEADERS);const rows=sheet.getDataRange().getValues();const index=rows.findIndex(r=>String(r[0])===String(id));if(index>0)sheet.deleteRow(index+1);SpreadsheetApp.flush();return {ok:true};}finally{lock.releaseLock();}
}

// Add this file alongside the current Code.gs. Existing document columns stay unchanged.
const REGISTRY_META_HEADERS = ['id', 'type', 'JSON'];
const REGISTRY_READ_ACTIONS = ['getAll', 'getAllFinance', 'getAllCalendar', 'getAllSupport', 'getRegistryConfig'];

function registryConfig(year) {
  year = Number(year);
  if (!Number.isInteger(year) || year < 2500 || year > 2700) throw new Error('ปีทะเบียนไม่ถูกต้อง');
  const props = PropertiesService.getScriptProperties();
  return { ok: true, version: 1, year: year,
    recv_start: Math.max(year === 2569 ? 120 : 1, Number(props.getProperty('CMU_START_recv_' + year) || 1)),
    send_start: Number(props.getProperty('CMU_START_send_' + year) || 1) };
}

function registryMetaMap() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ทะเบียนเอกสารเพิ่มเติม');
  const map = {};
  if (sheet) sheet.getDataRange().getValues().slice(1).forEach(function(row) {
    if (!row[0]) return;
    try { map[String(row[1]) + ':' + String(row[0])] = JSON.parse(row[2]); }
    catch (e) { throw new Error('ข้อมูลทะเบียนเพิ่มเติมเสียหาย กรุณาตรวจรายการ ' + row[0]); }
  });
  return map;
}

function registryGetAll() {
  const base = getAll();
  const meta = registryMetaMap();
  base.records = base.records.map(function(row) {
    const extra = meta[row.type + ':' + row.id] || {};
    return Object.assign({}, row, extra, { id: row.id, type: row.type, docno: row.docno });
  });
  return base;
}

function registryNumber(type, year, sequence) {
  return type === 'recv' ? sequence + '/' + year : 'สก.มช.' + sequence + '/' + year;
}

function registryParseNumber(type, value) {
  const number = String(value || '').trim();
  let match;
  if (type === 'recv') {
    match = number.match(/^(\d+)\s*\/\s*(\d{4})$/);
    if (match) return { year: Number(match[2]), sequence: Number(match[1]) };
    // Recognize the previous format without changing existing document numbers.
    match = number.match(/^รบ\.\s*(\d{4})-(\d+)$/);
    if (match) return { year: Number(match[1]), sequence: Number(match[2]) };
  } else {
    match = number.match(/^สก\.มช\.\s*(\d+)\/(\d{4})$/);
    if (match) return { year: Number(match[2]), sequence: Number(match[1]) };
  }
  return null;
}

function registryMaximum(records, type, year) {
  // Continue after the latest number confirmed by the association: 119/2569.
  let max = type === 'recv' && Number(year) === 2569 ? 119 : 0;
  records.filter(function(r) { return r.type === type; }).forEach(function(r) {
    const number = registryParseNumber(type, r.docno);
    if (number && number.year === Number(year)) max = Math.max(max, number.sequence);
  });
  return max;
}

function registrySaveDocument(row) {
  if (!row || !['recv', 'send'].includes(row.type)) throw new Error('ประเภทหนังสือไม่ถูกต้อง');
  const r = Object.assign({}, row);
  validateDocumentRecord(r.type, r);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const all = registryGetAll().records;
    const old = all.find(function(x) { return String(x.id) === String(r.id) && x.type === r.type; });
    if (!old && row.expected_updated_at) throw new Error('รายการเดิมถูกลบแล้ว กรุณาซิงก์ใหม่');
    if (old && row.expected_updated_at && old.updated_at !== row.expected_updated_at) throw new Error('รายการนี้เปลี่ยนแล้ว กรุณาซิงก์และเปิดแก้ไขใหม่');
    const year = Number(r.number_year);
    const config = registryConfig(year);
    const props = PropertiesService.getScriptProperties();
    const counterKey = 'CMU_LAST_' + r.type + '_' + year;
    let sequence = Number(props.getProperty(counterKey) || 0);
    if (!old && r.auto_number) {
      sequence = Math.max(sequence, registryMaximum(all, r.type, year), Number(config[r.type + '_start']) - 1) + 1;
      r.docno = registryNumber(r.type, year, sequence);
    } else if (old && r.auto_number) { r.docno = old.docno; }
    r.docno = String(r.docno || '').trim();
    if (!r.docno) throw new Error('กรอกเลขหนังสือหรือเลือกออกเลขอัตโนมัติ');
    if (all.some(function(x) { return x.type === r.type && String(x.id) !== String(r.id) && String(x.docno).trim() === r.docno; })) throw new Error('เลขหนังสือซ้ำกับรายการเดิม');
    r.reply_to = r.type === 'send' ? String(r.reply_to || '') : '';
    if (r.reply_to && !all.some(function(x) { return x.type === 'recv' && x.id === r.reply_to; })) throw new Error('ไม่พบหนังสือรับต้นเรื่อง กรุณาซิงก์ใหม่');
    r.tags = (Array.isArray(r.tags) ? r.tags : []).map(function(x) { return String(x).trim().slice(0, 60); }).filter(Boolean).slice(0, 12);
    r.created_at = old && old.created_at || r.created_at || new Date().toISOString();
    r.updated_at = new Date().toISOString();
    const extra = { reply_to: r.reply_to, tags: r.tags, number_year: year, auto_number: !!r.auto_number,
      created_at: r.created_at, updated_at: r.updated_at, signature: r.signature || '' };
    // Prepare metadata before committing the base record; retrying the same id updates it, never appends twice.
    const sheet = getOrCreateSheet('ทะเบียนเอกสารเพิ่มเติม', REGISTRY_META_HEADERS);
    const data = sheet.getDataRange().getValues();
    const index = data.findIndex(function(x, i) { return i > 0 && String(x[0]) === String(r.id) && x[1] === r.type; });
    const values = [String(r.id), r.type, JSON.stringify(extra)];
    const result = old ? updateRecord(r.type, r) : r.type === 'recv' ? addRecv(r) : addSend(r);
    if (!result || !result.ok) throw new Error(result && result.error || 'บันทึกหนังสือไม่สำเร็จ');
    if (index > 0) sheet.getRange(index + 1, 1, 1, 3).setValues([values]); else sheet.appendRow(values);
    if (!old && r.auto_number) props.setProperty(counterKey, String(sequence));
    delete r.expected_updated_at;
    return { ok: true, record: r };
  } finally { lock.releaseLock(); }
}

function registrySetConfig(params) {
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const year = Number(params.year); const config = registryConfig(year);
    const records = registryGetAll().records;
    const props = PropertiesService.getScriptProperties();
    ['recv', 'send'].forEach(function(type) {
      const start = Number(params[type + '_start']);
      const maximum = Math.max(registryMaximum(records, type, year), Number(props.getProperty('CMU_LAST_' + type + '_' + year) || 0));
      if (!Number.isSafeInteger(start) || start < 1 || start <= maximum) throw new Error('เลขเริ่มต้นต้องมากกว่าเลขที่ใช้แล้ว (' + type + ': ' + maximum + ')');
    });
    ['recv', 'send'].forEach(function(type) { props.setProperty('CMU_START_' + type + '_' + year, String(params[type + '_start'])); });
    return registryConfig(year);
  } finally { lock.releaseLock(); }
}

function registryDeleteDocument(id) {
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const records = registryGetAll().records;
    const r = records.find(function(x) { return x.id === String(id); });
    if (!r) throw new Error('ไม่พบหนังสือ');
    const number = registryParseNumber(r.type, r.docno);
    if (number) {
      const year = number.year;
      const key = 'CMU_LAST_' + r.type + '_' + year;
      const props = PropertiesService.getScriptProperties();
      props.setProperty(key, String(Math.max(registryMaximum(records, r.type, year), Number(props.getProperty(key) || 0))));
    }
    return deleteRecord(id);
  } finally { lock.releaseLock(); }
}

function registryDispatch(params) {
  const action = params.action;
  switch (action) {
    case 'getRegistryConfig': return registryConfig(params.year);
    case 'setRegistryConfig': return registrySetConfig(params);
    case 'saveRegistryDocument': return registrySaveDocument(JSON.parse(params.row));
    case 'getAll': return registryGetAll();
    case 'uploadFile': return uploadFile(params.type, params.filename, params.mimetype, params.data, params.subfolder);
    // Older clients cannot bypass numbering, duplicate checks, or metadata preservation.
    case 'addRecv': case 'addSend': case 'updateRecord': {
      const r = JSON.parse(params.row); r.type = action === 'addRecv' ? 'recv' : action === 'addSend' ? 'send' : params.type;
      const old = registryGetAll().records.find(function(x) { return String(x.id) === String(r.id) && x.type === r.type; });
      const merged = Object.assign({}, old || {}, r);
      merged.number_year = merged.number_year || Number(Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy')) + 543;
      return registrySaveDocument(merged);
    }
    case 'updateStatus': {
      const r = registryGetAll().records.find(function(x) { return x.type === params.type && x.id === String(params.id); });
      if (!r) throw new Error('ไม่พบหนังสือ'); r.status = params.status;
      if (!['pend', 'done'].includes(r.status)) throw new Error('สถานะไม่ถูกต้อง');
      r.number_year = r.number_year || Number(Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy')) + 543;
      return registrySaveDocument(r);
    }
    case 'delete': return registryDeleteDocument(params.id);
    case 'getAllFinance': return getAllFinance();
    case 'addFinance': return addFinance(JSON.parse(params.row));
    case 'updateFinance': return updateFinance(JSON.parse(params.row));
    case 'deleteFinance': return deleteFinance(params.id);
    case 'getAllCalendar': return getAllCalendar();
    case 'addCalendar': return addCalendar(JSON.parse(params.row));
    case 'updateCalendar': return updateCalendar(JSON.parse(params.row));
    case 'deleteCalendar': return deleteCalendar(params.id);
    case 'getAllSupport': return getAllSupport();
    case 'saveSupport': return saveSupport(JSON.parse(params.row));
    case 'deleteSupport': return deleteSupport(params.id);
    default: return { ok: false, error: 'ไม่รองรับคำสั่งนี้ กรุณาตรวจ Apps Script เวอร์ชันล่าสุด' };
  }
}

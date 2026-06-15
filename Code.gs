// Code.gs — CMU Alumni Document Tracker Backend (JSONP version)

const HEADERS_RECV = [
  'id','เลขหนังสือรับ','ที่ (เลขจากหน่วยงาน)','วันที่ออกหนังสือ',
  'จาก','ถึง','เรื่อง','การปฏิบัติ','ผู้รับในสมาคม',
  'ได้รับวันที่','กำหนดตอบ','ประเภทเอกสาร','สถานะ','หมายเหตุ','วันที่บันทึก'
];

const HEADERS_SEND = [
  'id','เลขที่ส่ง','วันที่ออก','ถึง','เรื่อง','รายละเอียด',
  'การปฏิบัติ','ผู้ส่ง','ผู้รับ','วันที่ส่ง','ช่องทางส่ง',
  'ประเภทเอกสาร','สถานะ','หมายเหตุ','วันที่บันทึก'
];

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
      case 'updateStatus':
        result = updateStatus(params.type, params.id, params.status);
        break;
      case 'delete':
        result = deleteRecord(params.id);
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

function addRecv(r) {
  const sheet = getOrCreateSheet('หนังสือรับ', HEADERS_RECV);
  sheet.appendRow([
    r.id || Date.now().toString(),
    r.docno || '', r.ref_no || '', r.issue_date || '',
    r.from_org || '', r.to_org || '', r.subject || '',
    r.handler || '', r.receiver || '', r.received_date || '',
    r.deadline || '', r.doc_type || '', r.status || 'pend',
    r.note || '', new Date().toISOString()
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
    r.note || '', new Date().toISOString()
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
    deadline: r[10], doc_type: r[11], status: r[12], note: r[13]
  }));

  const sendData = sendSheet.getDataRange().getValues().slice(1).map(r => ({
    id: String(r[0]), type: 'send',
    docno: r[1], issue_date: r[2], to_org: r[3],
    subject: r[4], detail: r[5], handler: r[6],
    sender: r[7], receiver_name: r[8], send_date: r[9],
    send_channel: r[10], doc_type: r[11], status: r[12], note: r[13]
  }));

  const all = [...recvData, ...sendData]
    .filter(r => r.id)
    .sort((a, b) => b.id.localeCompare(a.id));
  return { ok: true, records: all };
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

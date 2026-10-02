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
  if (!['รอพิจารณา','อนุมัติแล้ว','ไม่อนุมัติ','ไม่ระบุ'].includes(r.decision)) throw new Error('สถานะการพิจารณาไม่ถูกต้อง');
  if (!['รอดำเนินการ','ส่งมอบบางส่วน','เสร็จแล้ว','ยกเลิก','ไม่ระบุ'].includes(r.fulfilment)) throw new Error('สถานะการส่งมอบไม่ถูกต้อง');
  r.items.forEach(i=>{if (!i.description || !['เงิน','สิ่งของ','อาหาร','บริการ','ไม่ระบุ'].includes(i.kind) || !Number.isFinite(i.quantity) || i.quantity <= 0 || (i.unit_price !== null && (!Number.isFinite(i.unit_price) || i.unit_price < 0))) throw new Error('จำนวนหรือราคาของรายการย่อยไม่ถูกต้อง');});
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

/* Small-team document register. The shared view link only changes the interface. */
window.Registry = {
  viewer: new URLSearchParams(location.search).get('view') === '1',
  configs: {}, busy: false, draftId: null,
  canWrite() { return !this.viewer; },
  requireWriter() {
    if (this.canWrite()) return true;
    showToast('หน้านี้สำหรับดูเอกสารเท่านั้น');
    return false;
  },
  number(type, year, seq) { return type === 'recv' ? `${seq}/${year}` : `สก.มช.${seq}/${year}`; },
  parseNumber(type, value) {
    const number=String(value||'').trim();
    let match;
    if(type==='recv') {
      match=number.match(/^(\d+)\s*\/\s*(\d{4})$/);
      if(match)return {year:Number(match[2]),sequence:Number(match[1])};
      match=number.match(/^รบ\.\s*(\d{4})-(\d+)$/);
      if(match)return {year:Number(match[1]),sequence:Number(match[2])};
    } else {
      match=number.match(/^สก\.มช\.\s*(\d+)\/(\d{4})$/);
      if(match)return {year:Number(match[2]),sequence:Number(match[1])};
    }
    return null;
  },
  max(type, year) {
    // Latest confirmed incoming number is 119/2569; do not issue lower numbers.
    const lastKnown=type==='recv'&&Number(year)===2569?119:0;
    return state.records.filter(r=>r.type===type).reduce((max,r)=>{
      const number=this.parseNumber(type,r.docno);
      return number&&number.year===Number(year)?Math.max(max,number.sequence):max;
    },lastKnown);
  },
  async config(year) {
    if(this.configs[year]) return this.configs[year];
    let c;
    if(API.url) c=await API.call({action:'getRegistryConfig',year});
    else c=JSON.parse(localStorage.getItem('cmu_registry_config_'+year)||'null')||{year:Number(year),recv_start:Number(year)===2569?120:1,send_start:1};
    if(!c || (API.url && c.version!==1)) throw Error('อัปเดต Apps Script ตาม REGISTRY_SETUP.md ก่อนใช้ทะเบียนใหม่');
    this.configs[year]=c; return c;
  },
  async preview() {
    const type=currentFormType, year=Number(document.getElementById('registry-year').value);
    const input=document.getElementById(type==='recv'?'f-recv-docno':'f-send-docno');
    const automatic=document.getElementById('registry-auto').checked;
    input.readOnly=automatic;
    const hint=document.getElementById('registry-number-hint');
    if(!automatic) {hint.textContent='กรอกเลขตามทะเบียนเดิม ระบบจะตรวจเลขซ้ำก่อนบันทึก';return;}
    try {
      const c=await this.config(year);
      if(type!==currentFormType||year!==Number(document.getElementById('registry-year').value)||!document.getElementById('registry-auto').checked)return;
      const n=this.number(type,year,Math.max(this.max(type,year),Number(c[type+'_start'])-1)+1);
      input.value=type==='send'?n.replace(/^สก\.มช\./,''):n;
      hint.textContent=API.url?'เลขตัวอย่าง — ระบบจะออกเลขจริงเมื่อบันทึกสำเร็จ':'เลขจากข้อมูลในเครื่องนี้ — ยังไม่ได้เชื่อมทะเบียนกลาง';
    } catch(e) {input.value='';hint.textContent=e.message;}
  },
  prepareForm(isEdit) {
    const old=isEdit?state.records.find(r=>r.id===editingId):null;
    if(!isEdit)this.draftId=crypto.randomUUID();
    document.getElementById('registry-year').value=old?.number_year||Number(localDateISO().slice(0,4))+543;
    document.getElementById('registry-auto').checked=!isEdit;
    document.getElementById('registry-auto').disabled=isEdit;
    document.getElementById('registry-year').disabled=isEdit;
    document.getElementById('registry-tags').value=(old?.tags||[]).join(', ');
    this.relatedOptions(old?.reply_to||'');
    document.getElementById('registry-reply-field').hidden=currentFormType!=='send';
    if(!isEdit)void this.preview();
    else {document.getElementById(currentFormType==='recv'?'f-recv-docno':'f-send-docno').readOnly=false;document.getElementById('registry-number-hint').textContent='รายการเดิมคงเลขหนังสือไว้ แก้ไขได้โดยระบบจะตรวจเลขซ้ำ';}
  },
  relatedOptions(selected) {
    document.getElementById('registry-reply').innerHTML='<option value="">ไม่เชื่อมหนังสือรับ</option>'+state.records.filter(r=>r.type==='recv').map(r=>`<option value="${esc(r.id)}">${esc(r.docno||'ไม่มีเลข')} · ${esc(r.subject)}</option>`).join('');
    document.getElementById('registry-reply').value=selected;
  },
  async saveForm() {
    if(!this.requireWriter()||this.busy)return;
    const get=id=>document.getElementById(id)?.value?.trim()||'';
    const type=currentFormType, old=editingId?state.records.find(r=>r.id===editingId):null;
    const subject=get(type==='recv'?'f-subject':'f-subject-send');
    if(!subject || type==='recv'&&(!get('f-received-date')||!get('f-from-org'))) {showLoadingError('กรอกเรื่อง วันที่รับ และหน่วยงานต้นทางให้ครบ','ข้อมูลยังไม่ครบ');return;}
    const year=Number(get('registry-year'));
    if(!Number.isInteger(year)||year<2500||year>2700){showLoadingError('กรุณาระบุปี พ.ศ. 2500–2700');return;}
    let r={...old,id:old?.id||this.draftId||crypto.randomUUID(),type,subject,status:get('f-status'),doc_type:get('f-doc-type'),handler:get(type==='recv'?'f-handler':'f-handler-send'),note:get('f-note'),
      number_year:year,auto_number:!old&&document.getElementById('registry-auto').checked,
      tags:[...new Set(get('registry-tags').split(',').map(x=>x.trim()).filter(Boolean))].slice(0,12),
      reply_to:type==='send'?get('registry-reply'):'',file_url:old?.file_url||'',
      created_at:old?.created_at||new Date().toISOString(),updated_at:new Date().toISOString(),expected_updated_at:old?.updated_at||''};
    if(type==='recv')Object.assign(r,{docno:get('f-recv-docno'),ref_no:get('f-ref-no'),issue_date:get('f-issue-date'),from_org:get('f-from-org'),to_org:get('f-to-org-recv'),received_date:get('f-received-date'),deadline:get('f-deadline'),receiver:get('f-receiver')});
    else Object.assign(r,{docno:get('f-send-docno')?'สก.มช.'+get('f-send-docno'):'',issue_date:get('f-issue-date-send'),to_org:get('f-to-org'),detail:get('f-detail'),sender:get('f-sender'),receiver_name:get('f-receiver-name'),send_date:get('f-send-date'),send_channel:get('f-send-channel')});
    if(state.sigPad&&!state.sigPad.isEmpty())r.signature=state.sigPad.toDataURL();
    const file=document.getElementById('f-file').files[0];
    if(file && (!/\.(pdf|doc|docx|jpe?g|png)$/i.test(file.name)||file.size>10*1024*1024)){showLoadingError('ใช้ไฟล์ PDF, Word, JPG หรือ PNG ขนาดไม่เกิน 10 MB');return;}
    if(file&&!API.url){showLoadingError('เชื่อมระบบกลางก่อนแนบไฟล์ หรือบันทึกโดยไม่แนบไฟล์ก่อน');return;}
    this.busy=true;document.getElementById('submit-btn').disabled=true;
    showLoadingOverlay('กำลังบันทึกหนังสือ กรุณารอสักครู่','กำลังบันทึก…');
    try{
      await waitForSavePopupPaint();
      const config=await this.config(year);
      if(!API.url&&r.auto_number)r.docno=this.number(type,year,Math.max(this.max(type,year),Number(config[type+'_start'])-1)+1);
      if(!r.auto_number && (!r.docno||state.records.some(x=>x.id!==r.id&&x.type===type&&x.docno===r.docno)))throw Error('เลขหนังสือว่างหรือซ้ำกับรายการเดิม');
      // Keep uploaded file for a retry when saving metadata fails.
      if(file){
        const fingerprint=file.name+':'+file.size+':'+file.lastModified;
        if(this.uploadCache?.id===r.id&&this.uploadCache.fingerprint===fingerprint)r.file_url=this.uploadCache.url;
        else {const uploaded=await API.upload(type,file);if(!uploaded?.url)throw Error('อัปโหลดไฟล์แนบไม่สำเร็จ');r.file_url=uploaded.url;this.uploadCache={id:r.id,fingerprint,url:uploaded.url};}
      }
      if(API.url){const res=await API.post({action:'saveRegistryDocument',row:JSON.stringify(r)});if(!res.record?.id)throw Error('ระบบไม่ส่งข้อมูลที่บันทึกกลับมา กรุณาอัปเดต Apps Script');r=normalizeDocumentRecord(res.record);r._local_only=false;}
      else {delete r.expected_updated_at;r._local_only=true;}
      state.records=state.records.filter(x=>x.id!==r.id).concat(r);
      if(!API.url&&r.auto_number){localStorage.setItem('cmu_registry_last_'+type+'_'+year,String(this.max(type,year)));}
      saveLocal();renderList();checkDeadlines();if(state.page==='home')renderHome();
      closeForm();editingId=null;this.draftId=null;this.uploadCache=null;
      showLoadingSuccess(`${API.url?'บันทึกในทะเบียนกลางแล้ว':'บันทึกในเครื่องนี้แล้ว'}\nเลขหนังสือ: ${r.docno}`,'บันทึกเรียบร้อย');
    }catch(e){showLoadingError(e.message+'\nข้อมูลในฟอร์มยังอยู่ สามารถลองบันทึกอีกครั้งได้','ยังบันทึกไม่สำเร็จ');}
    finally{this.busy=false;document.getElementById('submit-btn').disabled=false;}
  },
  async changeStatus(id) {
    if(!this.requireWriter()||this.busy)return;
    const r=state.records.find(x=>x.id===id);if(!r)return;
    this.busy=true;
    try{let updated={...r,status:r.status==='pend'?'done':'pend',number_year:r.number_year||Number(localDateISO().slice(0,4))+543,expected_updated_at:r.updated_at||''};
      if(API.url){const res=await API.post({action:'saveRegistryDocument',row:JSON.stringify(updated)});updated=res.record;if(!updated)throw Error('ไม่พบผลการบันทึก');}
      state.records=state.records.map(x=>x.id===id?updated:x);saveLocal();renderList();openDetail(id);showToast('บันทึกสถานะแล้ว');
    }catch(e){showLoadingError(e.message,'เปลี่ยนสถานะไม่สำเร็จ');}finally{this.busy=false;}
  },
  async remove(id) {
    if(!this.requireWriter()||this.busy||!confirm('ลบหนังสือรายการนี้? เลขที่ออกแล้วจะไม่ถูกนำกลับมาใช้ซ้ำ'))return;
    this.busy=true;
    try{if(API.url)await API.post({action:'delete',id});else{const r=state.records.find(x=>x.id===id);if(r){const number=this.parseNumber(r.type,r.docno);const year=number?.year||r.number_year||Number(localDateISO().slice(0,4))+543;const key='cmu_registry_last_'+r.type+'_'+year;localStorage.setItem(key,String(Math.max(Number(localStorage.getItem(key)||0),this.max(r.type,year))));}}
      state.records=state.records.filter(x=>x.id!==id);saveLocal();closeDetail();renderList();showToast('ลบหนังสือแล้ว');
    }catch(e){showLoadingError(e.message,'ลบไม่สำเร็จ');}finally{this.busy=false;}
  },
  detail(id) {
    const r=state.records.find(x=>x.id===id);if(!r)return;
    const links=r.type==='recv'?state.records.filter(x=>x.type==='send'&&x.reply_to===id):state.records.filter(x=>x.type==='recv'&&x.id===r.reply_to);
    const section=document.createElement('section');section.className='registry-related';
    section.innerHTML=`<h3>${r.type==='recv'?'หนังสือตอบกลับ':'หนังสือรับต้นเรื่อง'}</h3>${links.length?links.map(x=>`<button type="button" data-document="${esc(x.id)}">${esc(x.docno)} · ${esc(x.subject)}</button>`).join(''):'<p>ยังไม่มีเอกสารเชื่อมโยง</p>'}${r.tags?.length?`<p>แฟ้ม: ${r.tags.map(esc).join(' · ')}</p>`:''}${r.type==='recv'&&this.canWrite()?'<button type="button" class="writer-only" id="registry-new-reply">สร้างหนังสือตอบกลับจากเรื่องนี้</button>':''}`;
    document.getElementById('detail-body').append(section);
    section.querySelectorAll('[data-document]').forEach(b=>b.onclick=()=>openDetail(b.dataset.document));
    document.getElementById('registry-new-reply')?.addEventListener('click',()=>{closeDetail();openForm('send');document.getElementById('registry-reply').value=id;document.getElementById('f-to-org').value=r.from_org||'';document.getElementById('f-subject-send').value='ตอบกลับ: '+r.subject;});
    this.markActions();
  },
  filtered() {
    const from=document.getElementById('registry-from').value,to=document.getElementById('registry-to').value;
    const kind=document.getElementById('registry-kind').value;
    const q=state.search||'';
    return state.records.filter(r=>{const date=dateInputValue(r.type==='recv'?r.received_date:(r.send_date||r.issue_date));
      const matches=(!kind||r.type===kind)&&(!from||date>=from)&&(!to||date&&date<=to);
      return matches&&(!q||[r.docno,r.ref_no,r.subject,r.from_org,r.to_org,r.handler,r.note,...(r.tags||[])].some(v=>String(v||'').toLowerCase().includes(q)));
    }).sort((a,b)=>String(a.type==='recv'?a.received_date:a.send_date||a.issue_date).localeCompare(String(b.type==='recv'?b.received_date:b.send_date||b.issue_date))||String(a.docno).localeCompare(String(b.docno),'th',{numeric:true}));
  },
  reportRows() {return this.filtered().map(r=>[r.type==='recv'?'รับ':'ส่ง',r.docno||'',r.type==='recv'?r.received_date:r.send_date||r.issue_date,r.issue_date||'',r.subject||'',r.type==='recv'?r.from_org:r.to_org,r.ref_no||'',r.send_channel||'',r.status==='done'?'เสร็จสิ้น':'รอดำเนินการ',r.note||'']);},
  reportHeaders:['ประเภท','เลขทะเบียน','วันที่รับ/ส่ง','วันที่หนังสือ','เรื่อง','จาก/ถึง','เลขต้นทาง','ช่องทางส่ง','สถานะ','หมายเหตุ'],
  export() {
    const rows=this.reportRows();if(!rows.length){document.getElementById('registry-report-error').textContent='ไม่มีรายการในช่วงที่เลือก';return;}
    const cell=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';
    const csv='\ufeff'+[this.reportHeaders,...rows].map(r=>r.map(cell).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='ทะเบียนรับส่ง-'+localDateISO()+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  },
  print() {
    const rows=this.reportRows();if(!rows.length){document.getElementById('registry-report-error').textContent='ไม่มีรายการในช่วงที่เลือก';return;}
    document.getElementById('registry-print-frame')?.remove();
    const frame=document.createElement('iframe');frame.id='registry-print-frame';frame.title='ทะเบียนสำหรับพิมพ์';frame.style.cssText='position:fixed;width:1px;height:1px;left:-10000px;border:0';
    frame.onload=()=>{frame.contentWindow.focus();frame.contentWindow.print();};
    frame.srcdoc=`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ทะเบียนรับ–ส่งเอกสาร</title><style>@page{size:A4 landscape;margin:12mm}body{font-family:Tahoma,sans-serif;color:#222;font-size:10pt}h1{font-size:18pt}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #aaa;padding:6px;overflow-wrap:anywhere;vertical-align:top}th{background:#eee}thead{display:table-header-group}tr{break-inside:avoid}th:nth-child(5){width:22%}th:nth-child(6){width:12%}</style></head><body><h1>ทะเบียนรับ–ส่งเอกสาร</h1><p>สมาคมนักศึกษาเก่ามหาวิทยาลัยเชียงใหม่ · ${rows.length} รายการ</p><p>ช่วงวันที่: ${esc(document.getElementById('registry-from').value||'ทั้งหมด')} ถึง ${esc(document.getElementById('registry-to').value||'ทั้งหมด')}</p><table><thead><tr>${this.reportHeaders.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>'<tr>'+row.map(v=>`<td>${esc(v)}</td>`).join('')+'</tr>').join('')}</tbody></table></body></html>`;
    document.body.append(frame);
  },
  openReport() {document.getElementById('registry-report-error').textContent='';document.getElementById('registry-report-dialog').showModal();},
  share() {
    if(!API.url){showLoadingError('ตั้งค่าและเชื่อมทะเบียนกลางก่อนสร้างลิงก์ดูเอกสาร');return;}
    const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('view','1');url.searchParams.set('api',API.url);
    document.getElementById('registry-share-url').value=url.href;document.getElementById('registry-share-dialog').showModal();
  },
  markActions() {
  const re=/\b(openForm|openEditForm|toggleStatus|deleteRecord|newSupportFromDocument|openFinForm|openFinEditForm|deleteFinRecord|openCalForm|openCalEditForm|deleteCalRecord|openSupportForm|openRentForm|openRentBatchForm|openMasterMeterForm|openShirtStockForm|openShirtLogForm|homeAdd|homeAddMenu)\s*\(/;
    document.querySelectorAll('[onclick]').forEach(el=>{if(re.test(el.getAttribute('onclick')))el.classList.add('writer-only');});
    document.querySelectorAll('#home-add,#sup-add,.sup-create-from-doc,[data-home-filter="การเงิน"],[data-home-filter="การสนับสนุน"],[data-home-tab="การเงิน"],[data-home-tab="การสนับสนุน"]').forEach(el=>el.classList.add('writer-only'));
  },
  applyMode() {
    document.body.classList.toggle('registry-reader',!this.canWrite());
    document.body.classList.toggle('registry-viewer',this.viewer);
    document.getElementById('registry-mode-label').textContent=this.viewer?'โหมดดูเอกสาร':(API.url?'ทะเบียนรับ–ส่งเอกสาร':'โหมดบันทึกในเครื่อง');
    this.markActions();
  },
  homeMetrics() {
    if(!document.getElementById('page-home'))return;
    const month=localDateISO().slice(0,7);
    const recv=state.records.filter(r=>r.type==='recv'&&String(r.received_date||'').startsWith(month)).length;
    const send=state.records.filter(r=>r.type==='send'&&String(r.send_date||r.issue_date||'').startsWith(month)).length;
    const due=state.records.filter(r=>r.type==='recv'&&r.deadline&&r.status==='pend').length;
    const old=document.getElementById('registry-metrics');if(old)old.remove();
    const el=document.createElement('section');el.id='registry-metrics';el.className='registry-metrics';el.setAttribute('aria-label','สรุปทะเบียนเอกสาร');
    el.innerHTML=[['รับเดือนนี้',recv],['ส่งเดือนนี้',send],['เอกสารทั้งหมด',state.records.length],['เรื่องที่ต้องตอบ',due]].map(([label,n])=>`<div><span>${label}</span><b>${n}</b></div>`).join('');document.getElementById('page-home').prepend(el);this.markActions();
  },
  async saveConfig(event) {
    event.preventDefault();if(!this.requireWriter())return;const form=event.target,button=form.querySelector('[type="submit"]');button.disabled=true;
    const year=Number(document.getElementById('registry-config-year').value),recv=Number(document.getElementById('registry-recv-start').value),send=Number(document.getElementById('registry-send-start').value);
    const error=document.getElementById('registry-config-error');error.textContent='';
    try{if(!Number.isInteger(year)||year<2500||year>2700||![recv,send].every(n=>Number.isSafeInteger(n)&&n>=1))throw Error('ตรวจปีและเลขเริ่มต้นให้ถูกต้อง');
      let c;if(API.url)c=await API.post({action:'setRegistryConfig',year,recv_start:recv,send_start:send});
      else{if(recv<=this.max('recv',year)||send<=this.max('send',year))throw Error('เลขเริ่มต้นต้องมากกว่าเลขที่ใช้แล้ว');c={year,recv_start:recv,send_start:send};localStorage.setItem('cmu_registry_config_'+year,JSON.stringify(c));}
      this.configs[year]=c;document.getElementById('registry-config-dialog').close();showToast('บันทึกเลขเริ่มต้นแล้ว');
    }catch(e){error.textContent=e.message;}finally{button.disabled=false;}
  },
  async openConfig() {
    if(!this.requireWriter())return;const year=Number(localDateISO().slice(0,4))+543;document.getElementById('registry-config-year').value=year;
    document.getElementById('registry-config-error').textContent='';document.getElementById('registry-config-dialog').showModal();
    await this.loadConfigInputs();
  },
  async loadConfigInputs() {
    const year=Number(document.getElementById('registry-config-year').value);
    try{const c=await this.config(year);document.getElementById('registry-recv-start').value=Math.max(Number(c.recv_start),this.max('recv',year)+1);document.getElementById('registry-send-start').value=Math.max(Number(c.send_start),this.max('send',year)+1);}
    catch(e){document.getElementById('registry-config-error').textContent=e.message;}
  }
};

// Hook existing screens without replacing finance, calendar, support, or their data.
(() => {
  const R=Registry;
  sessionStorage.removeItem('cmu_write_key');sessionStorage.removeItem('cmu_write_api');
  const params=new URLSearchParams(location.search), shared=params.get('api');
  if(shared){try{const u=new URL(shared);if(u.protocol!=='https:'||u.hostname!=='script.google.com'||!/^\/macros\/s\/[^/]+\/exec$/.test(u.pathname))throw Error('invalid');API.setUrl(u.href);}catch(e){R.badSharedUrl=true;}}
  const baseMax=R.max.bind(R);R.max=(type,year)=>Math.max(baseMax(type,year),Number(localStorage.getItem('cmu_registry_last_'+type+'_'+year)||0));
  const open=window.openForm;window.openForm=function(type,isEdit){if(!R.requireWriter())return;open(type,isEdit);R.prepareForm(!!isEdit);};
  const edit=window.openEditForm;window.openEditForm=function(id){if(!R.requireWriter())return;edit(id);R.prepareForm(true);};
  const type=window.setFormType;window.setFormType=function(t){type(t);if(document.getElementById('registry-reply-field')){document.getElementById('registry-reply-field').hidden=t!=='send';if(!editingId)void R.preview();}};
  const detail=window.openDetail;window.openDetail=function(id){detail(id);R.detail(id);};
  const home=window.renderHome;window.renderHome=function(){home();R.homeMetrics();};
  const tasks=window.homeTasks;window.homeTasks=function(){const rows=tasks();return R.canWrite()?rows:rows.filter(r=>r.kind==='doc');};
  const recent=window.homeRecentRecords;window.homeRecentRecords=function(){const rows=recent();return R.canWrite()?rows:rows.filter(r=>r.kind==='doc');};
  const list=window.renderList;window.renderList=function(){list();R.markActions();};
  const sync=window.syncFromSheets;window.syncFromSheets=async function(options={}){
    if(R.canWrite())return sync(options);
    if(!API.url||state.syncing)return;
    state.syncing=true;setSyncLoading(true);
    try{const res=ensureSyncResponse(await API.getAll());if(!Array.isArray(res.records))throw Error('รูปแบบข้อมูลไม่ถูกต้อง');state.records=res.records.map(normalizeDocumentRecord);saveLocal();renderList();checkDeadlines();await syncCalFromSheets();if(state.page==='home')renderHome();lastSuccessfulSyncAt=Date.now();localStorage.setItem('cmu_last_successful_sync',String(lastSuccessfulSyncAt));if(!options.silent)showToast('ซิงก์ทะเบียนแล้ว');}
    catch(e){if(!options.silent)showLoadingError(e.message,'ซิงก์ไม่สำเร็จ');}
    finally{state.syncing=false;setSyncLoading(false);updateConnectionStatus();R.applyMode();}
  };
  const nav=window.switchPage;window.switchPage=function(page){if(!R.canWrite()&&!['home','list','stats','calendar','settings'].includes(page)){showToast('โหมดดูเอกสาร');return;}nav(page);R.applyMode();};
  // Do not let an old mutation handler edit local state in view-only mode.
  ['homeAdd','homeAddMenu','openFinForm','openFinEditForm','submitFinForm','deleteFinRecord','openCalForm','openCalEditForm','submitCalForm','deleteCalRecord','openSupportForm','supportSave','supportDelete','newSupportFromDocument','openRentForm','openRentEditForm','submitRentForm','openRentBatchForm','submitRentBatchAll','deleteRentRecord','openMasterMeterForm','submitMasterMeter','openShirtStockForm','openShirtEditForm','submitShirtStockForm','deleteShirtStockRecord','openShirtLogForm','submitShirtLog','deleteShirtLogEntry','triggerShirtPhotoUpload'].forEach(name=>{const fn=window[name];if(typeof fn==='function')window[name]=function(...args){if(!R.requireWriter()){args[0]?.preventDefault?.();return;}return fn.apply(this,args);};});
  window.submitForm=()=>R.saveForm();window.toggleStatus=id=>R.changeStatus(id);window.deleteRecord=id=>R.remove(id);window.exportCSV=()=>R.openReport();
  const setUrl=window.saveApiUrl;window.saveApiUrl=function(){R.configs={};setUrl();R.applyMode();};
  document.addEventListener('DOMContentLoaded',()=>{
    document.getElementById('registry-config-form').addEventListener('submit',e=>R.saveConfig(e));
    document.getElementById('registry-config-year').addEventListener('change',()=>R.loadConfigInputs());
    ['registry-auto','registry-year'].forEach(id=>document.getElementById(id).addEventListener('change',()=>R.preview()));
    R.applyMode();R.homeMetrics();if(R.viewer)switchPage('list');
    if(R.badSharedUrl)showToast('ลิงก์ทะเบียนกลางไม่ถูกต้อง กรุณาขอลิงก์ใหม่');
    const observer=new MutationObserver(()=>R.markActions());observer.observe(document.getElementById('app'),{childList:true,subtree:true});
  });
})();

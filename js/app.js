/* app.js — CMU Alumni Document Tracker */

// ===== STATE =====
let state = {
  records: [],
  page: 'list',
  filter: 'all',
  search: '',
  loading: false,
  syncing: false,
  detailId: null,
  editingType: 'recv',
  sigPad: null,
  currentPage: 1,
  pageSize: 20,
};

// ===== FINANCE STATE =====
let finState = {
  records: [],
  filter: 'all',
  search: '',
  detailId: null,
  currentPage: 1,
  pageSize: 20,
};
let finEditingId = null;

// ===== RENT STATE (ค่าเช่า) =====
let rentState = {
  records: [],
  filter: 'all',
  search: '',
  detailId: null,
  currentPage: 1,
  pageSize: 20,
};
let rentEditingId = null;

// ===== MASTER METER STATE (มิเตอร์น้ำกลาง — 1 ตัวต่อเดือน ใช้อ้างอิงราคาเฉลี่ยต่อหน่วย) =====
let masterMeterState = { records: [] };
function saveMasterMeterLocal() { try { localStorage.setItem('cmu_master_meter', JSON.stringify(masterMeterState.records)); } catch(e){} }
function loadMasterMeterLocal() {
  try {
    const d = localStorage.getItem('cmu_master_meter');
    if (d) masterMeterState.records = JSON.parse(d);
  } catch(e) {}
}
function getAvgRateForMonth(monthKey) {
  const rec = masterMeterState.records.find(m => m.month_key === monthKey);
  return rec ? Number(rec.avg_rate) : null;
}
// ค่าน้ำของบิลเดือนนี้ อ้างอิงมิเตอร์กลางของ "เดือนก่อนหน้า" เสมอ (รอบบิลค่าน้ำล่าช้ากว่ารอบเก็บค่าเช่า 1 เดือน)
function getPrevMonthKey(monthKey) {
  const [y, m] = (monthKey || '').split('-').map(Number);
  if (!y || !m) return '';
  let py = y, pm = m - 1;
  if (pm < 1) { pm = 12; py -= 1; }
  return py + '-' + String(pm).padStart(2, '0');
}

function saveRentLocal() { try { localStorage.setItem('cmu_rent_records', JSON.stringify(rentState.records)); } catch(e){} }
function loadRentLocal() {
  try {
    const d = localStorage.getItem('cmu_rent_records');
    if (d) rentState.records = JSON.parse(d);
  } catch(e) {}
}

// ===== STORAGE (offline fallback) =====
function saveLocal() { try { localStorage.setItem('cmu_records', JSON.stringify(state.records)); } catch(e){} }
function loadLocal() {
  try {
    const d = localStorage.getItem('cmu_records');
    if (d) state.records = JSON.parse(d);
  } catch(e) {}
}

function saveFinLocal() { try { localStorage.setItem('cmu_fin_records', JSON.stringify(finState.records)); } catch(e){} }
function loadFinLocal() {
  try {
    const d = localStorage.getItem('cmu_fin_records');
    if (d) finState.records = JSON.parse(d);
  } catch(e) {}
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  loadLocal();
  loadFinLocal();
  loadCalLocal();
  loadRentLocal();
  loadMasterMeterLocal();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
  render();
  setupNav();
  setupFab();
  setupSearch();
  checkDeadlines();
  setupDateRolloverWatcher();
});

// ===== เช็ควันเปลี่ยนอัตโนมัติ กัน "วันนี้" ค้างข้ามเที่ยงคืนถ้าเปิดแท็บทิ้งไว้นาน =====
// (การไฮไลต์ "วันนี้" ในปฏิทิน/แจ้งเตือนเกินกำหนด คำนวณตอน render เท่านั้น ถ้าไม่มีอะไรมา trigger re-render
//  ข้ามเที่ยงคืนไป หน้าจอจะยังค้างของเดิมอยู่ ฟังก์ชันนี้คอยเช็คแล้วสั่ง render ใหม่ให้เมื่อวันที่เปลี่ยนจริง)
let lastKnownDate = new Date().toISOString().slice(0, 10);

function checkDateRollover() {
  const today = new Date().toISOString().slice(0, 10);
  if (today === lastKnownDate) return;
  lastKnownDate = today;
  checkDeadlines();
  if (state.currentPage === 'calendar') renderCalendar();
}

function setupDateRolloverWatcher() {
  // เช็คทันทีตอนกลับมาที่แท็บ (สลับแท็บ/สลับแอพไปมาแล้วกลับมา) — ครอบคลุมเคสส่วนใหญ่แบบเบาที่สุด
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkDateRollover();
  });
  // เช็คเป็นระยะทุก 1 นาที เผื่อเปิดจอค้างไว้ตลอดโดยไม่สลับแท็บเลย (เช่น จอปฏิทินในออฟฟิศ)
  setInterval(checkDateRollover, 60000);
}

// ===== NAVIGATION =====
function setupNav() {
  document.querySelectorAll('.nav-item, .desktop-nav-item').forEach(el => {
    el.addEventListener('click', () => switchPage(el.dataset.page));
  });
}

// ===== CALENDAR STATE =====
let calState = {
  records: [],
  selectedDate: new Date().toISOString().slice(0,10),
  viewMonth: new Date().getMonth(),
  viewYear: new Date().getFullYear(),
  detailId: null,
};
let calEditingId = null;

function saveCalLocal() { try { localStorage.setItem('cmu_cal_records', JSON.stringify(calState.records)); } catch(e){} }
function loadCalLocal() { try { const d = localStorage.getItem('cmu_cal_records'); if (d) calState.records = JSON.parse(d); } catch(e){} }

function switchPage(p) {
  state.page = p;
  document.querySelectorAll('.page').forEach(el => el.classList.toggle('active', el.id === 'page-' + p));
  document.querySelectorAll('.nav-item, .desktop-nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === p));
  if (p === 'list' || p === 'send' || p === 'recv') renderList();
  if (p === 'stats') renderStats();
  if (p === 'finance') renderFinList();
  if (p === 'calendar') renderCalendar();
  if (p === 'rent') renderRentList();
}

// ===== FAB =====
function setupFab() {
  document.getElementById('fab').addEventListener('click', () => {
    if (state.page === 'finance') openFinForm();
    else if (state.page === 'calendar') openCalForm();
    else if (state.page === 'rent') openRentForm();
    else openForm('recv');
  });
  document.getElementById('desktop-add-btn').addEventListener('click', () => {
    if (state.page === 'finance') openFinForm();
    else if (state.page === 'calendar') openCalForm();
    else if (state.page === 'rent') openRentForm();
    else openForm('recv');
  });
}

// ===== SEARCH =====
function setupSearch() {
  document.getElementById('search-input').addEventListener('input', e => {
    state.search = e.target.value.toLowerCase();
    state.currentPage = 1;
    renderList();
  });
  document.querySelectorAll('.filter-chip[data-filter]').forEach(el => {
    el.addEventListener('click', () => {
      state.filter = el.dataset.filter;
      state.currentPage = 1;
      document.querySelectorAll('.filter-chip[data-filter]').forEach(c => c.classList.toggle('active', c.dataset.filter === state.filter));
      renderList();
    });
  });

  const finSearch = document.getElementById('fin-search-input');
  if (finSearch) {
    finSearch.addEventListener('input', e => {
      finState.search = e.target.value.toLowerCase();
      finState.currentPage = 1;
      renderFinList();
    });
  }
  document.querySelectorAll('.filter-chip[data-fin-filter]').forEach(el => {
    el.addEventListener('click', () => {
      finState.filter = el.dataset.finFilter;
      finState.currentPage = 1;
      document.querySelectorAll('.filter-chip[data-fin-filter]').forEach(c => c.classList.toggle('active', c.dataset.finFilter === finState.filter));
      renderFinList();
    });
  });

  const rentSearch = document.getElementById('rent-search-input');
  if (rentSearch) {
    rentSearch.addEventListener('input', e => {
      rentState.search = e.target.value.toLowerCase();
      rentState.currentPage = 1;
      renderRentList();
    });
  }
  document.querySelectorAll('.filter-chip[data-rent-filter]').forEach(el => {
    el.addEventListener('click', () => {
      rentState.filter = el.dataset.rentFilter;
      rentState.currentPage = 1;
      document.querySelectorAll('.filter-chip[data-rent-filter]').forEach(c => c.classList.toggle('active', c.dataset.rentFilter === rentState.filter));
      renderRentList();
    });
  });
}

// ===== RENDER LIST =====
function renderList() {
  const container = document.getElementById('doc-list');
  let items = [...state.records];

  // เรียงตามวันที่รับ/ส่ง ล่าสุดก่อน
  items.sort((a, b) => {
    const da = a.type === 'recv' ? (a.received_date || a.issue_date || '') : (a.issue_date || a.send_date || '');
    const db = b.type === 'recv' ? (b.received_date || b.issue_date || '') : (b.issue_date || b.send_date || '');
    if (db !== da) return db > da ? 1 : -1;
    return b.id.localeCompare(a.id);
  });

  if (state.filter !== 'all') {
    if (state.filter === 'send') items = items.filter(r => r.type === 'send');
    else if (state.filter === 'recv') items = items.filter(r => r.type === 'recv');
    else if (state.filter === 'pend') items = items.filter(r => r.status === 'pend');
    else if (state.filter === 'overdue') {
      const today = new Date().toISOString().slice(0, 10);
      items = items.filter(r => r.deadline && r.deadline <= today && r.status === 'pend');
    }
  }
  if (state.search) {
    items = items.filter(r =>
      [r.docno, r.ref_no, r.subject, r.from_org, r.to_org, r.handler].some(v => v && v.toLowerCase().includes(state.search))
    );
  }

  // Update stats
  document.getElementById('s-all').textContent = state.records.length;
  document.getElementById('s-send').textContent = state.records.filter(r => r.type === 'send').length;
  document.getElementById('s-recv').textContent = state.records.filter(r => r.type === 'recv').length;
  const pendCount = state.records.filter(r => r.status === 'pend').length;
  document.getElementById('s-pend').textContent = pendCount;
  const badge = document.getElementById('nav-badge');
  if (badge) {
    badge.textContent = pendCount;
    badge.style.display = pendCount > 0 ? 'flex' : 'none';
  }

  if (!items.length) {
    container.innerHTML = `<div class="empty-state"><i class="ti ti-file-off"></i><p>ไม่พบรายการ</p></div>`;
    const pgEl = document.getElementById('pagination');
    if (pgEl) pgEl.innerHTML = '';
    return;
  }

  // Pagination
  // การ์ดกันพัง: ถ้า state.currentPage ดันไม่ใช่ตัวเลข (เช่นมีโค้ดจุดอื่นเผลอตั้งเป็น string) ให้รีเซ็ตเป็น 1 ทันที
  // กันไม่ให้ (currentPage - 1) กลายเป็น NaN แล้วทำให้ items.slice(NaN, NaN) ได้ array ว่างเปล่าทั้งหน้า
  if (!Number.isInteger(state.currentPage)) state.currentPage = 1;
  const totalPages = Math.ceil(items.length / state.pageSize);
  if (state.currentPage > totalPages) state.currentPage = 1;
  const pgStart = (state.currentPage - 1) * state.pageSize;
  const pagedItems = items.slice(pgStart, pgStart + state.pageSize);
  const pgEl = document.getElementById('pagination');
  if (pgEl) {
    let btns = '';
    if (state.currentPage > 1) btns += '<button class="pg-btn" onclick="goPage(' + (state.currentPage-1) + ')">← ก่อนหน้า</button>';
    btns += '<span class="pg-info">หน้า ' + state.currentPage + ' / ' + totalPages + ' (' + items.length + ' รายการ)</span>';
    if (state.currentPage < totalPages) btns += '<button class="pg-btn" onclick="goPage(' + (state.currentPage+1) + ')">ถัดไป →</button>';
    pgEl.innerHTML = btns;
  }

  container.innerHTML = pagedItems.map(r => `
    <div class="list-row" onclick="openDetail('${r.id}')">
      <div class="list-col-icon"><div class="list-row-icon ${r.type}"><i class="ti ti-${r.type === 'send' ? 'send' : 'inbox'}" aria-hidden="true"></i></div></div>
      <div class="list-col-main">
        <div class="list-row-title">${esc(r.subject || '-')}</div>
        <div class="list-row-sub">
          ${r.docno ? `<span class="docno">${esc(r.docno)}</span><span class="dot"></span>` : ''}
          <span>${esc(r.doc_type || '—')}</span>
        </div>
      </div>
      <div class="list-col-org list-row-org">${r.type === 'send' ? esc(r.to_org || '-') : esc(r.from_org || '-')}</div>
      <div class="list-col-date list-row-date">${formatDate(r.type === 'send' ? r.issue_date : r.received_date)}</div>
      <div class="list-col-deadline">${deadlineChipHtml(r)}</div>
      <div class="list-col-status">
        <span class="status-pill ${r.status === 'pend' ? 'pend' : 'done'}"><span class="dot"></span>${r.status === 'pend' ? 'รอดำเนินการ' : 'เสร็จสิ้น'}</span>
      </div>
    </div>
  `).join('');
}

// เดิม badge-urgent ขึ้นเฉพาะตอนเกินกำหนดแล้วเท่านั้น — เพิ่มสถานะ "ใกล้ครบกำหนด" (7 วัน) ให้เห็นล่วงหน้าตั้งแต่ในลิสต์
function deadlineChipHtml(r) {
  if (!r.deadline) return '<span class="deadline-none">—</span>';
  const today = new Date().toISOString().slice(0, 10);
  const diffDays = Math.round((new Date(r.deadline) - new Date(today)) / 86400000);
  if (r.status === 'pend' && diffDays < 0) {
    return `<span class="deadline-chip overdue"><i class="ti ti-alert-triangle" aria-hidden="true"></i>เกินกำหนด ${Math.abs(diffDays)} วัน</span>`;
  }
  if (r.status === 'pend' && diffDays <= 7) {
    return `<span class="deadline-chip soon"><i class="ti ti-clock" aria-hidden="true"></i>${diffDays === 0 ? 'ครบกำหนดวันนี้' : 'ใกล้ครบกำหนด (' + diffDays + ' วัน)'}</span>`;
  }
  return `<span class="deadline-chip later"><i class="ti ti-calendar" aria-hidden="true"></i>${formatDate(r.deadline)}</span>`;
}

// ===== RENDER STATS =====
function renderStats() {
  const total = state.records.length;
  const sends = state.records.filter(r => r.type === 'send');
  const recvs = state.records.filter(r => r.type === 'recv');
  const pend = state.records.filter(r => r.status === 'pend');
  const done = state.records.filter(r => r.status === 'done');

  const months = {};
  state.records.forEach(r => {
    const d = r.issue_date || r.received_date || '';
    const m = d.slice(0, 7);
    if (m) { months[m] = (months[m] || 0) + 1; }
  });
  const mKeys = Object.keys(months).sort().slice(-6);

  document.getElementById('stats-content').innerHTML = `
    <div class="stats-row" style="grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:16px">
      <div class="stat-card all"><div class="n">${total}</div><div class="l">ทั้งหมด</div></div>
      <div class="stat-card pend"><div class="n">${pend.length}</div><div class="l">รอดำเนินการ</div></div>
      <div class="stat-card send"><div class="n">${sends.length}</div><div class="l">ส่งออก</div></div>
      <div class="stat-card recv"><div class="n">${recvs.length}</div><div class="l">รับเข้า</div></div>
    </div>
    <div class="detail-section">
      <h3>รายเดือน (6 เดือนล่าสุด)</h3>
      ${mKeys.length ? mKeys.map(m => `
        <div class="detail-row">
          <span class="dk">${m}</span>
          <span class="dv">${months[m]} รายการ</span>
        </div>
      `).join('') : '<p style="font-size:13px;color:var(--text-hint);padding:8px 0">ยังไม่มีข้อมูล</p>'}
    </div>
    <div class="detail-section">
      <h3>ประเภทเอกสาร</h3>
      ${buildTypeStats()}
    </div>
  `;
}

function buildTypeStats() {
  const types = {};
  state.records.forEach(r => { if (r.doc_type) types[r.doc_type] = (types[r.doc_type] || 0) + 1; });
  const keys = Object.keys(types).sort((a,b) => types[b] - types[a]);
  if (!keys.length) return '<p style="font-size:13px;color:var(--text-hint);padding:8px 0">ยังไม่มีข้อมูล</p>';
  return keys.map(k => `<div class="detail-row"><span class="dk">${esc(k)}</span><span class="dv">${types[k]} รายการ</span></div>`).join('');
}

// ===== FORM =====
let currentFormType = 'recv';

function openForm(type = 'recv', isEditMode = false) {
  currentFormType = type;
  if (!isEditMode) editingId = null;
  document.getElementById('form-overlay').classList.add('open');
  setFormType(type);
  if (!isEditMode) resetForm();
  initSigPad();
}

function closeForm() {
  document.getElementById('form-overlay').classList.remove('open');
}

function trySwitchType(t) {
  if (editingId) {
    showToast('ไม่สามารถเปลี่ยนประเภทขณะแก้ไขรายการได้');
    return;
  }
  setFormType(t);
}

function setFormType(t) {
  currentFormType = t;
  document.querySelectorAll('.type-opt').forEach(el => {
    el.classList.toggle('active', el.dataset.type === t);
    el.classList.remove('recv', 'send');
    if (el.classList.contains('active')) el.classList.add(t);
  });
  // toggle fields
  document.querySelectorAll('[data-show]').forEach(el => {
    const show = el.dataset.show;
    const visible = show === 'both' || show === t;
    el.style.display = visible ? '' : 'none';
  });
  const isEdit = !!editingId;
  document.getElementById('form-title').textContent = isEdit
    ? (t === 'recv' ? 'แก้ไขหนังสือรับ' : 'แก้ไขหนังสือส่ง')
    : (t === 'recv' ? 'บันทึกหนังสือรับ' : 'บันทึกหนังสือส่ง');
  const btn = document.getElementById('submit-btn');
  btn.className = 'btn-submit ' + t;
  btn.textContent = isEdit ? 'บันทึกการแก้ไข' : (t === 'recv' ? 'บันทึกหนังสือรับ' : 'บันทึกหนังสือส่ง');
  // เคลียร์ข้อความไฟล์แนบเดิมทุกครั้งที่สลับประเภท (จะถูกตั้งใหม่จาก openEditForm ถ้าตรง record)
  document.getElementById('file-name').textContent = '';
}

function resetForm() {
  document.getElementById('doc-form').reset();
  document.getElementById('file-name').textContent = '';
  if (state.sigPad) state.sigPad.clear();
  // set today
  const today = new Date().toISOString().slice(0, 10);
  ['f-issue-date', 'f-issue-date-send', 'f-received-date', 'f-send-date'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = today;
  });
}

// ===== SIGNATURE PAD =====
function initSigPad() {
  const canvas = document.getElementById('sig-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  // รอให้ drawer เปิดก่อนค่อย resize
  requestAnimationFrame(() => {
    canvas.width = canvas.offsetWidth * window.devicePixelRatio || 300;
    canvas.height = canvas.offsetHeight * window.devicePixelRatio || 140;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.strokeStyle = '#1A1525';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

    let drawing = false, lastX = 0, lastY = 0;

    function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
      return [(src.clientX - rect.left), (src.clientY - rect.top)];
    }

    function start(e) { e.preventDefault(); drawing = true; [lastX, lastY] = getPos(e); }
    function move(e) {
      e.preventDefault();
      if (!drawing) return;
      const [x, y] = getPos(e);
      ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(x, y); ctx.stroke();
      [lastX, lastY] = [x, y];
    }
    function end() { drawing = false; }

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end);

    state.sigPad = { clear: () => ctx.clearRect(0, 0, canvas.width, canvas.height), toDataURL: () => canvas.toDataURL(), isEmpty: () => { try { return !ctx.getImageData(0,0,canvas.width,canvas.height).data.some(v => v !== 0); } catch(e) { return true; } } };
  }); // end requestAnimationFrame
}

function clearSig() { if (state.sigPad) state.sigPad.clear(); }


// ===== SUBMIT FORM =====
async function submitForm() {
  const get = id => document.getElementById(id)?.value?.trim() || '';

  const isEdit = !!editingId;

  const common = {
    id: isEdit ? editingId : Date.now().toString(),
    type: currentFormType,
    status: get('f-status'),
    doc_type: get('f-doc-type'),
    handler: get(currentFormType === 'send' ? 'f-handler-send' : 'f-handler'),
    note: get('f-note'),
    signature: (state.sigPad && !state.sigPad.isEmpty()) ? state.sigPad.toDataURL() : '',
    created_at: new Date().toISOString(),
  };

  const subject = currentFormType === 'recv' ? get('f-subject') : get('f-subject-send');
  if (!subject) { showToast('กรุณากรอกชื่อเรื่อง'); return; }

  // เก็บ file_url เดิมไว้ก่อน (ถ้าแก้ไขและไม่ได้แนบไฟล์ใหม่)
  const oldRecord = isEdit ? state.records.find(x => x.id === editingId) : null;
  let file_url = oldRecord ? (oldRecord.file_url || '') : '';

  // อัปโหลดไฟล์ไป Drive (ถ้ามีการเลือกไฟล์ใหม่)
  const fileInput = document.getElementById('f-file');
  if (fileInput && fileInput.files.length > 0 && API.url) {
    const file = fileInput.files[0];
    showToast('กำลังอัปโหลดไฟล์...');
    try {
      const res = await API.upload(currentFormType, file);
      if (res.ok) file_url = res.url;
    } catch(e) {
      showToast('อัปโหลดไฟล์ไม่สำเร็จ บันทึกข้อมูลอย่างเดียว');
    }
  }

  let record = {};
  if (currentFormType === 'recv') {
    record = { ...common,
      subject: get('f-subject'),
      docno: get('f-recv-docno'),
      ref_no: get('f-ref-no'),
      issue_date: get('f-issue-date'),
      from_org: get('f-from-org'),
      to_org: get('f-to-org-recv'),
      received_date: get('f-received-date'),
      deadline: get('f-deadline'),
      receiver: get('f-receiver'),
      file_url,
    };
  } else {
    record = { ...common,
      subject: get('f-subject-send'),
      docno: get('f-send-docno') ? ('สก.มช.' + get('f-send-docno')) : '',
      issue_date: get('f-issue-date-send'),
      to_org: get('f-to-org'),
      detail: get('f-detail'),
      sender: get('f-sender'),
      receiver_name: get('f-receiver-name'),
      send_date: get('f-send-date'),
      send_channel: get('f-send-channel'),
      file_url,
    };
  }

  if (isEdit) {
    // แก้ไขรายการเดิม
    const idx = state.records.findIndex(x => x.id === editingId);
    if (idx !== -1) state.records[idx] = record;
  } else {
    // เพิ่มรายการใหม่
    state.records.unshift(record);
  }
  saveLocal();
  renderList();
  closeForm();
  showToast(isEdit ? 'แก้ไขสำเร็จ' : 'บันทึกสำเร็จ');

  // Sync to Google Sheets
  if (API.url) {
    try {
      if (isEdit) {
        await API.updateRecord(currentFormType, record);
      } else {
        if (currentFormType === 'recv') await API.addRecv(record);
        else await API.addSend(record);
      }
    } catch(e) { showToast('บันทึก offline — จะซิงก์เมื่อออนไลน์'); }
  }

  editingId = null;
}

// ===== DETAIL =====
function openDetail(id) {
  const r = state.records.find(x => x.id === id);
  if (!r) return;
  state.detailId = id;

  const isRecv = r.type === 'recv';
  const el = document.getElementById('detail-overlay');

  document.getElementById('detail-title').textContent = isRecv ? 'รายละเอียดหนังสือรับ' : 'รายละเอียดหนังสือส่ง';

  const rows = isRecv ? [
    ['เลขหนังสือรับ', r.docno],
    ['ที่ (เลขจากหน่วยงาน)', r.ref_no],
    ['วันที่ออกหนังสือรับ', formatDate(r.issue_date)],
    ['จาก', r.from_org],
    ['ถึง', r.to_org],
    ['เรื่อง', r.subject],
    ['การปฏิบัติ', r.handler],
    ['ผู้รับในสมาคม', r.receiver],
    ['ได้รับวันที่', formatDate(r.received_date)],
    ['กำหนดตอบ', formatDate(r.deadline)],
    ['ประเภทเอกสาร', r.doc_type],
    ['หมายเหตุ', r.note],
    ['ไฟล์แนบ', r.file_url ? '🔗 เปิดไฟล์' : ''],
  ] : [
    ['เลขที่ส่ง', r.docno],
    ['วันที่ออก', formatDate(r.issue_date)],
    ['ถึง', r.to_org],
    ['เรื่อง', r.subject],
    ['รายละเอียด', r.detail],
    ['การปฏิบัติ', r.handler],
    ['ผู้ส่ง', r.sender],
    ['ผู้รับ', r.receiver_name],
    ['วันที่ส่ง', formatDate(r.send_date)],
    ['ช่องทางส่ง', r.send_channel],
    ['ประเภทเอกสาร', r.doc_type],
    ['หมายเหตุ', r.note],
    ['ไฟล์แนบ', r.file_url ? '🔗 เปิดไฟล์' : ''],
  ];

  document.getElementById('detail-body').innerHTML = `
    <div class="detail-section">
      <h3>ข้อมูลเอกสาร</h3>
      ${rows.filter(([,v]) => v).map(([k,v]) => `
        <div class="detail-row"><span class="dk">${k}</span><span class="dv">${k === 'ไฟล์แนบ' ? `<a href="${r.file_url}" target="_blank" style="color:var(--purple)">${esc(v)}</a>` : esc(v)}</span></div>
      `).join('')}
    </div>
    ${r.signature ? `
      <div class="detail-section">
        <h3>ลายเซ็นผู้รับ</h3>
        <div class="sig-display"><img src="${r.signature}" alt="ลายเซ็น"></div>
      </div>
    ` : ''}
    <div style="display:flex;gap:8px;margin-top:4px">
      <button class="btn-submit" onclick="openEditForm('${r.id}')" style="flex:1;background:var(--purple);color:#fff">
        <i class="ti ti-edit" aria-hidden="true"></i> แก้ไข
      </button>
      <button class="btn-submit ${r.status === 'pend' ? 'recv' : 'send'}" onclick="toggleStatus('${r.id}')" style="flex:1">
        ${r.status === 'pend' ? 'มาร์กเป็นเสร็จสิ้น' : 'มาร์กเป็นรอดำเนินการ'}
      </button>
      <button onclick="deleteRecord('${r.id}')" style="padding:12px 16px;border:1px solid var(--border-med);border-radius:var(--radius);background:#fff;cursor:pointer;font-size:18px;color:var(--text-sub)">
        <i class="ti ti-trash" aria-hidden="true"></i>
      </button>
    </div>
  `;

  el.classList.add('open');
}

function closeDetail() { document.getElementById('detail-overlay').classList.remove('open'); }

function toggleStatus(id) {
  const r = state.records.find(x => x.id === id);
  if (!r) return;
  r.status = r.status === 'pend' ? 'done' : 'pend';
  saveLocal();
  renderList();
  openDetail(id);
  if (API.url) API.updateStatus(r.type, id, r.status).catch(()=>{});
}

function deleteRecord(id) {
  if (!confirm('ลบรายการนี้?')) return;
  state.records = state.records.filter(x => x.id !== id);
  saveLocal();
  closeDetail();
  renderList();
  showToast('ลบรายการแล้ว');
  if (API.url) API.delete('', id).catch(()=>{});
}

// ===== DEADLINE CHECK =====
function checkDeadlines() {
  const today = new Date().toISOString().slice(0,10);
  const warn = state.records.filter(r => r.deadline && r.deadline <= today && r.status === 'pend');
  const el = document.getElementById('deadline-warn');
  if (warn.length) {
    el.style.display = 'flex';
    el.querySelector('span').textContent = `มี ${warn.length} รายการที่ครบกำหนดหรือเกินกำหนดแล้ว — แตะเพื่อดูรายการ`;
  } else {
    el.style.display = 'none';
  }
}

// กดที่ banner แจ้งเตือนเกินกำหนด → กระโดดไปหน้ารายการที่กรองเฉพาะรายการเกินกำหนดทันที
function goOverdue() {
  state.filter = 'overdue';
  document.querySelectorAll('.filter-chip[data-filter]').forEach(c => c.classList.remove('active'));
  state.currentPage = 1; // รีเซ็ตเลขหน้า pagination ให้เป็นตัวเลขเสมอ (ห้ามเป็น string เด็ดขาด)
  switchPage('list'); // ใช้ switchPage (เปลี่ยน "หน้าแอพ") ไม่ใช่ goPage (เลขหน้า pagination) — คนละตัวแปรกัน
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== SETTINGS =====
function saveApiUrl() {
  const url = document.getElementById('api-url-input').value.trim();
  API.setUrl(url);
  showToast('บันทึก URL สำเร็จ');
}

async function syncFromSheets() {
  if (!API.url) { showToast('กรุณาตั้งค่า API URL ก่อน'); return; }
  if (state.syncing) return; // กันกดซ้ำระหว่างกำลังซิงก์อยู่
  state.syncing = true;
  setSyncLoading(true);
  showToast('กำลังซิงก์...');
  try {
    const data = await API.getAll();
    if (data.records) { state.records = data.records; saveLocal(); renderList(); }
    await syncFinFromSheets();
    await syncCalFromSheets();
    await syncRentFromSheets();
    await syncMasterMeterFromSheets();
    showToast('ซิงก์สำเร็จ');
  } catch(e) { showToast('ซิงก์ไม่สำเร็จ: ' + e.message); }
  finally { state.syncing = false; setSyncLoading(false); }
}

// ควบคุม loading state ของปุ่มซิงก์ทั้ง 2 จุด (header + หน้าตั้งค่า)
function setSyncLoading(isLoading) {
  const headerBtn = document.getElementById('sync-header-btn');
  const settingsRow = document.getElementById('sync-settings-row');
  const settingsIcon = document.getElementById('sync-settings-icon');
  const settingsLabel = document.getElementById('sync-settings-label');

  if (headerBtn) {
    headerBtn.setAttribute('aria-busy', isLoading ? 'true' : 'false');
    headerBtn.querySelector('i')?.classList.toggle('icon-spinning', isLoading);
  }
  if (settingsRow) settingsRow.setAttribute('aria-busy', isLoading ? 'true' : 'false');
  if (settingsIcon) settingsIcon.classList.toggle('icon-spinning', isLoading);
  if (settingsLabel) settingsLabel.textContent = isLoading ? 'กำลังซิงก์ข้อมูล...' : 'ซิงก์ข้อมูลจาก Google Sheets';
}


// ===== FORMAT DATE =====
function formatDate(d) {
  if (!d) return '';
  try {
    const date = new Date(d);
    if (isNaN(date)) return d;
    return date.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch(e) { return d; }
}
function goPage(p) {
  state.currentPage = p;
  renderList();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== UTILS =====
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function isPast(d) { return d && d < new Date().toISOString().slice(0,10); }

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function render() {
  switchPage('list');
  // Restore API URL in settings
  document.getElementById('api-url-input').value = API.url;
}

// ===== EDIT =====
let editingId = null;

function openEditForm(id) {
  const r = state.records.find(x => x.id === id);
  if (!r) return;
  editingId = id;
  closeDetail();
  openForm(r.type, true);
  setTimeout(() => {
    const set = (elId, val) => { const el = document.getElementById(elId); if (el && val !== undefined) el.value = val; };
    if (r.type === 'recv') {
      set('f-recv-docno', r.docno); set('f-ref-no', r.ref_no);
      set('f-issue-date', r.issue_date); set('f-received-date', r.received_date);
      set('f-from-org', r.from_org); set('f-to-org-recv', r.to_org);
      set('f-subject', r.subject); set('f-receiver', r.receiver);
      set('f-deadline', r.deadline);
      set('f-handler', r.handler);
    } else {
      set('f-send-docno', (r.docno || '').replace('สก.มช.', '')); set('f-issue-date-send', r.issue_date);
      set('f-to-org', r.to_org); set('f-subject-send', r.subject);
      set('f-detail', r.detail); set('f-sender', r.sender);
      set('f-receiver-name', r.receiver_name); set('f-send-date', r.send_date);
      set('f-send-channel', r.send_channel);
      set('f-handler-send', r.handler);
    }
    set('f-doc-type', r.doc_type);
    set('f-status', r.status); set('f-note', r.note);
    if (r.file_url) document.getElementById('file-name').textContent = '📎 ไฟล์เดิมถูกแนบไว้แล้ว (แนบใหม่เพื่อเปลี่ยน)';
    document.getElementById('form-title').textContent = (r.type === 'recv' ? 'แก้ไขหนังสือรับ' : 'แก้ไขหนังสือส่ง');
    document.getElementById('submit-btn').textContent = 'บันทึกการแก้ไข';
  }, 100);
}

// ===== FINANCE: FORMAT HELPERS =====
function formatMoney(n) {
  const num = parseFloat(n);
  if (isNaN(num)) return '฿0';
  return '฿' + num.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function finStatusLabel(s) {
  return { prepaid: 'มีคนชำระให้ก่อน', pending: 'รอสมาคมชำระ', refund: 'ต้องโอนคืน' }[s] || s || '-';
}
function finStatusBadgeClass(s) {
  return { prepaid: 'badge-done', pending: 'badge-pend', refund: 'badge-urgent' }[s] || 'badge-type';
}

// ===== FINANCE: FORM =====
function updateFinFileNames() {
  const input = document.getElementById('fin-file');
  const label = document.getElementById('fin-file-name');
  if (!input || !input.files.length) { label.textContent = ''; return; }
  const names = Array.from(input.files).map((f, i) => `📎 ${f.name}`).join('\n');
  label.textContent = names;
}

function openFinForm() {
  finEditingId = null;
  document.getElementById('fin-form-overlay').classList.add('open');
  document.getElementById('fin-form').reset();
  document.getElementById('fin-file-name').textContent = '';
  document.getElementById('fin-approve-file-name').textContent = '';
  document.getElementById('fin-form-title').textContent = 'บันทึกรายการเบิก-จ่ายเงิน';
  document.getElementById('fin-submit-btn').textContent = 'บันทึกรายการเบิก-จ่ายเงิน';
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('fin-request-date').value = today;
}

function closeFinForm() {
  document.getElementById('fin-form-overlay').classList.remove('open');
}

function openFinEditForm(id) {
  const r = finState.records.find(x => x.id === id);
  if (!r) return;
  finEditingId = id;
  closeFinDetail();
  document.getElementById('fin-form-overlay').classList.add('open');
  document.getElementById('fin-form-title').textContent = 'แก้ไขรายการเบิก-จ่ายเงิน';
  document.getElementById('fin-submit-btn').textContent = 'บันทึกการแก้ไข';
  setTimeout(() => {
    const set = (elId, val) => { const el = document.getElementById(elId); if (el && val !== undefined) el.value = val; };
    set('fin-docno', (r.docno || '').replace('บง.มช.', ''));
    set('fin-request-date', r.request_date);
    set('fin-requester', r.requester);
    set('fin-title', r.title);
    set('fin-detail', r.detail);
    set('fin-amount-request', r.amount_request);
    set('fin-category', r.category);
    set('fin-approver', r.approver);
    set('fin-approve-date', r.approve_date);
    set('fin-status', r.status);
    set('fin-pay-date', r.pay_date);
    set('fin-pay-method', r.pay_method);
    set('fin-payee', r.payee);
    set('fin-bank-account', r.bank_account);
    set('fin-amount-paid', r.amount_paid);
    set('fin-receipt-no', r.receipt_no);
    set('fin-note', r.note);
    if (r.file_url) {
      const names = r.file_url.split(',').map((entry, i) => {
        const parts = entry.split('|');
        return '📎 ' + (parts[1] || 'ไฟล์ ' + (i+1));
      }).join('\n');
      document.getElementById('fin-file-name').textContent = names + '\n(แนบใหม่เพื่อแทนที่ทั้งหมด)';
    } else {
      document.getElementById('fin-file-name').textContent = '';
    }
    if (r.approve_file_url) document.getElementById('fin-approve-file-name').textContent = '📎 ไฟล์เดิมถูกแนบไว้แล้ว (แนบใหม่เพื่อเปลี่ยน)';
    else document.getElementById('fin-approve-file-name').textContent = '';
  }, 100);
}

async function submitFinForm() {
  const get = id => document.getElementById(id)?.value?.trim() || '';
  const isEdit = !!finEditingId;

  const title = get('fin-title');
  if (!title) { showToast('กรุณากรอกรายการ / เรื่องที่ขอเบิก'); return; }

  const oldRecord = isEdit ? finState.records.find(x => x.id === finEditingId) : null;
  let file_url = oldRecord ? (oldRecord.file_url || '') : '';
  let approve_file_url = oldRecord ? (oldRecord.approve_file_url || '') : '';

  const fileInput = document.getElementById('fin-file');
  if (fileInput && fileInput.files.length > 0 && API.url) {
    showToast(`กำลังอัปโหลด ${fileInput.files.length} ไฟล์...`);
    const urls = [];
    for (const file of Array.from(fileInput.files)) {
      try {
        const res = await API.upload('finance', file, 'หลักฐานการจ่าย');
        if (res.ok) urls.push(res.url + '|' + file.name);
      } catch(e) {
        showToast('อัปโหลด ' + file.name + ' ไม่สำเร็จ');
      }
    }
    if (urls.length) file_url = urls.join(',');
  }

  const approveFileInput = document.getElementById('fin-approve-file');
  if (approveFileInput && approveFileInput.files.length > 0 && API.url) {
    const file = approveFileInput.files[0];
    showToast('กำลังอัปโหลดหลักฐานการอนุมัติ...');
    try {
      const res = await API.upload('finance', file, 'หลักฐานการอนุมัติ');
      if (res.ok) approve_file_url = res.url;
    } catch(e) {
      showToast('อัปโหลดไฟล์อนุมัติไม่สำเร็จ บันทึกข้อมูลอย่างเดียว');
    }
  }

  const docnoRaw = get('fin-docno');
  const record = {
    id: isEdit ? finEditingId : Date.now().toString(),
    docno: docnoRaw ? ('บง.มช.' + docnoRaw) : '',
    request_date: get('fin-request-date'),
    requester: get('fin-requester'),
    title,
    detail: get('fin-detail'),
    amount_request: get('fin-amount-request'),
    category: get('fin-category'),
    approver: get('fin-approver'),
    approve_date: get('fin-approve-date'),
    approve_file_url,
    status: get('fin-status') || 'pend',
    pay_date: get('fin-pay-date'),
    pay_method: get('fin-pay-method'),
    payee: get('fin-payee'),
    bank_account: get('fin-bank-account'),
    amount_paid: get('fin-amount-paid'),
    receipt_no: get('fin-receipt-no'),
    note: get('fin-note'),
    file_url,
    created_at: new Date().toISOString(),
  };

  if (isEdit) {
    const idx = finState.records.findIndex(x => x.id === finEditingId);
    if (idx !== -1) finState.records[idx] = record;
  } else {
    finState.records.unshift(record);
  }
  saveFinLocal();
  renderFinList();
  closeFinForm();
  showToast(isEdit ? 'แก้ไขสำเร็จ' : 'บันทึกสำเร็จ');

  if (API.url) {
    try {
      if (isEdit) await API.call({ action: 'updateFinance', row: JSON.stringify(record) });
      else await API.call({ action: 'addFinance', row: JSON.stringify(record) });
    } catch(e) { showToast('บันทึก offline — จะซิงก์เมื่อออนไลน์'); }
  }

  finEditingId = null;
}

// ===== FINANCE: RENDER LIST =====
function renderFinList() {
  const container = document.getElementById('fin-list');
  let items = [...finState.records];

  // เรียงตามวันที่ขอเบิก ล่าสุดก่อน
  items.sort((a, b) => {
    const da = a.request_date || '';
    const db = b.request_date || '';
    if (db !== da) return db > da ? 1 : -1;
    return b.id.localeCompare(a.id);
  });

  if (finState.filter !== 'all') items = items.filter(r => r.status === finState.filter);
  if (finState.search) {
    items = items.filter(r =>
      [r.docno, r.title, r.requester, r.payee, r.category].some(v => v && v.toLowerCase().includes(finState.search))
    );
  }

  const totalAll = finState.records.length;
  const pendCount = finState.records.filter(r => r.status === 'pend').length;
  const paidAmt = finState.records.filter(r => r.status === 'paid').reduce((s,r) => s + (parseFloat(r.amount_paid) || parseFloat(r.amount_request) || 0), 0);
  const pendAmt = finState.records.filter(r => r.status === 'pend').reduce((s,r) => s + (parseFloat(r.amount_request) || 0), 0);

  document.getElementById('fin-total').textContent = totalAll;
  document.getElementById('fin-pend').textContent = pendCount;
  document.getElementById('fin-paid-amt').textContent = formatMoney(paidAmt);
  document.getElementById('fin-pend-amt').textContent = formatMoney(pendAmt);

  if (!items.length) {
    container.innerHTML = `<div class="empty-state"><i class="ti ti-receipt"></i><p>ไม่พบรายการ</p></div>`;
    document.getElementById('fin-pagination').innerHTML = '';
    return;
  }

  // การ์ดกันพัง: กัน finState.currentPage ไม่ใช่ตัวเลข ด้วยหลักการเดียวกับหน้ารายการเอกสาร
  if (!Number.isInteger(finState.currentPage)) finState.currentPage = 1;
  const totalPages = Math.ceil(items.length / finState.pageSize);
  if (finState.currentPage > totalPages) finState.currentPage = 1;
  const start = (finState.currentPage - 1) * finState.pageSize;
  const paged = items.slice(start, start + finState.pageSize);

  const pg = document.getElementById('fin-pagination');
  if (pg) {
    let btns = '';
    if (finState.currentPage > 1) btns += `<button class="pg-btn" onclick="goFinPage(${finState.currentPage-1})">← ก่อนหน้า</button>`;
    btns += `<span class="pg-info">หน้า ${finState.currentPage} / ${totalPages} (${items.length} รายการ)</span>`;
    if (finState.currentPage < totalPages) btns += `<button class="pg-btn" onclick="goFinPage(${finState.currentPage+1})">ถัดไป →</button>`;
    pg.innerHTML = btns;
  }

  container.innerHTML = paged.map(r => `
    <div class="doc-card" onclick="openFinDetail('${r.id}')">
      <div class="doc-card-icon" style="background:var(--gold-light);color:#854F0B">
        <i class="ti ti-cash" aria-hidden="true"></i>
      </div>
      <div class="doc-card-body">
        <div class="doc-card-row">
          <div class="doc-card-title">${esc(r.title || '-')}</div>
          <span class="badge ${finStatusBadgeClass(r.status)}">${finStatusLabel(r.status)}</span>
        </div>
        <div class="doc-card-meta">
          ${r.docno ? `<strong>${esc(r.docno)}</strong> &nbsp;·&nbsp; ` : ''}ผู้ขอเบิก: ${esc(r.requester || '-')} &nbsp;·&nbsp; ${formatDate(r.request_date)}
        </div>
        <div class="doc-card-tags">
          <span class="badge badge-type">ขอเบิก ${formatMoney(r.amount_request)}</span>
          ${r.amount_paid ? `<span class="badge badge-done">จ่ายจริง ${formatMoney(r.amount_paid)}</span>` : ''}
          ${r.category ? `<span class="badge badge-type">${esc(r.category)}</span>` : ''}
        </div>
      </div>
    </div>
  `).join('');
}

function goFinPage(p) {
  finState.currentPage = p;
  renderFinList();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== FINANCE: DETAIL =====
function openFinDetail(id) {
  const r = finState.records.find(x => x.id === id);
  if (!r) return;
  finState.detailId = id;
  document.getElementById('fin-detail-title').textContent = 'รายละเอียดรายการเบิก-จ่ายเงิน';

  const rows = [
    ['เลขที่เบิก', r.docno],
    ['วันที่ขอเบิก', formatDate(r.request_date)],
    ['ผู้ขอเบิก', r.requester],
    ['รายการ / เรื่อง', r.title],
    ['รายละเอียดการเบิกเงิน', r.detail],
    ['จำนวนเงินที่ขอเบิก', formatMoney(r.amount_request)],
    ['หมวดงบประมาณ', r.category],
    ['ผู้อนุมัติ', r.approver],
    ['วันที่อนุมัติ', formatDate(r.approve_date)],
    ['สถานะ', finStatusLabel(r.status)],
    ['วันที่จ่ายเงินจริง', formatDate(r.pay_date)],
    ['วิธีจ่าย', r.pay_method],
    ['จ่ายให้', r.payee],
    ['เลขบัญชีปลายทาง', r.bank_account],
    ['จำนวนเงินที่จ่ายจริง', r.amount_paid ? formatMoney(r.amount_paid) : ''],
    ['เลขที่ใบเสร็จ', r.receipt_no],
    ['หมายเหตุ', r.note],
    ['หลักฐานการอนุมัติ', r.approve_file_url ? '🔗 เปิดไฟล์' : ''],
  ];

  // แปลง file_url หลายอัน
  const fileLinks = r.file_url ? r.file_url.split(',').map((entry, i) => {
    const parts = entry.split('|');
    const url = parts[0];
    const name = parts[1] || ('ไฟล์ ' + (i+1));
    return `<a href="${url}" target="_blank" style="color:var(--purple);display:block">🔗 ${esc(name)}</a>`;
  }).join('') : '';

  document.getElementById('fin-detail-body').innerHTML = `
    <div class="detail-section">
      <h3>ข้อมูลรายการ</h3>
      ${rows.filter(([,v]) => v).map(([k,v]) => `
        <div class="detail-row"><span class="dk">${k}</span><span class="dv">${
          k === 'หลักฐานการอนุมัติ' ? `<a href="${r.approve_file_url}" target="_blank" style="color:var(--purple)">${esc(v)}</a>` :
          esc(v)
        }</span></div>
      `).join('')}
      ${fileLinks ? `<div class="detail-row"><span class="dk">หลักฐานการจ่าย</span><span class="dv">${fileLinks}</span></div>` : ''}
    </div>
    <div style="display:flex;gap:8px;margin-top:4px">
      <button class="btn-submit" onclick="openFinEditForm('${r.id}')" style="flex:1;background:var(--purple);color:#fff">
        <i class="ti ti-edit" aria-hidden="true"></i> แก้ไข
      </button>
      <button onclick="deleteFinRecord('${r.id}')" style="padding:12px 16px;border:1px solid var(--border-med);border-radius:var(--radius);background:#fff;cursor:pointer;font-size:18px;color:var(--text-sub)">
        <i class="ti ti-trash" aria-hidden="true"></i>
      </button>
    </div>
  `;

  document.getElementById('fin-detail-overlay').classList.add('open');
}

function closeFinDetail() { document.getElementById('fin-detail-overlay').classList.remove('open'); }

function deleteFinRecord(id) {
  if (!confirm('ลบรายการนี้?')) return;
  finState.records = finState.records.filter(x => x.id !== id);
  saveFinLocal();
  closeFinDetail();
  renderFinList();
  showToast('ลบรายการแล้ว');
  if (API.url) API.call({ action: 'deleteFinance', id }).catch(()=>{});
}

async function syncFinFromSheets() {
  if (!API.url) return;
  try {
    const data = await API.call({ action: 'getAllFinance' });
    if (data.records) { finState.records = data.records; saveFinLocal(); renderFinList(); }
  } catch(e) {}
}

// ===== RENT (ค่าเช่า) =====

// ตารางเรทค่าน้ำแบบขั้นบันได (กปภ. ตารางหมายเลข 3 ประเภท 2: ราชการและธุรกิจขนาดเล็ก)
// แก้ตัวเลขตรงนี้ได้เลยถ้า กปภ. ปรับอัตราในอนาคต ไม่ต้องแตะสูตรคำนวณ
const WATER_RATE_TIERS = [
  { upTo: 10, rate: 16.00 },
  { upTo: 20, rate: 19.00 },
  { upTo: 30, rate: 20.00 },
  { upTo: 50, rate: 21.50 },
  { upTo: 80, rate: 21.60 },
  { upTo: 100, rate: 21.65 },
  { upTo: 300, rate: 21.70 },
  { upTo: 1000, rate: 21.75 },
  { upTo: 2000, rate: 21.80 },
  { upTo: 3000, rate: 21.85 },
  { upTo: Infinity, rate: 21.90 },
];
const WATER_MIN_CHARGE = 150;
const RENT_SECURITY_FEE_PER_ROOM = 400;
const RENT_DONATION_RATE = 0.05; // บริจาคช่วยภาษี 5% ของค่าเช่า (ค่าเริ่มต้น แก้ไขต่อรายการได้)

// คำนวณค่าน้ำแบบขั้นบันได (เหมือนกับฝั่ง Apps Script เป๊ะ ใช้พรีวิวในฟอร์มแบบสด ๆ)
function calcWaterFee(units) {
  units = Number(units) || 0;
  if (units <= 0) return WATER_MIN_CHARGE;
  let remaining = units, prev = 0, total = 0;
  for (const tier of WATER_RATE_TIERS) {
    if (remaining <= 0) break;
    const size = tier.upTo - prev;
    const use = Math.min(remaining, size);
    total += use * tier.rate;
    remaining -= use;
    prev = tier.upTo;
  }
  return Math.max(Math.round(total * 100) / 100, WATER_MIN_CHARGE);
}

function rentStatusLabel(s) { return s === 'paid' ? 'จ่ายแล้ว' : 'ค้างชำระ'; }
function rentStatusBadgeClass(s) { return s === 'paid' ? 'badge-done' : 'badge-urgent'; }

function saveRentLocal2() {} // เผื่อเรียกผิดชื่อในอนาคต (no-op safeguard)

// อัปเดตพรีวิวยอดเงินแบบสดในฟอร์ม ตอนผู้ใช้พิมพ์ค่าเช่า/เลขมิเตอร์
function updateRentPreview() {
  const getNum = id => Number(document.getElementById(id)?.value) || 0;
  const meterCur = getNum('rent-f-meter-current');
  const meterPrev = getNum('rent-f-meter-previous');
  const rooms = getNum('rent-f-rooms') || 1;
  const rent = getNum('rent-f-rent');
  const monthKey = document.getElementById('rent-f-month')?.value || '';

  const units = Math.max(meterCur - meterPrev, 0);
  const waterMonthKey = getPrevMonthKey(monthKey);
  const avgRate = getAvgRateForMonth(waterMonthKey);
  const waterFee = avgRate != null ? Math.round(units * avgRate * 100) / 100 : 0;

  document.getElementById('rent-f-units').value = units;
  document.getElementById('rent-f-water-fee').value = waterFee.toFixed(2);

  const warnEl = document.getElementById('rent-f-water-warn');
  if (warnEl) {
    warnEl.style.display = (avgRate == null && monthKey) ? 'block' : 'none';
    if (avgRate == null && monthKey) {
      warnEl.querySelector('span').textContent = '⚠️ ยังไม่ได้ตั้งค่ามิเตอร์น้ำกลางของเดือน ' + (waterMonthKey || '-') + ' (เดือนก่อนหน้า) — ค่าน้ำจะเป็น 0 ไปก่อน กด "ตั้งค่ามิเตอร์น้ำกลาง" จากหน้ารายการก่อนบันทึกจริง';
    }
  }

  // เสนอค่า รปภ./บริจาคให้อัตโนมัติ "เฉพาะตอนที่ยังไม่เคยแก้เอง" (เช็คจาก data-touched)
  const secEl = document.getElementById('rent-f-security-fee');
  if (!secEl.dataset.touched) secEl.value = (RENT_SECURITY_FEE_PER_ROOM * rooms).toFixed(2);
  const donEl = document.getElementById('rent-f-donation');
  if (!donEl.dataset.touched) donEl.value = (rent * RENT_DONATION_RATE).toFixed(2);

  const total = rent + waterFee + Number(secEl.value || 0) + Number(donEl.value || 0);
  document.getElementById('rent-f-total-preview').textContent = formatMoney(total);
}

// ดึงเลขล็อคจากชื่อร้านที่มีวงเล็บท้าย เช่น "ร้านชงไก่ (9)" → เติมช่อง "ล็อค" เป็น "9" ให้อัตโนมัติ
function autofillRentLot() {
  const shopEl = document.getElementById('rent-f-shop');
  const lotEl = document.getElementById('rent-f-lot');
  if (!shopEl || !lotEl) return;
  const match = shopEl.value.match(/\((\d+)\)\s*$/);
  if (match) lotEl.value = match[1];
}

function openRentForm() {
  rentEditingId = null;
  document.getElementById('rent-form-overlay').classList.add('open');
  document.getElementById('rent-form').reset();
  document.getElementById('rent-form-title').textContent = 'บันทึกค่าเช่าประจำเดือน';
  document.getElementById('rent-submit-btn').textContent = 'บันทึกรายการค่าเช่า';
  document.getElementById('rent-f-security-fee').dataset.touched = '';
  document.getElementById('rent-f-donation').dataset.touched = '';
  const today = new Date();
  document.getElementById('rent-f-month').value = today.toISOString().slice(0, 7);
  document.getElementById('rent-f-rooms').value = 1;
  updateRentPreview();
}

function closeRentForm() {
  document.getElementById('rent-form-overlay').classList.remove('open');
}

function openRentEditForm(id) {
  const r = rentState.records.find(x => x.id === id);
  if (!r) return;
  rentEditingId = id;
  closeFinDetail();
  document.getElementById('rent-form-overlay').classList.add('open');
  document.getElementById('rent-form-title').textContent = 'แก้ไขรายการค่าเช่า';
  document.getElementById('rent-submit-btn').textContent = 'บันทึกการแก้ไข';
  setTimeout(() => {
    const set = (elId, val) => { const el = document.getElementById(elId); if (el && val !== undefined) el.value = val; };
    set('rent-f-month', r.month_key || '');
    set('rent-f-lot', r.lot);
    set('rent-f-shop', r.shop_name);
    set('rent-f-rooms', r.rooms || 1);
    set('rent-f-rent', r.rent);
    set('rent-f-meter-previous', r.meter_previous);
    set('rent-f-meter-current', r.meter_current);
    set('rent-f-security-fee', r.security_fee);
    set('rent-f-donation', r.donation);
    set('rent-f-status', r.status || 'unpaid');
    set('rent-f-note', r.note);
    // ตอนแก้ไข ถือว่า รปภ./บริจาคของเดิมถูก "แตะ" แล้วเสมอ กันระบบไปเผลอ auto-overwrite ค่าที่เคยตั้งเองไว้
    document.getElementById('rent-f-security-fee').dataset.touched = '1';
    document.getElementById('rent-f-donation').dataset.touched = '1';
    updateRentPreview();
  }, 100);
}

async function submitRentForm() {
  const get = id => document.getElementById(id)?.value?.trim() || '';
  const getNum = id => Number(document.getElementById(id)?.value) || 0;
  const isEdit = !!rentEditingId;

  const shopName = get('rent-f-shop');
  if (!shopName) { showToast('กรุณากรอกชื่อร้าน'); return; }

  const monthKey = get('rent-f-month'); // yyyy-mm จาก <input type="month">
  const [y, m] = monthKey.split('-').map(Number);
  const monthLabel = (y && m) ? (THAI_MONTHS[m - 1] + ' ' + (y + 543)) : '';
  const waterMonthKey = getPrevMonthKey(monthKey); // ค่าน้ำอ้างอิงมิเตอร์กลางของเดือนก่อนหน้าเสมอ

  if (getAvgRateForMonth(waterMonthKey) == null) {
    if (!confirm('ยังไม่ได้ตั้งค่ามิเตอร์กลางของเดือน ' + waterMonthKey + ' (เดือนก่อนหน้า) — ค่าน้ำจะถูกบันทึกเป็น 0 บาทไปก่อน แล้วค่อยกลับมาแก้ทีหลังได้ ต้องการดำเนินการต่อไหม?')) return;
  }

  const meterCur = getNum('rent-f-meter-current');
  const meterPrev = getNum('rent-f-meter-previous');
  const units = Math.max(meterCur - meterPrev, 0);
  const avgRate = getAvgRateForMonth(waterMonthKey);
  const waterFee = avgRate != null ? Math.round(units * avgRate * 100) / 100 : 0;
  const rent = getNum('rent-f-rent');
  const securityFee = getNum('rent-f-security-fee');
  const donation = getNum('rent-f-donation');
  const total = rent + waterFee + securityFee + donation;

  const oldRecord = isEdit ? rentState.records.find(x => x.id === rentEditingId) : null;

  const record = {
    id: isEdit ? rentEditingId : Date.now().toString(),
    month_key: monthKey,
    month: monthLabel,
    lot: get('rent-f-lot'),
    shop_name: shopName,
    rooms: getNum('rent-f-rooms') || 1,
    rent,
    meter_previous: meterPrev,
    meter_current: meterCur,
    units,
    water_fee: waterFee,
    security_fee: securityFee,
    donation,
    total,
    status: get('rent-f-status') || 'unpaid',
    note: get('rent-f-note'),
    file_url: oldRecord ? (oldRecord.file_url || '') : '',
    issue_date: oldRecord ? (oldRecord.issue_date || '') : '',
    created_at: new Date().toISOString(),
  };

  if (isEdit) {
    const idx = rentState.records.findIndex(x => x.id === rentEditingId);
    if (idx !== -1) rentState.records[idx] = record;
  } else {
    rentState.records.unshift(record);
  }
  saveRentLocal();
  renderRentList();
  closeRentForm();
  showToast(isEdit ? 'แก้ไขสำเร็จ' : 'บันทึกสำเร็จ');

  if (API.url) {
    try {
      if (isEdit) await API.call({ action: 'updateRent', row: JSON.stringify(record) });
      else await API.call({ action: 'addRent', row: JSON.stringify(record) });
    } catch(e) { showToast('บันทึก offline — จะซิงก์เมื่อออนไลน์'); }
  }

  rentEditingId = null;
}

// ===== RENT: RENDER LIST =====
function renderRentList() {
  const container = document.getElementById('rent-list');
  let items = [...rentState.records];

  // เรียงตามเดือน ล่าสุดก่อน แล้วตามชื่อร้าน
  items.sort((a, b) => {
    const ma = a.month_key || '', mb = b.month_key || '';
    if (mb !== ma) return mb > ma ? 1 : -1;
    return (a.shop_name || '').localeCompare(b.shop_name || '');
  });

  if (rentState.filter !== 'all') items = items.filter(r => r.status === rentState.filter);
  if (rentState.search) {
    items = items.filter(r =>
      [r.shop_name, r.lot, r.month].some(v => v && String(v).toLowerCase().includes(rentState.search))
    );
  }

  const totalAll = rentState.records.length;
  const unpaidCount = rentState.records.filter(r => r.status !== 'paid').length;
  const totalAmt = rentState.records.reduce((s, r) => s + (Number(r.total) || 0), 0);
  const unpaidAmt = rentState.records.filter(r => r.status !== 'paid').reduce((s, r) => s + (Number(r.total) || 0), 0);

  const elTotal = document.getElementById('rent-total');
  const elUnpaid = document.getElementById('rent-unpaid');
  const elTotalAmt = document.getElementById('rent-total-amt');
  const elUnpaidAmt = document.getElementById('rent-unpaid-amt');
  if (elTotal) elTotal.textContent = totalAll;
  if (elUnpaid) elUnpaid.textContent = unpaidCount;
  if (elTotalAmt) elTotalAmt.textContent = formatMoney(totalAmt);
  if (elUnpaidAmt) elUnpaidAmt.textContent = formatMoney(unpaidAmt);

  if (!items.length) {
    container.innerHTML = `<div class="empty-state"><i class="ti ti-building-store"></i><p>ยังไม่มีรายการค่าเช่า กดปุ่ม + เพื่อเพิ่มรายการแรก</p></div>`;
    document.getElementById('rent-pagination').innerHTML = '';
    return;
  }

  if (!Number.isInteger(rentState.currentPage)) rentState.currentPage = 1;
  const totalPages = Math.ceil(items.length / rentState.pageSize);
  if (rentState.currentPage > totalPages) rentState.currentPage = 1;
  const start = (rentState.currentPage - 1) * rentState.pageSize;
  const paged = items.slice(start, start + rentState.pageSize);

  const pg = document.getElementById('rent-pagination');
  if (pg) {
    let btns = '';
    if (rentState.currentPage > 1) btns += `<button class="pg-btn" onclick="goRentPage(${rentState.currentPage-1})">← ก่อนหน้า</button>`;
    btns += `<span class="pg-info">หน้า ${rentState.currentPage} / ${totalPages} (${items.length} รายการ)</span>`;
    if (rentState.currentPage < totalPages) btns += `<button class="pg-btn" onclick="goRentPage(${rentState.currentPage+1})">ถัดไป →</button>`;
    pg.innerHTML = btns;
  }

  container.innerHTML = paged.map(r => `
    <div class="doc-card" onclick="openRentDetail('${r.id}')">
      <div class="doc-card-icon" style="background:#E1F5EE;color:#085041">
        <i class="ti ti-building-store" aria-hidden="true"></i>
      </div>
      <div class="doc-card-body">
        <div class="doc-card-row">
          <div class="doc-card-title">${esc(r.shop_name || '-')}${r.lot ? ' (ล็อค ' + esc(r.lot) + ')' : ''}</div>
          <span class="badge ${rentStatusBadgeClass(r.status)}">${rentStatusLabel(r.status)}</span>
        </div>
        <div class="doc-card-meta">${esc(r.month || '-')} &nbsp;·&nbsp; หน่วยน้ำใช้ ${r.units || 0}</div>
        <div class="doc-card-tags">
          <span class="badge badge-type">รวม ${formatMoney(r.total)}</span>
          ${r.file_url ? `<span class="badge badge-done">มีใบแจ้งหนี้แล้ว</span>` : ''}
        </div>
      </div>
    </div>
  `).join('');
}

function goRentPage(p) {
  rentState.currentPage = p;
  renderRentList();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== RENT: DETAIL =====
function openRentDetail(id) {
  const r = rentState.records.find(x => x.id === id);
  if (!r) return;
  rentState.detailId = id;
  document.getElementById('fin-detail-title').textContent = 'รายละเอียดค่าเช่า';

  const rows = [
    ['เดือน', r.month],
    ['ล็อค', r.lot],
    ['ชื่อร้าน', r.shop_name],
    ['จำนวนห้องเช่า', r.rooms],
    ['ค่าเช่า', formatMoney(r.rent)],
    ['เลขมิเตอร์ก่อน', r.meter_previous],
    ['เลขมิเตอร์หลัง', r.meter_current],
    ['จำนวนหน่วยที่ใช้', r.units],
    ['ค่าน้ำ', formatMoney(r.water_fee)],
    ['ค่า รปภ.', formatMoney(r.security_fee)],
    ['บริจาคช่วยภาษี', formatMoney(r.donation)],
    ['รวมเงินที่ต้องชำระ', formatMoney(r.total)],
    ['สถานะ', rentStatusLabel(r.status)],
    ['วันที่ออกใบแจ้งหนี้', r.issue_date ? formatDate(r.issue_date) : ''],
    ['หมายเหตุ', r.note],
  ];

  document.getElementById('fin-detail-body').innerHTML = `
    <div class="detail-section">
      <h3>ข้อมูลค่าเช่า</h3>
      ${rows.filter(([,v]) => v !== undefined && v !== '').map(([k,v]) => `
        <div class="detail-row"><span class="dk">${k}</span><span class="dv">${esc(String(v))}</span></div>
      `).join('')}
      ${r.file_url ? `<div class="detail-row"><span class="dk">ใบแจ้งหนี้ (PDF)</span><span class="dv"><a href="${r.file_url}" target="_blank" style="color:var(--purple)">🔗 เปิดไฟล์</a></span></div>` : ''}
    </div>
    <div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap">
      <button class="btn-submit" onclick="generateRentInvoice('${r.id}')" style="flex:1;min-width:160px;background:#085041;color:#fff">
        <i class="ti ti-file-invoice" aria-hidden="true"></i> ${r.file_url ? 'ออกใบแจ้งหนี้ใหม่' : 'ออกใบแจ้งหนี้'}
      </button>
      <button class="btn-submit" onclick="openRentEditForm('${r.id}')" style="flex:1;min-width:100px;background:var(--purple);color:#fff">
        <i class="ti ti-edit" aria-hidden="true"></i> แก้ไข
      </button>
      <button onclick="deleteRentRecord('${r.id}')" style="padding:12px 16px;border:1px solid var(--border-med);border-radius:var(--radius);background:#fff;cursor:pointer;font-size:18px;color:var(--text-sub)">
        <i class="ti ti-trash" aria-hidden="true"></i>
      </button>
    </div>
  `;

  document.getElementById('fin-detail-overlay').classList.add('open');
}

function deleteRentRecord(id) {
  if (!confirm('ลบรายการค่าเช่านี้?')) return;
  rentState.records = rentState.records.filter(x => x.id !== id);
  saveRentLocal();
  closeFinDetail();
  renderRentList();
  showToast('ลบรายการแล้ว');
  if (API.url) API.call({ action: 'deleteRent', id }).catch(()=>{});
}

// สั่งออกใบแจ้งหนี้ (Apps Script จะ merge เข้า Slides template แล้ว export PDF ให้)
async function generateRentInvoice(id) {
  if (!API.url) { showToast('กรุณาตั้งค่า API URL ก่อน'); return; }
  showToast('กำลังออกใบแจ้งหนี้... (อาจใช้เวลาสักครู่)');
  try {
    const res = await API.call({ action: 'generateRentInvoice', id });
    if (res.ok) {
      const idx = rentState.records.findIndex(x => x.id === id);
      if (idx !== -1) {
        rentState.records[idx].file_url = res.pdfUrl;
        rentState.records[idx].issue_date = res.issueDate;
        saveRentLocal();
      }
      showToast('ออกใบแจ้งหนี้สำเร็จ');
      openRentDetail(id);
      window.open(res.pdfUrl, '_blank');
    } else {
      showToast('ออกใบแจ้งหนี้ไม่สำเร็จ: ' + (res.error || 'ไม่ทราบสาเหตุ'));
    }
  } catch (e) {
    showToast('ออกใบแจ้งหนี้ไม่สำเร็จ: ' + e.message);
  }
}

async function syncRentFromSheets() {
  if (!API.url) return;
  try {
    const data = await API.call({ action: 'getAllRent' });
    if (data.records) { rentState.records = data.records; saveRentLocal(); renderRentList(); }
  } catch(e) {}
}

// ===== มิเตอร์น้ำกลาง (ตั้งค่าราคาเฉลี่ยต่อหน่วยของแต่ละเดือน) =====
function openMasterMeterForm() {
  document.getElementById('mm-form-overlay').classList.add('open');
  const rentMonthKey = document.getElementById('rent-f-month')?.value;
  // ถ้าเปิดจากฟอร์มร้านค้าที่กำลังกรอกอยู่ ให้ default เป็น "เดือนก่อนหน้า" ของบิลนั้น (ค่าน้ำอ้างอิงเดือนก่อนเสมอ)
  // ถ้าไม่ได้เปิดจากฟอร์มร้านค้า ให้ default เป็นเดือนก่อนหน้าของเดือนปัจจุบัน
  const monthKey = getPrevMonthKey(rentMonthKey || new Date().toISOString().slice(0, 7));
  document.getElementById('mm-f-month').value = monthKey;
  const existing = masterMeterState.records.find(m => m.month_key === monthKey);
  document.getElementById('mm-f-meter-previous').value = existing ? existing.meter_previous : '';
  document.getElementById('mm-f-meter-current').value = existing ? existing.meter_current : '';
  updateMasterMeterPreview();
}

function closeMasterMeterForm() {
  document.getElementById('mm-form-overlay').classList.remove('open');
}

function updateMasterMeterPreview() {
  const getNum = id => Number(document.getElementById(id)?.value) || 0;
  const units = Math.max(getNum('mm-f-meter-current') - getNum('mm-f-meter-previous'), 0);
  const totalBill = calcWaterFee(units);
  const avgRate = units > 0 ? Math.round((totalBill / units) * 100) / 100 : 0;
  document.getElementById('mm-f-units-preview').textContent = units;
  document.getElementById('mm-f-total-preview').textContent = formatMoney(totalBill);
  document.getElementById('mm-f-avgrate-preview').textContent = avgRate.toFixed(2) + ' บาท/หน่วย';
}

async function submitMasterMeter() {
  const get = id => document.getElementById(id)?.value?.trim() || '';
  const getNum = id => Number(document.getElementById(id)?.value) || 0;

  const monthKey = get('mm-f-month');
  if (!monthKey) { showToast('กรุณาเลือกเดือน'); return; }
  const [y, m] = monthKey.split('-').map(Number);
  const monthLabel = (y && m) ? (THAI_MONTHS[m - 1] + ' ' + (y + 543)) : '';

  const record = {
    month_key: monthKey, month: monthLabel,
    meter_previous: getNum('mm-f-meter-previous'),
    meter_current: getNum('mm-f-meter-current'),
  };

  if (!API.url) { showToast('กรุณาตั้งค่า API URL ก่อน'); return; }
  showToast('กำลังบันทึกมิเตอร์กลาง...');
  try {
    const res = await API.call({ action: 'setMasterMeter', row: JSON.stringify(record) });
    if (res.ok) {
      const idx = masterMeterState.records.findIndex(x => x.month_key === monthKey);
      const updated = { month_key: monthKey, month: monthLabel, meter_previous: record.meter_previous, meter_current: record.meter_current, units: res.units, total_bill: res.totalBill, avg_rate: res.avgRate };
      if (idx !== -1) masterMeterState.records[idx] = updated;
      else masterMeterState.records.unshift(updated);
      saveMasterMeterLocal();
      showToast('บันทึกมิเตอร์กลางสำเร็จ — ราคาเฉลี่ย ' + res.avgRate.toFixed(2) + ' บาท/หน่วย');
      closeMasterMeterForm();
      updateRentPreview(); // อัปเดตพรีวิวค่าน้ำในฟอร์มร้านค้าทันที ถ้าเปิดอยู่
    } else {
      showToast('บันทึกไม่สำเร็จ: ' + (res.error || 'ไม่ทราบสาเหตุ'));
    }
  } catch (e) {
    showToast('บันทึกไม่สำเร็จ: ' + e.message);
  }
}

async function syncMasterMeterFromSheets() {
  if (!API.url) return;
  try {
    const data = await API.call({ action: 'getAllMasterMeter' });
    if (data.records) { masterMeterState.records = data.records; saveMasterMeterLocal(); }
  } catch(e) {}
}

// ===== CALENDAR =====
const CAL_TYPE_COLOR = {
  'ประชุม': { bg: '#EEEDFE', color: '#3C3489', dot: '#534AB7' },
  'กิจกรรม': { bg: '#FAEEDA', color: '#633806', dot: '#D4A017' },
  'งานภายนอก': { bg: '#E1F5EE', color: '#085041', dot: '#1D9E75' },
  'งานเอกสาร': { bg: '#E6F1FB', color: '#0C447C', dot: '#185FA5' },
  'อื่นๆ': { bg: 'var(--gray-100)', color: 'var(--gray-600)', dot: '#888780' },
};
const CAL_OWNER_COLOR = {
  'ไอยลดา': { bg: '#EEEDFE', color: '#3C3489' },
  'จิตรภณ': { bg: '#E1F5EE', color: '#085041' },
  'โรจนวัน': { bg: '#FAEEDA', color: '#633806' },
};
const THAI_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const THAI_DAYS = ['อา','จ','อ','พ','พฤ','ศ','ส'];

function calTypeIcon(type) {
  return { 'ประชุม': 'ti-users', 'กิจกรรม': 'ti-confetti', 'งานภายนอก': 'ti-building', 'งานเอกสาร': 'ti-file-text', 'อื่นๆ': 'ti-calendar-event' }[type] || 'ti-calendar-event';
}

function renderCalendar() {
  initCalPanelState();
  updateCalMonthHeader();
  renderCalLegend();
  renderMiniCal();
  renderCalMainGrid();
  renderCalRight();
  renderCalPinned();
}

// คำอธิบายสีของแต่ละประเภทกิจกรรม — เดิมไม่มี legend ผู้ใช้ต้องเดาความหมายสีของ chip เอง
function renderCalLegend() {
  const el = document.getElementById('cal-legend');
  if (!el) return;
  const types = Object.keys(CAL_TYPE_COLOR);
  el.innerHTML = '<span class="cal-legend-label">ประเภท</span>' + types.map(t => {
    const col = CAL_TYPE_COLOR[t];
    return `<div class="cal-legend-item"><i class="ti ${calTypeIcon(t)}" style="color:${col.dot}" aria-hidden="true"></i>${esc(t)}</div>`;
  }).join('');
}

// ===== ย่อ/ขยายเมนูซ้าย-ขวาของหน้าปฏิทิน (จำค่าไว้ใน localStorage) =====
function initCalPanelState() {
  const layout = document.querySelector('.cal-layout');
  if (!layout) return;
  try {
    const hideLeft = localStorage.getItem('cmu_cal_hide_left') === '1';
    const hideRight = localStorage.getItem('cmu_cal_hide_right') === '1';
    layout.classList.toggle('hide-left', hideLeft);
    layout.classList.toggle('hide-right', hideRight);
    const btnLeft = document.getElementById('cal-toggle-left');
    const btnRight = document.getElementById('cal-toggle-right');
    btnLeft?.classList.toggle('active', hideLeft);
    btnRight?.classList.toggle('active', hideRight);
    if (btnLeft) btnLeft.title = hideLeft ? 'ขยายเมนูซ้าย' : 'ย่อเมนูซ้าย';
    if (btnRight) btnRight.title = hideRight ? 'ขยายเมนูขวา' : 'ย่อเมนูขวา';
  } catch (e) {}
}

function calTogglePanel(side) {
  const layout = document.querySelector('.cal-layout');
  if (!layout) return;
  const cls = side === 'left' ? 'hide-left' : 'hide-right';
  const nowHidden = layout.classList.toggle(cls);
  const btn = document.getElementById('cal-toggle-' + side);
  btn?.classList.toggle('active', nowHidden);
  if (btn) {
    const sideLabel = side === 'left' ? 'ซ้าย' : 'ขวา';
    btn.title = (nowHidden ? 'ขยายเมนู' : 'ย่อเมนู') + sideLabel;
  }
  try { localStorage.setItem(side === 'left' ? 'cmu_cal_hide_left' : 'cmu_cal_hide_right', nowHidden ? '1' : '0'); } catch (e) {}
  renderCalMainGrid();
}

function renderMiniCal() {
  const y = calState.viewYear, m = calState.viewMonth;
  const thaiYear = y + 543;
  document.getElementById('cal-mini-label').textContent = THAI_MONTHS[m] + ' ' + thaiYear;
  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m+1, 0).getDate();
  const today = new Date().toISOString().slice(0,10);
  const eventDates = new Set(calState.records.map(r => r.date_start?.slice(0,7) === `${y}-${String(m+1).padStart(2,'0')}` ? r.date_start?.slice(0,10) : null).filter(Boolean));

  let html = THAI_DAYS.map(d => `<div class="cal-dow">${d}</div>`).join('');
  const startOffset = firstDay;
  for (let i = 0; i < startOffset; i++) html += '<div class="cal-d muted"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = dateStr === today;
    const isSel = dateStr === calState.selectedDate;
    const hasEv = eventDates.has(dateStr);
    html += `<div class="cal-d${isToday?' today':''}${isSel&&!isToday?' selected':''}${hasEv?' has-ev':''}" onclick="calSelectDate('${dateStr}')">${d}</div>`;
  }
  document.getElementById('cal-grid').innerHTML = html;
}

function updateCalMonthHeader() {
  const y = calState.viewYear, m = calState.viewMonth;
  const thaiYear = y + 543;
  const titleEl = document.getElementById('cal-month-title');
  const subEl = document.getElementById('cal-month-sub');
  if (titleEl) titleEl.textContent = THAI_MONTHS[m] + ' ' + thaiYear;
  if (subEl) subEl.textContent = new Date(y, m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function calNav(dir) {
  calState.viewMonth += dir;
  if (calState.viewMonth > 11) { calState.viewMonth = 0; calState.viewYear++; }
  if (calState.viewMonth < 0) { calState.viewMonth = 11; calState.viewYear--; }
  renderMiniCal();
  renderCalMainGrid();
  updateCalMonthHeader();
}

function calSelectDate(d) {
  calState.selectedDate = d;
  const [y, m] = d.split('-').map(Number);
  calState.viewYear = y;
  calState.viewMonth = m - 1;
  renderMiniCal();
  renderCalMainGrid();
  updateCalMonthHeader();
  calOpenDayDetail(d);
}

// จำนวน chip กิจกรรมสูงสุดที่โชว์ต่อวัน ปรับตามพื้นที่ที่เหลือ:
// ย่อเมนูซ้ายหรือขวาออก 1 ฝั่ง = เห็นได้มากขึ้น, ย่อทั้งสองฝั่ง = เห็นได้มากที่สุด
function calGetMaxChips() {
  const layout = document.querySelector('.cal-layout');
  if (!layout) return 2;
  const hideLeft = layout.classList.contains('hide-left');
  const hideRight = layout.classList.contains('hide-right');
  if (hideLeft && hideRight) return 4;
  if (hideLeft || hideRight) return 3;
  return 2;
}

// ===== ตารางปฏิทินเต็มเดือน (CENTER PANEL) =====
function renderCalMainGrid() {
  const y = calState.viewYear, m = calState.viewMonth;
  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const today = new Date().toISOString().slice(0, 10);
  const maxChips = calGetMaxChips();

  const dowEl = document.getElementById('cal-main-dow');
  if (dowEl && !dowEl.dataset.filled) {
    dowEl.innerHTML = THAI_DAYS.map(d => `<div>${d}</div>`).join('');
    dowEl.dataset.filled = '1';
  }

  let html = '';
  for (let i = 0; i < firstDay; i++) html += '<div class="cal-main-cell muted"></div>';

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isToday = dateStr === today;
    const dayEvents = calState.records.filter(r => {
      const s = r.date_start?.slice(0, 10);
      const e = r.date_end?.slice(0, 10) || s;
      return s && dateStr >= s && dateStr <= e;
    }).sort((a, b) => (a.time_start || '').localeCompare(b.time_start || ''));

    const chips = dayEvents.slice(0, maxChips).map(ev => {
      const col = CAL_TYPE_COLOR[ev.type] || CAL_TYPE_COLOR['อื่นๆ'];
      return `<div class="cal-main-ev-chip" style="background:${col.bg};color:${col.color}"><i class="ti ${calTypeIcon(ev.type)}" aria-hidden="true"></i><span>${esc(ev.title)}</span></div>`;
    }).join('');
    const more = dayEvents.length > maxChips ? `<div class="cal-main-more">+${dayEvents.length - maxChips} อื่นๆ</div>` : '';

    html += `<div class="cal-main-cell${isToday ? ' today' : ''}${dayEvents.length ? ' has-ev' : ''}" onclick="calOpenDayDetail('${dateStr}')">
      <div class="cal-main-date">${d}</div>
      <div class="cal-main-evs">${chips}${more}</div>
    </div>`;
  }

  const totalCells = firstDay + daysInMonth;
  const trailing = (7 - (totalCells % 7)) % 7;
  for (let i = 0; i < trailing; i++) html += '<div class="cal-main-cell muted"></div>';

  document.getElementById('cal-main-grid').innerHTML = html;
}

// เปิด popup รายละเอียดกิจกรรมเต็มของวันที่กดเลือก (จากตารางหลักหรือปฏิทินย่อย)
function calOpenDayDetail(dateStr) {
  calState.selectedDate = dateStr;
  const d = new Date(dateStr + 'T00:00:00');
  const dateLabel = d.toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const items = calState.records.filter(r => {
    const s = r.date_start?.slice(0, 10);
    const e = r.date_end?.slice(0, 10) || s;
    return s && dateStr >= s && dateStr <= e;
  }).sort((a, b) => (a.time_start || '').localeCompare(b.time_start || ''));

  const listHtml = items.length ? items.map(r => {
    const col = CAL_TYPE_COLOR[r.type] || CAL_TYPE_COLOR['อื่นๆ'];
    const oc = CAL_OWNER_COLOR[r.owner] || { bg: '#E6F1FB', color: '#0C447C' };
    const timeStr = r.time_start ? (r.time_start + (r.time_end ? '–' + r.time_end : '')) : 'ทั้งวัน';
    return `
      <div class="cal-event-card" onclick="openCalDetail('${r.id}')">
        <div class="cal-ev-icon" style="background:${col.bg};color:${col.color}">
          <i class="ti ${calTypeIcon(r.type)}" aria-hidden="true"></i>
        </div>
        <div class="cal-ev-body">
          <div class="cal-ev-row">
            <div class="cal-ev-title">${esc(r.title)}</div>
            <div class="cal-ev-time">${timeStr}</div>
          </div>
          ${r.location ? `<div class="cal-ev-sub">${esc(r.location)}</div>` : ''}
          <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
            ${r.owner ? `<div class="cal-av" style="background:${oc.bg};color:${oc.color}">${r.owner.slice(0, 2)}</div>` : ''}
            <span class="cal-ev-tag">${esc(r.type || '')}</span>
          </div>
        </div>
      </div>`;
  }).join('') : `<div class="empty-state"><i class="ti ti-calendar-off"></i><p>ไม่มีกิจกรรมในวันนี้</p></div>`;

  document.getElementById('fin-detail-title').textContent = dateLabel;
  document.getElementById('fin-detail-body').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px">${listHtml}</div>
    <button class="btn-submit" onclick="closeFinDetail();openCalForm()" style="width:100%;background:var(--purple);color:#fff">
      <i class="ti ti-plus" aria-hidden="true"></i> เพิ่มกิจกรรมวันนี้
    </button>
  `;
  document.getElementById('fin-detail-overlay').classList.add('open');
}

function renderCalRight() {
  const today = new Date().toISOString().slice(0,10);
  const ym = today.slice(0,7);
  const thisMonth = calState.records.filter(r => (r.date_start||'').slice(0,7) === ym);
  const done = thisMonth.filter(r => r.date_start?.slice(0,10) < today).length;
  const soon = thisMonth.filter(r => {
    const d = r.date_start?.slice(0,10);
    const diff = (new Date(d) - new Date()) / 86400000;
    return diff >= 0 && diff <= 7;
  }).length;
  const types = new Set(thisMonth.map(r => r.type).filter(Boolean)).size;

  document.getElementById('cal-s-total').textContent = thisMonth.length;
  document.getElementById('cal-s-soon').textContent = soon;
  document.getElementById('cal-s-done').textContent = done;
  document.getElementById('cal-s-types').textContent = types;

  // Upcoming
  const upcoming = calState.records.filter(r => r.date_start?.slice(0,10) >= today)
    .sort((a,b) => a.date_start.localeCompare(b.date_start)).slice(0,5);
  const upEl = document.getElementById('cal-upcoming-list');
  if (!upcoming.length) { upEl.innerHTML = '<div style="font-size:12px;color:var(--text-hint);padding:4px 0">ยังไม่มีกิจกรรม</div>'; }
  else {
    upEl.innerHTML = upcoming.map(r => {
      const col = CAL_TYPE_COLOR[r.type] || CAL_TYPE_COLOR['อื่นๆ'];
      const diff = Math.ceil((new Date(r.date_start) - new Date()) / 86400000);
      const isSoon = diff <= 7;
      return `<div class="cal-up-item">
        <div class="cal-up-dot" style="background:${col.dot}"></div>
        <div class="cal-up-body">
          <div class="cal-up-name">${esc(r.title)}</div>
          <div class="cal-up-date">${formatDate(r.date_start)}</div>
        </div>
        <span class="cal-up-badge ${isSoon?'soon':'ok'}">${diff === 0 ? 'วันนี้' : diff + ' วัน'}</span>
      </div>`;
    }).join('');
  }

  // Team workload
  const owners = {};
  calState.records.forEach(r => { if (r.owner) owners[r.owner] = (owners[r.owner]||0)+1; });
  const teamEl = document.getElementById('cal-team-list');
  const teamNames = ['ไอยลดา','จิตรภณ','โรจนวัน'];
  teamEl.innerHTML = teamNames.map(name => {
    const oc = CAL_OWNER_COLOR[name] || { bg:'#E6F1FB', color:'#0C447C' };
    return `<div class="cal-team-row">
      <div class="cal-team-info">
        <div class="cal-team-av" style="background:${oc.bg};color:${oc.color}">${name.slice(0,2)}</div>
        <div class="cal-team-name">${name}</div>
      </div>
      <div class="cal-team-count">${owners[name]||0} งาน</div>
    </div>`;
  }).join('');
}

function renderCalPinned() {
  const today = new Date().toISOString().slice(0,10);
  const upcoming = calState.records.filter(r => r.date_start?.slice(0,10) >= today)
    .sort((a,b) => a.date_start.localeCompare(b.date_start)).slice(0,3);
  const el = document.getElementById('cal-pinned-list');
  if (!upcoming.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--text-hint);padding:4px 0">ยังไม่มีกิจกรรม</div>';
    return;
  }
  el.innerHTML = upcoming.map(r => {
    const col = CAL_TYPE_COLOR[r.type] || CAL_TYPE_COLOR['อื่นๆ'];
    return `<div class="cal-pin-card" onclick="calSelectDate('${r.date_start?.slice(0,10)}')">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
        <div style="width:8px;height:8px;border-radius:50%;background:${col.dot};flex-shrink:0"></div>
        <div class="cal-pin-title">${esc(r.title)}</div>
      </div>
      <div class="cal-pin-date">${formatDate(r.date_start)}${r.location?(' · '+esc(r.location)):''}</div>
      <span class="badge badge-type" style="margin-top:4px;font-size:10px">${esc(r.type||'')}</span>
    </div>`;
  }).join('');
}

// ===== CALENDAR FORM =====
function openCalForm() {
  calEditingId = null;
  document.getElementById('cal-form-overlay').classList.add('open');
  document.getElementById('cal-form').reset();
  document.getElementById('cal-f-date-start').value = calState.selectedDate;
  document.getElementById('cal-form-title').textContent = 'เพิ่มกิจกรรม';
  document.getElementById('cal-submit-btn').textContent = 'บันทึกกิจกรรม';
}

function closeCalForm() {
  document.getElementById('cal-form-overlay').classList.remove('open');
}

function openCalEditForm(id) {
  const r = calState.records.find(x => x.id === id);
  if (!r) return;
  // ปิด detail ก่อน
  document.getElementById('fin-detail-overlay').classList.remove('open');
  calEditingId = id;
  // เปิด overlay โดยไม่ reset calEditingId
  document.getElementById('cal-form-overlay').classList.add('open');
  document.getElementById('cal-form').reset();
  document.getElementById('cal-form-title').textContent = 'แก้ไขกิจกรรม';
  document.getElementById('cal-submit-btn').textContent = 'บันทึกการแก้ไข';
  setTimeout(() => {
    const set = (elId, val) => { const el = document.getElementById(elId); if (el && val !== undefined) el.value = val; };
    set('cal-f-title', r.title);
    set('cal-f-type', r.type);
    set('cal-f-date-start', r.date_start);
    set('cal-f-date-end', r.date_end);
    set('cal-f-time-start', r.time_start);
    set('cal-f-time-end', r.time_end);
    set('cal-f-location', r.location);
    set('cal-f-owner', r.owner);
    set('cal-f-note', r.note);
  }, 100);
}

async function submitCalForm() {
  const get = id => document.getElementById(id)?.value?.trim() || '';
  const isEdit = !!calEditingId;
  const title = get('cal-f-title');
  if (!title) { showToast('กรุณากรอกชื่องาน'); return; }

  const record = {
    id: isEdit ? calEditingId : Date.now().toString(),
    title,
    type: get('cal-f-type'),
    date_start: get('cal-f-date-start'),
    date_end: get('cal-f-date-end'),
    time_start: get('cal-f-time-start'),
    time_end: get('cal-f-time-end'),
    location: get('cal-f-location'),
    owner: get('cal-f-owner'),
    note: get('cal-f-note'),
    created_at: new Date().toISOString(),
  };

  if (isEdit) {
    const idx = calState.records.findIndex(x => x.id === calEditingId);
    if (idx !== -1) calState.records[idx] = record;
  } else {
    calState.records.push(record);
  }
  saveCalLocal();
  closeCalForm();
  renderCalendar();
  showToast(isEdit ? 'แก้ไขกิจกรรมแล้ว' : 'เพิ่มกิจกรรมแล้ว');

  if (API.url) {
    try {
      if (isEdit) await API.call({ action: 'updateCalendar', row: JSON.stringify(record) });
      else await API.call({ action: 'addCalendar', row: JSON.stringify(record) });
    } catch(e) { showToast('บันทึก offline'); }
  }
  calEditingId = null;
}

// ===== CALENDAR DETAIL =====
function openCalDetail(id) {
  const r = calState.records.find(x => x.id === id);
  if (!r) return;
  const col = CAL_TYPE_COLOR[r.type] || CAL_TYPE_COLOR['อื่นๆ'];
  const rows = [
    ['ชื่องาน', r.title],
    ['ประเภท', r.type],
    ['วันที่เริ่ม', formatDate(r.date_start)],
    ['วันที่สิ้นสุด', r.date_end ? formatDate(r.date_end) : ''],
    ['เวลา', r.time_start ? (r.time_start + (r.time_end ? ' – ' + r.time_end : '')) : ''],
    ['สถานที่', r.location],
    ['ผู้รับผิดชอบ', r.owner],
    ['หมายเหตุ', r.note],
  ];
  document.getElementById('fin-detail-title').textContent = 'รายละเอียดกิจกรรม';
  document.getElementById('fin-detail-body').innerHTML = `
    <div class="detail-section">
      <h3>ข้อมูลกิจกรรม</h3>
      ${rows.filter(([,v]) => v).map(([k,v]) => `
        <div class="detail-row"><span class="dk">${k}</span><span class="dv">${esc(v)}</span></div>
      `).join('')}
    </div>
    <div style="display:flex;gap:8px;margin-top:4px">
      <button class="btn-submit" onclick="openCalEditForm('${r.id}')" style="flex:1;background:var(--purple);color:#fff">
        <i class="ti ti-edit" aria-hidden="true"></i> แก้ไข
      </button>
      <button onclick="deleteCalRecord('${r.id}')" style="padding:12px 16px;border:1px solid var(--border-med);border-radius:var(--radius);background:#fff;cursor:pointer;font-size:18px;color:var(--text-sub)">
        <i class="ti ti-trash" aria-hidden="true"></i>
      </button>
    </div>
  `;
  document.getElementById('fin-detail-overlay').classList.add('open');
}

function deleteCalRecord(id) {
  if (!confirm('ลบกิจกรรมนี้?')) return;
  calState.records = calState.records.filter(x => x.id !== id);
  saveCalLocal();
  document.getElementById('fin-detail-overlay').classList.remove('open');
  renderCalendar();
  showToast('ลบกิจกรรมแล้ว');
  if (API.url) API.call({ action: 'deleteCalendar', id }).catch(()=>{});
}

async function syncCalFromSheets() {
  if (!API.url) return;
  try {
    const data = await API.call({ action: 'getAllCalendar' });
    if (data.records) { calState.records = data.records; saveCalLocal(); if (state.page === 'calendar') renderCalendar(); }
  } catch(e) {}
}

// ===== CALENDAR ALL EVENTS =====
function openCalAllEvents() {
  // สร้าง month filter options
  const months = new Set(calState.records.map(r => r.date_start?.slice(0,7)).filter(Boolean));
  const sorted = Array.from(months).sort().reverse();
  const sel = document.getElementById('cal-all-month-filter');
  sel.innerHTML = '<option value="">ทุกเดือน</option>' + sorted.map(m => {
    const d = new Date(m + '-01');
    const label = d.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
    return `<option value="${m}">${label}</option>`;
  }).join('');

  renderCalAllEvents();
  document.getElementById('cal-all-overlay').classList.add('open');
}

function renderCalAllEvents() {
  const filterMonth = document.getElementById('cal-all-month-filter')?.value || '';
  let items = [...calState.records];

  if (filterMonth) {
    items = items.filter(r => r.date_start?.slice(0,7) === filterMonth);
  }

  items.sort((a,b) => (a.date_start||'').localeCompare(b.date_start||''));

  const countEl = document.getElementById('cal-all-count');
  if (countEl) countEl.textContent = items.length + ' รายการ';

  const container = document.getElementById('cal-all-list');
  if (!items.length) {
    container.innerHTML = `<div class="empty-state"><i class="ti ti-calendar-off"></i><p>ไม่พบกิจกรรม</p></div>`;
    return;
  }

  const today = new Date().toISOString().slice(0,10);
  let lastMonth = '';
  let html = '';

  items.forEach(r => {
    const month = r.date_start?.slice(0,7) || '';
    if (month !== lastMonth) {
      const d = new Date(month + '-01');
      const label = d.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
      html += `<div style="font-size:11px;font-weight:700;color:var(--text-hint);text-transform:uppercase;letter-spacing:.8px;padding:16px 0 8px;border-bottom:1px solid var(--border);margin-bottom:8px">${label}</div>`;
      lastMonth = month;
    }
    const col = CAL_TYPE_COLOR[r.type] || CAL_TYPE_COLOR['อื่นๆ'];
    const isPast = r.date_start?.slice(0,10) < today;
    const timeStr = r.time_start ? r.time_start + (r.time_end ? '–' + r.time_end : '') : 'ทั้งวัน';
    html += `
      <div class="doc-card" onclick="openCalDetail('${r.id}')" style="margin-bottom:8px;opacity:${isPast?'0.65':'1'}">
        <div class="doc-card-icon" style="background:${col.bg};color:${col.color};border-radius:12px">
          <i class="ti ${calTypeIcon(r.type)}" aria-hidden="true"></i>
        </div>
        <div class="doc-card-body">
          <div class="doc-card-row">
            <div class="doc-card-title">${esc(r.title)}</div>
            <span class="badge badge-type">${timeStr}</span>
          </div>
          <div class="doc-card-meta">${formatDate(r.date_start)}${r.location ? ' · ' + esc(r.location) : ''}</div>
          <div class="doc-card-tags">
            <span class="badge" style="background:${col.bg};color:${col.color}">${esc(r.type||'')}</span>
            ${r.owner ? `<span class="badge badge-type">${esc(r.owner)}</span>` : ''}
          </div>
        </div>
      </div>`;
  });

  container.innerHTML = html;
}

/* app.js — CMU Alumni Document Tracker */

// ===== STATE =====
let state = {
  records: [],
  page: 'list',
  filter: 'all',
  search: '',
  loading: false,
  detailId: null,
  editingType: 'recv',
  sigPad: null,
};

// ===== STORAGE (offline fallback) =====
function saveLocal() { try { localStorage.setItem('cmu_records', JSON.stringify(state.records)); } catch(e){} }
function loadLocal() {
  try {
    const d = localStorage.getItem('cmu_records');
    if (d) state.records = JSON.parse(d);
  } catch(e) {}
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  loadLocal();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
  render();
  setupNav();
  setupFab();
  setupSearch();
  checkDeadlines();
});

// ===== NAVIGATION =====
function setupNav() {
  document.querySelectorAll('.nav-item, .desktop-nav-item').forEach(el => {
    el.addEventListener('click', () => switchPage(el.dataset.page));
  });
}

function switchPage(p) {
  state.page = p;
  document.querySelectorAll('.page').forEach(el => el.classList.toggle('active', el.id === 'page-' + p));
  document.querySelectorAll('.nav-item, .desktop-nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === p));
  if (p === 'list' || p === 'send' || p === 'recv') renderList();
  if (p === 'stats') renderStats();
}

// ===== FAB =====
function setupFab() {
  document.getElementById('fab').addEventListener('click', () => openForm('recv'));
  document.getElementById('desktop-add-btn').addEventListener('click', () => openForm('recv'));
}

// ===== SEARCH =====
function setupSearch() {
  document.getElementById('search-input').addEventListener('input', e => {
    state.search = e.target.value.toLowerCase();
    renderList();
  });
  document.querySelectorAll('.filter-chip').forEach(el => {
    el.addEventListener('click', () => {
      state.filter = el.dataset.filter;
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.toggle('active', c.dataset.filter === state.filter));
      renderList();
    });
  });
}

// ===== RENDER LIST =====
function renderList() {
  const container = document.getElementById('doc-list');
  let items = state.records;

  if (state.filter !== 'all') {
    if (state.filter === 'send') items = items.filter(r => r.type === 'send');
    else if (state.filter === 'recv') items = items.filter(r => r.type === 'recv');
    else if (state.filter === 'pend') items = items.filter(r => r.status === 'pend');
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
    return;
  }

  container.innerHTML = items.map(r => `
    <div class="doc-card-wrap" id="wrap-${r.id}">
      <div class="doc-card-actions">
        <button class="swipe-action toggle" onclick="toggleStatus('${r.id}');resetSwipe('${r.id}')">
          <i class="ti ti-${r.status === 'pend' ? 'check' : 'refresh'}" aria-hidden="true"></i>
          <span>${r.status === 'pend' ? 'เสร็จ' : 'รีเซ็ต'}</span>
        </button>
        <button class="swipe-action delete" onclick="deleteRecord('${r.id}')">
          <i class="ti ti-trash" aria-hidden="true"></i>
          <span>ลบ</span>
        </button>
      </div>
      <div class="doc-card" id="card-${r.id}" onclick="openDetail('${r.id}')" onmousedown="startSwipe(event,'${r.id}')" ontouchstart="startSwipe(event,'${r.id}')">
      <div class="doc-card-icon ${r.type}">
        <i class="ti ti-${r.type === 'send' ? 'send' : 'inbox'}" aria-hidden="true"></i>
      </div>
      <div class="doc-card-body">
        <div class="doc-card-row">
          <div class="doc-card-title">${esc(r.subject || '-')}</div>
          <span class="badge badge-${r.status === 'pend' ? 'pend' : 'done'}">${r.status === 'pend' ? 'รอ' : 'เสร็จ'}</span>
        </div>
        <div class="doc-card-meta">
          ${r.type === 'send' ? 'ถึง: ' + esc(r.to_org || '-') : 'จาก: ' + esc(r.from_org || '-')} &nbsp;·&nbsp; ${r.type === 'send' ? r.issue_date || '' : r.received_date || ''}
        </div>
        <div class="doc-card-tags">
          <span class="badge badge-${r.type}">${r.type === 'send' ? 'ส่งออก' : 'รับเข้า'}</span>
          ${r.docno ? `<span class="badge badge-type">${esc(r.docno)}</span>` : ''}
          ${r.doc_type ? `<span class="badge badge-type">${esc(r.doc_type)}</span>` : ''}
          ${r.deadline && isPast(r.deadline) && r.status === 'pend' ? `<span class="badge badge-urgent"><i class="ti ti-alert-triangle" aria-hidden="true"></i> ครบกำหนด</span>` : ''}
        </div>
      </div>
      </div>
    </div>
  `).join('');
  setupSwipes();
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

function openForm(type = 'recv') {
  currentFormType = type;
  document.getElementById('form-overlay').classList.add('open');
  setFormType(type);
  resetForm();
  initSigPad();
}

function closeForm() {
  document.getElementById('form-overlay').classList.remove('open');
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
  document.getElementById('form-title').textContent = t === 'recv' ? 'บันทึกหนังสือรับ' : 'บันทึกหนังสือส่ง';
  const btn = document.getElementById('submit-btn');
  btn.className = 'btn-submit ' + t;
  btn.textContent = t === 'recv' ? 'บันทึกหนังสือรับ' : 'บันทึกหนังสือส่ง';
}

function resetForm() {
  document.getElementById('doc-form').reset();
  document.getElementById('file-name').textContent = '';
  if (state.sigPad) state.sigPad.clear();
  // set today
  const today = new Date().toISOString().slice(0, 10);
  ['f-issue-date', 'f-received-date', 'f-send-date'].forEach(id => {
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


// ===== SWIPE =====
let swipeState = {};
function startSwipe(e, id) {
  const src = e.touches ? e.touches[0] : e;
  swipeState[id] = { startX: src.clientX, swiped: false };
  const card = document.getElementById('card-' + id);
  if (card) {
    card.addEventListener('mousemove', (ev) => onSwipeMove(ev, id), { once: false });
    card.addEventListener('mouseup', (ev) => endSwipe(ev, id), { once: true });
    card.addEventListener('touchmove', (ev) => onSwipeMove(ev, id), { passive: true });
    card.addEventListener('touchend', (ev) => endSwipe(ev, id), { once: true });
  }
}
function onSwipeMove(e, id) {
  if (!swipeState[id]) return;
  const src = e.touches ? e.touches[0] : e;
  const dx = swipeState[id].startX - src.clientX;
  if (dx > 30) swipeState[id].swiped = true;
}
function endSwipe(e, id) {
  if (!swipeState[id]) return;
  const card = document.getElementById('card-' + id);
  if (swipeState[id].swiped) {
    if (card) card.classList.add('swiped');
    e.stopPropagation();
  } else {
    if (card) card.classList.remove('swiped');
  }
  delete swipeState[id];
}
function resetSwipe(id) {
  const card = document.getElementById('card-' + id);
  if (card) card.classList.remove('swiped');
}
function setupSwipes() {
  document.querySelectorAll('.doc-card-wrap').forEach(wrap => {
    wrap.addEventListener('click', e => {
      const swiped = wrap.querySelector('.doc-card.swiped');
      if (swiped) { e.stopPropagation(); }
    });
  });
}

// ===== STEP FORM =====
let currentStep = 1;
const TOTAL_STEPS = 3;

function setFormStep(step) {
  currentStep = step;
  for (let i = 1; i <= TOTAL_STEPS; i++) {
    const dot = document.getElementById('sdot-' + i);
    if (dot) {
      dot.className = 'step-dot' + (i === step ? ' active' : i < step ? ' done' : '');
      dot.textContent = i < step ? '✓' : i;
    }
    if (i < TOTAL_STEPS) {
      const line = document.getElementById('sline-' + i);
      if (line) line.className = 'step-line' + (i < step ? ' done' : '');
    }
  }
  document.querySelectorAll('.form-step').forEach(el => {
    el.classList.toggle('active', el.dataset.step === String(step));
  });
}

function nextStep() {
  if (currentStep < TOTAL_STEPS) setFormStep(currentStep + 1);
  else submitForm();
}
function prevStep() {
  if (currentStep > 1) setFormStep(currentStep - 1);
}

// ===== SUBMIT FORM =====
async function submitForm() {
  const get = id => document.getElementById(id)?.value?.trim() || '';

  const common = {
    id: Date.now().toString(),
    type: currentFormType,
    status: get('f-status'),
    doc_type: get('f-doc-type'),
    handler: get('f-handler'),
    note: get('f-note'),
    signature: (state.sigPad && !state.sigPad.isEmpty()) ? state.sigPad.toDataURL() : '',
    created_at: new Date().toISOString(),
  };

  const subject = currentFormType === 'recv' ? get('f-subject') : get('f-subject-send');
  if (!subject) { showToast('กรุณากรอกชื่อเรื่อง'); return; }

  // อัปโหลดไฟล์ไป Drive ก่อน (ถ้ามี)
  let file_url = '';
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
      docno: get('f-send-docno'),
      issue_date: get('f-issue-date'),
      to_org: get('f-to-org'),
      detail: get('f-detail'),
      sender: get('f-sender'),
      receiver_name: get('f-receiver-name'),
      send_date: get('f-send-date'),
      send_channel: get('f-send-channel'),
      file_url,
    };
  }

  // Save locally first
  state.records.unshift(record);
  saveLocal();
  renderList();
  closeForm();
  showToast('บันทึกสำเร็จ');

  // Try sync to Google Sheets
  if (API.url) {
    try {
      if (currentFormType === 'recv') await API.addRecv(record);
      else await API.addSend(record);
    } catch(e) { showToast('บันทึก offline — จะซิงก์เมื่อออนไลน์'); }
  }
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
    ['วันที่ออกหนังสือรับ', r.issue_date],
    ['จาก', r.from_org],
    ['ถึง', r.to_org],
    ['เรื่อง', r.subject],
    ['การปฏิบัติ', r.handler],
    ['ผู้รับในสมาคม', r.receiver],
    ['ได้รับวันที่', r.received_date],
    ['กำหนดตอบ', r.deadline],
    ['ประเภทเอกสาร', r.doc_type],
    ['หมายเหตุ', r.note],
    ['ไฟล์แนบ', r.file_url ? '🔗 เปิดไฟล์' : ''],
  ] : [
    ['เลขที่ส่ง', r.docno],
    ['วันที่ออก', r.issue_date],
    ['ถึง', r.to_org],
    ['เรื่อง', r.subject],
    ['รายละเอียด', r.detail],
    ['การปฏิบัติ', r.handler],
    ['ผู้ส่ง', r.sender],
    ['ผู้รับ', r.receiver_name],
    ['วันที่ส่ง', r.send_date],
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
    el.querySelector('span').textContent = `มี ${warn.length} รายการที่ครบกำหนดหรือเกินกำหนดแล้ว`;
  } else {
    el.style.display = 'none';
  }
}

// ===== SETTINGS =====
function saveApiUrl() {
  const url = document.getElementById('api-url-input').value.trim();
  API.setUrl(url);
  showToast('บันทึก URL สำเร็จ');
}

async function syncFromSheets() {
  if (!API.url) { showToast('กรุณาตั้งค่า API URL ก่อน'); return; }
  showToast('กำลังซิงก์...');
  try {
    const data = await API.getAll();
    if (data.records) { state.records = data.records; saveLocal(); renderList(); showToast('ซิงก์สำเร็จ'); }
  } catch(e) { showToast('ซิงก์ไม่สำเร็จ: ' + e.message); }
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
function openEditForm(id) {
  const r = state.records.find(x => x.id === id);
  if (!r) return;
  closeDetail();
  openForm(r.type);
  setTimeout(() => {
    const set = (elId, val) => { const el = document.getElementById(elId); if (el && val) el.value = val; };
    if (r.type === 'recv') {
      set('f-recv-docno', r.docno); set('f-ref-no', r.ref_no);
      set('f-issue-date', r.issue_date); set('f-received-date', r.received_date);
      set('f-from-org', r.from_org); set('f-to-org-recv', r.to_org);
      set('f-subject', r.subject); set('f-receiver', r.receiver);
      set('f-deadline', r.deadline);
    } else {
      set('f-send-docno', r.docno); set('f-issue-date', r.issue_date);
      set('f-to-org', r.to_org); set('f-subject-send', r.subject);
      set('f-detail', r.detail); set('f-sender', r.sender);
      set('f-receiver-name', r.receiver_name); set('f-send-date', r.send_date);
      set('f-send-channel', r.send_channel);
    }
    set('f-handler', r.handler); set('f-doc-type', r.doc_type);
    set('f-status', r.status); set('f-note', r.note);
    state.records = state.records.filter(x => x.id !== id);
    saveLocal();
  }, 100);
}

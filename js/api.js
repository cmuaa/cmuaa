/* api.js — เชื่อมต่อ Google Apps Script ผ่าน GET (JSONP) และ POST FormData (upload) */
const API = {
  url: localStorage.getItem('cmu_api_url') || '',
  jsonpSeq: 0,
  setUrl(u) {
    const next = u.trim();
    if (next !== this.url) {
      sessionStorage.removeItem('cmu_write_key');
      sessionStorage.removeItem('cmu_write_api');
      if (window.Registry) { Registry.key = ''; Registry.configs = {}; }
    }
    this.url = next;
    localStorage.setItem('cmu_api_url', this.url);
  },

  // GET สำหรับ action ทั่วไป (JSONP) — timeoutMs ปรับได้ต่องาน (ค่า default 20 วิ พอสำหรับ action ทั่วไป
  // แต่ action หนักๆ เช่นออกใบแจ้งหนี้/รวมไฟล์ ควรส่ง timeoutMs ที่นานกว่านี้เข้ามา)
  call(params, timeoutMs = 20000) {
    const reads = ['getAll','getAllFinance','getAllCalendar','getAllSupport','getAllRent','getAllMasterMeter','getAllShirt','getRegistryConfig','getAccess'];
    if (!reads.includes(params.action)) return this.post(params);
    return new Promise((resolve, reject) => {
      if (!this.url) return reject(new Error('ยังไม่ได้ตั้งค่า API URL'));
      // Date.now() อย่างเดียวอาจซ้ำเมื่อมีหลาย request ใน millisecond เดียวกัน
      const cbName = 'cb_' + Date.now() + '_' + (++this.jsonpSeq);
      const script = document.createElement('script');
      const timeout = setTimeout(() => {
        delete window[cbName];
        if (script.parentNode) document.body.removeChild(script);
        reject(new Error('Request timeout'));
      }, timeoutMs);
      window[cbName] = (data) => {
        clearTimeout(timeout);
        delete window[cbName];
        if (script.parentNode) document.body.removeChild(script);
        if (data && data.ok === false) {
          reject(new Error(data.error || 'Google Apps Script ตอบกลับว่าไม่สำเร็จ'));
          return;
        }
        resolve(data);
      };
      const qs = new URLSearchParams({ ...params, callback: cbName }).toString();
      script.src = this.url + '?' + qs;
      script.onerror = () => {
        clearTimeout(timeout);
        delete window[cbName];
        if (script.parentNode) document.body.removeChild(script);
        reject(new Error('Failed to fetch'));
      };
      document.body.appendChild(script);
    });
  },

  async post(params, authentication = false, timeoutMs = 45000) {
    if (!this.url) throw new Error('ยังไม่ได้ตั้งค่า API URL');
    if (!authentication && window.Registry && !Registry.requireWriter()) throw new Error('โหมดดูเอกสารไม่สามารถแก้ไขข้อมูลได้');
    const body = new FormData();
    Object.entries(params).forEach(([k,v]) => body.append(k, String(v)));
    if (!params.write_key && window.Registry?.key) body.append('write_key', Registry.key);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(this.url, {method:'POST',body,signal:controller.signal});
      if (!response.ok) throw new Error('เชื่อมต่อระบบกลางไม่สำเร็จ');
      let data; try { data = JSON.parse(await response.text()); }
      catch(e) { throw new Error('ระบบไม่ตอบกลับเป็นข้อมูล กรุณาตรวจ URL และอัปเดต Apps Script'); }
      if (data?.ok !== true) throw new Error(data?.error || 'บันทึกไม่สำเร็จ');
      return data;
    } catch(e) {
      if (e.name === 'AbortError') throw new Error('ยังยืนยันผลการบันทึกไม่ได้ กรุณาซิงก์ก่อนลองใหม่');
      throw e;
    } finally { clearTimeout(timer); }
  },

  // POST FormData สำหรับอัปโหลดไฟล์
  async upload(type, file) {
    if (!this.url) throw new Error('ยังไม่ได้ตั้งค่า API URL');
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    return this.post({ action:'uploadFile', type, filename:file.name,
      mimetype:file.type || 'application/octet-stream', data:base64 });
  },

  getAll()                        { return this.call({ action: 'getAll' }); },
  addRecv(row)                    { return this.call({ action: 'addRecv', row: JSON.stringify(row) }); },
  addSend(row)                    { return this.call({ action: 'addSend', row: JSON.stringify(row) }); },
  updateRecord(type, row)         { return this.call({ action: 'updateRecord', type, row: JSON.stringify(row) }); },
  updateStatus(type, id, status)  { return this.call({ action: 'updateStatus', type, id, status }); },
  delete(type, id)                { return this.call({ action: 'delete', type, id }); },
};

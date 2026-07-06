/* api.js — เชื่อมต่อ Google Apps Script ผ่าน GET (JSONP) และ POST FormData (upload) */
const API = {
  url: localStorage.getItem('cmu_api_url') || '',
  setUrl(u) {
    this.url = u.trim();
    localStorage.setItem('cmu_api_url', this.url);
  },

  // GET สำหรับ action ทั่วไป (JSONP) — timeoutMs ปรับได้ต่องาน (ค่า default 20 วิ พอสำหรับ action ทั่วไป
  // แต่ action หนักๆ เช่นออกใบแจ้งหนี้/รวมไฟล์ ควรส่ง timeoutMs ที่นานกว่านี้เข้ามา)
  // แนบ id_token ของผู้ที่ล็อกอินอยู่ไปด้วยทุกครั้งอัตโนมัติ (backend เช็คสิทธิ์จาก token นี้ทุก action)
  call(params, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      if (!this.url) return reject(new Error('ยังไม่ได้ตั้งค่า API URL'));
      const cbName = 'cb_' + Date.now();
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
        // ถ้า token หมดอายุ/ไม่ผ่านสิทธิ์ระหว่างใช้งาน ให้เด้งกลับไปหน้า login อัตโนมัติ
        if (data && data.ok === false && typeof data.error === 'string' && data.error.indexOf('AUTH_FAILED') === 0) {
          if (typeof handleSessionExpired === 'function') handleSessionExpired(data.error);
        }
        resolve(data);
      };
      const authToken = (typeof authState !== 'undefined' && authState.idToken) || '';
      const qs = new URLSearchParams({ ...params, id_token: params.id_token || authToken, callback: cbName }).toString();
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

  // POST FormData สำหรับอัปโหลดไฟล์ (แนบ id_token ไปด้วยเช่นกัน)
  async upload(type, file) {
    if (!this.url) throw new Error('ยังไม่ได้ตั้งค่า API URL');
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const formData = new FormData();
    formData.append('action', 'uploadFile');
    formData.append('type', type);
    formData.append('filename', file.name);
    formData.append('mimetype', file.type || 'application/octet-stream');
    formData.append('data', base64);
    formData.append('id_token', (typeof authState !== 'undefined' && authState.idToken) || '');
    const res = await fetch(this.url, {
      method: 'POST',
      body: formData
    });
    const text = await res.text();
    return JSON.parse(text);
  },

  getAll()                        { return this.call({ action: 'getAll' }); },
  addRecv(row)                    { return this.call({ action: 'addRecv', row: JSON.stringify(row) }); },
  addSend(row)                    { return this.call({ action: 'addSend', row: JSON.stringify(row) }); },
  updateRecord(type, row)         { return this.call({ action: 'updateRecord', type, row: JSON.stringify(row) }); },
  updateStatus(type, id, status)  { return this.call({ action: 'updateStatus', type, id, status }); },
  delete(type, id)                { return this.call({ action: 'delete', type, id }); },
};

/* api.js — เชื่อมต่อ Google Apps Script ผ่าน GET (JSONP) และ POST (upload) */
const API = {
  url: localStorage.getItem('cmu_api_url') || '',
  setUrl(u) {
    this.url = u.trim();
    localStorage.setItem('cmu_api_url', this.url);
  },

  // GET สำหรับ action ทั่วไป (JSONP)
  call(params) {
    return new Promise((resolve, reject) => {
      if (!this.url) return reject(new Error('ยังไม่ได้ตั้งค่า API URL'));
      const cbName = 'cb_' + Date.now();
      const script = document.createElement('script');
      const timeout = setTimeout(() => {
        delete window[cbName];
        if (script.parentNode) document.body.removeChild(script);
        reject(new Error('Request timeout'));
      }, 10000);
      window[cbName] = (data) => {
        clearTimeout(timeout);
        delete window[cbName];
        if (script.parentNode) document.body.removeChild(script);
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

  // POST สำหรับอัปโหลดไฟล์
  async upload(type, file) {
    if (!this.url) throw new Error('ยังไม่ได้ตั้งค่า API URL');
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'uploadFile',
        type,
        filename: file.name,
        mimetype: file.type || 'application/octet-stream',
        data: base64
      })
    });
    const text = await res.text();
    return JSON.parse(text);
  },

  getAll()                        { return this.call({ action: 'getAll' }); },
  addRecv(row)                    { return this.call({ action: 'addRecv', row: JSON.stringify(row) }); },
  addSend(row)                    { return this.call({ action: 'addSend', row: JSON.stringify(row) }); },
  updateStatus(type, id, status)  { return this.call({ action: 'updateStatus', type, id, status }); },
  delete(type, id)                { return this.call({ action: 'delete', type, id }); },
};

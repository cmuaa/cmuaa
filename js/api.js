/* api.js — เชื่อมต่อ Google Apps Script Web App */

const API = {
  url: localStorage.getItem('cmu_api_url') || '',

  setUrl(u) {
    this.url = u.trim();
    localStorage.setItem('cmu_api_url', this.url);
  },

  async call(action, data = {}) {
    if (!this.url) throw new Error('ยังไม่ได้ตั้งค่า API URL');
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...data }),
      mode: 'cors'
    });
    if (!res.ok) throw new Error('เซิร์ฟเวอร์ตอบกลับผิดพลาด: ' + res.status);
    return res.json();
  },

  async getAll() { return this.call('getAll'); },
  async addSend(row) { return this.call('addSend', { row }); },
  async addRecv(row) { return this.call('addRecv', { row }); },
  async updateStatus(type, id, status) { return this.call('updateStatus', { type, id, status }); },
  async delete(type, id) { return this.call('delete', { type, id }); },
};

// ============================================================
// api.js — Secure API Client (POST-based)
// ปลอดภัย: ส่งข้อมูลทาง POST body เท่านั้น ไม่ส่ง credential ใน URL
// ============================================================

// 🔧 เปลี่ยน URL นี้เป็น Web App URL ของคุณหลัง deploy Google Apps Script
//    (ดูวิธีใน README.md หัวข้อ "การ Deploy")
var APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz0jaD3WruNWahviXUwlPUgo3OuM5xK1bY4TPMbRUi-ujLZVQhCrWlL1cGKx0_ex40nFg/exec';

/**
 * เรียก API ฝั่ง server ผ่าน POST (ปลอดภัย)
 * @param {string} fn - ชื่อฟังก์ชัน เช่น 'login', 'getItems'
 * @param {...any} args - argument ตามลำดับ (token จะถูกแทรกอัตโนมัติ ยกเว้น login/forgotPassword)
 * @returns {Promise<Object>} ผลลัพธ์จาก server
 */
function callAPI(fnName) {
  var args = Array.prototype.slice.call(arguments, 1);

  // แทรก token อัตโนมัติสำหรับฟังก์ชันที่ต้อง login (ยกเว้น login, forgotPassword)
  var publicFns = ['login', 'forgotPassword'];
  if (publicFns.indexOf(fnName) === -1) {
    if (!AUTH.token) {
      return Promise.reject({ message: 'ไม่ได้เข้าสู่ระบบ', code: 'NO_AUTH' });
    }
    // token ต้องเป็น argument แรกเสมอ
    args = [AUTH.token].concat(args);
  }

  var payload = JSON.stringify({ fn: fnName, args: args });

  return fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    mode: 'cors',
    redirect: 'follow',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
      'X-Requested-With': 'InventorySystem'
    },
    body: payload
  }).then(function (res) {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }).then(function (data) {
    // ตรวจ session หมดอายุ
    if (data && data.code === 'NO_AUTH') {
      AUTH.clear();
      showLoginPage();
      throw data;
    }
    return data;
  }).catch(function (err) {
    console.error('[API FAIL]', fnName, err);
    throw err;
  });
}

/** แปลง file_id เป็น URL สำหรับแสดงรูป (Google Drive) */
function getFileDataUrl(fileId) {
  if (!fileId) return '';
  var s = String(fileId);
  if (s.indexOf('http') === 0 || s.indexOf('data:') === 0) return s;
  return 'https://drive.google.com/uc?export=view&id=' + encodeURIComponent(s);
}

// ============================================================
// api.js — Secure API Client (POST-based, CORS-friendly)
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

  // ตรวจ URL ก่อนเรียก
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.indexOf('PASTE_YOUR') !== -1) {
    return Promise.reject({ message: 'ยังไม่ได้ตั้งค่า APPS_SCRIPT_URL ใน api.js', code: 'NO_URL' });
  }

  // แทรก token อัตโนมัติสำหรับฟังก์ชันที่ต้อง login (ยกเว้น login, forgotPassword)
  var publicFns = ['login', 'forgotPassword'];
  if (publicFns.indexOf(fnName) === -1) {
    if (!AUTH.token) {
      return Promise.reject({ message: 'ไม่ได้เข้าสู่ระบบ', code: 'NO_AUTH' });
    }
    args = [AUTH.token].concat(args);
  }

  var payload = JSON.stringify({ fn: fnName, args: args });

  // ⚠️ สำคัญ: ห้ามใส่ custom headers (เช่น X-Requested-With)
  //    เพราะจะทำให้เบราว์เซอร์ส่ง CORS preflight (OPTIONS) ซึ่ง Apps Script ไม่รองรับ
  //    ใช้ Content-Type: text/plain เพื่อให้เป็น "simple request" ไม่ต้อง preflight
  return fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: payload
  }).then(function (res) {
    if (!res.ok) {
      throw new Error('HTTP ' + res.status + ' ' + res.statusText);
    }
    // อ่านเป็น text ก่อน เพื่อให้ debug ง่ายถ้า server ตอบ non-JSON
    return res.text();
  }).then(function (text) {
    try {
      var data = JSON.parse(text);
      // ตรวจ session หมดอายุ
      if (data && data.code === 'NO_AUTH') {
        AUTH.clear();
        showLoginPage();
        throw data;
      }
      return data;
    } catch (e) {
      // ถ้า parse ไม่ได้ แสดงว่า server ตอบข้อความ error หรือ HTML กลับมา
      console.error('[API] Non-JSON response (first 300 chars):', text.slice(0, 300));
      throw new Error('Server ตอบกลับไม่ใช่ JSON อาจเป็นหน้า error ของ Google');
    }
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

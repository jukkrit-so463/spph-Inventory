// ============================================================
// app.js — Frontend Logic (Secure Edition)
// ระบบวัสดุสิ้นเปลือง
// ============================================================

// ===== CONSTANTS =====
var ROLE_LABELS = { admin: 'ผู้ดูแลระบบ', staff: 'เจ้าหน้าที่คลัง', employee: 'พนักงาน' };
var ITEMS_PER_PAGE = 20;

// ===== AUTH STATE =====
var AUTH = {
  token: sessionStorage.getItem('sup_token') || '',
  user: JSON.parse(sessionStorage.getItem('sup_user') || 'null'),
  set: function (token, user) {
    AUTH.token = token; AUTH.user = user;
    sessionStorage.setItem('sup_token', token);
    sessionStorage.setItem('sup_user', JSON.stringify(user));
  },
  clear: function () {
    AUTH.token = ''; AUTH.user = null;
    sessionStorage.removeItem('sup_token');
    sessionStorage.removeItem('sup_user');
  },
  hasRole: function (roles) {
    if (!AUTH.user) return false;
    if (!Array.isArray(roles)) roles = [roles];
    return roles.indexOf(AUTH.user.role) !== -1;
  }
};

// ===== CACHE =====
var _itemsData = [];
var _itemsCacheTime = 0;
var _wdData = [];
var _usageData = [];
var _receiveData = [];
var _txData = [];
var _usersData = [];
var _deptsData = [];
var _configData = null;
var _currentPage = '';
var _charts = {};

// ===== LOADING =====
function showLoading(text) {
  var el = document.getElementById('loadingText');
  if (el) el.textContent = text || 'กำลังโหลด...';
  document.getElementById('loadingOverlay').classList.remove('hidden');
}
function hideLoading() { document.getElementById('loadingOverlay').classList.add('hidden'); }

// ===== ALERTS =====
function showSuccess(msg) { Swal.fire({ icon: 'success', title: 'สำเร็จ', text: msg, timer: 2000, showConfirmButton: false }); }
function showError(msg) { Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: msg }); }
function showConfirm(title, text, cb, confirmText) {
  Swal.fire({ title: title, text: text, icon: 'warning', showCancelButton: true,
    confirmButtonText: confirmText || 'ยืนยัน', cancelButtonText: 'ยกเลิก', reverseButtons: true })
    .then(function (r) { if (r.isConfirmed) cb(); });
}

// ===== MODAL =====
function openModal(title, bodyHtml, footerHtml) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalFooter').innerHTML = footerHtml || '';
  document.getElementById('modalOverlay').classList.remove('hidden');
}
function closeModal() {
  document.getElementById('modalOverlay').classList.add('hidden');
  document.getElementById('modalBody').innerHTML = '';
  document.getElementById('modalFooter').innerHTML = '';
}

// ===== UTILITIES =====
function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function formatDate(iso) {
  if (!iso) return '-';
  var d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}
function formatDateTime(iso) {
  if (!iso) return '-';
  var d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function togglePass(inputId, btn) {
  var inp = document.getElementById(inputId);
  var isPass = inp.type === 'password';
  inp.type = isPass ? 'text' : 'password';
  btn.querySelector('i').className = isPass ? 'fi fi-rr-eye-crossed text-sm' : 'fi fi-rr-eye text-sm';
}
function getStockClass(stock, min) {
  stock = Number(stock); min = Number(min);
  if (stock <= 0) return 'stock-critical';
  if (stock <= min) return 'stock-low';
  return 'stock-ok';
}
function getStockLabel(stock, min) {
  stock = Number(stock); min = Number(min);
  if (stock <= 0) return 'หมด';
  if (stock <= min) return 'ใกล้หมด';
  return 'ปกติ';
}
function imgUrl(fileId) {
  if (!fileId) return '';
  return getFileDataUrl(fileId);
}
function fieldHTML(label, id, type, value, extraClass) {
  return '<div class="' + (extraClass || '') + '"><label class="form-label">' + label + '</label>' +
    '<input type="' + (type || 'text') + '" id="' + id + '" value="' + escHtml(value) + '" class="form-input"></div>';
}
function paginate(arr, page, perPage) {
  perPage = perPage || ITEMS_PER_PAGE;
  var start = (page - 1) * perPage;
  return arr.slice(start, start + perPage);
}
function _formatNumber(n) {
  if (n === null || n === undefined) return '0';
  n = Number(n);
  if (isNaN(n)) return '0';
  return n.toLocaleString('th-TH');
}

// ===== INIT =====
window.addEventListener('DOMContentLoaded', function () {
  document.getElementById('loginYear').textContent = new Date().getFullYear();
  // ตรวจ Apps Script URL
  if (APPS_SCRIPT_URL.indexOf('PASTE_YOUR') !== -1) {
    Swal.fire({
      icon: 'warning', title: 'ยังไม่ได้ตั้งค่า API',
      html: 'กรุณาเปิดไฟล์ <b>api.js</b> แล้วแก้ <code>APPS_SCRIPT_URL</code> เป็น Web App URL ของคุณ<br>(ดูวิธีใน README.md)',
      confirmButtonText: 'รับทราบ'
    });
  }
  if (AUTH.token) { initApp(); } else { showLoginPage(); }
});

function initApp() {
  showLoading('กำลังตรวจสอบสิทธิ์...');
  callAPI('validateSession').then(function (session) {
    hideLoading();
    if (!session) { AUTH.clear(); showLoginPage(); return; }
    AUTH.user = { id: session.user_id, username: session.username, role: session.role, name: session.name, department_id: session.department_id || '', department_name: session.department_name || '' };
    sessionStorage.setItem('sup_user', JSON.stringify(AUTH.user));
    showMainShell();
    loadPage('dashboard');
  }).catch(function () { hideLoading(); showLoginPage(); });
}

function showLoginPage() {
  document.getElementById('loginPage').classList.remove('hidden');
  document.getElementById('mainShell').classList.add('hidden');
}
function showMainShell() {
  document.getElementById('loginPage').classList.add('hidden');
  document.getElementById('mainShell').classList.remove('hidden');
  document.getElementById('sidebarName').textContent = AUTH.user.name || AUTH.user.username;
  document.getElementById('sidebarRole').textContent = ROLE_LABELS[AUTH.user.role] || AUTH.user.role;
  // ซ่อนเมนูตาม role
  var isAdmin = AUTH.user.role === 'admin';
  var isEmp = AUTH.user.role === 'employee';
  var notEmp = !isEmp;
  document.getElementById('menuItems').style.display = isAdmin ? '' : 'none';
  document.getElementById('menuReceive').style.display = notEmp ? '' : 'none';
  document.getElementById('menuStocktake').style.display = notEmp ? '' : 'none';
  document.getElementById('menuInventorySection').style.display = notEmp ? '' : 'none';
  document.getElementById('menuUsage').style.display = isEmp ? '' : 'none';
  document.getElementById('menuWithdraw').style.display = isEmp ? '' : 'none';
  document.getElementById('menuApprove').style.display = isAdmin ? '' : 'none';
  document.getElementById('menuAdminSection').style.display = isAdmin ? '' : 'none';
  document.getElementById('menuReportSection').style.display = notEmp ? '' : 'none';
  updateClock();
  setInterval(updateClock, 60000);
  loadConfig();
}

function loadConfig() {
  callAPI('getConfig').then(function (res) {
    if (res.success) {
      _configData = res.data;
      var appName = res.data.app_name || 'ระบบวัสดุสิ้นเปลือง';
      document.getElementById('sidebarAppName').textContent = appName;
      document.getElementById('loginAppName').textContent = appName;
      if (res.data.app_logo) {
        var url = imgUrl(res.data.app_logo);
        var sImg = document.getElementById('sidebarLogoImg');
        var lImg = document.getElementById('loginLogoImg');
        if (sImg) { sImg.src = url; sImg.classList.remove('hidden'); }
        if (lImg) { lImg.src = url; lImg.classList.remove('hidden'); }
        document.getElementById('sidebarLogoIcon').classList.add('hidden');
        document.getElementById('loginLogoIcon').classList.add('hidden');
      }
    }
  }).catch(function () {});
}

function updateClock() {
  var el = document.getElementById('topDateTime');
  if (el) el.textContent = new Date().toLocaleString('th-TH', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function refreshPage() {
  var icon = document.getElementById('refreshIcon');
  if (icon) { icon.style.transition = 'transform 0.6s'; icon.style.transform = 'rotate(360deg)'; setTimeout(function () { icon.style.transform = ''; }, 650); }
  _itemsData = []; _itemsCacheTime = 0; _wdData = []; _usageData = []; _receiveData = []; _txData = []; _usersData = []; _deptsData = [];
  if (_currentPage) loadPage(_currentPage);
}

function toggleProfileDropdown() { document.getElementById('profileDropdown').classList.toggle('hidden'); }
document.addEventListener('click', function (e) {
  var wrap = document.getElementById('profileDropdownWrap');
  if (wrap && !wrap.contains(e.target)) { var dd = document.getElementById('profileDropdown'); if (dd) dd.classList.add('hidden'); }
});

// ===== LOGIN ROLE TABS =====
function setLoginRole(role) {
  document.getElementById('loginRole').value = role;
  ['Admin', 'Staff', 'Employee'].forEach(function (s) {
    var tab = document.getElementById('tab' + s);
    if (!tab) return;
    if ('tab' + s.toLowerCase() === 'tab' + role) {
      tab.className = 'role-tab flex-1 py-3.5 text-sm font-semibold text-center transition-all border-b-2 border-navy-700 text-navy-700';
    } else {
      tab.className = 'role-tab flex-1 py-3.5 text-sm font-semibold text-center transition-all border-b-2 border-transparent text-gray-400 hover:text-gray-600';
    }
  });
}

// ===== LOGIN / LOGOUT =====
function doLogin() {
  var username = (document.getElementById('loginUsername').value || '').trim();
  var password = document.getElementById('loginPassword').value;
  var role = document.getElementById('loginRole').value;
  if (!username || !password) { showError('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน'); return; }
  var btn = document.getElementById('btnLogin');
  btn.disabled = true; btn.innerHTML = '<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> กำลังเข้าสู่ระบบ...';
  callAPI('login', username, password, role).then(function (res) {
    btn.disabled = false; btn.innerHTML = '<i class="fi fi-rr-sign-in"></i> เข้าสู่ระบบ';
    if (res.success) { AUTH.set(res.token, res.user); initApp(); }
    else { showError(res.message); }
  }).catch(function (err) {
    btn.disabled = false; btn.innerHTML = '<i class="fi fi-rr-sign-in"></i> เข้าสู่ระบบ';
    // แสดงข้อความ error ที่ละเอียด เพื่อช่วย debug
    var msg = err && err.message ? err.message : String(err || 'ไม่ทราบสาเหตุ');
    var hint = '';
    if (msg.indexOf('Failed to fetch') !== -1 || msg.indexOf('NetworkError') !== -1 || msg === 'TypeError: Failed to fetch') {
      msg = 'เชื่อมต่อกับ server ไม่ได้';
      hint = '\n\nตรวจสอบ:\n1) APPS_SCRIPT_URL ใน api.js ถูกไหม\n2) Deploy เป็น Web App แล้ว (Execute as: Me, Access: Anyone)\n3) คัดลอก URL จาก Deploy ใหม่ล่าสุด (อย่าใช้ URL เก่า)';
    } else if (msg.indexOf('HTTP 405') !== -1) {
      msg = 'Server ไม่รับ POST';
      hint = '\n\nตรวจ: deploy เป็น Web App แล้วหรือยัง? (ถ้า deploy เป็น API executable จะไม่รับ POST)';
    } else if (msg.indexOf('HTTP 401') !== -1 || msg.indexOf('HTTP 403') !== -1) {
      msg = 'ไม่มีสิทธิ์เข้าถึง';
      hint = '\n\nตรวจ: Who has access = "Anyone" ในการ deploy';
    } else if (msg.indexOf('HTTP 404') !== -1) {
      msg = 'ไม่พบ URL';
      hint = '\n\nตรวจ: APPS_SCRIPT_URL ถูกต้องไหม (ต้องลงท้ายด้วย /exec)';
    } else if (msg.indexOf('Non-JSON') !== -1 || msg.indexOf('ไม่ใช่ JSON') !== -1) {
      hint = '\n\nตรวจ: รันฟังก์ชัน setup() ใน Apps Script แล้วหรือยัง?';
    } else if (msg.indexOf('NO_URL') !== -1 || msg.indexOf('ยังไม่ได้ตั้งค่า') !== -1) {
      hint = '\n\nแก้ api.js บรรทัดที่ 8: เปลี่ยน PASTE_YOUR_... เป็น Web App URL';
    }
    showError(msg + hint);
  });
}

function doLogout() {
  showConfirm('ออกจากระบบ', 'ต้องการออกจากระบบใช่หรือไม่?', function () {
    showLoading('กำลังออกจากระบบ...');
    callAPI('logout').then(function () { hideLoading(); AUTH.clear(); location.reload(); })
      .catch(function () { hideLoading(); AUTH.clear(); location.reload(); });
  }, 'ออกจากระบบ');
}

function showForgotModal() { document.getElementById('forgotModal').classList.remove('hidden'); }
function closeForgotModal() { document.getElementById('forgotModal').classList.add('hidden'); }
function submitForgotPassword() {
  var email = (document.getElementById('forgotEmail').value || '').trim();
  if (!email) { showError('กรุณากรอกอีเมล'); return; }
  showLoading('กำลังส่งรหัสผ่านชั่วคราว...');
  callAPI('forgotPassword', email).then(function (res) {
    hideLoading(); closeForgotModal();
    showSuccess(res.message);
  }).catch(function () { hideLoading(); showError('เกิดข้อผิดพลาด'); });
}

// ===== NAVIGATION =====
function loadPage(page) {
  _currentPage = page;
  document.querySelectorAll('.menu-btn').forEach(function (btn) {
    btn.classList.toggle('active', btn.getAttribute('data-page') === page);
  });
  var titles = {
    dashboard: 'ภาพรวมระบบ', stock: 'สต็อกคงเหลือ', items: 'รายการวัสดุ',
    receive: 'รับวัสดุเข้าคลัง', stocktake: 'นับสต็อก', usage: 'บันทึกการใช้จริง', withdraw: 'เบิกวัสดุ', approve: 'อนุมัติการเบิก',
    transactions: 'ประวัติเคลื่อนไหว', reports: 'รายงาน', departments: 'จัดการหน่วยงาน', users: 'จัดการผู้ใช้งาน', settings: 'ตั้งค่าระบบ', profile: 'โปรไฟล์'
  };
  document.getElementById('pageTitle').textContent = titles[page] || page;
  document.getElementById('pageBreadcrumb').textContent = 'ระบบวัสดุสิ้นเปลือง / ' + (titles[page] || page);
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.add('hidden');
  var content = document.getElementById('mainContent');
  content.innerHTML = '<div class="flex items-center justify-center py-16"><div class="w-8 h-8 border-4 border-navy-600 border-t-transparent rounded-full animate-spin"></div></div>';

  if (page === 'dashboard') renderDashboard();
  else if (page === 'stock') renderStock();
  else if (page === 'items') renderItems();
  else if (page === 'receive') renderReceive();
  else if (page === 'stocktake') renderStocktake();
  else if (page === 'usage') renderUsage();
  else if (page === 'withdraw') renderWithdraw();
  else if (page === 'approve') renderApprove();
  else if (page === 'transactions') renderTransactions();
  else if (page === 'reports') renderReports();
  else if (page === 'departments') renderDepartments();
  else if (page === 'users') renderUsers();
  else if (page === 'settings') renderSettings();
  else if (page === 'profile') renderProfile();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('hidden');
}

// ===== GLOBAL SEARCH =====
var _globalSearchTimer;
function debounceGlobalSearch() { clearTimeout(_globalSearchTimer); _globalSearchTimer = setTimeout(performGlobalSearch, 300); }
function performGlobalSearch() {
  var q = (document.getElementById('globalSearch') || {}).value || '';
  var resultsDiv = document.getElementById('globalSearchResults');
  if (!q || q.length < 2) { resultsDiv.classList.add('hidden'); return; }
  var term = q.toLowerCase();
  var matches = (_itemsData || []).filter(function (i) {
    return (i.name || '').toLowerCase().indexOf(term) !== -1 ||
           (i.item_code || '').toLowerCase().indexOf(term) !== -1 ||
           (i.category || '').toLowerCase().indexOf(term) !== -1;
  }).slice(0, 8);
  if (!matches.length) { resultsDiv.classList.add('hidden'); return; }
  var html = '';
  matches.forEach(function (item) {
    html += '<div class="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0" onclick="showItemDetail(\'' + item.id + '\')">';
    html += '<div class="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center"><i class="fi fi-rr-box-open-full text-gray-400 text-xs"></i></div>';
    html += '<div class="flex-1 min-w-0"><p class="text-sm font-medium text-gray-800 truncate">' + escHtml(item.name) + '</p>';
    html += '<p class="text-xs text-gray-500">' + escHtml(item.item_code) + ' • คงเหลือ ' + item.current_stock + ' ' + escHtml(item.unit) + '</p></div></div>';
  });
  resultsDiv.innerHTML = html;
  resultsDiv.classList.remove('hidden');
}
window.addEventListener('click', function (e) {
  var gs = document.getElementById('globalSearch'); var gr = document.getElementById('globalSearchResults');
  if (gs && gr && !gs.contains(e.target) && !gr.contains(e.target)) gr.classList.add('hidden');
});

// ===== HELPER: load items with cache =====
function _ensureItems(force) {
  if (!force && _itemsData.length && (Date.now() - _itemsCacheTime) < 60000) {
    return Promise.resolve({ success: true, data: _itemsData });
  }
  return callAPI('getItems').then(function (res) {
    if (res.success) { _itemsData = res.data || []; _itemsCacheTime = Date.now(); }
    return res;
  });
}

// ===== DASHBOARD =====
// ===== PENDING BADGE HELPER =====
function _updatePendingBadge() {
  if (!AUTH.hasRole('admin')) return;
  callAPI('getDashboardStats').then(function (d) {
    if (!d || !d.success || !d.kpi) return;
    var badge = document.getElementById('pendingBadge');
    if (!badge) return;
    if (d.kpi.pending > 0) { badge.textContent = d.kpi.pending; badge.classList.remove('hidden'); }
    else { badge.classList.add('hidden'); }
  }).catch(function () {});
}

function renderDashboard() {
  showLoading('โหลดข้อมูล Dashboard...');
  Promise.all([callAPI('getDashboardStats'), _ensureItems()]).then(function (results) {
    hideLoading();
    var d = results[0];
    if (!d.success) { showError(d.message); return; }
    var kpi = d.kpi;

    var badge = document.getElementById('pendingBadge');
    if (kpi.pending > 0) { badge.textContent = kpi.pending; badge.classList.remove('hidden'); } else badge.classList.add('hidden');
    var lowBadge = document.getElementById('lowStockBadge');
    if (kpi.low_stock > 0) { lowBadge.textContent = kpi.low_stock; lowBadge.classList.remove('hidden'); } else lowBadge.classList.add('hidden');

    var html = '<div class="fade-in space-y-5">';

    // KPI cards
    html += '<div class="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3">';
    html += _kpiCard('รายการวัสดุ', kpi.total_items, 'fi-rr-box-open-full', 'bg-navy-100 text-navy-700');
    html += _kpiCard('สต็อกรวม', kpi.total_stock, 'fi-rr-layers', 'bg-blue-100 text-blue-700');
    html += _kpiCard('มูลค่าสต็อก', _formatNumber(kpi.total_stock_value), 'fi-rr-money', 'bg-emerald-100 text-emerald-700');
    html += _kpiCard('ใช้วันนี้', kpi.total_usage_today, 'fi-rr-arrow-right-from-bracket', 'bg-purple-100 text-purple-700');
    html += _kpiCard('รออนุมัติ', kpi.pending, 'fi-rr-clock', 'bg-amber-100 text-amber-700');
    html += _kpiCard('อนุมัติแล้ว', kpi.approved, 'fi-rr-check-circle', 'bg-green-100 text-green-700');
    html += _kpiCard('สต็อกต่ำ', kpi.low_stock, 'fi-rr-triangle-warning', 'bg-red-100 text-red-700');
    html += _kpiCard('ปฏิเสธ', kpi.rejected, 'fi-rr-times-circle', 'bg-gray-100 text-gray-700');
    html += '</div>';

    // Charts row
    html += '<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">';
    html += '<div class="card p-5"><h3 class="font-semibold text-gray-700 mb-3 flex items-center gap-2"><i class="fi fi-rr-chart-column text-navy-600"></i> สถิติรับ-ใช้-เบิก 6 เดือนล่าสุด</h3><div style="height:240px"><canvas id="chartMonthly"></canvas></div></div>';
    html += '<div class="card p-5"><h3 class="font-semibold text-gray-700 mb-3 flex items-center gap-2"><i class="fi fi-rr-chart-pie text-navy-600"></i> สัดส่วนวัสดุตามหมวดหมู่</h3><div style="height:240px"><canvas id="chartCategory"></canvas></div></div>';
    html += '</div>';

    // Recent + Top
    html += '<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">';
    html += '<div class="card p-5"><h3 class="font-semibold text-gray-700 mb-3 flex items-center gap-2"><i class="fi fi-rr-time-past text-navy-600"></i> รายการเคลื่อนไหวล่าสุด</h3>';
    if (d.recent && d.recent.length) {
      html += '<div class="space-y-2 max-h-64 overflow-y-auto">';
      d.recent.forEach(function (t) {
        var icon = t.type === 'receive' ? 'fi-rr-inbox-in text-green-600' : t.type === 'withdraw' ? 'fi-rr-inbox-out text-red-600' : t.type === 'withdraw_request' ? 'fi-rr-clock text-amber-600' : 'fi-rr-edit text-blue-600';
        html += '<div class="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0"><i class="fi ' + icon + '"></i><div class="flex-1 min-w-0"><p class="text-sm text-gray-700 truncate">' + escHtml(t.item_name) + (t.quantity ? ' ×' + t.quantity : '') + '</p><p class="text-xs text-gray-400">' + escHtml(t.username) + ' • ' + formatDateTime(t.created_at) + '</p></div></div>';
      });
      html += '</div>';
    } else html += '<p class="text-sm text-gray-400 text-center py-6">ยังไม่มีรายการ</p>';
    html += '</div>';

    html += '<div class="card p-5"><h3 class="font-semibold text-gray-700 mb-3 flex items-center gap-2"><i class="fi fi-rr-trophy text-navy-600"></i> Top 5 วัสดุที่เบิกมากสุด</h3>';
    if (d.top_items && d.top_items.length) {
      var maxQ = d.top_items[0].quantity || 1;
      d.top_items.forEach(function (t, i) {
        var pct = Math.round((t.quantity / maxQ) * 100);
        html += '<div class="mb-3"><div class="flex justify-between text-sm mb-1"><span class="text-gray-700">#' + (i + 1) + ' ' + escHtml(t.name) + '</span><span class="font-bold text-navy-700">' + t.quantity + '</span></div>';
        html += '<div class="w-full bg-gray-100 rounded-full h-2"><div class="bg-navy-600 h-2 rounded-full" style="width:' + pct + '%"></div></div></div>';
      });
    } else html += '<p class="text-sm text-gray-400 text-center py-6">ยังไม่มีข้อมูล</p>';
    html += '</div></div>';

    // Pending approvals quick view (admin only)
    if (AUTH.hasRole('admin') && kpi.pending > 0) {
      html += '<div class="card p-5"><div class="flex items-center justify-between mb-3"><h3 class="font-semibold text-gray-700 flex items-center gap-2"><i class="fi fi-rr-check-circle text-navy-600"></i> คำขอเบิกรออนุมัติ</h3><button onclick="loadPage(\'approve\')" class="btn-primary btn-sm">จัดการ</button></div><p class="text-sm text-gray-500">มี ' + kpi.pending + ' คำขอรออนุมัติ</p></div>';
    }

    html += '</div>';
    document.getElementById('mainContent').innerHTML = html;

    // Draw charts
    _destroyCharts();
    if (d.monthly) {
      var ctx1 = document.getElementById('chartMonthly').getContext('2d');
      _charts.monthly = new Chart(ctx1, {
        type: 'bar',
        data: { labels: d.monthly.map(function (m) { return m.month; }), datasets: [
          { label: 'รับเข้า', data: d.monthly.map(function (m) { return m.receive; }), backgroundColor: '#10b981' },
          { label: 'ใช้จริง', data: d.monthly.map(function (m) { return m.usage || 0; }), backgroundColor: '#8b5cf6' },
          { label: 'เบิกออก', data: d.monthly.map(function (m) { return m.withdraw; }), backgroundColor: '#ef4444' }
        ]},
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
      });
    }
    if (d.category_stock) {
      var cats = Object.keys(d.category_stock);
      var vals = cats.map(function (c) { return d.category_stock[c]; });
      if (cats.length) {
        var ctx2 = document.getElementById('chartCategory').getContext('2d');
        _charts.category = new Chart(ctx2, {
          type: 'doughnut',
          data: { labels: cats, datasets: [{ data: vals, backgroundColor: ['#4338ca','#6366f1','#818cf8','#a5b4fc','#c7d2fe','#10b981','#f59e0b','#ef4444'] }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
        });
      }
    }
  }).catch(function (e) { hideLoading(); showError(e.message || 'โหลดข้อมูลไม่สำเร็จ'); });
}

function _kpiCard(label, value, icon, color) {
  return '<div class="card p-4 kpi-card"><div class="flex items-center justify-between"><div><p class="text-xs text-gray-500">' + label + '</p><p class="text-2xl font-bold text-gray-800 mt-1">' + value + '</p></div><div class="w-10 h-10 rounded-xl flex items-center justify-center ' + color + '"><i class="fi ' + icon + '"></i></div></div></div>';
}
function _destroyCharts() { for (var k in _charts) { if (_charts[k]) { _charts[k].destroy(); delete _charts[k]; } } }

// ===== STOCK =====
function renderStock() {
  showLoading('โหลดสต็อก...');
  _ensureItems(true).then(function (res) {
    hideLoading();
    if (!res.success) { showError(res.message); return; }
    var items = _itemsData;
    var html = '<div class="fade-in space-y-4">';
    html += '<div class="card overflow-hidden"><div class="overflow-x-auto"><table class="data-table"><thead><tr><th class="px-4 py-3 text-left">รหัส</th><th class="px-4 py-3 text-left">ชื่อวัสดุ</th><th class="px-4 py-3 text-left">หน่วย</th><th class="px-4 py-3 text-right">ราคา/หน่วย</th><th class="px-4 py-3 text-center">คงเหลือ</th><th class="px-4 py-3 text-right">มูลค่ารวม</th><th class="px-4 py-3 text-center">ขั้นต่ำ</th><th class="px-4 py-3 text-center">สถานะ</th></tr></thead><tbody>';
    if (!items.length) html += '<tr><td colspan="8" class="text-center py-10 text-gray-400">ไม่มีวัสดุ</td></tr>';
    items.forEach(function (i) {
      var sClass = getStockClass(i.current_stock, i.min_stock); var sLabel = getStockLabel(i.current_stock, i.min_stock);
      var price = Number(i.price || 0);
      var value = price * i.current_stock;
      html += '<tr><td class="px-4 py-3 font-mono text-xs text-navy-700">' + escHtml(i.item_code) + '</td><td class="px-4 py-3 font-medium text-gray-800">' + escHtml(i.name) + (i.size ? ' <span class="text-xs text-gray-400">(' + escHtml(i.size) + ')</span>' : '') + '</td><td class="px-4 py-3 text-gray-600 text-xs">' + escHtml(i.unit) + '</td><td class="px-4 py-3 text-right text-gray-600 text-xs">' + (price > 0 ? _formatNumber(price) : '-') + '</td><td class="px-4 py-3 text-center font-bold text-gray-800">' + i.current_stock + '</td><td class="px-4 py-3 text-right text-sm font-semibold text-gray-700">' + (value > 0 ? _formatNumber(value) : '-') + '</td><td class="px-4 py-3 text-center text-gray-500 text-xs">' + i.min_stock + '</td><td class="px-4 py-3 text-center"><span class="px-2 py-0.5 rounded-full text-xs font-medium ' + sClass + '">' + sLabel + '</span></td></tr>';
    });
    html += '</tbody></table></div></div></div>';
    document.getElementById('mainContent').innerHTML = html;
  }).catch(function (e) { hideLoading(); showError(e.message); });
}

// ===== ITEMS =====
var _itemsFilter = { search: '', category: 'all' };
var _itemsPage = 1;
function renderItems() {
  showLoading('โหลดรายการวัสดุ...');
  _ensureItems(true).then(function (res) {
    hideLoading();
    if (!res.success) { showError(res.message); return; }
    buildItemsPage();
  });
}
function buildItemsPage() {
  var filtered = _itemsData.filter(function (i) {
    if (_itemsFilter.category !== 'all' && (i.category || '') !== _itemsFilter.category) return false;
    if (_itemsFilter.search) {
      var q = _itemsFilter.search.toLowerCase();
      if ((i.name || '').toLowerCase().indexOf(q) === -1 && (i.item_code || '').toLowerCase().indexOf(q) === -1) return false;
    }
    return true;
  });
  var cats = {}; _itemsData.forEach(function (i) { if (i.category) cats[i.category] = 1; });
  var catList = Object.keys(cats);
  var paged = paginate(filtered, _itemsPage);

  var html = '<div class="fade-in space-y-4">';
  html += '<div class="flex items-center justify-between flex-wrap gap-3">';
  html += '<h3 class="font-semibold text-gray-700 flex items-center gap-2"><i class="fi fi-rr-box-open-full text-navy-600"></i> รายการวัสดุ (' + filtered.length + ')</h3>';
  if (AUTH.hasRole('admin')) html += '<button onclick="openAddItemModal()" class="btn-primary"><i class="fi fi-rr-plus"></i> เพิ่มวัสดุ</button></div>';
  else html += '</div>';

  // Filters
  html += '<div class="card p-4 flex flex-wrap gap-3 items-end">';
  html += '<div class="flex-1 min-w-[200px]"><label class="form-label">ค้นหา</label><input type="text" id="itemSearch" value="' + escHtml(_itemsFilter.search) + '" onkeyup="onItemsFilter()" class="form-input" placeholder="ชื่อหรือรหัสวัสดุ"></div>';
  html += '<div><label class="form-label">หมวดหมู่</label><select id="itemCatFilter" onchange="onItemsFilter()" class="form-input"><option value="all">ทั้งหมด</option>';
  catList.forEach(function (c) { html += '<option value="' + escHtml(c) + '"' + (_itemsFilter.category === c ? ' selected' : '') + '>' + escHtml(c) + '</option>'; });
  html += '</select></div>';
  html += '</div>';

  // Table
  html += '<div class="card overflow-hidden"><div class="overflow-x-auto"><table class="data-table"><thead><tr><th class="px-4 py-3 text-left">รหัส</th><th class="px-4 py-3 text-left">วัสดุ</th><th class="px-4 py-3 text-center">คงเหลือ</th><th class="px-4 py-3 text-center">สถานะ</th><th class="px-4 py-3 text-center">จัดการ</th></tr></thead><tbody>';
  if (!paged.length) html += '<tr><td colspan="5" class="text-center py-10 text-gray-400">ไม่พบวัสดุ</td></tr>';
  paged.forEach(function (i) {
    var sClass = getStockClass(i.current_stock, i.min_stock); var sLabel = getStockLabel(i.current_stock, i.min_stock);
    var img = imgUrl(i.image_file_id);
    var imgHtml = img ? '<img src="' + img + '" class="w-10 h-10 object-cover rounded-lg border">' : '<div class="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center"><i class="fi fi-rr-box text-gray-400"></i></div>';
    html += '<tr><td class="px-4 py-3 font-mono text-xs text-navy-700">' + escHtml(i.item_code) + '</td>';
    html += '<td class="px-4 py-3"><div class="flex items-center gap-3">' + imgHtml + '<div><p class="font-medium text-gray-800">' + escHtml(i.name) + '</p><p class="text-xs text-gray-400">' + escHtml(i.category || '-') + ' • ' + escHtml(i.unit) + '</p></div></div></td>';
    html += '<td class="px-4 py-3 text-center font-bold text-gray-800">' + i.current_stock + ' <span class="text-xs text-gray-400">' + escHtml(i.unit) + '</span></td>';
    html += '<td class="px-4 py-3 text-center"><span class="px-2 py-0.5 rounded-full text-xs font-medium ' + sClass + '">' + sLabel + '</span></td>';
    html += '<td class="px-4 py-3 text-center"><div class="flex gap-1 justify-center">';
    html += '<button onclick="showItemDetail(\'' + i.id + '\')" title="ดู" class="w-7 h-7 bg-gray-100 text-gray-700 rounded-lg flex items-center justify-center hover:bg-gray-200"><i class="fi fi-rr-eye text-xs"></i></button>';
    if (AUTH.hasRole('admin')) {
      html += '<button onclick="openEditItemModal(\'' + i.id + '\')" title="แก้ไข" class="w-7 h-7 bg-blue-100 text-blue-700 rounded-lg flex items-center justify-center hover:bg-blue-200"><i class="fi fi-rr-edit text-xs"></i></button>';
      html += '<button onclick="doDeleteItem(\'' + i.id + '\')" title="ลบ" class="w-7 h-7 bg-red-100 text-red-700 rounded-lg flex items-center justify-center hover:bg-red-200"><i class="fi fi-rr-trash text-xs"></i></button>';
    }
    html += '</div></td></tr>';
  });
  html += '</tbody></table></div></div>';
  html += '<div id="itemsPagination"></div></div>';
  document.getElementById('mainContent').innerHTML = html;
  _renderPagination('itemsPagination', filtered.length, _itemsPage, function (p) { _itemsPage = p; buildItemsPage(); });
}
function onItemsFilter() {
  _itemsFilter.search = (document.getElementById('itemSearch') || {}).value || '';
  _itemsFilter.category = (document.getElementById('itemCatFilter') || {}).value || 'all';
  _itemsPage = 1; buildItemsPage();
}
function showItemDetail(id) {
  var item = _itemsData.filter(function (i) { return i.id === id; })[0];
  if (!item) return;
  var sClass = getStockClass(item.current_stock, item.min_stock); var sLabel = getStockLabel(item.current_stock, item.min_stock);
  var html = '<div class="space-y-4">';
  if (item.image_file_id) { var img = imgUrl(item.image_file_id); html += '<div class="text-center"><img src="' + img + '" class="max-h-48 rounded-xl border mx-auto"></div>'; }
  html += '<div class="grid grid-cols-2 gap-3 text-sm">';
  html += _detailRow('รหัส', item.item_code); html += _detailRow('หมวดหมู่', item.category || '-');
  html += _detailRow('หน่วย', item.unit); html += _detailRow('ขนาด', item.size || '-');
  html += _detailRow('ราคา/หน่วย', Number(item.price || 0) > 0 ? _formatNumber(item.price) + ' บาท' : '-');
  html += _detailRow('คงเหลือ', item.current_stock + ' ' + (item.unit || '')); html += _detailRow('ขั้นต่ำ', item.min_stock);
  if (Number(item.price || 0) > 0) html += _detailRow('มูลค่ารวม', _formatNumber(Number(item.price) * item.current_stock) + ' บาท');
  html += _detailRow('สถานะ', '<span class="px-2 py-0.5 rounded-full text-xs ' + sClass + '">' + sLabel + '</span>');
  html += '</div></div>';
  var footer = '<button onclick="closeModal()" class="btn-secondary">ปิด</button>';
  if (AUTH.hasRole('admin')) footer += '<button onclick="closeModal();openEditItemModal(\'' + item.id + '\')" class="btn-primary"><i class="fi fi-rr-edit mr-1"></i>แก้ไข</button>';
  openModal('รายละเอียดวัสดุ', html, footer);
}
function _detailRow(label, value) { return '<div><p class="text-xs text-gray-500 mb-0.5">' + escHtml(label) + '</p><p class="font-medium text-gray-800">' + value + '</p></div>'; }
function openAddItemModal() { _openItemForm(null); }
function openEditItemModal(id) { var i = _itemsData.filter(function (x) { return x.id === id; })[0]; if (i) _openItemForm(i); }
function _openItemForm(item) {
  item = item || {};
  var body = '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">'
    + fieldHTML('รหัสวัสดุ', 'iCode', 'text', item.item_code || '')
    + fieldHTML('ชื่อวัสดุ *', 'iName', 'text', item.name || '', 'sm:col-span-2')
    + fieldHTML('ขนาด', 'iSize', 'text', item.size || '')
    + fieldHTML('หน่วย *', 'iUnit', 'text', item.unit || '')
    + fieldHTML('หมวดหมู่', 'iCategory', 'text', item.category || 'ทั่วไป')
    + fieldHTML('ราคา/หน่วย (บาท)', 'iPrice', 'number', item.price || 0)
    + fieldHTML('สต็อกปัจจุบัน', 'iStock', 'number', item.current_stock || 0)
    + fieldHTML('สต็อกขั้นต่ำ', 'iMin', 'number', item.min_stock || 5)
    + '</div>';
  var footer = '<button onclick="closeModal()" class="btn-secondary">ยกเลิก</button><button onclick="submitItem(' + (item.id ? '\'' + item.id + '\'' : 'null') + ')" class="btn-primary"><i class="fi fi-rr-disk mr-1"></i>บันทึก</button>';
  openModal(item.id ? 'แก้ไขวัสดุ' : 'เพิ่มวัสดุ', body, footer);
}
function submitItem(id) {
  var data = {
    item_code: (document.getElementById('iCode') || {}).value || '',
    name: (document.getElementById('iName') || {}).value || '',
    size: (document.getElementById('iSize') || {}).value || '',
    unit: (document.getElementById('iUnit') || {}).value || '',
    category: (document.getElementById('iCategory') || {}).value || 'ทั่วไป',
    price: parseFloat((document.getElementById('iPrice') || {}).value) || 0,
    current_stock: parseInt((document.getElementById('iStock') || {}).value) || 0,
    min_stock: parseInt((document.getElementById('iMin') || {}).value) || 5
  };
  if (!data.name || !data.unit) { showError('กรุณากรอกชื่อและหน่วย'); return; }
  showLoading('กำลังบันทึก...');
  var api = id ? callAPI('updateItem', id, data) : callAPI('addItem', data);
  api.then(function (res) {
    hideLoading();
    if (res.success) { closeModal(); showSuccess(res.message); _itemsData = []; _itemsCacheTime = 0; buildItemsPage(); }
    else showError(res.message);
  }).catch(function (e) { hideLoading(); showError(e.message || 'บันทึกไม่สำเร็จ'); });
}
function doDeleteItem(id) {
  var item = _itemsData.filter(function (i) { return i.id === id; })[0];
  showConfirm('ยืนยันการลบ', 'ต้องการลบ "' + (item ? item.name : '') + '" ใช่หรือไม่?', function () {
    showLoading('กำลังลบ...');
    callAPI('deleteItem', id).then(function (res) {
      hideLoading();
      if (res.success) { showSuccess(res.message); _itemsData = []; _itemsCacheTime = 0; buildItemsPage(); }
      else showError(res.message);
    }).catch(function (e) { hideLoading(); showError(e.message); });
  }, 'ลบ');
}

// ===== RECEIVE =====
function renderReceive() {
  showLoading('โหลดข้อมูล...');
  Promise.all([_ensureItems(), callAPI('getReceives', {})]).then(function (results) {
    hideLoading();
    var itemsRes = results[0], recRes = results[1];
    if (!itemsRes.success || !recRes.success) { showError('โหลดข้อมูลไม่สำเร็จ'); return; }
    var recs = recRes.data || [];
    var html = '<div class="fade-in space-y-4">';
    html += '<div class="flex items-center justify-between"><h3 class="font-semibold text-gray-700 flex items-center gap-2"><i class="fi fi-rr-inbox-in text-navy-600"></i> รับวัสดุเข้าคลัง</h3>';
    if (AUTH.hasRole(['admin', 'staff'])) html += '<button onclick="openReceiveModal()" class="btn-primary"><i class="fi fi-rr-plus"></i> รับเข้าคลัง</button>';
    html += '</div>';
    html += '<div class="card overflow-hidden"><div class="overflow-x-auto"><table class="data-table"><thead><tr><th class="px-4 py-3 text-left">วันที่</th><th class="px-4 py-3 text-left">วัสดุ</th><th class="px-4 py-3 text-center">จำนวน</th><th class="px-4 py-3 text-left">รับโดย</th><th class="px-4 py-3 text-left">หมายเหตุ</th></tr></thead><tbody>';
    if (!recs.length) html += '<tr><td colspan="5" class="text-center py-10 text-gray-400">ยังไม่มีรายการรับ</td></tr>';
    recs.slice(0, 50).forEach(function (r) {
      var item = _itemsData.filter(function (i) { return i.id === r.item_id; })[0];
      html += '<tr><td class="px-4 py-3 text-xs text-gray-500">' + formatDate(r.date) + '</td><td class="px-4 py-3 font-medium text-gray-800">' + escHtml(item ? item.name : r.item_id) + '</td><td class="px-4 py-3 text-center font-bold text-green-700">+' + r.quantity + '</td><td class="px-4 py-3 text-xs text-gray-600">' + escHtml(r.received_by) + '</td><td class="px-4 py-3 text-xs text-gray-500">' + escHtml(r.note || '-') + '</td></tr>';
    });
    html += '</tbody></table></div></div></div>';
    document.getElementById('mainContent').innerHTML = html;
  }).catch(function (e) { hideLoading(); showError(e.message); });
}
function openReceiveModal() {
  var opts = _itemsData.map(function (i) { return '<option value="' + i.id + '">' + escHtml(i.name) + ' (' + escHtml(i.item_code) + ') คงเหลือ ' + i.current_stock + '</option>'; }).join('');
  var body = '<div class="space-y-4"><div><label class="form-label">วัสดุ *</label><select id="rItem" class="form-input"><option value="">เลือกวัสดุ</option>' + opts + '</select></div>'
    + '<div class="grid grid-cols-2 gap-3"><div><label class="form-label">จำนวน *</label><input type="number" id="rQty" min="1" class="form-input" value="1"></div><div><label class="form-label">วันที่</label><input type="date" id="rDate" class="form-input" value="' + new Date().toISOString().slice(0, 10) + '"></div></div>'
    + '<div><label class="form-label">หมายเหตุ</label><textarea id="rNote" class="form-input" rows="2"></textarea></div></div>';
  var footer = '<button onclick="closeModal()" class="btn-secondary">ยกเลิก</button><button onclick="submitReceive()" class="btn-primary"><i class="fi fi-rr-check mr-1"></i>บันทึก</button>';
  openModal('รับวัสดุเข้าคลัง', body, footer);
}
function submitReceive() {
  var data = { item_id: (document.getElementById('rItem') || {}).value, quantity: parseInt((document.getElementById('rQty') || {}).value), date: (document.getElementById('rDate') || {}).value, note: (document.getElementById('rNote') || {}).value };
  if (!data.item_id || !data.quantity) { showError('กรุณาเลือกวัสดุและใส่จำนวน'); return; }
  showLoading('กำลังบันทึก...');
  callAPI('addReceive', data).then(function (res) { hideLoading(); if (res.success) { closeModal(); showSuccess(res.message); _itemsData = []; _itemsCacheTime = 0; renderReceive(); } else showError(res.message); })
    .catch(function (e) { hideLoading(); showError(e.message); });
}

// ===== USAGE (บันทึกการใช้จริง) =====
function renderUsage() {
  showLoading('โหลดข้อมูลการใช้จริง...');
  Promise.all([_ensureItems(), _ensureDepts(), callAPI('getUsages', {})]).then(function (results) {
    hideLoading();
    var usageRes = results[2];
    if (!usageRes.success) { showError(usageRes.message); return; }
    _usageData = usageRes.data || [];
    var html = '<div class="fade-in space-y-4">';
    html += '<div class="flex items-center justify-between flex-wrap gap-3">';
    html += '<div><h3 class="font-semibold text-gray-700 flex items-center gap-2"><i class="fi fi-rr-arrow-right-from-bracket text-navy-600"></i> บันทึกการใช้จริง</h3><p class="text-xs text-gray-400 mt-1">ตัดยอดสต็อกทันที ไม่ต้องรออนุมัติ</p></div>';
    html += '<button onclick="openUsageModal()" class="btn-primary"><i class="fi fi-rr-plus"></i> บันทึกการใช้</button></div>';

    // Summary cards
    var totalUsed = _usageData.reduce(function (s, u) { return s + Number(u.quantity || 0); }, 0);
    var totalValue = _usageData.reduce(function (s, u) { return s + (Number(u.price || 0) * Number(u.quantity || 0)); }, 0);
    html += '<div class="grid grid-cols-2 md:grid-cols-2 gap-3">';
    html += '<div class="card p-4 text-center"><p class="text-xs text-gray-500">จำนวนรายการ</p><p class="text-2xl font-bold text-gray-800 mt-1">' + _usageData.length + '</p></div>';
    html += '<div class="card p-4 text-center"><p class="text-xs text-gray-500">มูลค่ารวม</p><p class="text-2xl font-bold text-emerald-600 mt-1">' + _formatNumber(totalValue) + '</p><p class="text-xs text-gray-400">บาท</p></div>';
    html += '</div>';

    html += '<div class="card overflow-hidden"><div class="overflow-x-auto"><table class="data-table"><thead><tr><th class="px-4 py-3 text-left">เลขที่</th><th class="px-4 py-3 text-left">วัสดุ</th><th class="px-4 py-3 text-center">จำนวน</th><th class="px-4 py-3 text-right">มูลค่า</th><th class="px-4 py-3 text-left">ผู้บันทึก</th><th class="px-4 py-3 text-left">หน่วยงาน</th><th class="px-4 py-3 text-left">วัตถุประสงค์</th><th class="px-4 py-3 text-left">วันที่</th></tr></thead><tbody>';
    if (!_usageData.length) html += '<tr><td colspan="8" class="text-center py-10 text-gray-400">ยังไม่มีรายการใช้จริง</td></tr>';
    _usageData.slice(0, 100).forEach(function (u) {
      var value = Number(u.price || 0) * Number(u.quantity || 0);
      html += '<tr><td class="px-4 py-3 font-mono text-xs text-navy-700">' + escHtml(u.usage_no || '-') + '</td>';
      html += '<td class="px-4 py-3 font-medium text-gray-800">' + escHtml(u.item_name || u.item_id) + (u.unit ? ' <span class="text-xs text-gray-400">(' + escHtml(u.unit) + ')</span>' : '') + '</td>';
      html += '<td class="px-4 py-3 text-center font-bold text-purple-700">-' + u.quantity + '</td>';
      html += '<td class="px-4 py-3 text-right text-sm ' + (value > 0 ? 'text-gray-700' : 'text-gray-400') + '">' + (value > 0 ? _formatNumber(value) + ' บาท' : '-') + '</td>';
      html += '<td class="px-4 py-3 text-xs text-gray-600">' + escHtml(u.user_name || u.username) + '</td>';
      html += '<td class="px-4 py-3 text-xs text-gray-600"><span class="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded text-xs">' + escHtml(u.department_name || u.department_id || '-') + '</span></td>';
      html += '<td class="px-4 py-3 text-xs text-gray-500">' + escHtml(u.purpose || '-') + '</td>';
      html += '<td class="px-4 py-3 text-xs text-gray-400">' + formatDateTime(u.created_at) + '</td></tr>';
    });
    html += '</tbody></table></div></div></div>';
    document.getElementById('mainContent').innerHTML = html;
  }).catch(function (e) { hideLoading(); showError(e.message); });
}
function openUsageModal() {
  var opts = _itemsData.filter(function (i) { return i.current_stock > 0; }).map(function (i) {
    var priceInfo = Number(i.price || 0) > 0 ? ' | ' + _formatNumber(i.price) + ' บาท/' + escHtml(i.unit) : '';
    return '<option value="' + i.id + '">' + escHtml(i.name) + ' (คงเหลือ ' + i.current_stock + ' ' + escHtml(i.unit) + priceInfo + ')</option>';
  }).join('');
  var deptInfo = AUTH.user.department_id ? '<div class="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-sm text-indigo-700"><i class="fi fi-rr-building mr-1"></i> <strong>ใช้ในนามหน่วยงาน:</strong> ' + escHtml(AUTH.user.department_name || _deptName(AUTH.user.department_id)) + '</div>' : '';
  var body = '<div class="space-y-4">' + deptInfo
    + '<div class="bg-purple-50 border border-purple-200 rounded-xl p-3 text-xs text-purple-700"><i class="fi fi-rr-info mr-1"></i> การบันทึกนี้จะตัดยอดสต็อกทันที โดยไม่ต้องรออนุมัติ</div>'
    + '<div><label class="form-label">วัสดุ *</label><select id="uItem" class="form-input" onchange="updateUsagePreview()"><option value="">เลือกวัสดุ</option>' + opts + '</select></div>'
    + '<div><label class="form-label">จำนวน *</label><input type="number" id="uQty" min="1" class="form-input" value="1" oninput="updateUsagePreview()"></div>'
    + '<div id="usagePreview"></div>'
    + '<div><label class="form-label">วัตถุประสงค์</label><input type="text" id="uPurpose" class="form-input" placeholder="เช่น ใช้ในงานซ่อม..."></div>'
    + '<div><label class="form-label">หมายเหตุ</label><textarea id="uNote" class="form-input" rows="2"></textarea></div></div>';
  var footer = '<button onclick="closeModal()" class="btn-secondary">ยกเลิก</button><button onclick="submitUsage()" class="btn-primary" style="background:#7c3aed"><i class="fi fi-rr-check mr-1"></i>บันทึก (ตัดยอด)</button>';
  openModal('บันทึกการใช้จริง', body, footer);
}
function updateUsagePreview() {
  var itemId = (document.getElementById('uItem') || {}).value;
  var qty = parseInt((document.getElementById('uQty') || {}).value) || 0;
  var previewEl = document.getElementById('usagePreview');
  if (!previewEl || !itemId || qty <= 0) { if (previewEl) previewEl.innerHTML = ''; return; }
  var item = _itemsData.filter(function (i) { return i.id === itemId; })[0];
  if (!item) return;
  var price = Number(item.price || 0);
  var value = price * qty;
  var html = '<div class="bg-gray-50 rounded-xl p-3 text-sm text-gray-700">';
  html += '<span class="text-gray-500">คงเหลือหลังตัดยอด:</span> <strong>' + (item.current_stock - qty) + ' ' + escHtml(item.unit) + '</strong>';
  if (value > 0) html += ' | <span class="text-gray-500">มูลค่าที่ตัด:</span> <strong class="text-red-600">' + _formatNumber(value) + ' บาท</strong>';
  html += '</div>';
  previewEl.innerHTML = html;
}
function submitUsage() {
  var data = {
    item_id: (document.getElementById('uItem') || {}).value,
    quantity: parseInt((document.getElementById('uQty') || {}).value),
    purpose: (document.getElementById('uPurpose') || {}).value,
    note: (document.getElementById('uNote') || {}).value,
    department_id: AUTH.user.department_id || ''
  };
  if (!data.item_id || !data.quantity || data.quantity <= 0) { showError('กรุณาเลือกวัสดุและใส่จำนวน'); return; }
  showLoading('กำลังบันทึกการใช้จริง...');
  callAPI('addUsage', data).then(function (res) {
    hideLoading();
    if (res.success) { closeModal(); showSuccess(res.message); _itemsData = []; _itemsCacheTime = 0; renderUsage(); }
    else showError(res.message);
  }).catch(function (e) { hideLoading(); showError(e.message); });
}

// ===== STOCKTAKE =====
function renderStocktake() {
  showLoading('โหลดข้อมูล...');
  _ensureItems(true).then(function () { hideLoading(); buildStocktakePage(); });
}
function buildStocktakePage() {
  var html = '<div class="fade-in space-y-4">';
  html += '<div class="card p-5"><div class="flex items-center gap-2 mb-3"><i class="fi fi-rr-clipboard-list text-navy-600 text-lg"></i><h3 class="font-semibold text-gray-700">นับสต็อก — ปรับยอดตามจริง</h3></div><p class="text-sm text-gray-500 mb-4">กดปุ่ม "นับ" แล้วกรอกยอดจริง ระบบจะบันทึกการเปลี่ยนแปลงและบันทึกประวัติ</p></div>';
  html += '<div class="card overflow-hidden"><div class="overflow-x-auto"><table class="data-table"><thead><tr><th class="px-4 py-3 text-left">วัสดุ</th><th class="px-4 py-3 text-center">ในระบบ</th><th class="px-4 py-3 text-center">จัดการ</th></tr></thead><tbody>';
  _itemsData.forEach(function (i) {
    html += '<tr><td class="px-4 py-3"><p class="font-medium text-gray-800">' + escHtml(i.name) + '</p><p class="text-xs text-gray-400">' + escHtml(i.item_code) + '</p></td>';
    html += '<td class="px-4 py-3 text-center font-bold ' + (i.current_stock <= i.min_stock ? 'text-red-600' : 'text-gray-800') + '">' + i.current_stock + ' ' + escHtml(i.unit) + '</td>';
    html += '<td class="px-4 py-3 text-center"><button onclick="openStocktakeModal(\'' + i.id + '\')" class="btn-secondary btn-sm"><i class="fi fi-rr-edit"></i> นับ</button></td></tr>';
  });
  html += '</tbody></table></div></div></div>';
  document.getElementById('mainContent').innerHTML = html;
}
function openStocktakeModal(id) {
  var i = _itemsData.filter(function (x) { return x.id === id; })[0]; if (!i) return;
  var body = '<div class="space-y-4"><div class="bg-gray-50 rounded-xl p-3"><p class="text-sm text-gray-500">วัสดุ</p><p class="font-semibold text-gray-800">' + escHtml(i.name) + '</p><p class="text-xs text-gray-400">ในระบบ: ' + i.current_stock + ' ' + escHtml(i.unit) + '</p></div>'
    + '<div><label class="form-label">ยอดจริง *</label><input type="number" id="stActual" class="form-input" value="' + i.current_stock + '"></div>'
    + '<div><label class="form-label">หมายเหตุ</label><textarea id="stNote" class="form-input" rows="2"></textarea></div></div>';
  var footer = '<button onclick="closeModal()" class="btn-secondary">ยกเลิก</button><button onclick="submitStocktake(\'' + id + '\')" class="btn-primary"><i class="fi fi-rr-check mr-1"></i>บันทึก</button>';
  openModal('นับสต็อก', body, footer);
}
function submitStocktake(id) {
  var data = { item_id: id, actual: parseInt((document.getElementById('stActual') || {}).value), note: (document.getElementById('stNote') || {}).value };
  if (isNaN(data.actual)) { showError('กรุณากรอกยอดจริง'); return; }
  showLoading('กำลังบันทึก...');
  callAPI('addStocktake', data).then(function (res) { hideLoading(); if (res.success) { closeModal(); showSuccess(res.message); _itemsData = []; _itemsCacheTime = 0; renderStocktake(); } else showError(res.message); })
    .catch(function (e) { hideLoading(); showError(e.message); });
}

// ===== WITHDRAW =====
function renderWithdraw() {
  showLoading('โหลดข้อมูล...');
  Promise.all([_ensureItems(), _ensureDepts(), callAPI('getWithdrawals', { status: 'all' })]).then(function (results) {
    hideLoading();
    var wdRes = results[2];
    _wdData = wdRes.data || [];
    var mine = _wdData.filter(function (w) { return w.requester_id === AUTH.user.id || AUTH.hasRole('admin'); });
    var html = '<div class="fade-in space-y-4">';
    html += '<div class="flex items-center justify-between"><h3 class="font-semibold text-gray-700 flex items-center gap-2"><i class="fi fi-rr-inbox-out text-navy-600"></i> เบิกวัสดุ</h3><button onclick="openWithdrawModal()" class="btn-primary"><i class="fi fi-rr-plus"></i> เบิกวัสดุ</button></div>';
    html += '<div class="card overflow-hidden"><div class="overflow-x-auto"><table class="data-table"><thead><tr><th class="px-4 py-3 text-left">เลขที่</th><th class="px-4 py-3 text-left">วัสดุ</th><th class="px-4 py-3 text-center">จำนวน</th><th class="px-4 py-3 text-left">หน่วยงาน</th><th class="px-4 py-3 text-left">วันที่</th><th class="px-4 py-3 text-center">สถานะ</th><th class="px-4 py-3 text-center">จัดการ</th></tr></thead><tbody>';
    if (!mine.length) html += '<tr><td colspan="7" class="text-center py-10 text-gray-400">ยังไม่มีคำขอเบิก</td></tr>';
    mine.slice(0, 50).forEach(function (w) {
      var stCls = 'status-' + w.status; var stTxt = { pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ปฏิเสธ', cancelled: 'ยกเลิก' }[w.status] || w.status;
      html += '<tr><td class="px-4 py-3 font-mono text-xs text-navy-700">' + escHtml(w.withdraw_no) + '</td><td class="px-4 py-3 font-medium text-gray-800">' + escHtml(w.item_name || w.item_id) + '</td><td class="px-4 py-3 text-center font-bold text-gray-800">' + w.quantity + '</td><td class="px-4 py-3 text-xs text-gray-600">' + escHtml(w.department_name || w.department_id || '-') + '</td><td class="px-4 py-3 text-xs text-gray-500">' + formatDateTime(w.created_at) + '</td><td class="px-4 py-3 text-center"><span class="px-2 py-0.5 rounded-full text-xs font-medium ' + stCls + '">' + stTxt + '</span></td>';
      html += '<td class="px-4 py-3 text-center">';
      if (w.status === 'pending') html += '<button onclick="doCancelWithdraw(\'' + w.id + '\')" class="btn-secondary btn-sm"><i class="fi fi-rr-times"></i> ยกเลิก</button>';
      else if (w.reject_reason) html += '<button onclick="Swal.fire({icon:\'info\',title:\'เหตุผลที่ปฏิเสธ\',text:\'' + escHtml(w.reject_reason).replace(/'/g, "\\'") + '\'})" class="btn-secondary btn-sm"><i class="fi fi-rr-info"></i></button>';
      else html += '<span class="text-xs text-gray-400">—</span>';
      html += '</td></tr>';
    });
    html += '</tbody></table></div></div></div>';
    document.getElementById('mainContent').innerHTML = html;
  }).catch(function (e) { hideLoading(); showError(e.message); });
}
function openWithdrawModal() {
  var opts = _itemsData.filter(function (i) { return i.current_stock > 0; }).map(function (i) { return '<option value="' + i.id + '">' + escHtml(i.name) + ' (คงเหลือ ' + i.current_stock + ' ' + escHtml(i.unit) + ')</option>'; }).join('');
  var deptInfo = AUTH.user.department_id ? '<div class="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-sm text-indigo-700"><i class="fi fi-rr-building mr-1"></i> <strong>เบิกในนามหน่วยงาน:</strong> ' + escHtml(AUTH.user.department_name || _deptName(AUTH.user.department_id)) + '</div>' : '';
  var body = '<div class="space-y-4">' + deptInfo
    + '<div><label class="form-label">วัสดุ *</label><select id="wItem" class="form-input"><option value="">เลือกวัสดุ</option>' + opts + '</select></div>'
    + '<div><label class="form-label">จำนวน *</label><input type="number" id="wQty" min="1" class="form-input" value="1"></div>'
    + '<div><label class="form-label">วัตถุประสงค์</label><input type="text" id="wPurpose" class="form-input" placeholder="เช่น ใช้ในงาน..."></div>'
    + '<div><label class="form-label">หมายเหตุ</label><textarea id="wNote" class="form-input" rows="2"></textarea></div></div>';
  var footer = '<button onclick="closeModal()" class="btn-secondary">ยกเลิก</button><button onclick="submitWithdraw()" class="btn-primary"><i class="fi fi-rr-check mr-1"></i>ส่งคำขอ</button>';
  openModal('เบิกวัสดุ', body, footer);
}
function submitWithdraw() {
  var data = { item_id: (document.getElementById('wItem') || {}).value, quantity: parseInt((document.getElementById('wQty') || {}).value), purpose: (document.getElementById('wPurpose') || {}).value, note: (document.getElementById('wNote') || {}).value, via_qr: false, department_id: AUTH.user.department_id || '' };
  if (!data.item_id || !data.quantity) { showError('กรุณาเลือกวัสดุและใส่จำนวน'); return; }
  showLoading('กำลังส่งคำขอ...');
  callAPI('addWithdrawal', data).then(function (res) { hideLoading(); if (res.success) { closeModal(); showSuccess(res.message); renderWithdraw(); } else showError(res.message); })
    .catch(function (e) { hideLoading(); showError(e.message); });
}
function doCancelWithdraw(id) {
  showConfirm('ยกเลิกคำขอเบิก', 'ต้องการยกเลิกคำขอนี้ใช่หรือไม่?', function () {
    showLoading('กำลังยกเลิก...');
    callAPI('cancelWithdrawal', id).then(function (res) { hideLoading(); if (res.success) { showSuccess(res.message); _updatePendingBadge(); renderWithdraw(); } else showError(res.message); })
      .catch(function (e) { hideLoading(); showError(e.message); });
  }, 'ยกเลิก');
}

// ===== APPROVE =====
function renderApprove() {
  showLoading('โหลดคำขอเบิก...');
  Promise.all([_ensureDepts(), callAPI('getWithdrawals', { status: 'all' })]).then(function (results) {
    hideLoading();
    var res = results[1];
    if (!res.success) { showError(res.message); return; }
    var all = res.data || [];
    var pending = all.filter(function (w) { return w.status === 'pending'; });
    var html = '<div class="fade-in space-y-4">';
    html += '<div class="flex items-center justify-between"><h3 class="font-semibold text-gray-700 flex items-center gap-2"><i class="fi fi-rr-check-circle text-navy-600"></i> อนุมัติการเบิก <span class="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-xs">' + pending.length + ' รออนุมัติ</span></h3></div>';
    if (!pending.length) html += '<div class="card p-10 text-center text-gray-400"><i class="fi fi-rr-check text-4xl mb-2 block"></i>ไม่มีคำขอรออนุมัติ</div>';
    pending.forEach(function (w) {
      html += '<div class="card p-4 flex items-center gap-4 flex-wrap">';
      html += '<div class="flex-1 min-w-[200px]"><p class="font-semibold text-gray-800">' + escHtml(w.item_name) + '</p>';
      html += '<p class="text-xs text-gray-400">' + escHtml(w.withdraw_no) + ' • ' + escHtml(w.requester_name) + ' • ' + formatDateTime(w.created_at) + '</p>';
      if (w.department_name || w.department_id) html += '<p class="text-xs text-indigo-600 mt-0.5"><i class="fi fi-rr-building mr-1"></i>' + escHtml(w.department_name || w.department_id) + '</p>';
      if (w.purpose) html += '<p class="text-xs text-gray-500 mt-0.5">วัตถุประสงค์: ' + escHtml(w.purpose) + '</p>';
      html += '</div>';
      html += '<div class="text-center"><p class="text-2xl font-bold text-navy-700">' + w.quantity + '</p><p class="text-xs text-gray-400">' + escHtml(w.unit || '') + '</p></div>';
      html += '<div class="flex gap-2"><button onclick="doApprove(\'' + w.id + '\',' + w.quantity + ')" class="btn-primary btn-sm"><i class="fi fi-rr-check"></i> อนุมัติ</button><button onclick="doReject(\'' + w.id + '\')" class="btn-danger btn-sm"><i class="fi fi-rr-times"></i> ปฏิเสธ</button></div></div>';
    });
    html += '</div>';
    document.getElementById('mainContent').innerHTML = html;
  }).catch(function (e) { hideLoading(); showError(e.message); });
}
function doApprove(id, qty) {
  showConfirm('อนุมัติการเบิก', 'ยืนยันการอนุมัติใช่หรือไม่?', function () {
    showLoading('กำลังอนุมัติ...');
    callAPI('approveWithdrawal', id, qty).then(function (res) { hideLoading(); if (res.success) { showSuccess(res.message); _updatePendingBadge(); renderApprove(); } else showError(res.message); })
      .catch(function (e) { hideLoading(); showError(e.message); });
  }, 'อนุมัติ');
}
function doReject(id) {
  Swal.fire({ title: 'ปฏิเสธการเบิก', input: 'textarea', inputLabel: 'เหตุผลที่ปฏิเสธ', showCancelButton: true, confirmButtonText: 'ปฏิเสธ', cancelButtonText: 'ยกเลิก', reverseButtons: true, inputValidator: function (v) { if (!v) return 'กรุณาระบุเหตุผล'; } })
    .then(function (r) {
      if (r.isConfirmed) {
        showLoading('กำลังบันทึก...');
        callAPI('rejectWithdrawal', id, r.value).then(function (res) { hideLoading(); if (res.success) { showSuccess(res.message); _updatePendingBadge(); renderApprove(); } else showError(res.message); })
          .catch(function (e) { hideLoading(); showError(e.message); });
      }
    });
}

// ===== TRANSACTIONS =====
var _txFilter = { dept: 'all' };
function renderTransactions() {
  showLoading('โหลดประวัติ...');
  Promise.all([_ensureDepts(), callAPI('getTransactions', {})]).then(function (results) {
    hideLoading();
    var res = results[1];
    if (!res.success) { showError(res.message); return; }
    var txs = res.data || [];

    // Filter
    var filtered = txs;
    if (_txFilter.dept !== 'all') {
      filtered = txs.filter(function (t) { return t.department_id === _txFilter.dept; });
    }

    var html = '<div class="fade-in space-y-4">';
    html += '<div class="flex items-center justify-between"><h3 class="font-semibold text-gray-700 flex items-center gap-2"><i class="fi fi-rr-time-past text-navy-600"></i> ประวัติเคลื่อนไหว (' + filtered.length + '/' + txs.length + ')</h3></div>';

    // Department filter
    if (_deptsData.length) {
      html += '<div class="card p-3 flex flex-wrap gap-3 items-end">';
      html += '<div><label class="form-label">กรองตามหน่วยงาน</label><select id="txDeptFilter" onchange="_txFilter.dept=this.value;renderTransactions()" class="form-input"><option value="all">ทุกหน่วยงาน</option>';
      _deptsData.forEach(function (d) { html += '<option value="' + d.id + '"' + (_txFilter.dept === d.id ? ' selected' : '') + '>' + escHtml(d.name) + '</option>'; });
      html += '</select></div></div>';
    }

    html += '<div class="card overflow-hidden"><div class="overflow-x-auto"><table class="data-table"><thead><tr><th class="px-4 py-3 text-left">วันที่</th><th class="px-4 py-3 text-left">ประเภท</th><th class="px-4 py-3 text-left">วัสดุ</th><th class="px-4 py-3 text-center">จำนวน</th><th class="px-4 py-3 text-left">โดย</th><th class="px-4 py-3 text-left">หน่วยงาน</th><th class="px-4 py-3 text-left">หมายเหตุ</th></tr></thead><tbody>';
    if (!filtered.length) html += '<tr><td colspan="7" class="text-center py-10 text-gray-400">ยังไม่มีประวัติ</td></tr>';
    filtered.slice(0, 100).forEach(function (t) {
      var typeMap = { receive: ['รับเข้า', 'text-green-700', 'fi-rr-inbox-in'], withdraw: ['เบิกออก', 'text-red-700', 'fi-rr-inbox-out'], usage: ['ใช้จริง', 'text-purple-700', 'fi-rr-arrow-right-from-bracket'], withdraw_request: ['ขอเบิก', 'text-amber-700', 'fi-rr-clock'], create: ['สร้าง', 'text-blue-700', 'fi-rr-plus'], stocktake: ['นับสต็อก', 'text-indigo-700', 'fi-rr-clipboard-list'] };
      var tp = typeMap[t.type] || [t.type, 'text-gray-700', 'fi-rr-dot-circle'];
      var deptCell = (t.department_name || t.department_id) ? '<td class="px-4 py-3 text-xs text-gray-600"><span class="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded text-xs">' + escHtml(t.department_name || t.department_id) + '</span></td>' : '<td class="px-4 py-3 text-xs text-gray-400">-</td>';
      html += '<tr><td class="px-4 py-3 text-xs text-gray-500">' + formatDateTime(t.created_at) + '</td><td class="px-4 py-3"><span class="' + tp[1] + ' text-xs font-medium"><i class="fi ' + tp[2] + ' mr-1"></i>' + tp[0] + '</span></td><td class="px-4 py-3 font-medium text-gray-800">' + escHtml(t.item_name) + '</td><td class="px-4 py-3 text-center font-bold ' + tp[1] + '">' + (t.quantity > 0 ? (t.type === 'receive' ? '+' : (t.type === 'withdraw' || t.type === 'usage' ? '-' : '')) + t.quantity : '-') + '</td><td class="px-4 py-3 text-xs text-gray-600">' + escHtml(t.username) + '</td>' + deptCell + '<td class="px-4 py-3 text-xs text-gray-500">' + escHtml(t.note || '-') + '</td></tr>';
    });
    html += '</tbody></table></div></div></div>';
    document.getElementById('mainContent').innerHTML = html;
  }).catch(function (e) { hideLoading(); showError(e.message); });
}

// ===== REPORTS =====
var _rptFilter = { dept: 'all' };
function renderReports() {
  showLoading('โหลดรายงาน...');
  Promise.all([_ensureItems(), _ensureDepts(), callAPI('getWithdrawals', { status: 'all' }), callAPI('getReceives', {})]).then(function (results) {
    hideLoading();
    var wds = (results[2].data || []).filter(function (w) { return w.status === 'approved'; });
    var recs = results[3].data || [];

    // Filter by department
    var filteredWds = wds;
    if (_rptFilter.dept !== 'all') {
      filteredWds = wds.filter(function (w) { return w.department_id === _rptFilter.dept; });
    }
    var filteredRecs = recs;

    var totalIn = filteredRecs.reduce(function (s, r) { return s + Number(r.quantity || 0); }, 0);
    var totalOut = filteredWds.reduce(function (s, w) { return s + Number(w.quantity || 0); }, 0);
    var totalStockValue = _itemsData.reduce(function (s, i) { return s + (Number(i.price || 0) * Number(i.current_stock || 0)); }, 0);
    var html = '<div class="fade-in space-y-4">';

    // Department filter
    if (_deptsData.length) {
      html += '<div class="card p-3 flex flex-wrap gap-3 items-end">';
      html += '<div><label class="form-label">กรองรายงานตามหน่วยงาน</label><select id="rptDeptFilter" onchange="_rptFilter.dept=this.value;renderReports()" class="form-input"><option value="all">ทุกหน่วยงาน</option>';
      _deptsData.forEach(function (d) { html += '<option value="' + d.id + '"' + (_rptFilter.dept === d.id ? ' selected' : '') + '>' + escHtml(d.name) + '</option>'; });
      html += '</select></div></div>';
    }

    html += '<div class="grid grid-cols-1 md:grid-cols-4 gap-4">';
    html += '<div class="card p-5 text-center"><i class="fi fi-rr-inbox-in text-3xl text-green-600"></i><p class="text-2xl font-bold text-gray-800 mt-2">' + totalIn + '</p><p class="text-xs text-gray-500">รับเข้ารวม</p></div>';
    html += '<div class="card p-5 text-center"><i class="fi fi-rr-inbox-out text-3xl text-red-600"></i><p class="text-2xl font-bold text-gray-800 mt-2">' + totalOut + '</p><p class="text-xs text-gray-500">เบิกออกรวม</p></div>';
    html += '<div class="card p-5 text-center"><i class="fi fi-rr-layers text-3xl text-navy-600"></i><p class="text-2xl font-bold text-gray-800 mt-2">' + _itemsData.reduce(function (s, i) { return s + Number(i.current_stock || 0); }, 0) + '</p><p class="text-xs text-gray-500">สต็อกปัจจุบัน</p></div>';
    html += '<div class="card p-5 text-center"><i class="fi fi-rr-money text-3xl text-emerald-600"></i><p class="text-2xl font-bold text-emerald-700 mt-2">' + _formatNumber(totalStockValue) + '</p><p class="text-xs text-gray-500">มูลค่าสต็อกรวม (บาท)</p></div>';
    html += '</div>';

    // Withdrawal detail by department
    if (_rptFilter.dept !== 'all') {
      var deptName = _deptName(_rptFilter.dept);
      html += '<div class="card p-5"><div class="flex items-center justify-between mb-3"><h3 class="font-semibold text-gray-700"><i class="fi fi-rr-building text-indigo-500 mr-1"></i> รายการเบิกของ ' + escHtml(deptName) + '</h3></div>';
      if (filteredWds.length) {
        html += '<div class="overflow-x-auto"><table class="data-table"><thead><tr><th class="px-3 py-2 text-left">เลขที่</th><th class="px-3 py-2 text-left">วัสดุ</th><th class="px-3 py-2 text-center">จำนวน</th><th class="px-3 py-2 text-left">ผู้เบิก</th><th class="px-3 py-2 text-left">วันที่</th></tr></thead><tbody>';
        filteredWds.forEach(function (w) {
          html += '<tr><td class="px-3 py-2 text-xs font-mono">' + escHtml(w.withdraw_no || '-') + '</td><td class="px-3 py-2">' + escHtml(w.item_name || '-') + '</td><td class="px-3 py-2 text-center font-bold">' + w.quantity + '</td><td class="px-3 py-2 text-xs">' + escHtml(w.requester_name || '-') + '</td><td class="px-3 py-2 text-xs">' + formatDateTime(w.created_at) + '</td></tr>';
        });
        html += '</tbody></table></div>';
      } else {
        html += '<p class="text-sm text-gray-400 text-center py-6">ไม่มีรายการเบิกสำหรับหน่วยงานนี้</p>';
      }
      html += '</div>';
    }

    html += '<div class="card p-5"><div class="flex items-center justify-between mb-3"><h3 class="font-semibold text-gray-700">รายงานสต็อกคงเหลือ</h3><button onclick="exportItemsExcel()" class="btn-secondary btn-sm"><i class="fi fi-rr-file-export"></i> Export Excel</button></div>';
    html += '<div class="overflow-x-auto"><table class="data-table"><thead><tr><th class="px-3 py-2 text-left">รหัส</th><th class="px-3 py-2 text-left">ชื่อ</th><th class="px-3 py-2 text-right">ราคา/หน่วย</th><th class="px-3 py-2 text-center">คงเหลือ</th><th class="px-3 py-2 text-right">มูลค่ารวม</th><th class="px-3 py-2 text-center">ขั้นต่ำ</th><th class="px-3 py-2 text-center">สถานะ</th></tr></thead><tbody>';
    _itemsData.forEach(function (i) {
      var sClass = getStockClass(i.current_stock, i.min_stock); var sLabel = getStockLabel(i.current_stock, i.min_stock);
      var price = Number(i.price || 0);
      var value = price * i.current_stock;
      html += '<tr><td class="px-3 py-2 text-xs font-mono">' + escHtml(i.item_code) + '</td><td class="px-3 py-2">' + escHtml(i.name) + '</td><td class="px-3 py-2 text-right">' + (price > 0 ? _formatNumber(price) : '-') + '</td><td class="px-3 py-2 text-center">' + i.current_stock + ' ' + escHtml(i.unit) + '</td><td class="px-3 py-2 text-right font-medium">' + (value > 0 ? _formatNumber(value) : '-') + '</td><td class="px-3 py-2 text-center">' + i.min_stock + '</td><td class="px-3 py-2 text-center"><span class="px-2 py-0.5 rounded-full text-xs ' + sClass + '">' + sLabel + '</span></td></tr>';
    });
    html += '</tbody></table></div></div></div>';
    document.getElementById('mainContent').innerHTML = html;
  }).catch(function (e) { hideLoading(); showError(e.message); });
}
function exportItemsExcel() {
  var data = _itemsData.map(function (i) { return { 'รหัส': i.item_code, 'ชื่อ': i.name, 'ขนาด': i.size, 'หน่วย': i.unit, 'หมวดหมู่': i.category, 'ราคา/หน่วย (บาท)': Number(i.price || 0), 'คงเหลือ': i.current_stock, 'มูลค่ารวม (บาท)': Number(i.price || 0) * i.current_stock, 'ขั้นต่ำ': i.min_stock }; });
  var ws = XLSX.utils.json_to_sheet(data);
  var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'สต็อก');
  XLSX.writeFile(wb, 'รายงานสต็อก_' + new Date().toISOString().slice(0, 10) + '.xlsx');
}

// ===== HELPER: load departments with cache =====
function _ensureDepts() {
  if (_deptsData.length) return Promise.resolve({ success: true, data: _deptsData });
  return callAPI('getDepartments').then(function (res) {
    if (res.success) _deptsData = res.data || [];
    return res;
  });
}
function _deptName(deptId) {
  if (!deptId) return '-';
  var d = _deptsData.filter(function (x) { return x.id === deptId; })[0];
  return d ? d.name : deptId;
}
function _deptOpts(selectedId) {
  return _deptsData.map(function (d) {
    return '<option value="' + d.id + '"' + (d.id === selectedId ? ' selected' : '') + '>' + escHtml(d.name) + '</option>';
  }).join('');
}

// ===== DEPARTMENTS =====
var _deptsPage = 1;
function renderDepartments() {
  showLoading('โหลดหน่วยงาน...');
  callAPI('getDepartments').then(function (res) {
    hideLoading();
    if (!res.success) { showError(res.message); return; }
    _deptsData = res.data || [];
    buildDepartmentsPage();
  }).catch(function (e) { hideLoading(); showError(e.message); });
}
function buildDepartmentsPage() {
  var paged = paginate(_deptsData, _deptsPage);
  var html = '<div class="fade-in space-y-4">';
  html += '<div class="flex items-center justify-between"><h3 class="font-semibold text-gray-700 flex items-center gap-2"><i class="fi fi-rr-building text-navy-600"></i> หน่วยงาน (' + _deptsData.length + ')</h3>';
  if (AUTH.hasRole('admin')) html += '<button onclick="openAddDeptModal()" class="btn-primary"><i class="fi fi-rr-building"></i> เพิ่มหน่วยงาน</button>';
  html += '</div>';
  html += '<div class="card overflow-hidden"><div class="overflow-x-auto"><table class="data-table"><thead><tr><th class="px-4 py-3 text-left">ชื่อหน่วยงาน</th><th class="px-4 py-3 text-left">รายละเอียด</th><th class="px-4 py-3 text-center">จำนวนพนักงาน</th><th class="px-4 py-3 text-center">สถานะ</th><th class="px-4 py-3 text-center">จัดการ</th></tr></thead><tbody>';
  if (!paged.length) html += '<tr><td colspan="5" class="text-center py-10 text-gray-400">ยังไม่มีหน่วยงาน</td></tr>';
  paged.forEach(function (d) {
    html += '<tr>';
    html += '<td class="px-4 py-3 font-medium text-gray-800"><div class="flex items-center gap-2"><i class="fi fi-rr-building text-navy-500"></i> ' + escHtml(d.name) + '</div></td>';
    html += '<td class="px-4 py-3 text-sm text-gray-600">' + escHtml(d.description || '-') + '</td>';
    html += '<td class="px-4 py-3 text-center"><span class="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-xs font-medium">' + (d.employee_count || 0) + ' คน</span></td>';
    html += '<td class="px-4 py-3 text-center"><span class="px-2 py-0.5 rounded-full text-xs ' + (d.active !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700') + '">' + (d.active !== false ? 'ใช้งาน' : 'ระงับ') + '</span></td>';
    html += '<td class="px-4 py-3 text-center"><div class="flex gap-1 justify-center">';
    html += '<button onclick="openEditDeptModal(\'' + d.id + '\')" title="แก้ไข" class="w-7 h-7 bg-blue-100 text-blue-700 rounded-lg flex items-center justify-center hover:bg-blue-200"><i class="fi fi-rr-edit text-xs"></i></button>';
    html += '<button onclick="doDeleteDept(\'' + d.id + '\',\'' + escHtml(d.name).replace(/'/g, "\\'") + '\')" title="ลบ" class="w-7 h-7 bg-red-100 text-red-700 rounded-lg flex items-center justify-center hover:bg-red-200"><i class="fi fi-rr-trash text-xs"></i></button>';
    html += '</div></td></tr>';
  });
  html += '</tbody></table></div><div id="deptsPagination"></div></div>';
  document.getElementById('mainContent').innerHTML = html;
  _renderPagination('deptsPagination', _deptsData.length, _deptsPage, function (p) { _deptsPage = p; buildDepartmentsPage(); });
}
function openAddDeptModal() { _openDeptForm(null); }
function openEditDeptModal(id) { var d = _deptsData.filter(function (x) { return x.id === id; })[0]; if (d) _openDeptForm(d); }
function _openDeptForm(dept) {
  dept = dept || {};
  var body = '<div class="grid grid-cols-1 gap-4">'
    + '<div><label class="form-label">ชื่อหน่วยงาน *</label><input type="text" id="dName" class="form-input" value="' + escHtml(dept.name || '') + '" placeholder="เช่น แผนกซ่อมบำรุง"></div>'
    + '<div><label class="form-label">รายละเอียด</label><textarea id="dDesc" class="form-input" rows="2" placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)">' + escHtml(dept.description || '') + '</textarea></div>'
    + '</div>';
  var footer = '<button onclick="closeModal()" class="btn-secondary">ยกเลิก</button><button onclick="submitDept(' + (dept.id ? '\'' + dept.id + '\'' : 'null') + ')" class="btn-primary"><i class="fi fi-rr-disk mr-1"></i>บันทึก</button>';
  openModal(dept.id ? 'แก้ไขหน่วยงาน' : 'เพิ่มหน่วยงาน', body, footer);
}
function submitDept(id) {
  var data = {
    name: (document.getElementById('dName') || {}).value || '',
    description: (document.getElementById('dDesc') || {}).value || ''
  };
  if (!data.name) { showError('กรุณากรอกชื่อหน่วยงาน'); return; }
  showLoading('กำลังบันทึก...');
  var api = id ? callAPI('updateDepartment', id, data) : callAPI('addDepartment', data);
  api.then(function (res) {
    hideLoading();
    if (res.success) { closeModal(); showSuccess(res.message); _deptsData = []; renderDepartments(); }
    else showError(res.message);
  }).catch(function (e) { hideLoading(); showError(e.message || 'บันทึกไม่สำเร็จ'); });
}
function doDeleteDept(id, name) {
  showConfirm('ยืนยันการลบ', 'ต้องการลบหน่วยงาน "' + name + '" ใช่หรือไม่?\n(หากมีพนักงานอยู่ในหน่วยงาน ระบบจะไม่อนุญาตให้ลบ)', function () {
    showLoading('กำลังลบ...');
    callAPI('deleteDepartment', id).then(function (res) {
      hideLoading();
      if (res.success) { showSuccess(res.message); _deptsData = []; renderDepartments(); }
      else showError(res.message);
    }).catch(function (e) { hideLoading(); showError(e.message); });
  }, 'ลบ');
}

// ===== USERS =====
var _usersPage = 1;
function renderUsers() {
  showLoading('โหลดผู้ใช้...');
  Promise.all([callAPI('getUsers'), _ensureDepts()]).then(function (results) {
    hideLoading();
    var res = results[0];
    if (!res.success) { showError(res.message); return; }
    _usersData = res.data || [];
    buildUsersPage();
  }).catch(function (e) { hideLoading(); showError(e.message); });
}
function buildUsersPage() {
  var paged = paginate(_usersData, _usersPage);
  var html = '<div class="fade-in space-y-4">';
  html += '<div class="flex items-center justify-between"><h3 class="font-semibold text-gray-700 flex items-center gap-2"><i class="fi fi-rr-users text-navy-600"></i> ผู้ใช้งาน (' + _usersData.length + ')</h3><button onclick="openAddUserModal()" class="btn-primary"><i class="fi fi-rr-user-add"></i> เพิ่มผู้ใช้</button></div>';
  html += '<div class="card overflow-hidden"><div class="overflow-x-auto"><table class="data-table"><thead><tr><th class="px-4 py-3 text-left">ชื่อ</th><th class="px-4 py-3 text-left">Username</th><th class="px-4 py-3 text-left">บทบาท</th><th class="px-4 py-3 text-left">หน่วยงาน</th><th class="px-4 py-3 text-left">อีเมล</th><th class="px-4 py-3 text-center">สถานะ</th><th class="px-4 py-3 text-center">จัดการ</th></tr></thead><tbody>';
  if (!paged.length) html += '<tr><td colspan="7" class="text-center py-10 text-gray-400">ไม่มีผู้ใช้</td></tr>';
  paged.forEach(function (u) {
    var roleColor = u.role === 'admin' ? 'bg-navy-100 text-navy-700' : u.role === 'staff' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700';
    html += '<tr><td class="px-4 py-3 font-medium text-gray-800">' + escHtml(u.name) + '</td><td class="px-4 py-3 font-mono text-xs text-gray-500">@' + escHtml(u.username) + '</td><td class="px-4 py-3"><span class="px-2 py-0.5 rounded-full text-xs font-medium ' + roleColor + '">' + (ROLE_LABELS[u.role] || u.role) + '</span></td><td class="px-4 py-3 text-xs text-gray-600">' + (u.role === 'employee' ? '<span class="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full text-xs font-medium">' + escHtml(_deptName(u.department_id)) + '</span>' : '<span class="text-gray-400">-</span>') + '</td><td class="px-4 py-3 text-xs text-gray-500">' + escHtml(u.email || '-') + '</td><td class="px-4 py-3 text-center"><span class="px-2 py-0.5 rounded-full text-xs ' + (u.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700') + '">' + (u.active ? 'ใช้งาน' : 'ระงับ') + '</span></td>';
    html += '<td class="px-4 py-3 text-center"><div class="flex gap-1 justify-center">';
    html += '<button onclick="openEditUserModal(\'' + u.id + '\')" title="แก้ไข" class="w-7 h-7 bg-blue-100 text-blue-700 rounded-lg flex items-center justify-center hover:bg-blue-200"><i class="fi fi-rr-edit text-xs"></i></button>';
    html += '<button onclick="doResetPassword(\'' + u.id + '\')" title="Reset Password" class="w-7 h-7 bg-amber-100 text-amber-700 rounded-lg flex items-center justify-center hover:bg-amber-200"><i class="fi fi-rr-lock text-xs"></i></button>';
    if (u.id !== AUTH.user.id) html += '<button onclick="doToggleUser(\'' + u.id + '\',\'' + escHtml(u.name).replace(/'/g, "\\'") + '\')" title="เปิด/ระงับ" class="w-7 h-7 ' + (u.active ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-green-100 text-green-700 hover:bg-green-200') + ' rounded-lg flex items-center justify-center"><i class="fi fi-rr-' + (u.active ? 'ban' : 'check-circle') + ' text-xs"></i></button>';
    html += '</div></td></tr>';
  });
  html += '</tbody></table></div><div id="usersPagination"></div></div>';
  document.getElementById('mainContent').innerHTML = html;
  _renderPagination('usersPagination', _usersData.length, _usersPage, function (p) { _usersPage = p; buildUsersPage(); });
}
function openAddUserModal() {
  _ensureDepts().then(function () { _buildAddUserModal(); });
}
function _buildAddUserModal() {
  var deptSelect = '<div class="sm:col-span-2" id="uDeptWrap"><label class="form-label">หน่วยงาน (สำหรับพนักงาน)</label><select id="uDept" class="form-input"><option value="">-- เลือกหน่วยงาน --</option>' + _deptOpts('') + '</select></div>';
  var body = '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">'
    + fieldHTML('ชื่อ-นามสกุล *', 'uName', 'text', '', 'sm:col-span-2')
    + fieldHTML('Username *', 'uUsername', 'text', '')
    + '<div class="sm:col-span-2"><label class="form-label">Password * (อย่างน้อย 8 ตัว มีตัวอักษร+ตัวเลข)</label><input type="password" id="uPassword" class="form-input" placeholder="รหัสผ่าน"></div>'
    + fieldHTML('อีเมล', 'uEmail', 'email', '')
    + fieldHTML('เบอร์โทร', 'uPhone', 'text', '')
    + '<div class="sm:col-span-2"><label class="form-label">บทบาท *</label><select id="uRole" class="form-input" onchange="toggleDeptField()"><option value="employee">พนักงาน</option><option value="staff">เจ้าหน้าที่คลัง</option><option value="admin">ผู้ดูแลระบบ</option></select></div>'
    + deptSelect + '</div>';
  var footer = '<button onclick="closeModal()" class="btn-secondary">ยกเลิก</button><button onclick="submitAddUser()" class="btn-primary"><i class="fi fi-rr-user-add mr-1"></i>เพิ่ม</button>';
  openModal('เพิ่มผู้ใช้งาน', body, footer);
}
function openEditUserModal(id) {
  var u = _usersData.filter(function (x) { return x.id === id; })[0]; if (!u) return;
  _ensureDepts().then(function () { _buildEditUserModal(u); });
}
function _buildEditUserModal(u) {
  var deptSelect = '<div class="sm:col-span-2" id="uDeptWrap" style="' + (u.role === 'employee' ? '' : 'display:none') + '"><label class="form-label">หน่วยงาน</label><select id="uDept" class="form-input"><option value="">-- เลือกหน่วยงาน --</option>' + _deptOpts(u.department_id || '') + '</select></div>';
  var body = '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">'
    + fieldHTML('ชื่อ-นามสกุล *', 'uName', 'text', u.name, 'sm:col-span-2')
    + fieldHTML('Username', 'uUsername', 'text', u.username)
    + fieldHTML('อีเมล', 'uEmail', 'email', u.email)
    + fieldHTML('เบอร์โทร', 'uPhone', 'text', u.phone)
    + '<div class="sm:col-span-2"><label class="form-label">บทบาท</label><select id="uRole" class="form-input" onchange="toggleDeptField()"><option value="employee"' + (u.role === 'employee' ? ' selected' : '') + '>พนักงาน</option><option value="staff"' + (u.role === 'staff' ? ' selected' : '') + '>เจ้าหน้าที่คลัง</option><option value="admin"' + (u.role === 'admin' ? ' selected' : '') + '>ผู้ดูแลระบบ</option></select></div>'
    + deptSelect + '</div>';
  var footer = '<button onclick="closeModal()" class="btn-secondary">ยกเลิก</button><button onclick="submitEditUser(\'' + u.id + '\')" class="btn-primary"><i class="fi fi-rr-disk mr-1"></i>บันทึก</button>';
  openModal('แก้ไขผู้ใช้งาน', body, footer);
}
function toggleDeptField() {
  var role = (document.getElementById('uRole') || {}).value;
  var wrap = document.getElementById('uDeptWrap');
  if (wrap) wrap.style.display = (role === 'employee') ? '' : 'none';
}
function submitAddUser() {
  var data = { name: (document.getElementById('uName') || {}).value, username: (document.getElementById('uUsername') || {}).value, password: (document.getElementById('uPassword') || {}).value, email: (document.getElementById('uEmail') || {}).value, phone: (document.getElementById('uPhone') || {}).value, role: (document.getElementById('uRole') || {}).value, department_id: (document.getElementById('uDept') || {}).value || '' };
  if (!data.name || !data.username || !data.password) { showError('กรุณากรอกข้อมูลให้ครบ'); return; }
  if (data.role === 'employee' && !data.department_id) { showError('กรุณาเลือกหน่วยงานสำหรับพนักงาน'); return; }
  showLoading('กำลังเพิ่ม...');
  callAPI('addUser', data).then(function (res) { hideLoading(); if (res.success) { closeModal(); showSuccess(res.message); _usersData = []; renderUsers(); } else showError(res.message); })
    .catch(function (e) { hideLoading(); showError(e.message); });
}
function submitEditUser(id) {
  var data = { name: (document.getElementById('uName') || {}).value, email: (document.getElementById('uEmail') || {}).value, phone: (document.getElementById('uPhone') || {}).value, role: (document.getElementById('uRole') || {}).value, department_id: (document.getElementById('uDept') || {}).value || '' };
  if (data.role === 'employee' && !data.department_id) { showError('กรุณาเลือกหน่วยงานสำหรับพนักงาน'); return; }
  showLoading('กำลังบันทึก...');
  callAPI('updateUser', id, data).then(function (res) { hideLoading(); if (res.success) { closeModal(); showSuccess(res.message); _usersData = []; renderUsers(); } else showError(res.message); })
    .catch(function (e) { hideLoading(); showError(e.message); });
}
function doResetPassword(id) {
  showConfirm('รีเซ็ตรหัสผ่าน', 'ระบบจะสุ่มรหัสผ่านใหม่ให้ ดำเนินการต่อ?', function () {
    showLoading('กำลังรีเซ็ต...');
    callAPI('resetUserPassword', id).then(function (res) {
      hideLoading();
      if (res.success) { Swal.fire({ icon: 'success', title: 'รีเซ็ตสำเร็จ', html: 'รหัสผ่านชั่วคราว: <b style="font-size:18px;font-family:monospace">' + res.temp_password + '</b><br><br>กรุณาแจ้งผู้ใช้และให้เปลี่ยนรหัสทันที', confirmButtonText: 'รับทราบ' }); renderUsers(); }
      else showError(res.message);
    }).catch(function (e) { hideLoading(); showError(e.message); });
  }, 'รีเซ็ต');
}
function doToggleUser(id, name) {
  showConfirm('เปลี่ยนสถานะผู้ใช้', 'สลับสถานะการใช้งานของ "' + name + '"?', function () {
    showLoading('กำลังบันทึก...');
    callAPI('toggleUserActive', id).then(function (res) { hideLoading(); if (res.success) { showSuccess(res.message); renderUsers(); } else showError(res.message); })
      .catch(function (e) { hideLoading(); showError(e.message); });
  }, 'ยืนยัน');
}

// ===== PROFILE =====
function renderProfile() {
  showLoading('โหลดโปรไฟล์...');
  callAPI('getProfile').then(function (res) {
    hideLoading();
    if (!res.success) { showError(res.message); return; }
    var u = res.data;
    var html = '<div class="fade-in space-y-4 max-w-2xl">';
    html += '<div class="card p-5"><h3 class="font-semibold text-gray-700 mb-4 flex items-center gap-2"><i class="fi fi-rr-user text-navy-600"></i> ข้อมูลโปรไฟล์</h3>';
    html += '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">'
      + fieldHTML('ชื่อ-นามสกุล', 'pName', 'text', u.name, 'sm:col-span-2')
      + fieldHTML('Username', 'pUsername', 'text', u.username)
      + fieldHTML('บทบาท', 'pRole', 'text', ROLE_LABELS[u.role] || u.role)
      + fieldHTML('อีเมล', 'pEmail', 'email', u.email)
      + fieldHTML('เบอร์โทร', 'pPhone', 'text', u.phone)
      + '</div>';
    html += '<div class="flex justify-end mt-4"><button onclick="submitProfile()" class="btn-primary"><i class="fi fi-rr-disk mr-1"></i>บันทึก</button></div></div>';
    html += '<div class="card p-5"><h3 class="font-semibold text-gray-700 mb-4 flex items-center gap-2"><i class="fi fi-rr-lock text-navy-600"></i> เปลี่ยนรหัสผ่าน</h3>';
    html += '<div class="space-y-3">'
      + '<div><label class="form-label">รหัสผ่านเดิม</label><input type="password" id="cpOld" class="form-input"></div>'
      + '<div><label class="form-label">รหัสผ่านใหม่ (อย่างน้อย 8 ตัว มีตัวอักษร+ตัวเลข)</label><input type="password" id="cpNew" class="form-input"></div>'
      + '<div><label class="form-label">ยืนยันรหัสผ่านใหม่</label><input type="password" id="cpConfirm" class="form-input"></div>'
      + '</div><div class="flex justify-end mt-4"><button onclick="submitChangePassword()" class="btn-primary"><i class="fi fi-rr-key mr-1"></i>เปลี่ยนรหัสผ่าน</button></div></div>';
    html += '<div class="text-xs text-gray-400">เข้าสู่ระบบล่าสุด: ' + formatDateTime(u.last_login) + ' • สมัครเมื่อ: ' + formatDate(u.created_at) + '</div>';
    html += '</div>';
    document.getElementById('mainContent').innerHTML = html;
  }).catch(function (e) { hideLoading(); showError(e.message); });
}
function submitProfile() {
  var data = { name: (document.getElementById('pName') || {}).value, email: (document.getElementById('pEmail') || {}).value, phone: (document.getElementById('pPhone') || {}).value };
  showLoading('กำลังบันทึก...');
  callAPI('updateProfile', data).then(function (res) { hideLoading(); if (res.success) { showSuccess(res.message); AUTH.user.name = data.name; sessionStorage.setItem('sup_user', JSON.stringify(AUTH.user)); document.getElementById('sidebarName').textContent = data.name; } else showError(res.message); })
    .catch(function (e) { hideLoading(); showError(e.message); });
}
function submitChangePassword() {
  var oldP = (document.getElementById('cpOld') || {}).value;
  var newP = (document.getElementById('cpNew') || {}).value;
  var conf = (document.getElementById('cpConfirm') || {}).value;
  if (!oldP || !newP) { showError('กรุณากรอกรหัสผ่าน'); return; }
  if (newP !== conf) { showError('รหัสผ่านใหม่ไม่ตรงกัน'); return; }
  showLoading('กำลังเปลี่ยนรหัส...');
  callAPI('changePassword', oldP, newP).then(function (res) { hideLoading(); if (res.success) { showSuccess(res.message); document.getElementById('cpOld').value = ''; document.getElementById('cpNew').value = ''; document.getElementById('cpConfirm').value = ''; } else showError(res.message); })
    .catch(function (e) { hideLoading(); showError(e.message); });
}

// ===== SETTINGS =====
function renderSettings() {
  showLoading('โหลดการตั้งค่า...');
  callAPI('getConfig').then(function (res) {
    hideLoading();
    if (!res.success) { showError(res.message); return; }
    var cfg = res.data || {};
    var html = '<div class="fade-in space-y-4 max-w-3xl">';
    html += '<div class="card"><div class="card-header"><h3 class="font-semibold text-gray-700 flex items-center gap-2"><i class="fi fi-rr-building text-navy-600"></i> ข้อมูลหน่วยงาน</h3></div><div class="card-body grid grid-cols-1 sm:grid-cols-2 gap-4">';
    html += fieldHTML('ชื่อระบบ', 'cfgAppName', 'text', cfg.app_name || '', 'sm:col-span-2');
    html += fieldHTML('ชื่อหน่วยงาน', 'cfgOrgName', 'text', cfg.organization_name || '', 'sm:col-span-2');
    html += fieldHTML('ที่อยู่', 'cfgOrgAddr', 'text', cfg.organization_address || '', 'sm:col-span-2');
    html += fieldHTML('เบอร์โทร', 'cfgOrgPhone', 'text', cfg.organization_phone || '');
    html += fieldHTML('อีเมล', 'cfgOrgEmail', 'email', cfg.organization_email || '');
    html += '</div></div>';
    html += '<div class="card"><div class="card-header"><h3 class="font-semibold text-gray-700 flex items-center gap-2"><i class="fi fi-rr-layers text-navy-600"></i> การตั้งค่าสต็อก</h3></div><div class="card-body">';
    html += fieldHTML('ระดับสต็อกขั้นต่ำเริ่มต้น', 'cfgLowStock', 'number', cfg.low_stock_threshold || 5);
    html += '</div></div>';
    html += '<div class="card"><div class="card-header"><h3 class="font-semibold text-gray-700 flex items-center gap-2"><i class="fi fi-rr-bell text-navy-600"></i> การแจ้งเตือน Telegram</h3></div><div class="card-body space-y-4">';
    html += '<div class="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700"><p class="font-semibold mb-1">วิธีตั้งค่า Telegram Bot</p><ol class="list-decimal list-inside space-y-0.5"><li>ทัก @BotFather พิมพ์ /newbot</li><li>คัดลอก Token</li><li>สร้าง Group เพิ่ม Bot</li><li>เปิด api.telegram.org/bot[TOKEN]/getUpdates ดู chat_id</li></ol></div>';
    html += '<div class="flex items-center gap-3"><input type="checkbox" id="cfgTgEnabled" ' + (cfg.telegram_enabled ? 'checked' : '') + ' class="w-4 h-4 rounded accent-navy-700"><label for="cfgTgEnabled" class="text-sm font-medium text-gray-700">เปิดใช้งานการแจ้งเตือน</label></div>';
    html += fieldHTML('Bot Token', 'cfgTgToken', 'text', cfg.telegram_bot_token || '');
    html += fieldHTML('Chat ID', 'cfgTgChatId', 'text', cfg.telegram_chat_id || '');
    html += '<button onclick="doTestTelegram()" class="btn-secondary btn-sm"><i class="fi fi-rr-paper-plane"></i> ส่ง Test Message</button>';
    html += '</div></div>';
    html += '<div class="flex justify-end gap-3"><button onclick="renderSettings()" class="btn-secondary"><i class="fi fi-rr-refresh mr-1"></i>รีเซ็ต</button><button onclick="saveSettings()" class="btn-primary"><i class="fi fi-rr-disk mr-1"></i>บันทึกการตั้งค่า</button></div>';
    html += '</div>';
    document.getElementById('mainContent').innerHTML = html;
  }).catch(function (e) { hideLoading(); showError(e.message); });
}
function saveSettings() {
  var data = {
    app_name: (document.getElementById('cfgAppName') || {}).value || '',
    organization_name: (document.getElementById('cfgOrgName') || {}).value || '',
    organization_address: (document.getElementById('cfgOrgAddr') || {}).value || '',
    organization_phone: (document.getElementById('cfgOrgPhone') || {}).value || '',
    organization_email: (document.getElementById('cfgOrgEmail') || {}).value || '',
    telegram_enabled: (document.getElementById('cfgTgEnabled') || {}).checked || false,
    telegram_bot_token: (document.getElementById('cfgTgToken') || {}).value || '',
    telegram_chat_id: (document.getElementById('cfgTgChatId') || {}).value || '',
    low_stock_threshold: parseInt((document.getElementById('cfgLowStock') || {}).value) || 5
  };
  showLoading('กำลังบันทึก...');
  callAPI('saveConfig', data).then(function (res) { hideLoading(); if (res.success) { showSuccess(res.message); document.getElementById('sidebarAppName').textContent = data.app_name || 'ระบบวัสดุสิ้นเปลือง'; } else showError(res.message); })
    .catch(function (e) { hideLoading(); showError(e.message); });
}
function doTestTelegram() {
  showLoading('กำลังส่ง...');
  callAPI('testTelegram').then(function (res) { hideLoading(); if (res.success) showSuccess(res.message); else showError(res.message); })
    .catch(function (e) { hideLoading(); showError(e.message); });
}

// ===== PAGINATION =====
function _renderPagination(containerId, total, currentPage, onPageClick) {
  var container = document.getElementById(containerId);
  if (!container) return;
  var totalPages = Math.ceil(total / ITEMS_PER_PAGE);
  if (totalPages <= 1) { container.innerHTML = ''; return; }
  var html = '<div class="flex items-center justify-between mt-3"><p class="text-xs text-gray-500">ทั้งหมด ' + total + ' รายการ</p><div class="flex gap-1">';
  if (currentPage > 1) html += '<button onclick="_gotoPage(' + (currentPage - 1) + ')" class="w-8 h-8 bg-white border rounded-lg text-sm hover:bg-gray-50">&lt;</button>';
  var start = Math.max(1, currentPage - 2), end = Math.min(totalPages, currentPage + 2);
  for (var i = start; i <= end; i++) {
    html += '<button onclick="_gotoPage(' + i + ')" class="w-8 h-8 ' + (i === currentPage ? 'bg-navy-700 text-white' : 'bg-white border hover:bg-gray-50') + ' rounded-lg text-sm">' + i + '</button>';
  }
  if (currentPage < totalPages) html += '<button onclick="_gotoPage(' + (currentPage + 1) + ')" class="w-8 h-8 bg-white border rounded-lg text-sm hover:bg-gray-50">&gt;</button>';
  html += '</div></div>';
  container.innerHTML = html;
  container._onPageClick = onPageClick;
}
function _gotoPage(p) {
  // หา container ที่มี _onPageClick
  ['itemsPagination', 'usersPagination'].forEach(function (id) {
    var c = document.getElementById(id);
    if (c && c._onPageClick) c._onPageClick(p);
  });
}

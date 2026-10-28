/* ============================================================
   TOP TRAINING INSTITUTE - Accounts, Messaging & Settings
   Session-based auth against the PHP API in /api.
   - Admin login is the bootstrapped account in api/config.php.
   - Students & users self-register and get an account area with
     a message thread to the admin plus profile/password settings.
   - The admin dashboard gains a Messages inbox and Site Settings.
   Depends on helpers from js/app.js (ttiIcons) but degrades
   gracefully when the PHP API is unavailable.
   ============================================================ */

var TTI_AUTH_API = 'api/';
var TTI_AUTH = { user: null, ready: false, online: false, pendingAdmin: false, adminThreadUid: null };

// ---------- tiny helpers ----------
function ttiEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function ttiAuthIcons() { if (typeof lucide !== 'undefined') lucide.createIcons(); }

function ttiApi(ep, opts) {
  opts = opts || {};
  opts.credentials = 'same-origin';
  if (opts.body && typeof opts.body !== 'string') {
    opts.method = opts.method || 'POST';
    opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    opts.body = JSON.stringify(opts.body);
  }
  return fetch(TTI_AUTH_API + ep, opts).then(function (r) {
    return r.json().then(function (d) { d.__status = r.status; return d; });
  });
}

function ttiShort(dt) { return (dt || '').toString().slice(0, 16); }

// ============================================================
// INIT
// ============================================================
function TTIAuthInit() {
  ttiPopulateRegCourses();
  // No server -> no auth (static / node preview). Hide auth affordances.
  ttiApi('auth.php?action=me')
    .then(function (d) {
      TTI_AUTH.ready = true;
      TTI_AUTH.user = (d && d.ok) ? d.user : null;
      TTI_AUTH.online = !!(d && d.ok);
      ttiRenderAuthNav();
    })
    .catch(function () { TTI_AUTH.online = false; ttiRenderAuthNav(); });
}

function ttiPopulateRegCourses() {
  var sel = document.getElementById('regCourse');
  if (!sel) return;
  var cats = (typeof courseCategories !== 'undefined' ? courseCategories : []);
  sel.length = 0;
  sel.add(new Option('General Training', ''));
  cats.forEach(function (c) { sel.add(new Option(c.title, c.title)); });
}

// ============================================================
// NAV RENDERING (desktop + mobile)
// ============================================================
function ttiRenderAuthNav() {
  var u = TTI_AUTH.user;
  var cta = document.getElementById('authNavCta');
  var mob = document.getElementById('authNavMobile');

  if (!TTI_AUTH.online) {
    if (cta) cta.innerHTML = '';
    if (mob) mob.innerHTML = '';
    return;
  }

  if (u) {
    var label = ttiEsc(u.name.split(' ')[0]);
    if (cta) cta.innerHTML =
      '<button onclick="openAccountModal()" class="border border-brand-500/50 text-brand-400 hover:bg-brand-500/10 px-3 py-2 rounded-xl text-sm font-semibold transition inline-flex items-center gap-1.5">' +
        '<i data-lucide="user-round" class="w-4 h-4"></i> ' + label + '</button>' +
      '<button onclick="TTILogout()" class="text-slate-400 hover:text-white px-2 py-2 rounded-xl text-sm font-semibold transition" title="Sign out">' +
        '<i data-lucide="log-out" class="w-4 h-4"></i></button>';
    if (mob) mob.innerHTML =
      '<button onclick="openAccountModal(); toggleMobileMenu();" class="w-full bg-brand-500/10 border border-brand-500/40 text-brand-400 font-bold py-2.5 rounded-xl text-center">My Account (' + label + ')</button>' +
      '<button onclick="TTILogout(); toggleMobileMenu();" class="w-full bg-slate-800 text-slate-200 font-semibold py-2.5 rounded-xl text-center">Sign out</button>';
  } else {
    if (cta) cta.innerHTML =
      '<button onclick="openAuthModal(\'login\')" class="border border-slate-600 text-slate-200 hover:text-white hover:border-brand-500 px-3 py-2 rounded-xl text-sm font-semibold transition">Login</button>' +
      '<button onclick="openAuthModal(\'register\')" class="bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-xl text-sm font-semibold transition">Register</button>';
    if (mob) mob.innerHTML =
      '<button onclick="openAuthModal(\'login\'); toggleMobileMenu();" class="w-full bg-slate-800 text-white font-semibold py-2.5 rounded-xl text-center">Login</button>' +
      '<button onclick="openAuthModal(\'register\'); toggleMobileMenu();" class="w-full bg-brand-500/20 border border-brand-500/40 text-brand-400 font-bold py-2.5 rounded-xl text-center">Create Account</button>';
  }
  ttiAuthIcons();
}

// ============================================================
// AUTH MODAL
// ============================================================
function openAuthModal(tab) {
  var m = document.getElementById('authModal');
  if (!m) return;
  m.classList.remove('hidden');
  ttiAuthError('');
  switchAuthTab(tab || 'login');
  ttiAuthIcons();
}
function closeAuthModal() { document.getElementById('authModal').classList.add('hidden'); }

function switchAuthTab(tab) {
  var login = tab === 'login';
  document.getElementById('authLoginForm').classList.toggle('hidden', !login);
  document.getElementById('authRegisterForm').classList.toggle('hidden', login);
  var lt = document.getElementById('authTabLogin'), rt = document.getElementById('authTabRegister');
  lt.className = 'flex-1 py-2 rounded-lg text-xs font-bold ' + (login ? 'bg-brand-500 text-navy-950' : 'text-slate-400');
  rt.className = 'flex-1 py-2 rounded-lg text-xs font-bold ' + (!login ? 'bg-brand-500 text-navy-950' : 'text-slate-400');
}

function ttiAuthError(msg) {
  var e = document.getElementById('authError');
  if (!e) return;
  e.innerText = msg || '';
  e.classList.toggle('hidden', !msg);
}

function TTILogin(ev) {
  ev.preventDefault();
  ttiAuthError('');
  var email = document.getElementById('loginEmail').value.trim();
  var password = document.getElementById('loginPassword').value;
  if (!email || !password) { ttiAuthError('Enter your email and password.'); return false; }
  ttiApi('auth.php', { body: { action: 'login', email: email, password: password } })
    .then(function (d) {
      if (!d.ok) { ttiAuthError(d.error || 'Login failed.'); return; }
      TTI_AUTH.user = d.user;
      closeAuthModal();
      ttiRenderAuthNav();
      ttiAfterAuthSuccess();
    })
    .catch(function () { ttiAuthError('Cannot reach the server. Is Apache + MySQL running?'); });
  return false;
}

function TTIRegister(ev) {
  ev.preventDefault();
  ttiAuthError('');
  var payload = {
    action: 'register',
    name: document.getElementById('regName').value.trim(),
    email: document.getElementById('regEmail').value.trim(),
    phone: document.getElementById('regPhone').value.trim(),
    course: document.getElementById('regCourse').value,
    role: document.getElementById('regRole').value,
    password: document.getElementById('regPassword').value
  };
  if (!payload.name || !payload.email) { ttiAuthError('Name and email are required.'); return false; }
  if (payload.password.length < 6) { ttiAuthError('Password must be at least 6 characters.'); return false; }
  ttiApi('auth.php', { body: payload })
    .then(function (d) {
      if (!d.ok) { ttiAuthError(d.error || 'Registration failed.'); return; }
      TTI_AUTH.user = d.user;
      closeAuthModal();
      ttiRenderAuthNav();
      openAccountModal();
    })
    .catch(function () { ttiAuthError('Cannot reach the server.'); });
  return false;
}

function TTILogout() {
  ttiApi('auth.php', { body: { action: 'logout' } }).then(function () {
    TTI_AUTH.user = null;
    ttiRenderAuthNav();
    if (typeof showPublicView === 'function') showPublicView();
    closeAccountModal();
  });
}

// If an admin was trying to reach the dashboard, complete the switch.
function ttiAfterAuthSuccess() {
  if (TTI_AUTH.pendingAdmin && TTI_AUTH.user && TTI_AUTH.user.role === 'admin') {
    TTI_AUTH.pendingAdmin = false;
    ttiEnterAdminView();
  }
}

function ttiEnterAdminView() {
  var pub = document.getElementById('publicView');
  var admin = document.getElementById('adminDashboardView');
  var txt = document.getElementById('viewToggleText');
  var nav = document.getElementById('publicNav');
  var cta = document.getElementById('publicNavCta');
  if (pub) pub.classList.add('hidden');
  if (admin) admin.classList.remove('hidden');
  if (txt) txt.innerText = 'Switch to Public Website';
  if (nav) nav.classList.add('hidden');
  if (cta) cta.classList.add('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Called from toggleSystemMode() before revealing the admin dashboard.
// Returns true to allow access, or false (and opens login) to block.
function TTIAuthRequireAdmin() {
  if (!TTI_AUTH.online) return true; // static preview: don't lock the demo
  if (TTI_AUTH.user && TTI_AUTH.user.role === 'admin') return true;
  TTI_AUTH.pendingAdmin = true;
  openAuthModal('login');
  document.getElementById('authHint').innerText = 'Administrator access — sign in with the admin account.';
  return false;
}

// ============================================================
// ACCOUNT MODAL (student / user): messages + settings
// ============================================================
function openAccountModal() {
  var u = TTI_AUTH.user;
  if (!u) { openAuthModal('login'); return; }
  var m = document.getElementById('accountModal');
  if (!m) return;
  document.getElementById('accountChip').innerText = u.role.toUpperCase();
  document.getElementById('accountEmail').innerText = u.email;
  // Prime settings fields from cached user while the profile loads.
  document.getElementById('pfName').value = u.name || '';
  document.getElementById('pfEmail').value = u.email || '';
  document.getElementById('pfPhone').value = u.phone || '';
  document.getElementById('pfCourse').value = u.course || '';
  m.classList.remove('hidden');
  switchAccountTab('messages');
  ttiLoadMyThread();
  ttiAuthIcons();
}
function closeAccountModal() { document.getElementById('accountModal').classList.add('hidden'); }

function switchAccountTab(tab) {
  var msg = tab === 'messages';
  document.getElementById('accPanelMessages').classList.toggle('hidden', !msg);
  document.getElementById('accPanelSettings').classList.toggle('hidden', msg);
  var mt = document.getElementById('accTabMessages'), st = document.getElementById('accTabSettings');
  mt.className = 'flex-1 py-2 rounded-lg text-xs font-bold ' + (msg ? 'bg-brand-500 text-navy-950' : 'text-slate-400');
  st.className = 'flex-1 py-2 rounded-lg text-xs font-bold ' + (!msg ? 'bg-brand-500 text-navy-950' : 'text-slate-400');
}

function ttiLoadMyThread() {
  ttiApi('messages.php?action=list')
    .then(function (d) {
      var box = document.getElementById('accThread');
      if (!d.ok || !box) return;
      var rows = d.thread || [];
      if (!rows.length) {
        box.innerHTML = '<p class="text-slate-500 text-xs text-center py-6">No messages yet. Write to the admin below.</p>';
        return;
      }
      box.innerHTML = rows.map(function (m) {
        var mine = m.sender === 'user';
        return '<div class="flex ' + (mine ? 'justify-end' : 'justify-start') + '">' +
          '<div class="max-w-[85%] rounded-xl px-3 py-2 text-xs ' +
            (mine ? 'bg-brand-500 text-navy-950' : 'bg-navy-900 border border-slate-700 text-slate-200') + '">' +
            (m.subject ? '<p class="font-bold mb-0.5">' + ttiEsc(m.subject) + '</p>' : '') +
            '<p class="leading-relaxed">' + ttiEsc(m.body) + '</p>' +
            '<p class="opacity-60 text-[10px] mt-1">' + (mine ? 'You' : 'Admin') + ' · ' + ttiShort(m.created_at) + '</p>' +
          '</div></div>';
      }).join('');
      // Mark admin replies as read on our side.
      ttiApi('messages.php', { body: { action: 'mark_read' } });
    })
    .catch(function () {});
}

function TTISendMessage() {
  var ta = document.getElementById('accCompose');
  var body = ta.value.trim();
  var status = document.getElementById('accMsgStatus');
  if (!body) { status.innerText = 'Type a message first.'; status.className = 'text-xs font-semibold text-amber-400'; return; }
  status.innerText = 'Sending...'; status.className = 'text-xs font-semibold text-slate-400';
  ttiApi('messages.php', { body: { action: 'send', body: body } })
    .then(function (d) {
      if (!d.ok) { status.innerText = d.error || 'Failed.'; status.className = 'text-xs font-semibold text-red-400'; return; }
      ta.value = '';
      status.innerText = 'Sent — the admin will reply here.'; status.className = 'text-xs font-semibold text-emerald-400';
      ttiLoadMyThread();
    })
    .catch(function () { status.innerText = 'Cannot reach server.'; status.className = 'text-xs font-semibold text-red-400'; });
}

function TTISaveProfile() {
  var status = document.getElementById('pfMsg');
  var payload = {
    action: 'update_profile',
    name: document.getElementById('pfName').value.trim(),
    email: document.getElementById('pfEmail').value.trim(),
    phone: document.getElementById('pfPhone').value.trim(),
    course: document.getElementById('pfCourse').value.trim()
  };
  status.innerText = 'Saving...'; status.className = 'text-xs font-semibold text-slate-400';
  ttiApi('settings.php', { body: payload })
    .then(function (d) {
      if (!d.ok) { status.innerText = d.error || 'Failed.'; status.className = 'text-xs font-semibold text-red-400'; return; }
      TTI_AUTH.user = d.user;
      status.innerText = 'Profile saved.'; status.className = 'text-xs font-semibold text-emerald-400';
      document.getElementById('accountEmail').innerText = d.user.email;
      ttiRenderAuthNav();
    })
    .catch(function () { status.innerText = 'Cannot reach server.'; status.className = 'text-xs font-semibold text-red-400'; });
}

function TTIChangePassword() {
  var status = document.getElementById('pwMsg');
  var current = document.getElementById('pwCurrent').value;
  var neu = document.getElementById('pwNew').value;
  if (neu.length < 6) { status.innerText = 'New password too short.'; status.className = 'text-xs font-semibold text-red-400'; return; }
  status.innerText = 'Updating...'; status.className = 'text-xs font-semibold text-slate-400';
  ttiApi('settings.php', { body: { action: 'change_password', current: current, new: neu } })
    .then(function (d) {
      if (!d.ok) { status.innerText = d.error || 'Failed.'; status.className = 'text-xs font-semibold text-red-400'; return; }
      document.getElementById('pwCurrent').value = ''; document.getElementById('pwNew').value = '';
      status.innerText = 'Password updated.'; status.className = 'text-xs font-semibold text-emerald-400';
    })
    .catch(function () { status.innerText = 'Cannot reach server.'; status.className = 'text-xs font-semibold text-red-400'; });
}

// ============================================================
// ADMIN: messages inbox + site settings (loaded on tab open)
// ============================================================
function TTIAdminTabHook(tabId) {
  if (!TTI_AUTH.online) return;
  if (tabId === 'messages') TTILoadAdminInbox();
  if (tabId === 'settings') TTILoadSiteSettings();
}

function TTILoadAdminInbox() {
  var list = document.getElementById('adminThreadList');
  if (!list) return;
  list.innerHTML = '<p class="p-6 text-center text-slate-500 text-xs">Loading inbox...</p>';
  ttiApi('messages.php?action=list')
    .then(function (d) {
      if (!d.ok) { list.innerHTML = '<p class="p-6 text-center text-red-400 text-xs">' + ttiEsc(d.error || 'Failed to load.') + '</p>'; return; }
      var badge = document.getElementById('adminMsgBadge');
      if (badge) { badge.innerText = d.totalUnread; badge.classList.toggle('hidden', !d.totalUnread); }
      var rows = d.inbox || [];
      if (!rows.length) { list.innerHTML = '<p class="p-6 text-center text-slate-500 text-xs">No conversations yet.</p>'; return; }
      list.innerHTML = rows.map(function (r) {
        return '<button onclick="TTIOpenAdminThread(' + r.user_id + ')" class="w-full text-left p-4 hover:bg-slate-800/60 transition">' +
          '<div class="flex items-center justify-between">' +
            '<span class="font-bold text-white text-sm">' + ttiEsc(r.name) + '</span>' +
            (r.unread ? '<span class="text-[10px] bg-red-500 text-white font-bold px-2 py-0.5 rounded-full">' + r.unread + '</span>' : '') +
          '</div>' +
          '<p class="text-[10px] text-slate-500">' + ttiEsc(r.email) + ' · ' + ttiEsc(r.role) + '</p>' +
          '<p class="text-xs text-slate-400 mt-1 truncate">' + ttiEsc(r.last_body) + '</p>' +
        '</button>';
      }).join('');
    })
    .catch(function () { list.innerHTML = '<p class="p-6 text-center text-red-400 text-xs">Cannot reach server.</p>'; });
}

function TTIOpenAdminThread(uid) {
  TTI_AUTH.adminThreadUid = uid;
  var view = document.getElementById('adminThreadView');
  view.innerHTML = '<p class="text-slate-500 text-xs m-auto">Loading...</p>';
  ttiApi('messages.php?action=thread&user_id=' + uid)
    .then(function (d) {
      if (!d.ok) { view.innerHTML = '<p class="text-red-400 text-xs">' + ttiEsc(d.error) + '</p>'; return; }
      var rows = d.thread || [];
      var head = '<div class="border-b border-slate-800 pb-2"><p class="font-bold text-white text-sm">' +
        ttiEsc(d.user.full_name) + '</p><p class="text-[10px] text-slate-500">' + ttiEsc(d.user.email) + '</p></div>';
      var body = rows.map(function (m) {
        var admin = m.sender === 'admin';
        return '<div class="flex ' + (admin ? 'justify-end' : 'justify-start') + '">' +
          '<div class="max-w-[85%] rounded-xl px-3 py-2 text-xs ' +
            (admin ? 'bg-emerald-600 text-white' : 'bg-navy-950 border border-slate-700 text-slate-200') + '">' +
            (m.subject ? '<p class="font-bold mb-0.5">' + ttiEsc(m.subject) + '</p>' : '') +
            '<p class="leading-relaxed">' + ttiEsc(m.body) + '</p>' +
            '<p class="opacity-60 text-[10px] mt-1">' + (admin ? 'Admin' : ttiEsc(d.user.full_name.split(' ')[0])) + ' · ' + ttiShort(m.created_at) + '</p>' +
          '</div></div>';
      }).join('');
      view.innerHTML = head + '<div class="space-y-2 flex-grow overflow-y-auto">' + (body || '<p class="text-slate-500 text-xs">No messages.</p>') + '</div>' +
        '<div class="flex gap-2 pt-2 border-t border-slate-800">' +
          '<input id="adminReply" class="flex-1 bg-navy-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white" placeholder="Type a reply...">' +
          '<button onclick="TTISendAdminReply()" class="bg-brand-500 hover:bg-brand-600 text-navy-950 font-bold text-xs px-3 rounded-lg">Reply</button>' +
        '</div>';
      ttiAuthIcons();
    })
    .catch(function () { view.innerHTML = '<p class="text-red-400 text-xs">Cannot reach server.</p>'; });
}

function TTISendAdminReply() {
  var inp = document.getElementById('adminReply');
  var body = (inp.value || '').trim();
  if (!body || !TTI_AUTH.adminThreadUid) return;
  ttiApi('messages.php', { body: { action: 'send', user_id: TTI_AUTH.adminThreadUid, body: body } })
    .then(function (d) { if (d.ok) TTIOpenAdminThread(TTI_AUTH.adminThreadUid); });
}

function TTILoadSiteSettings() {
  ttiApi('settings.php?action=site')
    .then(function (d) {
      if (!d.ok) return;
      var s = d.settings;
      document.getElementById('setInstName').value = s.institution_name || '';
      document.getElementById('setCurrency').value = s.currency || '';
      document.getElementById('setRegFee').value = s.registration_fee || 0;
      document.getElementById('setCertFee').value = s.certificate_fee || 0;
    });
}

function TTISaveSiteSettings() {
  var status = document.getElementById('adminSettingsMsg');
  status.innerText = 'Saving...'; status.className = 'text-xs font-semibold text-slate-400';
  ttiApi('settings.php', { body: {
    action: 'save_settings',
    institution_name: document.getElementById('setInstName').value,
    currency: document.getElementById('setCurrency').value,
    registration_fee: parseInt(document.getElementById('setRegFee').value, 10) || 0,
    certificate_fee: parseInt(document.getElementById('setCertFee').value, 10) || 0
  } })
    .then(function (d) {
      if (!d.ok) { status.innerText = d.error || 'Failed.'; status.className = 'text-xs font-semibold text-red-400'; return; }
      status.innerText = 'Settings saved.'; status.className = 'text-xs font-semibold text-emerald-400';
    })
    .catch(function () { status.innerText = 'Cannot reach server.'; status.className = 'text-xs font-semibold text-red-400'; });
}

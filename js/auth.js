/* ==============================================================
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
var TTI_AUTH = { user: null, ready: false, online: false, pendingAdmin: false, adminThreadUid: null, pendingIntent: null, pendingResume: null };

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
  return fetch(TTI_AUTH_API + String(ep).replace(/\.php(?=$|\?)/, ''), opts).then(function (r) {
    // Read as text first so we can give a helpful message when the response
    // isn't JSON (e.g. raw PHP source or an Apache/PHP error page).
    return r.text().then(function (txt) {
      var d;
      try { d = JSON.parse(txt); }
      catch (e) { d = { ok: false, __badResponse: true, error: ttiBadResponseMsg(txt, r.status) }; }
      d.__status = r.status;
      return d;
    });
  });
}

// Turn a non-JSON API response into an actionable message. The usual cause
// is opening the site outside Apache (Node preview on :8123 or a file://
// path), so api/*.php is served as plain text instead of being executed.
function ttiBadResponseMsg(txt, status) {
  var body = String(txt || '');
  if (status === 405) {
    return 'The server rejected the login/register POST (HTTP 405). This happens when the page is opened through the IDE preview panel or a proxy that only forwards GET. Open the site directly in Chrome/Edge at http://localhost/TOP-TRAINING-INSTITUTE-CENTER/ and press Ctrl+F5.';
  }
  if (/^\s*<\?php/i.test(body) || /TtiApi|__DIR__|\brequire\b.*auth\.php/i.test(body)) {
    return 'PHP is not running for this page \u2014 the API file was returned as text. Open the site through Apache at http://localhost/TOP-TRAINING-INSTITUTE-CENTER/ (not the node preview on :8123 or a file:// path).';
  }
  if (/fatal error|parse error|uncaught|undefined (index|variable)|warning:/i.test(body)) {
    var line = (body.replace(/<[^>]+>/g, ' ').match(/(fatal error|parse error|uncaught[^\n<]*|undefined[^\n<]*|warning:[^\n<]*)/i) || [''])[0];
    return 'The PHP API returned an error: ' + line.slice(0, 200) + '. Check that MySQL is running and the \u201ctop_training_center\u201d database exists.';
  }
  if (/<!doctype html|<html/i.test(body)) {
    return 'Unexpected HTML response (status ' + status + '). Double-check the URL starts with http://localhost/TOP-TRAINING-INSTITUTE-CENTER/.';
  }
  return 'The server returned an unexpected response (status ' + status + '). Is Apache + MySQL running and opened via http://localhost/TOP-TRAINING-INSTITUTE-CENTER/?';
}

// Message for a rejected fetch (network-level failure: file:// origin, or
// Apache not reachable at all).
function ttiNetErrMsg() {
  if (window.location && window.location.protocol === 'file:') {
    return 'You opened index.html directly (file://). Use http://localhost/TOP-TRAINING-INSTITUTE-CENTER/ so PHP can run.';
  }
  return 'Cannot reach the server. Make sure Apache + MySQL are running and open the site at http://localhost/TOP-TRAINING-INSTITUTE-CENTER/.';
}

function ttiShort(dt) { return (dt || '').toString().slice(0, 16); }

// ============================================================
// INIT
// ============================================================
function TTIAuthInit() {
  ttiPopulateRegCourses();
  ttiRenderViewEntry();
  // No server -> no auth (static / node preview). Hide auth affordances.
  ttiApi('auth.php?action=me')
    .then(function (d) {
      TTI_AUTH.ready = true;
      TTI_AUTH.user = (d && d.ok) ? d.user : null;
      TTI_AUTH.online = !!(d && d.ok);
      ttiRenderAuthNav();
      ttiRenderViewEntry();
    })
    .catch(function () { TTI_AUTH.online = false; ttiRenderAuthNav(); ttiRenderViewEntry(); });
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
// Logged-out nav markup. Rendered whether or not the PHP API is reachable,
// so the Login / Register buttons always appear. When offline, submitting
// the form surfaces a "cannot reach server" message instead of a crash.
function ttiLoggedOutCta() {
  return '<button onclick="openAuthModal(\'login\')" class="border border-slate-600 text-slate-200 hover:text-white hover:border-brand-500 px-3 py-2 rounded-xl text-sm font-semibold transition">Login</button>' +
    '<button onclick="openAuthModal(\'register\')" class="bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-xl text-sm font-semibold transition">Register</button>';
}
function ttiLoggedOutMobile() {
  return '<button onclick="openAuthModal(\'login\'); toggleMobileMenu();" class="w-full bg-slate-800 text-white font-semibold py-2.5 rounded-xl text-center">Login</button>' +
    '<button onclick="openAuthModal(\'register\'); toggleMobileMenu();" class="w-full bg-brand-500/20 border border-brand-500/40 text-brand-400 font-bold py-2.5 rounded-xl text-center">Create Account</button>';
}

function ttiRenderAuthNav() {
  var u = TTI_AUTH.user;
  var cta = document.getElementById('authNavCta');
  var mob = document.getElementById('authNavMobile');

  // Not signed in (server reachable or not): always show Login / Register.
  if (!u) {
    if (cta) cta.innerHTML = ttiLoggedOutCta();
    if (mob) mob.innerHTML = ttiLoggedOutMobile();
    ttiAuthIcons();
    return;
  }

  var label = ttiEsc(u.name.split(' ')[0]);
  if (cta) cta.innerHTML =
    '<button onclick="openAccountModal()" class="border border-brand-500/50 text-brand-400 hover:bg-brand-500/10 px-3 py-2 rounded-xl text-sm font-semibold transition inline-flex items-center gap-1.5">' +
      '<i data-lucide="user-round" class="w-4 h-4"></i> ' + label + '</button>' +
    '<button onclick="TTILogout()" class="border border-slate-600 text-slate-300 hover:text-white hover:border-red-500/60 hover:bg-red-500/10 px-3 py-2 rounded-xl text-sm font-semibold transition inline-flex items-center gap-1.5" title="Sign out">' +
      '<i data-lucide="log-out" class="w-4 h-4"></i> Logout</button>';
  if (mob) mob.innerHTML =
    '<button onclick="openAccountModal(); toggleMobileMenu();" class="w-full bg-brand-500/10 border border-brand-500/40 text-brand-400 font-bold py-2.5 rounded-xl text-center">My Account (' + label + ')</button>' +
    '<button onclick="TTILogout(); toggleMobileMenu();" class="w-full bg-slate-800 text-slate-200 font-semibold py-2.5 rounded-xl text-center">Sign out</button>';
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
  var bar = document.getElementById('authTabBar'); if (bar) bar.classList.remove('hidden');
  var forgot = document.getElementById('authForgotForm'); if (forgot) forgot.classList.add('hidden');
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

// ---- Forgot password (admin-reset flow) ----
function TTIShowForgot() {
  var bar = document.getElementById('authTabBar'); if (bar) bar.classList.add('hidden');
  document.getElementById('authLoginForm').classList.add('hidden');
  document.getElementById('authRegisterForm').classList.add('hidden');
  var f = document.getElementById('authForgotForm'); if (f) f.classList.remove('hidden');
  ttiAuthError('');
  var m = document.getElementById('authForgotMsg'); if (m) { m.innerText = ''; m.className = 'text-xs font-semibold text-center'; }
  var hint = document.getElementById('authHint'); if (hint) hint.innerText = 'Reset your password';
  ttiAuthIcons();
}
function TTIShowLogin() {
  var hint = document.getElementById('authHint'); if (hint) hint.innerText = 'Sign in or create a student / user account.';
  switchAuthTab('login');
}
function TTIForgotPassword(ev) {
  ev.preventDefault();
  var email = (document.getElementById('forgotEmail').value || '').trim();
  var m = document.getElementById('authForgotMsg');
  function say(txt, cls) { if (m) { m.innerText = txt; m.className = 'text-xs font-semibold text-center ' + cls; } }
  if (!email) { say('Enter your registered email.', 'text-red-400'); return false; }
  say('Sending...', 'text-slate-400');
  ttiApi('auth.php', { body: { action: 'forgot_password', email: email } })
    .then(function (d) {
      if (!d.ok) { say(d.error || 'Failed to send request.', 'text-red-400'); return; }
      say(d.message || 'Request sent to the administrator.', 'text-emerald-400');
      document.getElementById('forgotEmail').value = '';
    })
    .catch(function () { say(ttiNetErrMsg(), 'text-red-400'); });
  return false;
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
      ttiResumeAfterAuth();
    })
    .catch(function () { ttiAuthError(ttiNetErrMsg()); });
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
      ttiRenderViewEntry();
      if (TTI_AUTH.pendingResume) { ttiResumeAfterAuth(); }
      else { openAccountModal(); }
    })
    .catch(function () { ttiAuthError(ttiNetErrMsg()); });
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

// After a successful login: administrators land on the dashboard,
// everyone else just gets the refreshed top-bar control.
function ttiAfterAuthSuccess() {
  if (TTI_AUTH.user && TTI_AUTH.user.role === 'admin') {
    ttiEnterAdminView();
  } else {
    ttiRenderViewEntry();
  }
}

// Is the admin dashboard currently the visible view?
function ttiInAdminView() {
  var admin = document.getElementById('adminDashboardView');
  return !!admin && !admin.classList.contains('hidden');
}

function ttiEnterAdminView() {
  var pub = document.getElementById('publicView');
  var admin = document.getElementById('adminDashboardView');
  var nav = document.getElementById('publicNav');
  var cta = document.getElementById('publicNavCta');
  if (pub) pub.classList.add('hidden');
  if (admin) admin.classList.remove('hidden');
  if (nav) nav.classList.add('hidden');
  if (cta) cta.classList.add('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  ttiRenderViewEntry();
}

function ttiExitAdminView() {
  if (typeof showPublicView === 'function') showPublicView();
  ttiRenderViewEntry();
}

// Renders the single top-bar control that replaced the old "Switch to Admin
// Dashboard" button: a Login button for visitors, a dashboard toggle for admins.
function ttiRenderViewEntry() {
  var area = document.getElementById('viewEntryArea');
  if (!area) return;
  var u = TTI_AUTH.user;
  var btn = 'inline-flex items-center gap-2 font-bold px-3.5 py-1.5 rounded-full text-xs transition-all active:scale-95';
  if (u && u.role === 'admin') {
    area.innerHTML = ttiInAdminView()
      ? '<button onclick="ttiExitAdminView()" class="' + btn + ' border border-slate-600 text-slate-200 hover:text-white hover:border-brand-500"><i data-lucide="globe" class="w-3.5 h-3.5"></i> Public Website</button>'
      : '<button onclick="ttiEnterAdminView()" class="' + btn + ' bg-brand-500 hover:bg-brand-600 text-navy-950 shadow-md shadow-brand-500/20"><i data-lucide="layout-dashboard" class="w-3.5 h-3.5"></i> Admin Dashboard</button>';
  } else if (u) {
    // Signed in as student/user: the nav already shows Account + Logout.
    area.innerHTML = '';
  } else {
    area.innerHTML = '<button onclick="TTIViewEntryClick()" class="' + btn + ' bg-brand-500 hover:bg-brand-600 text-navy-950 shadow-md shadow-brand-500/20"><i data-lucide="log-in" class="w-3.5 h-3.5"></i> Login</button>';
  }
  ttiAuthIcons();
}

// Top-bar Login button: opens the login modal (an admin sign-in lands on the
// dashboard via ttiAfterAuthSuccess).
function TTIViewEntryClick() {
  openAuthModal('login');
  var hint = document.getElementById('authHint');
  if (hint) hint.innerText = 'Sign in to continue \u2014 administrators are taken to the dashboard.';
}

// Gate a student-facing action (Pay Fees, Student Portal, classes,
// certificate) behind an account. Returns true to allow, or false and
// opens the auth modal prompting the visitor to log in / create an
// account. When the API is offline we don't lock the static demo.
function TTIRequireAuth(intent, resume) {
  if (!TTI_AUTH.online) return true; // static preview: allow the demo through
  if (TTI_AUTH.user) return true;    // signed in (student / user / admin)
  TTI_AUTH.pendingIntent = intent || 'continue';
  TTI_AUTH.pendingResume = resume || null; // 'pay' | 'portal' | 'cert'
  openAuthModal('login');
  var hint = document.getElementById('authHint');
  if (hint) hint.innerText = 'Please log in (or create an account) to ' + TTI_AUTH.pendingIntent + '.';
  return false;
}

// After a successful login / register, resume the action the visitor was
// blocked from (pay fees, open portal, certificate) if one was pending.
function ttiResumeAfterAuth() {
  var r = TTI_AUTH.pendingResume;
  TTI_AUTH.pendingResume = null;
  TTI_AUTH.pendingIntent = null;
  if (!r) return;
  if (r === 'portal' && typeof loginStudentPortal === 'function') loginStudentPortal();
  else if (r === 'pay' && typeof openPaymentModal === 'function') openPaymentModal();
  else if (r === 'cert' && typeof printCertificateFromPortal === 'function') printCertificateFromPortal();
}

// ============================================================
// ACCOUNT MODAL (student / user): messages call :this number:+251910695378 + settings
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
  if (tabId === 'resets') TTILoadResetRequests();
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

// ---- Password reset desk (admin) ----
function TTILoadResetRequests() {
  var list = document.getElementById('adminResetList');
  if (!list) return;
  list.innerHTML = '<p class="p-6 text-center text-slate-500 text-xs">Loading requests...</p>';
  ttiApi('auth.php?action=reset_requests')
    .then(function (d) {
      if (!d.ok) { list.innerHTML = '<p class="p-6 text-center text-red-400 text-xs">' + ttiEsc(d.error || 'Failed to load.') + '</p>'; return; }
      var badge = document.getElementById('adminResetBadge');
      if (badge) { badge.innerText = d.count; badge.classList.toggle('hidden', !d.count); }
      var rows = d.requests || [];
      if (!rows.length) { list.innerHTML = '<p class="p-6 text-center text-slate-500 text-xs">No pending reset requests.</p>'; return; }
      list.innerHTML = rows.map(function (r) {
        var who = r.full_name
          ? ttiEsc(r.full_name) + ' <span class="text-slate-500">(' + ttiEsc(r.role) + ')</span>'
          : '<span class="text-amber-400">No matching account</span>';
        var canReset = !!r.user_id && r.role !== 'admin';
        var out = '<div class="bg-navy-900 rounded-2xl border border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center gap-3">'
          + '<div class="flex-1">'
            + '<p class="text-sm font-bold text-white">' + who + '</p>'
            + '<p class="text-[11px] text-slate-400">' + ttiEsc(r.email) + (r.phone ? ' · ' + ttiEsc(r.phone) : '') + '</p>'
            + '<p class="text-[11px] text-slate-500">Requested ' + ttiShort(r.created_at) + '</p>'
          + '</div>';
        if (canReset) {
          out += '<div class="flex items-center gap-2">'
            + '<input id="resetpw_' + r.user_id + '" type="text" class="bg-navy-950 border border-slate-700 rounded-lg p-2 text-xs text-white w-40" placeholder="New password (min 6)">'
            + '<button onclick="TTIAdminResetPassword(' + r.user_id + ')" class="bg-brand-500 hover:bg-brand-600 text-navy-950 font-bold text-xs px-3 py-2 rounded-lg">Reset</button>'
            + '<button onclick="TTIDismissReset(' + r.id + ')" class="bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs px-3 py-2 rounded-lg">Dismiss</button>'
          + '</div>';
        } else {
          out += '<button onclick="TTIDismissReset(' + r.id + ')" class="bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs px-3 py-2 rounded-lg self-start">Dismiss</button>';
        }
        return out + '</div>';
      }).join('');
    })
    .catch(function () { list.innerHTML = '<p class="p-6 text-center text-red-400 text-xs">Cannot reach server.</p>'; });
}

function TTIAdminResetPassword(uid) {
  var inp = document.getElementById('resetpw_' + uid);
  var pw = inp ? (inp.value || '').trim() : '';
  if (pw.length < 6) { alert('Enter a new password of at least 6 characters.'); return; }
  ttiApi('auth.php', { body: { action: 'admin_reset_password', user_id: uid, new_password: pw } })
    .then(function (d) {
      if (!d.ok) { alert(d.error || 'Failed to reset.'); return; }
      TTILoadResetRequests();
    })
    .catch(function () { alert('Cannot reach server.'); });
}

function TTIDismissReset(rid) {
  ttiApi('auth.php', { body: { action: 'dismiss_reset', request_id: rid } })
    .then(function () { TTILoadResetRequests(); })
    .catch(function () { alert('Cannot reach server.'); });
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

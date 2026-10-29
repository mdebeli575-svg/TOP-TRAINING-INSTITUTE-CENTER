/* ============================================================
   TOP TRAINING INSTITUTE - Payment & Certificate Add-on
   TeleBirr + CBE (Acc. 1000448547519) fee collection,
   theory class completion tracking and certificate printing.
   Works on top of the inline app logic in index.html and
   shares the global `leadsData` store.
   Config values mirror config/config.json and config/config.yaml.
   ============================================================ */

// ---------- Gateway configuration (see config/config.json) ----------
var TTI_CONFIG = {
  institution: 'TOP TRAINING INSTITUTE',
  currency: 'ETB',
  registration_fee: 500,
  theory_pass_percent: 100,
  payment_methods: {
    telebirr: { provider: 'TeleBirr (Ethio Telecom)', shortcode: '*844#', paybill: '84400', merchant: '77100' },
    cbe: { provider: 'Commercial Bank of Ethiopia', account_number: '1000448547519', account_name: 'TOP TRAINING INSTITUTE', bank_code: '13' }
  },
  certificate: { prefix: 'TTI', signature_title: 'Academic Director' }
};

var TTI_LSTORE = { payments: 'tti_payments_v1', theory: 'tti_theory_v1' };
var TTI_SELECTED_METHOD = 'telebirr';
var TTI_FROM_PORTAL = false;
var TTI_ACTIVE_STUDENT = null; // { name, phone, course, branch, lead }
var TTI_PRINT_BACK = null;     // restore node after printing

// ---------- Server-backed state (PHP + MySQL under /api) ----------
// TTI_STATE is the authoritative in-memory cache that all render functions
// read synchronously. ttiBootstrap() fills it from the server when the PHP
// API is reachable and gracefully falls back to localStorage otherwise, so the
// static/node preview keeps working with no backend.
var TTI_API = 'api/';
var TTI_REMOTE = false;
var TTI_STATE = { payments: [], theory: {} };

// Write the current cache back to localStorage (keeps the offline copy fresh).
function ttiMirror() {
  ttiSave(TTI_LSTORE.payments, TTI_STATE.payments);
  ttiSave(TTI_LSTORE.theory, TTI_STATE.theory);
}

// Prime the cache from localStorage so the UI renders instantly on load.
function ttiHydrateFromLocal() {
  TTI_STATE.payments = ttiLoad(TTI_LSTORE.payments, []);
  TTI_STATE.theory = ttiLoad(TTI_LSTORE.theory, {});
}

// POST JSON to an API endpoint. Resolves {ok:true, local:true} offline.
function ttiPost(endpoint, payload) {
  if (!TTI_REMOTE) return Promise.resolve({ ok: true, local: true });
  return fetch(TTI_API + String(endpoint).replace(/\.php(?=$|\?)/, ''), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(function (r) { return r.json(); })
    .catch(function () { return { ok: false, error: 'network' }; });
}

// Load all state from the server; enables remote mode only on success.
function ttiBootstrap() {
  fetch(TTI_API + 'bootstrap', { headers: { 'Accept': 'application/json' } })
    .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
    .then(function (d) {
      if (!d || !d.server) throw new Error('no server');
      TTI_REMOTE = true;
      TTI_STATE.payments = d.payments || [];
      TTI_STATE.theory = d.theory || {};
      if (Array.isArray(d.leads) && d.leads.length && typeof leadsData !== 'undefined') {
        leadsData = d.leads;
        if (typeof renderLeadsTable === 'function') renderLeadsTable();
      }
      ttiMirror();
      ttiAfterDataReady();
    })
    .catch(function () {
      TTI_REMOTE = false; // keep the localStorage-hydrated state
      ttiAfterDataReady();
    });
}

function ttiAfterDataReady() {
  ttiPopulateStudentPickers();
  renderPaymentsTable();
  if (TTI_ACTIVE_STUDENT) renderPortalDashboard();
}

// Persist a new enrollment lead (called from the inline enrollment handler).
function ttiCreateLead(lead) {
  if (!lead) return;
  ttiPost('leads.php', {
    action: 'create',
    lead: { name: lead.name, phone: lead.phone, course: lead.course, branch: lead.branch }
  }).then(function (res) {
    if (res && res.ok && res.lead && res.lead.id) lead.id = res.lead.id;
  });
}

// Persist a lead status change made in the admin CRM.
function ttiPersistLeadStatus(id, status) {
  ttiPost('leads.php', { action: 'status', id: id, status: status });
}

// ---------- Small helpers ----------
function ttiLoad(key, fallback) {
  try {
    var raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
}

function ttiSave(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}

function ttiIcons() {
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function ttiPhoneValid(p) {
  return /^0[97][0-9]{8}$/.test((p || '').replace(/[\s-]/g, ''));
}

function ttiPayments() { return TTI_STATE.payments || []; }

function ttiStudentKey(name, course) {
  return (name + '||' + course).toLowerCase();
}

// A course counts as paid only when a Verified payment belongs to THIS
// student (for their course, or a general Registration Fee).
function ttiIsPaid(name, course) {
  var lname = (name || '').toLowerCase();
  return ttiPayments().some(function (p) {
    if (p.status !== 'Verified') return false;
    if ((p.name || '').toLowerCase() !== lname) return false;
    return p.course === 'Registration Fee' || p.course === course;
  });
}

function ttiTheoryDone(name, course) {
  return !!(TTI_STATE.theory || {})[ttiStudentKey(name, course)];
}

// Resolve the theory modules for a course: exact title match first, else the
// LONGEST substring match so e.g. "Programming Languages" beats "Languages".
function ttiModulesForCourse(course) {
  var cats = (typeof courseCategories !== 'undefined' ? courseCategories : []);
  var cat = cats.find(function (c) { return c.title === course; });
  if (!cat) {
    var matches = cats.filter(function (c) {
      return course.indexOf(c.title) !== -1 || c.title.indexOf(course) !== -1;
    }).sort(function (a, b) { return b.title.length - a.title.length; });
    cat = matches[0];
  }
  return cat ? cat.tools : ['Course Orientation & Fundamentals', 'Core Theory Modules', 'Practical Lab Sessions', 'Capstone Project & Defense'];
}

// ============================================================
// INITIALIZATION (called from window.onload in index.html)
// ============================================================
function TTIInit() {
  // Print root used to isolate the certificate when printing
  if (!document.getElementById('print-root')) {
    var root = document.createElement('div');
    root.id = 'print-root';
    document.body.appendChild(root);
  }
  ttiHydrateFromLocal();
  ttiPopulateStudentPickers();
  renderPaymentsTable();
  ttiBootstrap();
}

// Fill admin "Pick Enrolled Student" + theory tracker selects
function ttiPopulateStudentPickers() {
  var enrolled = (typeof leadsData !== 'undefined' ? leadsData : []).filter(function (l) {
    return l.status === 'Enrolled';
  });

  var pick = document.getElementById('certStudentPick');
  var tracker = document.getElementById('trackerStudentSelect');
  if (pick) {
    pick.length = 0;
    pick.add(new Option('-- Type manually --', ''));
    enrolled.forEach(function (l) { pick.add(new Option(l.name + ' — ' + l.course, l.id)); });
  }
  if (tracker) {
    tracker.length = 0;
    tracker.add(new Option('-- Select enrolled student --', ''));
    enrolled.forEach(function (l) { tracker.add(new Option(l.name + ' — ' + l.course, l.id)); });
  }
}

function pickCertStudent() {
  var id = document.getElementById('certStudentPick').value;
  if (!id) return;
  var lead = leadsData.find(function (l) { return String(l.id) === String(id); });
  if (lead) {
    document.getElementById('certStudentName').value = lead.name;
    document.getElementById('certCourseName').value = lead.course;
  }
}

// ============================================================
// PAYMENT MODAL (TeleBirr + CBE)
// ============================================================
function openPaymentModal(method, fromPortal, studentName, courseTitle) {
  // Requires an account: students/users without one are prompted to log
  // in or register, then the payment flow resumes automatically.
  if (typeof TTIRequireAuth === 'function' && !TTIRequireAuth('pay your fees', 'pay')) return;
  TTI_FROM_PORTAL = !!fromPortal;
  document.getElementById('paymentSuccessBox').classList.add('hidden');

  // Reset submit button to an actionable state (guards against stale double-submit)
  var submitBtn = document.getElementById('paymentSubmitBtn');
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.className = 'w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl text-sm transition shadow-lg shadow-emerald-600/20 inline-flex items-center justify-center gap-2';
    submitBtn.innerHTML = '<i data-lucide="shield-check" class="w-4 h-4"></i> Confirm & Submit Payment';
  }

  if (studentName) document.getElementById('payStudentName').value = studentName;
  if (courseTitle) {
    var sel = document.getElementById('payCourseSelect');
    for (var i = 0; i < sel.options.length; i++) {
      if (sel.options[i].text.indexOf(courseTitle) !== -1) { sel.selectedIndex = i; break; }
    }
  }
  if (fromPortal && TTI_ACTIVE_STUDENT) {
    document.getElementById('payStudentName').value = TTI_ACTIVE_STUDENT.name;
    // Preselect the student's course in the payment form when it matches an option
    var pcSel = document.getElementById('payCourseSelect');
    var want = TTI_ACTIVE_STUDENT.course;
    for (var j = 0; j < pcSel.options.length; j++) {
      if (pcSel.options[j].text.indexOf(want) !== -1 || want.indexOf(pcSel.options[j].text) !== -1) {
        pcSel.selectedIndex = j; break;
      }
    }
  }

  selectPaymentMethod(method || TTI_SELECTED_METHOD);
  document.getElementById('paymentModal').classList.remove('hidden');
  ttiIcons();
}

function closePaymentModal() {
  document.getElementById('paymentModal').classList.add('hidden');
  if (TTI_FROM_PORTAL && TTI_ACTIVE_STUDENT) renderPortalDashboard();
}

function selectPaymentMethod(method) {
  TTI_SELECTED_METHOD = method;
  var tb = document.getElementById('methodTelebirrBtn');
  var cbe = document.getElementById('methodCbeBtn');
  var active = ['border-emerald-500', 'bg-emerald-500/10', 'text-white'];
  var idle = ['border-slate-700', 'bg-navy-950', 'text-slate-400'];

  if (method === 'telebirr') {
    active.forEach(function (c) { tb.classList.add(c); });
    idle.forEach(function (c) { tb.classList.remove(c); });
    idle.forEach(function (c) { cbe.classList.add(c); });
    active.forEach(function (c) { cbe.classList.remove(c); });
  } else {
    active.forEach(function (c) { cbe.classList.add(c); });
    idle.forEach(function (c) { cbe.classList.remove(c); });
    idle.forEach(function (c) { tb.classList.add(c); });
    active.forEach(function (c) { tb.classList.remove(c); });
  }
  document.getElementById('telebirrPanel').classList.toggle('hidden', method !== 'telebirr');
  document.getElementById('cbePanel').classList.toggle('hidden', method !== 'cbe');
}

function copyCbeAccount() {
  var acc = TTI_CONFIG.payment_methods.cbe.account_number;
  function done() {
    var btn = event ? event.currentTarget : null;
    if (btn) { btn.innerHTML = 'Copied!'; setTimeout(function () { btn.innerHTML = '<i data-lucide="copy" class="w-3.5 h-3.5"></i> Copy'; ttiIcons(); }, 1600); }
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(acc).then(done);
  } else {
    var ta = document.createElement('textarea');
    ta.value = acc; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta); done();
  }
}

function submitPayment() {
  var submitBtn = document.getElementById('paymentSubmitBtn');
  if (submitBtn && submitBtn.disabled) return; // already submitted, ignore double clicks

  var name = document.getElementById('payStudentName').value.trim();
  var amount = parseFloat(document.getElementById('payAmount').value);
  var course = document.getElementById('payCourseSelect').value;

  if (!name) { alert('Please enter the student full name.'); return; }
  if (!amount || amount <= 0) { alert('Please enter a valid amount in ETB.'); return; }

  var method = TTI_SELECTED_METHOD, phone = '', ref = '';

  if (method === 'telebirr') {
    phone = document.getElementById('payTelebirrPhone').value.replace(/[\s-]/g, '');
    if (!ttiPhoneValid(phone)) { alert('Enter a valid TeleBirr number (09 or 07 followed by 8 digits).'); return; }
  } else {
    var trx = document.getElementById('payCbeTrxRef').value.trim();
    if (!trx) { alert('Enter the CBE transaction reference number from your receipt.'); return; }
    ref = trx;
  }

  // Lock the button immediately so the same payment can't be double-submitted
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.className = 'w-full bg-slate-700 text-slate-400 font-bold py-3.5 rounded-xl text-sm inline-flex items-center justify-center gap-2 cursor-not-allowed';
    submitBtn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Submitting payment...';
    ttiIcons();
  }

  ttiCreatePayment({ name: name, phone: phone, course: course, amount: amount, method: method, trx_ref: ref });
}

// Persist a payment on the server (TeleBirr push / CBE reference) with a
// localStorage fallback when the PHP API is not reachable.
function ttiCreatePayment(form) {
  ttiPost('payments.php', { action: 'create', payment: form }).then(function (res) {
    var payment;
    if (res && res.ok && res.payment) {
      payment = res.payment; // authoritative id + reference from MySQL
    } else {
      payment = { // offline fallback so the demo still records the request
        id: Date.now(),
        name: form.name, amount: form.amount, course: form.course, method: form.method,
        ref: form.method === 'telebirr' ? 'TB-' + Date.now().toString(36).toUpperCase() : form.trx_ref,
        status: 'Pending',
        date: new Date().toISOString().slice(0, 10)
      };
    }
    TTI_STATE.payments.unshift(payment);
    ttiMirror();
    renderPaymentsTable();
    showPaymentSuccess(payment);
  });
}

function showPaymentSuccess(payment) {
  var box = document.getElementById('paymentSuccessBox');
  document.getElementById('paymentReceiptInfo').innerHTML = payment.method === 'telebirr'
    ? 'Ref <b class="text-white">' + payment.ref + '</b> — a TeleBirr push request was sent to your dialer. Approve it with your PIN. The finance team verifies within 24h.'
    : 'Ref <b class="text-white">' + payment.ref + '</b> — CBE transfer to Acc. ' + TTI_CONFIG.payment_methods.cbe.account_number + ' recorded. Verification within 1 business day.';
  box.classList.remove('hidden');

  var submitBtn = document.getElementById('paymentSubmitBtn');
  if (submitBtn) {
    submitBtn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Submitted — awaiting verification';
    ttiIcons();
  }
  setTimeout(function () { closePaymentModal(); }, 3200);
}

// ============================================================
// ADMIN: PAYMENTS PANEL
// ============================================================
function renderPaymentsTable() {
  var tbody = document.getElementById('paymentsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  var filterEl = document.getElementById('paymentMethodFilter');
  var filter = filterEl ? filterEl.value : 'ALL';
  var payments = ttiPayments();
  var items = filter === 'ALL' ? payments : payments.filter(function (p) { return p.method === filter; });

  items.forEach(function (p) {
    var badge = p.status === 'Verified' ? 'bg-emerald-500/10 text-emerald-400'
      : p.status === 'Rejected' ? 'bg-red-500/10 text-red-400'
      : 'bg-amber-500/10 text-amber-400';
    var methodLabel = p.method === 'telebirr'
      ? '<span class="text-emerald-400 font-bold">TeleBirr</span>'
      : '<span class="text-blue-400 font-bold">CBE (' + TTI_CONFIG.payment_methods.cbe.account_number + ')</span>';
    var action = p.status === 'Pending'
      ? '<button onclick="setPaymentStatus(' + p.id + ',\'Verified\')" class="bg-emerald-600/80 hover:bg-emerald-500 text-white px-2 py-1 rounded text-[10px] font-bold mr-1">Verify</button>' +
        '<button onclick="setPaymentStatus(' + p.id + ',\'Rejected\')" class="bg-slate-800 hover:bg-red-600 text-slate-200 px-2 py-1 rounded text-[10px] font-bold">Reject</button>'
      : '<span class="text-slate-500 text-[10px]">Settled</span>';

    tbody.insertAdjacentHTML('beforeend',
      '<tr class="hover:bg-slate-800/50">' +
        '<td class="p-4"><p class="font-bold text-white">' + p.name + '</p><p class="text-[10px] text-slate-500">' + p.course + ' · ' + p.date + '</p></td>' +
        '<td class="p-4">' + methodLabel + '</td>' +
        '<td class="p-4 font-bold text-white">' + p.amount.toLocaleString() + '</td>' +
        '<td class="p-4 font-mono text-slate-300">' + p.ref + '</td>' +
        '<td class="p-4"><span class="' + badge + ' font-bold px-2 py-0.5 rounded text-[10px]">' + p.status + '</span></td>' +
        '<td class="p-4 text-right">' + action + '</td>' +
      '</tr>');
  });

  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-slate-500">No payments recorded yet. Share the Pay Fees button with students.</td></tr>';
  }

  // Stats + badge
  var verified = payments.filter(function (p) { return p.status === 'Verified'; });
  var pending = payments.filter(function (p) { return p.status === 'Pending'; });
  var totalEl = document.getElementById('statTotalCollected');
  var pendEl = document.getElementById('statPendingPayments');
  var cntEl = document.getElementById('statPaymentCount');
  var badgeEl = document.getElementById('paymentCountBadge');
  if (totalEl) totalEl.innerText = verified.reduce(function (s, p) { return s + p.amount; }, 0).toLocaleString();
  if (pendEl) pendEl.innerText = pending.length;
  if (cntEl) cntEl.innerText = payments.length;
  if (badgeEl) badgeEl.innerText = payments.length;
}

function setPaymentStatus(id, status) {
  var p = TTI_STATE.payments.find(function (x) { return String(x.id) === String(id); });
  if (p) { p.status = status; ttiMirror(); }
  renderPaymentsTable();
  ttiPost('payments.php', { action: status === 'Verified' ? 'verify' : 'reject', id: id });
  if (TTI_ACTIVE_STUDENT) renderPortalDashboard();
}

// ============================================================
// PUBLIC STUDENT PORTAL (theory progress + certificate)
// ============================================================
function loginStudentPortal() {
  // An account is required to access classes, theory progress and the
  // certificate. Without one, prompt to log in / register, then resume.
  if (typeof TTIRequireAuth === 'function' && !TTIRequireAuth('access the Student Portal (theory classes & certificate)', 'portal')) return;
  var name = document.getElementById('portalName').value.trim();
  var phone = document.getElementById('portalPhone').value.replace(/[\s-]/g, '');
  var courseSel = document.getElementById('portalCourse');
  var err = document.getElementById('portalError');

  err.classList.add('hidden');
  if (!name) { err.innerText = 'Please enter your full name.'; err.classList.remove('hidden'); return; }

  // Match an existing enrollment by phone first, then by name (case-insensitive).
  var leads = (typeof leadsData !== 'undefined' ? leadsData : []);
  var lead = null;
  if (phone) lead = leads.find(function (l) { return l.phone.replace(/[\s-]/g, '') === phone; });
  if (!lead) lead = leads.find(function (l) { return l.name.toLowerCase() === name.toLowerCase(); });

  // Course comes from the matched enrollment when available, else the chosen course.
  var course = lead ? lead.course : (courseSel ? courseSel.value : 'General Training');
  var branch = lead ? lead.branch : '—';

  TTI_ACTIVE_STUDENT = {
    name: lead ? lead.name : name,
    phone: lead ? lead.phone : phone,
    course: course,
    branch: branch,
    lead: lead
  };

  document.getElementById('portalDashboard').classList.remove('hidden');
  renderPortalDashboard();

  // Bring the opened portal into view.
  document.getElementById('portalDashboard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderPortalDashboard() {
  var s = TTI_ACTIVE_STUDENT;
  if (!s) return;

  var paid = ttiIsPaid(s.name, s.course);
  var finished = ttiTheoryDone(s.name, s.course);

  document.getElementById('portalStudentInfo').innerHTML =
    '<span class="text-white font-bold">' + s.name + '</span> · ' + s.course +
    ' · Branch: ' + s.branch + ' · <span class="font-mono">' + (s.phone || 'no phone') + '</span>';

  var payBadge = document.getElementById('portalPayBadge');
  payBadge.className = 'text-[10px] font-bold px-2.5 py-1 rounded-full border ' +
    (paid ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30">Paid'
          : 'bg-red-500/10 text-red-400 border-red-500/30">Unpaid');
  payBadge.innerText = paid ? 'Paid / Verified' : 'Unpaid';

  renderPortalTheoryList(s, finished);
  renderPortalCertificateCard(s, paid, finished);
  ttiIcons();
}

// Theory checklist — students tick modules they have attended & passed;
// the admin tracker (Certification Desk) is the authoritative source.
function renderPortalTheoryList(s, alreadyFinished) {
  var container = document.getElementById('portalTheoryList');
  var modules = ttiModulesForCourse(s.course);
  var state = TTI_STATE.theory || {};
  var key = ttiStudentKey(s.name, s.course);
  var checked = state['progress_' + key] || [];

  container.innerHTML = '';
  modules.forEach(function (m, i) {
    var isDone = alreadyFinished || checked.indexOf(i) !== -1;
    // No `disabled`: students can untick a module to correct a mistaken check,
    // which reopens theory completion (and re-locks the certificate).
    container.insertAdjacentHTML('beforeend',
      '<label class="theory-module-row flex items-center gap-3 bg-navy-950 border border-slate-700 rounded-xl px-3 py-2 cursor-pointer ' + (isDone ? 'theory-done' : '') + '">' +
        '<input type="checkbox" ' + (isDone ? 'checked' : '') + ' onchange="togglePortalTheoryModule(' + i + ', this.checked)" class="accent-amber-500 w-4 h-4">' +
        '<span class="text-xs ' + (isDone ? 'text-emerald-300 font-semibold' : 'text-slate-300') + '">' + m + '</span>' +
      '</label>');
  });

  var doneCount = Math.max(alreadyFinished ? modules.length : 0, checked.length);
  var percent = Math.round((doneCount / modules.length) * 100);
  document.getElementById('portalTheoryPercent').innerText = percent + '%';
  document.getElementById('portalTheoryBar').style.width = percent + '%';
}

function togglePortalTheoryModule(index, isChecked) {
  var s = TTI_ACTIVE_STUDENT;
  if (!s) return;
  var state = TTI_STATE.theory || (TTI_STATE.theory = {});
  var idKey = ttiStudentKey(s.name, s.course);
  var key = 'progress_' + idKey;
  var total = ttiModulesForCourse(s.course).length;
  var checked = (state[key] || []).slice();
  if (isChecked) { if (checked.indexOf(index) === -1) checked.push(index); }
  else { checked = checked.filter(function (x) { return x !== index; }); }
  checked.sort(function (a, b) { return a - b; });
  state[key] = checked;
  // Theory is FINISHED once every module is checked; unticking any module
  // reopens it, so the flag (and certificate unlock) always tracks the list.
  state[idKey] = (checked.length >= total);
  ttiMirror();
  ttiPost('theory.php', { name: s.name, course: s.course, finished: state[idKey], progress: checked });
  renderPortalDashboard();
}

function renderPortalCertificateCard(s, paid, finished) {
  var status = document.getElementById('portalCertStatus');
  var list = document.getElementById('portalCertChecklist');
  var btn = document.getElementById('portalCertPrintBtn');

  var items = [
    { ok: finished, text: 'All theory classes completed & finished' },
    { ok: paid, text: 'Tuition / registration fees settled (TeleBirr or CBE)' },
    { ok: paid && finished, text: 'Certificate unlocked for printing' }
  ];

  list.innerHTML = items.map(function (it) {
    return '<li class="flex items-center gap-2 ' + (it.ok ? 'text-emerald-400' : 'text-slate-500') + '">' +
      '<i data-lucide="' + (it.ok ? 'check-circle-2' : 'circle') + '" class="w-3.5 h-3.5"></i> ' + it.text + '</li>';
  }).join('');

  if (paid && finished) {
    status.innerText = 'Congratulations! Your certificate is ready. Click below to print it or save as PDF.';
    btn.disabled = false;
    btn.className = 'w-full bg-brand-500 hover:bg-brand-600 text-navy-950 font-bold py-3 rounded-xl text-sm transition inline-flex items-center justify-center gap-2';
    btn.innerHTML = '<i data-lucide="printer" class="w-4 h-4"></i> Print My Certificate';
  } else {
    status.innerText = 'Your certificate stays locked until theory classes are marked finished by your instructor and all fees are verified by finance.';
    btn.disabled = true;
    btn.className = 'w-full bg-slate-800 text-slate-500 font-bold py-3 rounded-xl text-sm cursor-not-allowed transition inline-flex items-center justify-center gap-2';
    btn.innerHTML = '<i data-lucide="lock" class="w-4 h-4"></i> Certificate Locked';
  }
}

function printCertificateFromPortal() {
  if (typeof TTIRequireAuth === 'function' && !TTIRequireAuth('print your certificate', 'cert')) return;
  var s = TTI_ACTIVE_STUDENT;
  if (!s) return;
  document.getElementById('certStudentName').value = s.name;
  document.getElementById('certCourseName').value = s.course;
  generateCertificatePreview();
  printCertificate();
}

// ============================================================
// ADMIN THEORY TRACKER (Certification Desk)
// ============================================================
function ttiTrackerSelectedStudent() {
  var sel = document.getElementById('trackerStudentSelect');
  var manual = document.getElementById('trackerStudentManual').value.trim();
  if (sel.value) {
    var lead = leadsData.find(function (l) { return String(l.id) === String(sel.value); });
    if (lead) return { name: lead.name, course: lead.course };
  }
  if (manual) return { name: manual, course: document.getElementById('certCourseName').value || 'General Training' };
  return null;
}

function renderTrackerModules() {
  var s = ttiTrackerSelectedStudent();
  var list = document.getElementById('trackerModuleList');
  var finishBtn = document.getElementById('trackerFinishBtn');
  if (!s) { alert('Select an enrolled student or type a name first.'); return; }

  var finished = ttiTheoryDone(s.name, s.course);
  list.classList.remove('hidden');
  finishBtn.classList.remove('hidden');
  list.innerHTML =
    '<p class="text-xs text-slate-400">Student: <span class="text-white font-bold">' + s.name + '</span> — ' + s.course + '</p>' +
    '<p class="text-xs ' + (finished ? 'text-emerald-400 font-bold' : 'text-amber-400') + '">' +
    (finished ? 'Theory classes FINISHED — certificate approved for issuance.' : 'Theory classes not yet finished.') + '</p>';

  finishBtn.innerHTML = finished
    ? '<i data-lucide="rotate-ccw" class="w-4 h-4"></i> Reopen Theory Classes'
    : '<i data-lucide="check-circle-2" class="w-4 h-4"></i> Mark Theory Classes Finished';
  ttiIcons();
}

function finishTheoryClasses() {
  var s = ttiTrackerSelectedStudent();
  if (!s) { alert('Select a student first.'); return; }
  var state = TTI_STATE.theory || (TTI_STATE.theory = {});
  var key = ttiStudentKey(s.name, s.course);
  var finished = !state[key]; // toggle finished flag
  state[key] = finished;
  // Keep the per-module checklist in sync with the admin decision: all modules
  // checked when finished, cleared when reopened, so the portal stays accurate.
  var modules = ttiModulesForCourse(s.course);
  state['progress_' + key] = finished ? modules.map(function (_, i) { return i; }) : [];
  ttiMirror();
  ttiPost('theory.php', { name: s.name, course: s.course, finished: finished, progress: state['progress_' + key] });
  renderTrackerModules();
  if (TTI_ACTIVE_STUDENT && TTI_ACTIVE_STUDENT.name === s.name) renderPortalDashboard();
}

// ============================================================
// CERTIFICATE PRINTING (isolates #certPreviewCard on paper)
// ============================================================
function printCertificate() {
  var card = document.getElementById('certPreviewCard');
  var root = document.getElementById('print-root');
  if (!card || card.classList.contains('hidden')) {
    alert('Generate the certificate preview first.');
    return;
  }

  TTI_PRINT_BACK = { parent: card.parentNode, next: card.nextSibling };
  root.appendChild(card);
  ttiIcons();

  window.print();

  // Restore the certificate back into the dashboard panel
  if (TTI_PRINT_BACK && TTI_PRINT_BACK.parent) {
    TTI_PRINT_BACK.parent.insertBefore(card, TTI_PRINT_BACK.next);
  } else {
    document.getElementById('panel-certificates').appendChild(card);
  }
}

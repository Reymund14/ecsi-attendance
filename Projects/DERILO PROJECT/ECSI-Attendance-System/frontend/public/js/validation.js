/* ECSI Attendance System - validation
   Shared client-side validation + input-restriction helpers.

   Loaded first as a classic global script via /js/validation.js so every
   feature script can call V.* rule functions and the vShow/vHide/vValidate
   display helpers. Each V rule takes the raw field value and returns '' when
   valid, or a human-readable message when not. Optional fields accept an
   empty value — put V.required(label) in front of them to make them
   mandatory. */

// ── Validation rules ─────────────────────────────────────────
const V = {
  // Generic "must not be blank"
  required: (label) => (v) => (v == null || String(v).trim() === '')
    ? (label || 'This field') + ' is required.' : '',

  // Person names: 2–80 chars, letters / spaces / . ' - only
  name: (v, label) => {
    const s = (v == null ? '' : String(v)).trim();
    const n = label || 'Name';
    if (!s) return n + ' is required.';
    if (s.length < 2) return n + ' must be at least 2 characters.';
    if (s.length > 80) return n + ' must be 80 characters or fewer.';
    if (!/^[A-Za-zÀ-ÿ.'\- ]+$/.test(s)) return n + ' may only contain letters, spaces, hyphens, apostrophes and periods.';
    return '';
  },

  // Optional name — blank is fine, otherwise the name rules apply
  nameOpt: (v, label) => (v == null || String(v).trim() === '') ? '' : V.name(v, label),

  // ID / account numbers: 3–20 chars, starts alphanumeric, then alphanumeric or -
  idNumber: (v, label) => {
    const s = (v == null ? '' : String(v)).trim();
    const n = label || 'ID Number';
    if (!s) return n + ' is required.';
    if (s.length < 3 || s.length > 20) return n + ' must be 3–20 characters.';
    if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(s)) return n + ' may only contain letters, numbers and hyphens (and must start with a letter or number).';
    return '';
  },

  // Email — optional unless `required` is truthy
  email: (v, required) => {
    const s = (v == null ? '' : String(v)).trim();
    if (!s) return required ? 'Email is required.' : '';
    if (s.length > 120) return 'Email must be 120 characters or fewer.';
    const at = s.lastIndexOf('@');
    const local = s.slice(0, at);
    const domain = s.slice(at + 1);
    const labels = domain.split('.');
    if (at < 1 || s.indexOf('@') !== at || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ||
        local.startsWith('.') || local.endsWith('.') || local.includes('..') ||
        labels.length < 2 || labels.some(label => !/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label)) ||
        !/^[A-Za-z]{2,63}$/.test(labels[labels.length - 1])) {
      return 'Enter a valid email address.';
    }
    return '';
  },

  // PH mobile number — 09XXXXXXXXX or +639XXXXXXXXX; optional unless required
  phone: (v, required) => {
    const s = (v == null ? '' : String(v)).trim();
    if (!s) return required ? 'Contact number is required.' : '';
    if (!/^(09\d{9}|\+?639\d{9})$/.test(s.replace(/[\s()-]/g, ''))) return 'Enter a valid PH mobile number (e.g. 09171234567 or 639171234567).';
    return '';
  },

  // RFID card UID: 4–32 letters/numbers
  rfid: (v) => {
    const s = (v == null ? '' : String(v)).trim();
    if (!s) return 'Please enter an RFID UID.';
    if (s.length < 4 || s.length > 32) return 'RFID UID must be 4–32 characters.';
    if (!/^[A-Za-z0-9]+$/.test(s)) return 'RFID UID may only contain letters and numbers.';
    return '';
  },

  // Free text with a length ceiling; `required` makes it mandatory
  text: (max, required, label) => (v) => {
    const s = (v == null ? '' : String(v)).trim();
    const n = label || 'This field';
    if (!s) return required ? n + ' is required.' : '';
    if (s.length > max) return n + ' must be ' + max + ' characters or fewer.';
    return '';
  },

  // Short labels (section / department): 2–40 chars, letters numbers space . -
  label: (v, required, name) => {
    const s = (v == null ? '' : String(v)).trim();
    const n = name || 'This field';
    if (!s) return required ? n + ' is required.' : '';
    if (s.length < 2 || s.length > 40) return n + ' must be 2–40 characters.';
    if (!/^[A-Za-z0-9][A-Za-z0-9 .\-]*$/.test(s)) return n + ' may only contain letters, numbers, spaces, periods and hyphens.';
    return '';
  },

  // A <select> that must have a non-empty choice
  select: (v, label) => (v == null || String(v).trim() === '')
    ? 'Please select ' + (label || 'an option') + '.' : '',

  // A date that must exist and must not be in the future
  pastDate: (v, label) => {
    const n = label || 'Date';
    if (!v) return n + ' is required.';
    const d = new Date(v + 'T00:00:00');
    if (isNaN(d.getTime())) return 'Enter a valid ' + n.toLowerCase() + '.';
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    if (d > end) return n + ' cannot be in the future.';
    return '';
  }
};

// Compares two date inputs and returns '' or a message for the end bound.
function vDateRange(fromEl, toEl) {
  const f = fromEl && fromEl.value;
  const t = toEl && toEl.value;
  if (!f || !t) return '';
  return f > t ? 'The start date must be on or before the end date.' : '';
}

// ── Error display ────────────────────────────────────────────
function _vErrId(el) {
  return 'v-err-' + (el.id || 'anon-' + Math.random().toString(36).slice(2));
}

function vShow(el, msg) {
  if (!el || !msg) return;
  el.classList.add('v-invalid');
  if (el.setAttribute) el.setAttribute('aria-invalid', 'true');
  let box = document.getElementById(_vErrId(el));
  if (!box) {
    box = document.createElement('div');
    box.id = _vErrId(el);
    box.className = 'v-error';
    if (el.parentNode) el.parentNode.insertBefore(box, el.nextSibling);
  }
  box.textContent = msg;
}

function vHide(el) {
  if (!el) return;
  el.classList.remove('v-invalid');
  if (el.removeAttribute) el.removeAttribute('aria-invalid');
  const box = document.getElementById(_vErrId(el));
  if (box) box.remove();
}

// Validate a list of [element, message] pairs. Every message is shown at once;
// focus moves to the first invalid field. Returns true when everything is valid.
function vValidate(checks) {
  let firstBad = null;
  (checks || []).forEach((pair) => {
    if (!pair) return;
    const el = pair[0], msg = pair[1];
    if (!el) return;
    if (msg) {
      vShow(el, msg);
      if (!firstBad) firstBad = el;
    } else {
      vHide(el);
    }
  });
  if (firstBad) {
    try { firstBad.focus({ preventScroll: false }); }
    catch (e) { try { firstBad.focus(); } catch (e2) { /* ignore */ } }
    return false;
  }
  return true;
}

// Clear every validation error inside a container (defaults to the page).
function vClearAll(root) {
  const scope = root && root.querySelectorAll ? root : document;
  scope.querySelectorAll('.v-invalid').forEach(vHide);
  scope.querySelectorAll('.v-error').forEach((n) => n.remove());
}

// Numeric-only inputs (marked data-digits) have every non-digit stripped as it
// is typed or pasted. A field's validation error is also cleared on edit.
document.addEventListener('input', (e) => {
  const t = e.target;
  if (!t) return;
  if (t.dataset && t.dataset.digits !== undefined) {
    const cleaned = String(t.value || '').replace(/\D/g, '');
    if (t.value !== cleaned) t.value = cleaned;
  }
  if (t.classList && t.classList.contains('v-invalid')) vHide(t);
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t && t.classList && t.classList.contains('v-invalid')) vHide(t);
});

/* ECSI Attendance System — helpers
   Extracted verbatim from index.html (original lines 5011–5042).
   Loaded as a classic global script via /js/helpers.js. */

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════
function badgeHtml(status){
  const m={verified:'badge-green',proxy_anomaly:'badge-red',pending_review:'badge-yellow',manual_override:'badge-blue',unregistered_rfid:'badge-red',face_mismatch:'badge-red',rfid_only:'badge-yellow',no_face_template:'badge-red'};
  const l={verified:'✓ Verified',proxy_anomaly:'⚠ Proxy',pending_review:'⏳ Pending',manual_override:'✎ Override',unregistered_rfid:'⛔ Unknown RFID',face_mismatch:'🚫 Face Mismatch',rfid_only:'📋 RFID Only',no_face_template:'🚷 Not Enrolled'};
  return `<span class="badge ${m[status]||'badge-gray'}">${l[status]||status}</span>`;
}
function roleBadge(r){
  const m={super_admin:'badge-purple',faculty:'badge-blue',student:'badge-gray'};
  return `<span class="badge ${m[r]||'badge-gray'}">${r.replace('_',' ')}</span>`;
}

// ═══════════════════════════════════════════════════════════
// ── Global persistent modals (available on every page) ───────
(function injectGlobalModals(){
  const m=document.createElement('div');
  m.innerHTML=`
    <!-- Excuse request review modal -->
    <div id="excuse-review-modal" style="display:none;position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,.55);backdrop-filter:blur(4px);align-items:center;justify-content:center">
      <div style="background:#fff;border-radius:18px;width:500px;max-width:96vw;max-height:92vh;overflow-y:auto;box-shadow:0 28px 70px rgba(0,0,0,.35)">
        <div style="padding:18px 22px;border-bottom:1px solid #F3F4F6;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:#fff;z-index:1;border-radius:18px 18px 0 0">
          <span id="exc-modal-title" style="font-weight:700;font-size:15px;color:#111827"></span>
          <button onclick="closeExcuseModal()" style="background:#F3F4F6;border:none;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:16px;color:#6B7280;display:flex;align-items:center;justify-content:center">×</button>
        </div>
        <div style="padding:22px" id="exc-modal-body"></div>
      </div>
    </div>`;
  document.body.appendChild(m.firstElementChild);
})();



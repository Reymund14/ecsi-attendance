/* ECSI Attendance System — enrollment
   Extracted verbatim from index.html (original lines 4273–5010).
   Loaded as a classic global script via /js/enrollment.js. */

// ═══════════════════════════════════════════════════════════
// ENROLLMENT
// ═══════════════════════════════════════════════════════════
let enrolState={step:'list',selected:null,rfidUid:'',frames:[],addingNew:false};

async function renderEnrollment(el){
  enrolState={step:'list',selected:null,rfidUid:'',frames:[],addingNew:false};
  if(!demoMode){
    const users=await apiFetchAll('/users/',100);
    if(users) backendUsers=users;
    else {el.innerHTML='<div class="page-content"><div class="alert alert-error">Unable to load students from the backend.</div></div>';return;}
  }
  if(currentUser.role==='student'){
    const me=appUsers().find(u=>u.id_number===currentUser.id_number)||currentUser;
    enrolState.selected=me; enrolState.step='rfid';
  }
  renderEnrolInner(el);
}

function renderEnrolInner(el){
  const s=enrolState;
  const showSteps=s.step!=='list'&&s.step!=='new'&&s.step!=='advisers';
  el.innerHTML=`
    <div class="topbar">
      <span class="font-bold">Student Enrollment</span>
      ${s.step==='list'?`
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary" style="font-size:12px" onclick="enrolShowAdvisers()">👤 Advisers per Section</button>
          <button class="btn btn-primary" style="font-size:12px" onclick="enrolShowNew()">+ Add New Student</button>
        </div>`:''}
    </div>
    <div class="page-content"><div style="width:100%;max-width:${s.step==='list'||s.step==='advisers'?'100%':'860px'};margin:0 auto">
      ${showSteps?`
      <div class="card p-4" style="margin-bottom:16px">
        <div style="padding:8px 0 24px">
          <div class="steps">
            ${['Find','RFID','Face','Done'].map((lbl,i)=>{
              const idx=['search','rfid','face','done'].indexOf(s.step);
              const nodeClass=i<idx?'step-done':i===idx?'step-active':'step-idle';
              const labelColor=i<idx?'var(--green)':i===idx?'#1F2937':'#9CA3AF';
              const track=i>0?`<div class="step-track"><div class="step-track-fill${i<idx?' done':i===idx?' half':''}"></div></div>`:'';
              return `${track}<div style="display:flex;flex-direction:column;align-items:center;gap:5px">
                <div class="step-node ${nodeClass}">${i<idx?'✓':i+1}</div>
                <span class="step-label" style="color:${labelColor}">${lbl}</span>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>`:''}
      <div id="enrol-alert"></div>
      <div id="enrol-body"></div>
    </div></div>`;
  renderEnrolStep();
}

function renderEnrolStep(){
  const s=enrolState,body=document.getElementById('enrol-body');
  if(!body) return;

  // ── ADVISERS PANEL ──────────────────────────────────────
  if(s.step==='advisers'){
    renderAdvisersPanel(body);
    return;
  }

  // ── STUDENT LIST (default view) ──────────────────────────
  if(s.step==='list'){
    const students=appUsers().filter(u=>u.role==='student');
    body.innerHTML=`
      <div style="margin-bottom:14px;display:flex;gap:10px;align-items:center;width:100%">
        <input type="search" id="enrol-q" placeholder="Search students by name or ID…" maxlength="60" spellcheck="false" style="box-sizing:border-box;flex:1 1 0;min-width:120px;padding:13px 16px;font-size:15px;border:1px solid #D1D5DB;border-radius:9px;box-shadow:0 1px 3px rgba(15,23,42,.06)" oninput="enrolFilterList()"/>
        <select id="enrol-section-filter" onchange="enrolFilterList()" style="flex:0 0 auto;width:auto;padding:9px 12px;border:1px solid #E5E7EB;border-radius:8px;font-size:12px;background:#fff;color:#374151">
          <option value="">All Sections</option>
          ${appSections().map(s=>`<option value="${s}">${s}</option>`).join('')}
        </select>
        <select id="enrol-status-filter" onchange="enrolFilterList()" style="flex:0 0 auto;width:auto;padding:9px 12px;border:1px solid #E5E7EB;border-radius:8px;font-size:12px;background:#fff;color:#374151">
          <option value="">All Status</option>
          <option value="complete">Fully Enrolled</option>
          <option value="partial">Partial</option>
          <option value="none">Not Enrolled</option>
        </select>
        <span id="enrol-count" style="flex:0 0 auto;font-size:12px;color:#9CA3AF;white-space:nowrap">${students.length} students</span>
      </div>
      <div class="card" style="overflow:hidden">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr>
            <th style="text-align:left;padding:11px 16px;font-size:10px;font-weight:700;text-transform:uppercase;color:#6B7280;background:#F9FAFB;border-bottom:1px solid #E5E7EB;white-space:nowrap">Student</th>
            <th style="text-align:left;padding:11px 16px;font-size:10px;font-weight:700;text-transform:uppercase;color:#6B7280;background:#F9FAFB;border-bottom:1px solid #E5E7EB;white-space:nowrap">Section / Adviser</th>
            <th style="text-align:left;padding:11px 16px;font-size:10px;font-weight:700;text-transform:uppercase;color:#6B7280;background:#F9FAFB;border-bottom:1px solid #E5E7EB;white-space:nowrap">Parent / Guardian</th>
            <th style="text-align:center;padding:11px 16px;font-size:10px;font-weight:700;text-transform:uppercase;color:#6B7280;background:#F9FAFB;border-bottom:1px solid #E5E7EB">RFID</th>
            <th style="text-align:center;padding:11px 16px;font-size:10px;font-weight:700;text-transform:uppercase;color:#6B7280;background:#F9FAFB;border-bottom:1px solid #E5E7EB">Face</th>
            <th style="text-align:center;padding:11px 16px;font-size:10px;font-weight:700;text-transform:uppercase;color:#6B7280;background:#F9FAFB;border-bottom:1px solid #E5E7EB">Account Status</th>
            <th style="padding:11px 16px;background:#F9FAFB;border-bottom:1px solid #E5E7EB"></th>
          </tr></thead>
          <tbody id="enrol-list-body">
            ${enrolListRows(students)}
          </tbody>
        </table>
      </div>`;
    return;
  }

  // ── ADD NEW STUDENT FORM ─────────────────────────────────
  if(s.step==='new'){
    body.innerHTML=`
      <div class="card p-5">
        <div style="font-weight:700;font-size:15px;margin-bottom:4px">New Student</div>
        <p style="font-size:12px;color:#6B7280;margin-bottom:20px">Fill in the details then proceed to RFID & face enrollment.</p>
        <div style="display:grid;gap:14px">
          <div><label>ID Number *</label><input type="text" id="ns-id" placeholder="e.g., STU2026-001" maxlength="20" spellcheck="false" autocomplete="off"/></div>
          <div><label>Full Name *</label><input type="text" id="ns-name" placeholder="e.g., Maria Clara Santos" maxlength="80" autocomplete="name"/></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div>
              <label>Section</label>
              <select id="ns-section" onchange="enrolSectionChanged(this.value)" style="width:100%;padding:9px 12px;border:1px solid #E5E7EB;border-radius:8px;font-size:13px;background:#fff">
                <option value="">— Select section —</option>
                ${appSections().map(s=>`<option value="${s}">${s}</option>`).join('')}
                <option value="__other__">Other (type below)</option>
              </select>
              <input type="text" id="ns-section-custom" placeholder="e.g., Grade 10-A" maxlength="40" style="display:none;margin-top:6px"/>
            </div>
            <div><label>Department</label><input type="text" id="ns-dept" placeholder="e.g., Junior High" maxlength="40" readonly style="background:#F9FAFB"/></div>
          </div>
          <div id="ns-adviser-row" style="display:none;background:#FEF9EC;border:1px solid #F2C111;border-radius:8px;padding:10px 14px;font-size:12px">
            <span style="color:#6B7280">👤 Adviser:</span> <strong id="ns-adviser-name"></strong>
          </div>
          <div><label>Email *</label><input type="email" id="ns-email" placeholder="student@ecsi.edu.ph" maxlength="120" autocomplete="email"/></div>
          <div style="border-top:1px solid #E5E7EB;padding-top:14px;margin-top:2px">
            <div style="font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">👨‍👩‍👧 Parent / Guardian Information</div>
            <div style="display:grid;gap:14px">
              <div><label>Parent / Guardian Name *</label><input type="text" id="ns-parent-name" placeholder="e.g., Roberto Santos" maxlength="80" autocomplete="name"/></div>
              <div><label>Parent Contact Number * <span style="font-size:11px;color:#6B7280;font-weight:400">(for SMS attendance alerts)</span></label><input type="tel" inputmode="numeric" data-digits id="ns-parent-contact" placeholder="e.g., 09171234567" maxlength="13" autocomplete="tel"/></div>
            </div>
          </div>
        </div>
        <div id="enrol-alert" style="margin-top:14px"></div>
        <div style="display:flex;gap:8px;margin-top:16px">
          <button id="create-student-btn" class="btn btn-primary" style="flex:1" onclick="enrolCreateStudent()">Create & Continue →</button>
          <button class="btn btn-secondary" onclick="enrolGoList()">Cancel</button>
        </div>
      </div>`;
    return;
  }

  // ── RFID STEP ────────────────────────────────────────────
  if(s.step==='rfid'){
    const existingUid=s.selected?.rfid_uid||'';
    const isRebind=!!s.selected?.has_rfid;
    body.innerHTML=`
      <div class="card p-5">
        <div style="display:flex;align-items:center;gap:12px;padding:12px;background:#F9FAFB;border-radius:10px;margin-bottom:20px">
          <div style="width:40px;height:40px;border-radius:50%;background:#F2C111;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;flex-shrink:0">${(s.selected?.full_name||'?')[0]}</div>
          <div>
            <div style="font-weight:700">${s.selected?.full_name||'—'}</div>
            <div style="font-size:11px;color:#6B7280">${s.selected?.id_number||''} · ${s.selected?.section||s.selected?.department||'Student'}</div>
          </div>
          <span class="badge ${isRebind?'badge-green':'badge-gray'}" style="margin-left:auto">${isRebind?'RFID Bound':'No RFID'}</span>
        </div>
        ${isRebind?`
        <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:10px 14px;margin-bottom:16px;font-size:12px;color:#92400E;display:flex;gap:8px">
          <span style="flex-shrink:0">⚠</span>
          <span>This student already has a card bound (<code style="font-family:monospace;font-weight:700">${existingUid}</code>). Submitting a new UID will <strong>replace</strong> the existing binding.</span>
        </div>`:''}
        <div style="font-weight:700;margin-bottom:8px">Bind RFID Card</div>
        <p style="font-size:13px;color:#6B7280;margin-bottom:16px">Tap the student's card on the reader, or enter the UID manually.</p>
        <div style="border:2px dashed rgba(242,193,17,.4);border-radius:12px;padding:24px;text-align:center;margin-bottom:16px">
          <div style="font-size:28px;margin-bottom:8px">💳</div>
          <p style="font-size:12px;color:#6B7280;margin-bottom:12px">Card UID</p>
          <input type="text" id="rfid-uid" placeholder="e.g. A3F20B11" maxlength="32" oninput="checkRfidDuplicate(this)" style="max-width:220px;text-align:center;font-family:monospace;font-weight:700;letter-spacing:.1em;text-transform:uppercase" value="${s.rfidUid||existingUid}"/>
          <div id="rfid-dup-warn" style="margin-top:8px;font-size:11px;color:#EF4444;font-weight:600;display:none"></div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary" style="flex:1" id="rfid-bind-btn" onclick="enrolBindRFID()">Bind & Continue →</button>
          <button class="btn btn-secondary" onclick="enrolNext('face')">Skip →</button>
        </div>
        <button onclick="enrolGoList()" style="display:block;margin-top:10px;background:none;border:none;color:#6B7280;font-size:12px;cursor:pointer;width:100%;text-align:center">← Back to list</button>
      </div>`;
    return;
  }

  // ── FACE STEP ────────────────────────────────────────────
  if(s.step==='face'){
    const hasFace=s.selected?.has_face;
    body.innerHTML=`
      <div class="card p-5">
        <div style="display:flex;align-items:center;gap:12px;padding:12px;background:#F9FAFB;border-radius:10px;margin-bottom:20px">
          <div style="width:40px;height:40px;border-radius:50%;background:#F2C111;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;flex-shrink:0">${(s.selected?.full_name||'?')[0]}</div>
          <div>
            <div style="font-weight:700">${s.selected?.full_name||'—'}</div>
            <div style="font-size:11px;color:#6B7280">${s.selected?.id_number||''}</div>
          </div>
          <span class="badge ${s.rfidUid?'badge-green':'badge-gray'}" style="margin-left:auto">${s.rfidUid?'RFID ✓':'RFID Skipped'}</span>
        </div>
        ${hasFace?`
        <div style="background:#FFF1F2;border:1px solid #FECDD3;border-radius:10px;padding:10px 14px;margin-bottom:16px;font-size:12px;color:#9F1239;display:flex;gap:8px">
          <span style="flex-shrink:0">🔴</span>
          <span>A face template is <strong>already enrolled</strong> for this student. Submitting new photos will <strong>permanently replace</strong> the existing 512-dim ArcFace embedding. This action cannot be undone.</span>
        </div>`:''}
        <div style="font-weight:700;margin-bottom:8px">Face Enrollment</div>
        <p style="font-size:13px;color:#6B7280;margin-bottom:16px">Capture <strong>1–5 clear, front-facing photos</strong> using your camera. The AI extracts a 512-dim ArcFace embedding.</p>
        <!-- Camera preview -->
        <div style="position:relative;width:100%;aspect-ratio:4/3;background:#111;border-radius:12px;overflow:hidden;margin-bottom:10px">
          <video id="enrol-cam-video" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover;display:block"></video>
          <canvas id="enrol-cam-canvas" style="display:none"></canvas>
          <div id="enrol-cam-scanline" style="display:none;position:absolute;top:0;left:0;width:100%;height:3px;background:rgba(242,193,17,.8);animation:scanMove 2s linear infinite"></div>
          <div id="enrol-cam-badge" style="position:absolute;bottom:8px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.6);color:#fff;font-size:11px;padding:3px 10px;border-radius:20px;white-space:nowrap">Camera off</div>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:10px">
          <button class="btn btn-secondary" id="enrol-cam-start-btn" onclick="enrolCamStart()" style="flex:1">▶ Start Camera</button>
          <button class="btn btn-secondary" id="enrol-cam-stop-btn" onclick="enrolCamStop()" style="flex:1;display:none">■ Stop</button>
          <button class="btn btn-primary" id="enrol-cam-capture-btn" onclick="enrolCamCapture()" style="flex:1" disabled>📸 Capture</button>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;min-height:0" id="thumb-row"></div>
        <div id="face-dup-warn" style="display:none;background:#FFF1F2;border:1px solid #FECDD3;border-radius:8px;padding:10px 14px;font-size:12px;color:#9F1239;margin-bottom:12px;gap:8px">
          <span>🚫</span> <span id="face-dup-msg"></span>
          <div style="margin-top:8px;display:flex;gap:8px">
            <button class="btn btn-secondary" style="font-size:12px;padding:6px 12px" onclick="document.getElementById('face-dup-warn').style.display='none'">Dismiss</button>
          </div>
        </div>
        <div id="face-ai-status" style="display:none;padding:10px 14px;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;font-size:12px;color:#1D4ED8;margin-bottom:14px">
          <span class="spinner" style="border-color:rgba(29,78,216,.2);border-top-color:#1D4ED8"></span> Running ArcFace embedding extraction…
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn ${hasFace?'btn-danger':'btn-primary'}" style="flex:1" id="enrol-face-btn" onclick="enrolFace()" disabled>${hasFace?'Replace Face Template':'Enroll Face'}</button>
          <button class="btn btn-secondary" onclick="resetEnrol()">Reset</button>
        </div>
        <button onclick="enrolGoList()" style="display:block;margin-top:10px;background:none;border:none;color:#6B7280;font-size:12px;cursor:pointer;width:100%;text-align:center">← Back to list</button>
      </div>`;
    return;
  }
  // ── DONE STEP ────────────────────────────────────────────
  if(s.step==='done'){
    const stu=s.selected;
    const sec=stu?.section||stu?.department||'';
    const adviser=appSectionInfo(sec)?.adviser||'';
    body.innerHTML=`
      <div class="card p-8" style="text-align:center">
        <div style="width:64px;height:64px;background:#D1FAE5;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:28px">✓</div>
        <div style="font-size:20px;font-weight:800;margin-bottom:8px">Enrollment Complete!</div>
        <p style="font-size:13px;color:#6B7280;margin-bottom:4px"><strong>${stu?.full_name||'Student'}</strong> is now enrolled with RFID + ArcFace facial recognition.</p>
        ${sec?`<p style="font-size:12px;color:#6B7280;margin-bottom:4px">📚 Section: <strong>${sec}</strong>${adviser?` &nbsp;·&nbsp; 👤 Adviser: <strong>${adviser}</strong>`:''}</p>`:''}
        <p style="font-size:11px;color:#9CA3AF;margin-bottom:20px">Returning to list in <span id="done-countdown">4</span>s…</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;max-width:280px;margin:0 auto 20px">
          <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:12px;text-align:center">
            <div style="font-size:20px;margin-bottom:4px">💳</div>
            <div style="font-size:11px;font-weight:700;color:#065F46">RFID Bound</div>
            <div style="font-size:10px;color:#6B7280;font-family:monospace;margin-top:2px">${s.rfidUid||'Skipped'}</div>
          </div>
          <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:12px;text-align:center">
            <div style="font-size:20px;margin-bottom:4px">🤖</div>
            <div style="font-size:11px;font-weight:700;color:#1E40AF">Face Enrolled</div>
            <div style="font-size:10px;color:#6B7280;margin-top:2px">512-dim ArcFace</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;justify-content:center">
          <button class="btn btn-primary" onclick="enrolGoList()">← Back to List</button>
          <button class="btn btn-secondary" onclick="resetEnrol()">Enroll Another</button>
        </div>
      </div>`;
    // Auto-redirect countdown
    let secs=4;
    const tick=setInterval(()=>{
      secs--;
      const el=document.getElementById('done-countdown');
      if(el) el.textContent=secs;
      if(secs<=0){clearInterval(tick);enrolGoList();}
    },1000);
  }
}

// ── List helpers ────────────────────────────────────────────
function enrolListRows(students){
  if(!students.length) return `<tr><td colspan="7" style="text-align:center;padding:32px;color:#6B7280">No students found.</td></tr>`;
  return students.map(u=>{
    const sec=u.section||u.department||'';
    const adviser=appSectionInfo(sec)?.adviser||'';
    const isNew=u._justEnrolled;
    const isActive=u.status==='active';
    const statusBadge=isActive
      ?'<span style="background:#D1FAE5;color:#065F46;font-size:10px;font-weight:700;padding:3px 9px;border-radius:99px">● Active</span>'
      :'<span style="background:#FEE2E2;color:#991B1B;font-size:10px;font-weight:700;padding:3px 9px;border-radius:99px">● Inactive</span>';
    return `<tr style="border-bottom:1px solid #F3F4F6${isNew?';background:#FFFBEB':''}">
      <td style="padding:13px 16px">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:34px;height:34px;border-radius:50%;background:#F2C111;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;flex-shrink:0">${u.full_name[0]}</div>
          <div>
            <div style="font-weight:600;font-size:13px">${u.full_name}${isNew?` <span style="margin-left:5px;font-size:9px;background:#F2C111;color:#1F2937;padding:1px 6px;border-radius:99px;font-weight:700">NEW</span>`:''}</div>
            <div style="font-size:11px;color:#9CA3AF;font-family:monospace">${u.id_number}</div>
          </div>
        </div>
      </td>
      <td style="padding:13px 16px;font-size:12px">
        <div style="font-weight:600;color:#1F2937">${sec||'—'}</div>
        ${adviser?`<div style="color:#6B7280;font-size:11px;margin-top:2px">👤 ${adviser}</div>`:'<div style="color:#D1D5DB;font-size:11px">No adviser</div>'}
      </td>
      <td style="padding:13px 16px;font-size:12px">
        <div style="font-weight:500;color:#1F2937">${u.parent_name||'—'}</div>
        <div style="color:#9CA3AF;font-size:11px;font-family:monospace">${u.parent_contact||''}</div>
      </td>
      <td style="padding:13px 16px;text-align:center">${u.has_rfid?'<span class="badge badge-green">✓ Bound</span>':'<span class="badge badge-gray">None</span>'}</td>
      <td style="padding:13px 16px;text-align:center">${u.has_face?'<span class="badge badge-green">✓ Enrolled</span>':'<span class="badge badge-gray">None</span>'}</td>
      <td style="padding:13px 16px;text-align:center">${statusBadge}</td>
      <td style="padding:13px 16px;text-align:right;white-space:nowrap">
        <button onclick='enrolSelect(${JSON.stringify(u).replace(/'/g,"&#39;")})' class="btn btn-primary" style="font-size:11px;padding:6px 14px">${(!u.has_rfid||!u.has_face)?'Enroll →':'Re-enroll'}</button>
      </td>
    </tr>`;
  }).join('');
}

function enrolShowAdvisers(){
  enrolState.step='advisers';
  const el=document.getElementById('page-enrollment');
  renderEnrolInner(el);
}

function renderAdvisersPanel(body){
  const sectionKeys=appSections();
  body.innerHTML=`
    <div class="card" style="overflow:hidden">
      <div style="padding:14px 16px;border-bottom:1px solid #E5E7EB;display:flex;justify-content:space-between;align-items:center">
        <div style="font-weight:700;font-size:14px">Advisers per Section</div>
        <button class="btn btn-primary" style="font-size:11px;padding:5px 12px" onclick="enrolAddSection()">+ Add Section</button>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr>
          <th style="text-align:left;padding:10px 16px;font-size:10px;font-weight:700;text-transform:uppercase;color:#6B7280;background:#F9FAFB;border-bottom:1px solid #E5E7EB">Section</th>
          <th style="text-align:left;padding:10px 16px;font-size:10px;font-weight:700;text-transform:uppercase;color:#6B7280;background:#F9FAFB;border-bottom:1px solid #E5E7EB">Department</th>
          <th style="text-align:left;padding:10px 16px;font-size:10px;font-weight:700;text-transform:uppercase;color:#6B7280;background:#F9FAFB;border-bottom:1px solid #E5E7EB">Adviser</th>
          <th style="text-align:right;padding:10px 16px;font-size:10px;font-weight:700;text-transform:uppercase;color:#6B7280;background:#F9FAFB;border-bottom:1px solid #E5E7EB">Students</th>
          <th style="background:#F9FAFB;border-bottom:1px solid #E5E7EB;width:60px"></th>
        </tr></thead>
        <tbody>
          ${sectionKeys.map(sec=>{
            const info=appSectionInfo(sec);
            const count=appUsers().filter(u=>u.role==='student'&&(u.section===sec||u.department===sec)).length;
            return `<tr style="border-bottom:1px solid #F3F4F6" id="sec-row-${CSS.escape(sec)}">
              <td style="padding:12px 16px;font-weight:600">${sec}</td>
              <td style="padding:12px 16px;color:#6B7280">${info.department||'—'}</td>
              <td style="padding:12px 16px">
                <div style="display:flex;align-items:center;gap:8px">
                  <div style="width:28px;height:28px;border-radius:50%;background:#E5E7EB;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#6B7280">${(info.adviser||'?')[0]}</div>
                  <span>${info.adviser||'—'}</span>
                </div>
              </td>
              <td style="padding:12px 16px;text-align:right">
                <span style="font-size:12px;background:#F3F4F6;padding:2px 8px;border-radius:99px">${count} student${count!==1?'s':''}</span>
              </td>
              <td style="padding:12px 16px;text-align:right">
                <button class="btn btn-secondary" style="font-size:10px;padding:4px 10px" onclick="enrolEditSection('${sec.replace(/'/g,"\\'")}')">Edit</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div id="section-form" style="display:none;margin-top:14px"></div>
    <div style="margin-top:14px;text-align:center">
      <button class="btn btn-secondary" onclick="enrolGoList()">← Back to Students</button>
    </div>`;
}

function enrolAddSection(){
  document.getElementById('section-form').style.display='';
  document.getElementById('section-form').innerHTML=`
    <div class="card p-4">
      <div style="font-weight:700;font-size:13px;margin-bottom:12px">➕ New Section</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
        <div><label>Section Name *</label><input type="text" id="sec-name" placeholder="e.g., Grade 10-C" maxlength="40"/></div>
        <div><label>Department *</label><input type="text" id="sec-dept" placeholder="e.g., Junior High" maxlength="40"/></div>
      </div>
      <div style="margin-bottom:12px"><label>Adviser Name *</label><input type="text" id="sec-adviser" placeholder="e.g., Ms. Elena Reyes" maxlength="80"/></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" style="flex:1" onclick="enrolSaveSection(null)">Save Section</button>
        <button class="btn btn-secondary" onclick="document.getElementById('section-form').style.display='none'">Cancel</button>
      </div>
    </div>`;
}

function enrolEditSection(sec){
  const info=appSectionInfo(sec)||{};
  document.getElementById('section-form').style.display='';
  document.getElementById('section-form').innerHTML=`
    <div class="card p-4">
      <div style="font-weight:700;font-size:13px;margin-bottom:12px">✏️ Edit Section: ${sec}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
        <div><label>Section Name *</label><input type="text" id="sec-name" value="${sec}" maxlength="40" readonly style="background:#F9FAFB"/></div>
        <div><label>Department *</label><input type="text" id="sec-dept" value="${info.department||''}" maxlength="40"/></div>
      </div>
      <div style="margin-bottom:12px"><label>Adviser Name *</label><input type="text" id="sec-adviser" value="${info.adviser||''}" maxlength="80"/></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" style="flex:1" onclick="enrolSaveSection('${sec.replace(/'/g,"\\'")}')">Update</button>
        <button class="btn btn-secondary" onclick="document.getElementById('section-form').style.display='none'">Cancel</button>
      </div>
    </div>`;
  document.getElementById('section-form').scrollIntoView({behavior:'smooth'});
}

function enrolSaveSection(oldSec){
  const name=(document.getElementById('sec-name')?.value||'').trim();
  const dept=(document.getElementById('sec-dept')?.value||'').trim();
  const adviser=(document.getElementById('sec-adviser')?.value||'').trim();
  if(!vValidate([
    [document.getElementById('sec-name'), V.label(name,true,'Section name')],
    [document.getElementById('sec-dept'), V.label(dept,true,'Department')],
    [document.getElementById('sec-adviser'), V.name(adviser,'Adviser name')]
  ])) return;
  MOCK.sections[name]={adviser,department:dept};
  const body=document.getElementById('enrol-body');
  if(body) renderAdvisersPanel(body);
}

function enrolSectionChanged(val){
  const customInput=document.getElementById('ns-section-custom');
  const deptInput=document.getElementById('ns-dept');
  const adviserRow=document.getElementById('ns-adviser-row');
  const adviserName=document.getElementById('ns-adviser-name');
  if(val==='__other__'){
    customInput.style.display='';
    deptInput.value=''; deptInput.readOnly=false;
    adviserRow.style.display='none';
  } else if(val&&appSectionInfo(val)){
    customInput.style.display='none';
    deptInput.value=appSectionInfo(val).department; deptInput.readOnly=true;
    adviserName.textContent=appSectionInfo(val).adviser;
    adviserRow.style.display='';
  } else {
    customInput.style.display='none';
    deptInput.value=''; deptInput.readOnly=false;
    adviserRow.style.display='none';
  }
}

function enrolFilterList(){
  const q=(document.getElementById('enrol-q')?.value||'').toLowerCase();
  const secF=document.getElementById('enrol-section-filter')?.value||'';
  const statF=document.getElementById('enrol-status-filter')?.value||'';
  let students=appUsers().filter(u=>u.role==='student');
  if(q) students=students.filter(u=>u.full_name.toLowerCase().includes(q)||u.id_number.toLowerCase().includes(q));
  if(secF) students=students.filter(u=>(u.section||u.department||'')=== secF);
  if(statF==='complete') students=students.filter(u=>u.has_rfid&&u.has_face);
  else if(statF==='partial') students=students.filter(u=>u.has_rfid!==u.has_face);
  else if(statF==='none') students=students.filter(u=>!u.has_rfid&&!u.has_face);
  const tbody=document.getElementById('enrol-list-body');
  if(tbody) tbody.innerHTML=enrolListRows(students);
  const cnt=document.getElementById('enrol-count');
  if(cnt) cnt.textContent=students.length+' student'+(students.length!==1?'s':'');
}

function enrolShowNew(){
  const el=document.getElementById('page-enrollment');
  enrolState.step='new';
  renderEnrolInner(el);
}

function enrolGoList(){
  enrolCamStop();
  const el=document.getElementById('page-enrollment');
  enrolState={step:'list',selected:null,rfidUid:'',frames:[]};
  renderEnrolInner(el);
}

async function enrolCreateStudent(){
  const id=document.getElementById('ns-id')?.value?.trim();
  const name=document.getElementById('ns-name')?.value?.trim();
  const selVal=document.getElementById('ns-section')?.value||'';
  const section=(selVal==='__other__'?(document.getElementById('ns-section-custom')?.value?.trim()||''):selVal);
  const dept=document.getElementById('ns-dept')?.value?.trim()||(demoMode?appSectionInfo(section)?.department:appUsers().find(u=>u.role==='student'&&u.section===section)?.department)||'';
  const parentName=document.getElementById('ns-parent-name')?.value?.trim();
  const parentContact=document.getElementById('ns-parent-contact')?.value?.trim();
  const email=document.getElementById('ns-email')?.value?.trim();
  const ok=vValidate([
    [document.getElementById('ns-id'), V.idNumber(id,'ID Number')],
    [document.getElementById('ns-name'), V.name(name,'Full name')],
    [document.getElementById('ns-email'), V.email(email,true)],
    [document.getElementById('ns-parent-name'), V.name(parentName,'Parent / Guardian name')],
    [document.getElementById('ns-parent-contact'), V.phone(parentContact,true)],
    [document.getElementById('ns-section-custom'), selVal==='__other__'?V.label(document.getElementById('ns-section-custom')?.value?.trim(),true,'Section name'):'']
  ]);
  if(!ok){setEnrolAlert('error','Please correct the highlighted fields.');return;}
  if(appUsers().find(u=>u.id_number===id)){setEnrolAlert('error','ID Number already exists.');return;}
  const emailField=document.getElementById('ns-email');
  if(email && appUsers().some(u=>u.email && u.email.trim().toLowerCase()===email.toLowerCase())){
    vShow(emailField,'Email already exists.');
    setEnrolAlert('error','Email already exists.');
    return;
  }
  const password=prompt('Set an initial password (at least 8 characters) for this student:')||'';
  if(password.length<8){setEnrolAlert('error','Initial password must be at least 8 characters.');return;}
  if(!demoMode){
    const createBtn=document.getElementById('create-student-btn');
    if(createBtn){createBtn.disabled=true;createBtn.innerHTML='<span class="spinner"></span> Creating account…';}
    try{
      const r=await apiFetch('/users/',{method:'POST',body:JSON.stringify({id_number:id,full_name:name,email:email||null,password,role:'student',section:section||null,department:dept||null,parent_name:parentName,parent_contact:parentContact})});
      if(!r?.ok){let msg='Could not create student.';try{const detail=(await r.json()).detail;if(typeof detail==='string')msg=detail;else if(Array.isArray(detail))msg=detail.map(e=>e?.msg||e?.message||JSON.stringify(e)).join('; ');else if(detail&&typeof detail==='object')msg=detail.msg||detail.message||JSON.stringify(detail);}catch{}if(/email already exists|student id or email already exists/i.test(msg))vShow(emailField,'Email already exists.');setEnrolAlert('error',msg);return;}
      const saved=await r.json();backendUsers=[...backendUsers,saved];enrolState.selected={...saved,has_rfid:false,has_face:false};enrolState.step='rfid';renderEnrolInner(document.getElementById('page-enrollment'));setEnrolAlert('success','Created account successfully.');return;
    }catch{
      setEnrolAlert('error','Could not reach the server. Please try again.');
      return;
    }finally{
      const btn=document.getElementById('create-student-btn');
      if(btn){btn.disabled=false;btn.innerHTML='Create & Continue →';}
    }
  }
  const newStudent={id:'u-'+Date.now(),id_number:id,full_name:name,role:'student',department:dept,section:section,has_rfid:false,has_face:false,status:'active',parent_name:parentName,parent_contact:parentContact,_justEnrolled:true};
  MOCK.users.push(newStudent);
  enrolState.selected=newStudent;
  enrolState.step='rfid';
  const el=document.getElementById('page-enrollment');
  renderEnrolInner(el);
  setEnrolAlert('success','Created account successfully.');
}

function enrolSelect(u){enrolState.selected=u;enrolState.step='rfid';const el=document.getElementById('page-enrollment');renderEnrolInner(el);}
function enrolNext(step){enrolCamStop();enrolState.step=step;const _el=document.getElementById('page-enrollment');if(_el)renderEnrolInner(_el);else renderEnrolStep();}

// Live duplicate check as user types UID
function checkRfidDuplicate(input){
  // Restrict input to uppercase letters/numbers as it is typed.
  const cleaned=(input.value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(input.value!==cleaned) input.value=cleaned;
  const uid=cleaned;
  const warn=document.getElementById('rfid-dup-warn');
  const btn=document.getElementById('rfid-bind-btn');
  if(!warn||!uid){if(warn)warn.style.display='none';if(btn)btn.disabled=false;return;}
  const ownerId=MOCK.rfidCards[uid];
  if(ownerId && ownerId!==enrolState.selected?.id){
    const owner=appUsers().find(u=>u.id===ownerId);
    warn.style.display='block';
    warn.textContent=`🚫 This card is already bound to ${owner?owner.full_name+' ('+owner.id_number+')':'another user'}. Enter a different UID.`;
    if(btn) btn.disabled=true;
  } else {
    warn.style.display='none';
    if(btn) btn.disabled=false;
  }
}

async function enrolBindRFID(){
  const uid=(document.getElementById('rfid-uid')?.value||'').trim().toUpperCase();
  if(!vValidate([[document.getElementById('rfid-uid'), V.rfid(uid)]])){setEnrolAlert('error','Please correct the RFID UID.');return;}

  // Duplicate check
  const existingOwner=demoMode?MOCK.rfidCards[uid]:null;
  if(existingOwner && existingOwner!==enrolState.selected?.id){
    const owner=appUsers().find(u=>u.id===existingOwner);
    setEnrolAlert('error',`This card (${uid}) is already bound to ${owner?owner.full_name+' — '+owner.id_number:'another user'}. Each card can only be assigned to one person.`);
    return;
  }

  enrolState.rfidUid=uid;

  if(demoMode){
    // Release old UID if re-binding
    const sel=enrolState.selected;
    if(sel?.rfid_uid && sel.rfid_uid!==uid) delete MOCK.rfidCards[sel.rfid_uid];
    // Register new UID
    MOCK.rfidCards[uid]=sel?.id;
    const u=appUsers().find(u=>u.id===sel?.id);
    if(u){u.has_rfid=true;u.rfid_uid=uid;}
    // Refresh monitor student selectors so newly enrolled student appears immediately
    _refreshRfidSelectors();
    setEnrolAlert('success',`Card <strong>${uid}</strong> bound successfully.`);
    setTimeout(()=>enrolNext('face'),700);
    return;
  }

  try{
    const r=await apiFetch(`/enrollment/${enrolState.selected.id}/rfid`,{method:'POST',body:JSON.stringify({card_uid:uid})});
    const d=await r.json();
    if(!r.ok){const msg=d.detail||'Binding failed. The card may already be in use.';if(r.status===409)vShow(document.getElementById('rfid-uid'),msg);setEnrolAlert('error',msg);return;}
    enrolState.selected.has_rfid=true;enrolState.selected.rfid_uid=d.card_uid;
    backendUsers=backendUsers.map(u=>u.id===enrolState.selected.id?{...u,has_rfid:true,rfid_uid:d.card_uid}:u);
    setEnrolAlert('success',`Card <strong>${uid}</strong> bound successfully.`);
    setTimeout(()=>enrolNext('face'),700);
  }catch{setEnrolAlert('error','Server error.');}
}

// ── Camera capture for face enrollment ──────────────────────
let _enrolCamStream=null;

async function enrolCamStart(){
  try{
    const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:480}},audio:false});
    _enrolCamStream=stream;
    const vid=document.getElementById('enrol-cam-video');
    if(vid){vid.srcObject=stream;await vid.play();}
    const scanline=document.getElementById('enrol-cam-scanline');
    const badge=document.getElementById('enrol-cam-badge');
    const startBtn=document.getElementById('enrol-cam-start-btn');
    const stopBtn=document.getElementById('enrol-cam-stop-btn');
    const captureBtn=document.getElementById('enrol-cam-capture-btn');
    if(scanline) scanline.style.display='block';
    if(badge) badge.textContent='Camera on — face the camera';
    if(startBtn) startBtn.style.display='none';
    if(stopBtn) stopBtn.style.display='';
    if(captureBtn) captureBtn.disabled=false;
  }catch(e){
    setEnrolAlert('error','Camera access denied or unavailable. '+e.message);
  }
}

function enrolCamStop(){
  if(_enrolCamStream){_enrolCamStream.getTracks().forEach(t=>t.stop());_enrolCamStream=null;}
  const vid=document.getElementById('enrol-cam-video');
  if(vid){vid.srcObject=null;}
  const scanline=document.getElementById('enrol-cam-scanline');
  const badge=document.getElementById('enrol-cam-badge');
  const startBtn=document.getElementById('enrol-cam-start-btn');
  const stopBtn=document.getElementById('enrol-cam-stop-btn');
  const captureBtn=document.getElementById('enrol-cam-capture-btn');
  if(scanline) scanline.style.display='none';
  if(badge) badge.textContent='Camera off';
  if(startBtn) startBtn.style.display='';
  if(stopBtn) stopBtn.style.display='none';
  if(captureBtn) captureBtn.disabled=true;
}

function enrolCamCapture(){
  const vid=document.getElementById('enrol-cam-video');
  const canvas=document.getElementById('enrol-cam-canvas');
  if(!vid||!canvas||!_enrolCamStream) return;
  if(enrolState.frames.length>=5){setEnrolAlert('error','Maximum 5 photos reached. Remove some before capturing more.');return;}
  canvas.width=vid.videoWidth||640;
  canvas.height=vid.videoHeight||480;
  const ctx=canvas.getContext('2d');
  ctx.drawImage(vid,0,0,canvas.width,canvas.height);
  canvas.toBlob(blob=>{
    if(!blob) return;
    // Store blob with a synthetic name for dup-hash purposes
    blob.name='capture_'+Date.now()+'.jpg';
    enrolState.frames.push(blob);
    _enrolUpdateCaptureThumbs();
  },'image/jpeg',0.92);
}

function enrolCamRemoveCapture(idx){
  enrolState.frames.splice(idx,1);
  _enrolUpdateCaptureThumbs();
}

function _enrolUpdateCaptureThumbs(){
  const row=document.getElementById('thumb-row');
  const btn=document.getElementById('enrol-face-btn');
  const captureBtn=document.getElementById('enrol-cam-capture-btn');
  const count=enrolState.frames.length;
  if(row){
    row.innerHTML=enrolState.frames.map((b,i)=>`
      <div style="position:relative;flex-shrink:0">
        <img src="${URL.createObjectURL(b)}" style="width:64px;height:64px;border-radius:8px;border:2px solid #F2C111;object-fit:cover;display:block"/>
        <button onclick="enrolCamRemoveCapture(${i})" style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;background:#EF4444;border:none;color:#fff;font-size:10px;cursor:pointer;line-height:18px;padding:0;display:flex;align-items:center;justify-content:center">✕</button>
      </div>`).join('');
  }
  const hasFace=enrolState.selected?.has_face;
  if(btn){
    btn.disabled=count===0;
    btn.textContent=count===0?(hasFace?'Replace Face Template':'Enroll Face'):`${hasFace?'Replace':'Enroll'} Face (${count} photo${count!==1?'s':''})`;
  }
  if(captureBtn) captureBtn.disabled=(!_enrolCamStream||count>=5);
}

async function enrolFace(){
  if(!enrolState.frames.length){setEnrolAlert('error','Capture at least 1 photo before enrolling.');return;}

  const sel=enrolState.selected;

  // RESTRICTION: Check if this face is already registered to another student
  // Extract pixel histogram features from the first captured frame
  const btn=document.getElementById('enrol-face-btn');
  if(btn){btn.disabled=true;btn.innerHTML='<span class="spinner"></span> Checking for duplicates…';}

  let newFeatures=null;
  try{
    const dataUrl=await new Promise(res=>{
      const fr=new FileReader();
      fr.onload=e=>res(e.target.result);
      fr.readAsDataURL(enrolState.frames[0]);
    });
    newFeatures=await extractImageFeatures(dataUrl);
  }catch(e){}

  if(newFeatures){
    // Compare against every enrolled student that is NOT the current one
    const enrolledStudents=appUsers().filter(u=>u._faceFeatures && u.id!==sel?.id);
    for(const u of enrolledStudents){
      const sim=compareImageFeatures(newFeatures, u._faceFeatures);
      if(sim!==null && sim>=FACE_SIM_THRESHOLD){
        // Duplicate face found
        if(btn){btn.disabled=false;btn.textContent='Enroll Face';}
        const warn=document.getElementById('face-dup-warn');
        const msg=document.getElementById('face-dup-msg');
        if(warn&&msg){
          const cosine=parseFloat((1-sim).toFixed(4));
          msg.textContent=`🚫 This face is already registered to ${u.full_name} (${u.id_number}) — cosine distance: ${cosine}. Each person can only have one biometric record. Duplicate enrollment is not permitted.`;
          warn.style.display='flex';warn.style.flexDirection='column';
        }
        return;
      }
    }
  }

  // Passed all checks — proceed with enrollment
  if(btn){btn.disabled=false;}
  enrolFaceConfirmed();
}

async function enrolFaceConfirmed(){
  const btn=document.getElementById('enrol-face-btn');
  const aiStatus=document.getElementById('face-ai-status');
  const dupWarn=document.getElementById('face-dup-warn');
  if(dupWarn) dupWarn.style.display='none';
  if(btn){btn.disabled=true;btn.innerHTML='<span class="spinner"></span> Processing…';}
  if(aiStatus) aiStatus.style.display='flex';

  if(demoMode){
    setTimeout(()=>{
      const sel=enrolState.selected;
      const u=appUsers().find(u=>u.id===sel?.id);
      if(u){
        // Remove old face hash if re-enrolling
        Object.keys(MOCK.faceHashes).forEach(k=>{if(MOCK.faceHashes[k]===sel.id)delete MOCK.faceHashes[k];});
        u.has_face=true;
        // Store first frame as enrolled face reference photo (base64 data URL)
        // and pre-compute pixel histogram features for face matching
        if(enrolState.frames.length>0){
          const fr=new FileReader();
          fr.onload=e=>{
            u.face_photo=e.target.result;
            // Pre-compute features so simFaceMatch can compare without async delay
            extractImageFeatures(u.face_photo).then(f=>{u._faceFeatures=f;});
          };
          fr.readAsDataURL(enrolState.frames[0]);
        }
        // Register new "hash"
        const hashKey='fname:'+(enrolState.frames[0]?.name||'new');
        MOCK.faceHashes[hashKey]=sel.id;
      }
      if(aiStatus) aiStatus.style.display='none';
      setEnrolAlert('success','Face enrolled — 512-dim ArcFace embedding saved.');
      setTimeout(()=>enrolNext('done'),700);
    },1800);
    return;
  }

  try{
    const fd=new FormData();
    enrolState.frames.forEach(f=>fd.append('frames',f));
    const r=await fetch(`${API}/enrollment/${enrolState.selected.id}/face`,{method:'POST',headers:{'Authorization':'Bearer '+currentUser.token},body:fd});
    const d=await r.json();
    if(aiStatus) aiStatus.style.display='none';
    if(!r.ok){
      // Backend returns 409 for duplicate face
      setEnrolAlert('error',d.detail||'Enrollment failed.');
      if(btn){btn.disabled=false;btn.textContent='Enroll Face';}
      return;
    }
    enrolState.selected.has_face=true;
    if(d.face_photo_url) enrolState.selected.face_photo=d.face_photo_url;
    backendUsers=backendUsers.map(u=>u.id===enrolState.selected.id?{...u,has_face:true,face_photo:d.face_photo_url||u.face_photo}:u);
    setEnrolAlert('success','Face enrolled successfully!');
    setTimeout(()=>enrolNext('done'),700);
  }catch{
    if(aiStatus) aiStatus.style.display='none';
    setEnrolAlert('error','Server error.');
    if(btn){btn.disabled=false;btn.textContent='Enroll Face';}
  }
}

function resetEnrol(){enrolCamStop();enrolState={step:'list',selected:null,rfidUid:'',frames:[]};const el=document.getElementById('page-enrollment');renderEnrolInner(el);}
function setEnrolAlert(type,msg){const el=document.getElementById('enrol-alert');if(!el)return;el.innerHTML=`<div class="alert alert-${type}" style="margin-top:0;margin-bottom:12px">${type==='success'?'✓':'⚠'} ${msg}</div>`;}


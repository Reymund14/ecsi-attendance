/* ECSI Attendance System — student
   Extracted verbatim from index.html (original lines 3272–3596).
   Loaded as a classic global script via /js/student.js. */

// ═══════════════════════════════════════════════════════════
// STUDENT — MY ACCOUNT
// ═══════════════════════════════════════════════════════════
function renderStudentProfile(el){
  const me=appUsers().find(u=>u.id===currentUser.id)||currentUser;
  const sec=me.section||me.department||'—';
  const adviser=appSectionInfo(sec)?.adviser||'—';
  const dept=appSectionInfo(sec)?.department||me.department||'—';
  el.innerHTML=`
    <div class="topbar"><span class="font-bold">My Account</span></div>
    ${demoMode?`<div class="demo-banner"><div class="demo-banner-dot"></div>Demo Mode — changes are saved locally and reset on page reload</div>`:''}
    <div class="page-content" style="max-width:640px">
      <div id="profile-alert"></div>

      <!-- Identity card (read-only) -->
      <div class="card p-5" style="margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px">
          <div style="width:56px;height:56px;border-radius:50%;background:#F2C111;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:22px;flex-shrink:0">${(me.full_name||'?')[0]}</div>
          <div>
            <div style="font-weight:700;font-size:16px">${me.full_name}</div>
            <div style="font-size:12px;color:#6B7280">${me.id_number} · ${me.role}</div>
          </div>
          <span class="badge ${me.has_rfid?'badge-green':'badge-gray'}" style="margin-left:auto">${me.has_rfid?'RFID ✓':'No RFID'}</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          ${[['Section',sec],['Department',dept],['Adviser',adviser],['Status',me.status||'active']].map(([l,v])=>`
            <div style="background:#F9FAFB;border-radius:8px;padding:10px 14px">
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#9CA3AF;margin-bottom:3px">${l}</div>
              <div style="font-weight:600;font-size:13px;color:#1F2937">${v}</div>
            </div>`).join('')}
        </div>
      </div>

      <!-- Editable fields -->
      <div class="card p-5">
        <div style="font-weight:700;margin-bottom:16px">Edit Profile</div>
        <div style="display:flex;flex-direction:column;gap:14px">
          <div>
            <label style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Full Name</label>
            <input id="prof-name" type="text" value="${me.full_name||''}" maxlength="80" autocomplete="name" style="width:100%;padding:9px 12px;border:1px solid #E5E7EB;border-radius:8px;font-size:13px;box-sizing:border-box"/>
          </div>
          <div>
            <label style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Home Address</label>
            <input id="prof-address" type="text" value="${me.address||''}" placeholder="e.g. 123 Rizal St., Brgy. San Jose, City" maxlength="120" autocomplete="street-address" style="width:100%;padding:9px 12px;border:1px solid #E5E7EB;border-radius:8px;font-size:13px;box-sizing:border-box"/>
          </div>
          <div>
            <label style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Contact Number</label>
            <input id="prof-contact" type="tel" inputmode="numeric" value="${me.phone||me.contact||''}" placeholder="e.g. 09171234567" maxlength="16" autocomplete="tel" style="width:100%;padding:9px 12px;border:1px solid #E5E7EB;border-radius:8px;font-size:13px;box-sizing:border-box"/>
          </div>
          <div>
            <label style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Parent / Guardian Name</label>
            <input id="prof-parent" type="text" value="${me.parent_name||''}" placeholder="Parent or guardian full name" maxlength="80" style="width:100%;padding:9px 12px;border:1px solid #E5E7EB;border-radius:8px;font-size:13px;box-sizing:border-box"/>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:18px">
          <button class="btn btn-primary" style="flex:1" onclick="saveStudentProfile()">Save Changes</button>
          <button class="btn btn-secondary" onclick="renderStudentProfile(document.getElementById('page-student-profile'))">Reset</button>
        </div>
      </div>${currentUser?.role==='parent'?'':'`'}
    </div>`;
}

async function saveStudentProfile(){
  const me=appUsers().find(u=>u.id===currentUser.id);
  if(!me){setProfileAlert('error','User not found.');return;}
  const name=document.getElementById('prof-name')?.value.trim();
  const address=document.getElementById('prof-address')?.value.trim();
  const contact=document.getElementById('prof-contact')?.value.trim();
  const parent=document.getElementById('prof-parent')?.value.trim();
  const ok=vValidate([
    [document.getElementById('prof-name'), V.name(name,'Full name')],
    [document.getElementById('prof-address'), V.text(120,false,'Home address')(address)],
    [document.getElementById('prof-contact'), V.phone(contact)],
    [document.getElementById('prof-parent'), V.nameOpt(parent,'Parent / Guardian name')]
  ]);
  if(!ok){setProfileAlert('error','Please correct the highlighted fields.');return;}
  if(demoMode){
    me.full_name=name;me.address=address;me.phone=contact;me.parent_name=parent;
  }else{
    const r=await apiFetch(`/users/${encodeURIComponent(me.id)}`,{method:'PATCH',body:JSON.stringify({full_name:name,address,phone:contact,parent_name:parent})});
    const d=r?await r.json():{};
    if(!r?.ok){setProfileAlert('error',d.detail||'Could not save profile changes.');return;}
    Object.assign(currentUser,d,{token:currentUser.token});
    backendUsers=backendUsers.map(u=>u.id===d.id?d:u);
  }
  currentUser.full_name=name;
  document.getElementById('sb-name').textContent=name;
  setProfileAlert('success','Profile updated successfully.');
}
function setProfileAlert(type,msg){
  const el=document.getElementById('profile-alert');
  if(!el) return;
  el.innerHTML=`<div class="alert alert-${type}" style="margin-bottom:12px">${type==='success'?'✓':'⚠'} ${msg}</div>`;
  setTimeout(()=>{if(el)el.innerHTML='';},3500);
}

// ═══════════════════════════════════════════════════════════
// STUDENT — EXCUSE REQUEST
// ═══════════════════════════════════════════════════════════
function renderStudentExcuse(el){
  const me=appUsers().find(u=>u.id===currentUser.id)||currentUser;
  const sec=me.section||'—';
  const adviser=appSectionInfo(sec)?.adviser||'—';
  const myRequests=appExcuseRequests().filter(r=>r.student_id===me.id);
  const today=new Date().toISOString().split('T')[0];

  const statusBadge=(s)=>({
    pending: `<span style="background:#FEF3C7;color:#92400E;font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px">⏳ Pending</span>`,
    approved:`<span style="background:#D1FAE5;color:#065F46;font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px">✓ Approved</span>`,
    rejected:`<span style="background:#FEE2E2;color:#991B1B;font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px">✕ Rejected</span>`,
  })[s]||s;

  el.innerHTML=`
    <div class="topbar"><span class="font-bold">Excuse Request</span></div>
    ${demoMode?`<div class="demo-banner"><div class="demo-banner-dot"></div>Demo Mode — requests are submitted locally and reviewed by your adviser</div>`:''}
    <div class="page-content" style="max-width:640px">
      <div id="excuse-alert"></div>

      <!-- Adviser info strip -->
      <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:10px 16px;margin-bottom:16px;display:flex;align-items:center;gap:10px">
        <div style="font-size:20px">👩‍🏫</div>
        <div>
          <div style="font-size:11px;color:#1D4ED8;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Your Adviser</div>
          <div style="font-weight:700;font-size:13px;color:#1E3A8A">${adviser} <span style="color:#93C5FD;font-weight:400">· ${sec}</span></div>
        </div>
      </div>

      <!-- File new request -->
      <div class="card p-5" style="margin-bottom:16px">
        <div style="font-weight:700;margin-bottom:16px">File an Excuse Request</div>
        <div style="display:flex;flex-direction:column;gap:12px">
          <div>
            <label style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Date of Absence</label>
            <input id="exc-date" type="date" value="${today}" max="${today}" style="width:100%;padding:9px 12px;border:1px solid #E5E7EB;border-radius:8px;font-size:13px;box-sizing:border-box"/>
          </div>
          <div>
            <label style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Reason for Absence</label>
            <select id="exc-reason-type" onchange="toggleExcuseOther()" style="width:100%;padding:9px 12px;border:1px solid #E5E7EB;border-radius:8px;font-size:13px;background:#fff;box-sizing:border-box;margin-bottom:8px">
              <option value="">Select a reason…</option>
              <option value="Medical / Illness">Medical / Illness</option>
              <option value="Family emergency">Family Emergency</option>
              <option value="School event / activity">School Event / Activity</option>
              <option value="Transport issues">Transport Issues</option>
              <option value="Other">Other (specify below)</option>
            </select>
            <textarea id="exc-details" rows="3" placeholder="Additional details or supporting information…" maxlength="500" style="width:100%;padding:9px 12px;border:1px solid #E5E7EB;border-radius:8px;font-size:13px;resize:vertical;box-sizing:border-box;font-family:inherit"></textarea>
          </div>
          <!-- Proof / excuse letter upload -->
          <div>
            <label style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">
              Proof / Excuse Letter <span style="font-weight:400;color:#9CA3AF;text-transform:none">(image or PDF · optional but recommended)</span>
            </label>
            <div id="exc-drop-zone"
              onclick="document.getElementById('exc-proof-input').click()"
              ondragover="event.preventDefault();this.style.borderColor='#F2C111'"
              ondragleave="this.style.borderColor='#E5E7EB'"
              ondrop="event.preventDefault();this.style.borderColor='#E5E7EB';excHandleDrop(event)"
              style="border:2px dashed #E5E7EB;border-radius:10px;padding:20px;text-align:center;cursor:pointer;transition:border-color .2s;background:#FAFAFA">
              <div style="font-size:28px;margin-bottom:6px">📎</div>
              <div style="font-size:13px;font-weight:600;color:#374151">Click or drag a file here</div>
              <div style="font-size:11px;color:#9CA3AF;margin-top:3px">JPG · PNG · PDF · max 5 MB</div>
              <input type="file" id="exc-proof-input" accept="image/*,.pdf" style="display:none" onchange="excHandleFile(this.files[0])"/>
            </div>
            <!-- Preview -->
            <div id="exc-proof-preview" style="display:none;margin-top:10px;position:relative">
              <div style="display:flex;align-items:center;gap:10px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:10px 14px">
                <span id="exc-proof-icon" style="font-size:22px">📄</span>
                <div style="flex:1;min-width:0">
                  <div id="exc-proof-name" style="font-weight:600;font-size:12px;color:#065F46;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div>
                  <div id="exc-proof-size" style="font-size:11px;color:#6B7280"></div>
                </div>
                <button onclick="excClearProof()" style="background:#FEE2E2;color:#EF4444;border:none;border-radius:6px;padding:4px 9px;font-size:11px;cursor:pointer;font-weight:600;flex-shrink:0">✕ Remove</button>
              </div>
              <img id="exc-proof-img-thumb" src="" alt="preview" style="display:none;width:100%;max-height:180px;object-fit:contain;border-radius:8px;margin-top:8px;border:1px solid #E5E7EB"/>
            </div>
          </div>
        </div>
        <button class="btn btn-primary" style="width:100%;margin-top:14px" onclick="submitExcuseRequest()">📨 Submit to Adviser</button>
      </div>

      <!-- Past requests -->
      <div class="card" style="margin-bottom:20px">
        <div style="padding:14px 20px;border-bottom:1px solid #E5E7EB;font-weight:700;font-size:13px">My Excuse Requests <span style="font-weight:400;color:#6B7280;font-size:12px">(${myRequests.length})</span></div>
        ${myRequests.length?`<div style="display:flex;flex-direction:column">
          ${myRequests.map(r=>`
            <div style="padding:14px 20px;border-bottom:1px solid #F3F4F6;display:flex;gap:12px;align-items:flex-start">
              <div style="flex:1">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                  <span style="font-weight:600;font-size:13px">${r.date}</span>
                  ${statusBadge(r.status)}
                  ${r.proof_name?`<span style="font-size:10px;background:#EFF6FF;color:#1D4ED8;padding:2px 7px;border-radius:99px;font-weight:600">📎 ${r.proof_name}</span>`:'<span style="font-size:10px;color:#D1D5DB">No attachment</span>'}
                </div>
                <div style="font-size:12px;color:#374151">${r.reason}</div>
                ${r.adviser_note?`<div style="font-size:11px;color:#6B7280;margin-top:4px;background:#F9FAFB;border-radius:6px;padding:5px 8px">💬 Adviser: ${r.adviser_note}</div>`:''}
                ${r.proof_data&&r.proof_type&&r.proof_type.startsWith('image/')?`<img src="${r.proof_data}" style="max-width:180px;max-height:100px;object-fit:contain;border-radius:6px;border:1px solid #E5E7EB;margin-top:8px;cursor:pointer" onclick="excViewProof('${r.id}')" title="Click to view full size"/>`:''}
                ${r.proof_data&&r.proof_type==='application/pdf'?`<a href="${r.proof_data}" target="_blank" style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:#1D4ED8;font-weight:600;margin-top:6px;text-decoration:none">📄 View PDF</a>`:''}
              </div>
              <div style="font-size:10px;color:#9CA3AF;white-space:nowrap">${new Date(r.filed_at).toLocaleDateString()}</div>
            </div>`).join('')}
        </div>`:`<div style="padding:32px;text-align:center;color:#9CA3AF;font-size:13px">No excuse requests filed yet.</div>`}
      </div>
    </div>`;
}

function toggleExcuseOther(){
  const sel=document.getElementById('exc-reason-type');
  const det=document.getElementById('exc-details');
  if(!det) return;
  det.placeholder=sel?.value==='Other'?'Please specify your reason…':'Additional details or supporting information…';
}

// ── Excuse proof upload helpers ──────────────────────────────
let _excProofData=null,_excProofName=null,_excProofType=null,_excProofFile=null;

function excHandleDrop(e){
  const f=e.dataTransfer?.files?.[0];
  if(f) excHandleFile(f);
}
function excHandleFile(f){
  if(!f) return;
  if(f.size>5*1024*1024){alert('File too large — maximum 5 MB.');return;}
  const allowed=['image/jpeg','image/png','image/webp','application/pdf'];
  if(!allowed.includes(f.type)){alert('Only JPG, PNG, WebP, or PDF files are allowed.');return;}
  const reader=new FileReader();
  reader.onload=e=>{
    _excProofData=e.target.result;
    _excProofName=f.name;
    _excProofType=f.type;
    _excProofFile=f;
    // Update preview
    const prev=document.getElementById('exc-proof-preview');
    const icon=document.getElementById('exc-proof-icon');
    const name=document.getElementById('exc-proof-name');
    const size=document.getElementById('exc-proof-size');
    const thumb=document.getElementById('exc-proof-img-thumb');
    const dz=document.getElementById('exc-drop-zone');
    if(prev) prev.style.display='block';
    if(icon) icon.textContent=f.type==='application/pdf'?'📄':'🖼️';
    if(name) name.textContent=f.name;
    if(size) size.textContent=(f.size/1024).toFixed(1)+' KB · '+(f.type==='application/pdf'?'PDF':'Image');
    if(dz) dz.style.display='none';
    if(thumb){
      if(f.type.startsWith('image/')){thumb.src=e.target.result;thumb.style.display='block';}
      else{thumb.style.display='none';}
    }
  };
  reader.readAsDataURL(f);
}
function excClearProof(){
  _excProofData=null;_excProofName=null;_excProofType=null;_excProofFile=null;
  const prev=document.getElementById('exc-proof-preview');
  const dz=document.getElementById('exc-drop-zone');
  const inp=document.getElementById('exc-proof-input');
  const thumb=document.getElementById('exc-proof-img-thumb');
  if(prev) prev.style.display='none';
  if(dz) dz.style.display='block';
  if(inp) inp.value='';
  if(thumb){thumb.src='';thumb.style.display='none';}
}

// Lightbox viewer for image proofs
function excViewProof(reqId){
  const req=appExcuseRequests().find(r=>r.id===reqId);
  const proofUrl=req?.proof_data||req?.proof_url;
  if(!proofUrl) return;
  let lb=document.getElementById('exc-lightbox');
  if(!lb){lb=document.createElement('div');lb.id='exc-lightbox';document.body.appendChild(lb);}
  lb.style.cssText='position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;padding:20px;cursor:zoom-out';
  lb.innerHTML=`<div style="position:relative;max-width:90vw;max-height:90vh">
    <img src="${proofUrl}" style="max-width:100%;max-height:90vh;border-radius:10px;display:block"/>
    <div style="position:absolute;top:-14px;right:-14px;background:#EF4444;color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,.4)" onclick="document.getElementById('exc-lightbox').style.display='none'">✕</div>
    <div style="text-align:center;color:#9CA3AF;font-size:11px;margin-top:8px">${req.proof_name||''} · ${req.student_name}</div>
  </div>`;
  lb.onclick=e=>{if(e.target===lb)lb.style.display='none';};
}

async function submitExcuseRequest(){
  const me=appUsers().find(u=>u.id===currentUser.id)||currentUser;
  const date=document.getElementById('exc-date')?.value;
  const reasonType=document.getElementById('exc-reason-type')?.value;
  const details=document.getElementById('exc-details')?.value.trim();
  const ok=vValidate([
    [document.getElementById('exc-date'), V.pastDate(date,'Date of absence')],
    [document.getElementById('exc-reason-type'), V.select(reasonType,'a reason')],
    [document.getElementById('exc-details'),
      reasonType==='Other'
        ? V.text(500,true,'Reason details')(details)
        : V.text(500,false,'Details')(details)]
  ]);
  if(!ok){setExcuseAlert('error','Please correct the highlighted fields.');return;}
  const reason=reasonType==='Other'?(details||'Other'):reasonType+(details?` — ${details}`:'');
  const sec=me.section||'—';
  const req={
    id:'ex-'+Date.now(),
    student_id:me.id,
    student_name:me.full_name,
    id_number:me.id_number,
    section:sec,
    date,reason,
    status:'pending',
    adviser_note:'',
    filed_at:new Date().toISOString(),
    proof_data:_excProofData||null,
    proof_name:_excProofName||null,
    proof_type:_excProofType||null,
  };
  const hadProof=!!_excProofFile;
  if(demoMode){
    MOCK.excuseRequests.unshift(req);
  }else{
    const form=new FormData();
    form.append('absence_date',date);
    form.append('reason',reason);
    if(_excProofFile) form.append('proof',_excProofFile,_excProofName||_excProofFile.name);
    const response=await apiFetch('/excuses/',{method:'POST',body:form});
    const result=response?await response.json():{};
    if(!response?.ok){setExcuseAlert('error',result.detail||'Could not submit your excuse request.');return;}
    backendExcuses.unshift(normalizeExcuseRequest(result));
  }
  // Reset form
  if(document.getElementById('exc-date')) document.getElementById('exc-date').value=new Date().toISOString().split('T')[0];
  if(document.getElementById('exc-reason-type')) document.getElementById('exc-reason-type').value='';
  if(document.getElementById('exc-details')) document.getElementById('exc-details').value='';
  excClearProof();
  setExcuseAlert('success',hadProof?'Request with proof submitted to your adviser.':'Request submitted. You can also attach a proof document for faster approval.');
  _excProofData=null;_excProofName=null;_excProofType=null;_excProofFile=null;
  // Re-render the list
  setTimeout(()=>renderStudentExcuse(document.getElementById('page-student-excuse')),1200);
}

function setExcuseAlert(type,msg){
  const el=document.getElementById('excuse-alert');
  if(!el) return;
  el.innerHTML=`<div class="alert alert-${type}" style="margin-bottom:12px">${type==='success'?'✓':'⚠'} ${msg}</div>`;
  setTimeout(()=>{if(el)el.innerHTML='';},3500);
}


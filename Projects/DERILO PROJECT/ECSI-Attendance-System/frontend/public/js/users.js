/* ECSI Attendance System — users
   Extracted verbatim from index.html (original lines 2457–2738).
   Loaded as a classic global script via /js/users.js. */

// ═══════════════════════════════════════════════════════════
// USERS
// ═══════════════════════════════════════════════════════════
function renderUsers(el){
  el.innerHTML=`
    <div class="topbar">
      <span class="font-bold">User Management</span>
      <button class="btn btn-primary" style="font-size:12px" onclick="openUserModal()">＋ Add User</button>
    </div>
    ${demoMode?`<div class="demo-banner"><div class="demo-banner-dot"></div>Demo Mode — changes apply to in-memory data only</div>`:''}
    <div class="page-content">
      <div class="filter-row" style="flex-wrap:wrap;gap:8px">
        <div style="flex:1;min-width:180px"><input type="text" id="user-q" placeholder="Search by name or ID…" maxlength="60" spellcheck="false"/></div>
        <div>
          <select id="user-role-f" onchange="loadUsers()">
            <option value="">All Roles</option>
            <option value="super_admin">Super Admin</option>
            <option value="faculty">Faculty</option>
            <option value="student">Student</option>
          </select>
        </div>
        <div>
          <select id="user-status-f" onchange="loadUsers()">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <button class="btn btn-primary" onclick="loadUsers()">Search</button>
      </div>
      <div class="card"><div class="table-wrap"><table>
        <thead><tr><th>ID Number</th><th>Full Name</th><th>Role</th><th>Dept / Section</th><th>RFID</th><th>Face</th><th>Status</th><th style="text-align:center">Actions</th></tr></thead>
        <tbody id="user-tbody"><tr class="empty-row"><td colspan="8">Loading…</td></tr></tbody>
      </table></div></div>
    </div>
    <!-- User CRUD Modal -->
    <div id="user-modal" style="display:none;position:fixed;inset:0;z-index:5000;background:rgba(0,0,0,.5);backdrop-filter:blur(3px);align-items:center;justify-content:center">
      <div style="background:#fff;border-radius:16px;width:520px;max-width:95vw;max-height:90vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,.3)">
        <div style="padding:20px 24px;border-bottom:1px solid #F3F4F6;display:flex;align-items:center;justify-content:space-between">
          <span id="user-modal-title" style="font-weight:700;font-size:16px">Add User</span>
          <button onclick="closeUserModal()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#6B7280;line-height:1">×</button>
        </div>
        <div style="padding:24px" id="user-modal-body"></div>
      </div>
    </div>
    <!-- Delete Confirm Modal -->
    <div id="user-del-modal" style="display:none;position:fixed;inset:0;z-index:5100;background:rgba(0,0,0,.5);backdrop-filter:blur(3px);align-items:center;justify-content:center">
      <div style="background:#fff;border-radius:16px;width:380px;max-width:95vw;padding:28px;box-shadow:0 24px 64px rgba(0,0,0,.3);text-align:center">
        <div style="font-size:48px;margin-bottom:12px">🗑️</div>
        <div style="font-weight:700;font-size:16px;margin-bottom:8px">Delete User?</div>
        <div id="user-del-name" style="color:#6B7280;font-size:13px;margin-bottom:20px"></div>
        <div style="display:flex;gap:10px;justify-content:center">
          <button class="btn btn-secondary" onclick="closeDelModal()">Cancel</button>
          <button class="btn" style="background:#EF4444;color:#fff" id="user-del-confirm-btn">Delete</button>
        </div>
      </div>
    </div>`;
  document.getElementById('user-q').addEventListener('keydown',e=>{if(e.key==='Enter')loadUsers();});
  loadUsers();
}

async function loadUsers(){
  const q=(document.getElementById('user-q')?.value||'').toLowerCase();
  const roleF=document.getElementById('user-role-f')?.value||'';
  const statF=document.getElementById('user-status-f')?.value||'';
  const tbody=document.getElementById('user-tbody');
  if(!tbody) return;
  let users=MOCK.users;
  if(!demoMode){
    const params=new URLSearchParams();
    if(q) params.set('search',q);
    if(roleF) params.set('role',roleF);
    const records=await apiFetchAll('/users/?'+params,100);
    if(!records){tbody.innerHTML='<tr class="empty-row"><td colspan="8">Could not load users from the server.</td></tr>';return;}
    backendUsers=records;
    users=backendUsers;
  }
  if(q) users=users.filter(u=>u.full_name.toLowerCase().includes(q)||u.id_number.toLowerCase().includes(q));
  if(roleF) users=users.filter(u=>u.role===roleF);
  if(statF) users=users.filter(u=>u.status===statF);
  if(!users.length){tbody.innerHTML='<tr class="empty-row"><td colspan="8">No users found.</td></tr>';return;}
  tbody.innerHTML=users.map(u=>`<tr>
    <td><span style="font-family:monospace;font-weight:700;font-size:12px">${u.id_number}</span></td>
    <td style="font-weight:500">${u.full_name}</td>
    <td>${roleBadge(u.role)}</td>
    <td style="color:#6B7280;font-size:12px">${u.section||u.department||'—'}</td>
    <td style="text-align:center">${u.has_rfid?'<span style="color:#16a34a;font-size:16px">✔</span>':'<span style="color:#D1D5DB;font-size:16px">⬜</span>'}</td>
    <td style="text-align:center">${u.has_face?'<span style="color:#16a34a;font-size:16px">✔</span>':'<span style="color:#D1D5DB;font-size:16px">⬜</span>'}</td>
    <td>${u.status==='active'?'<span class="badge badge-green">active</span>':'<span class="badge badge-red">'+u.status+'</span>'}</td>
    <td style="text-align:center;white-space:nowrap">
      <button onclick="openUserModal('${u.id}')" style="background:#EFF6FF;border:none;color:#2563EB;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:11px;font-weight:600;margin-right:4px">✏ Edit</button>
      <button onclick="openDelModal('${u.id}')" style="background:#FEF2F2;border:none;color:#DC2626;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:11px;font-weight:600">🗑 Delete</button>
    </td>
  </tr>`).join('');
}

function _userFormHtml(u){
  const sections=appSections();
  const isEdit=!!u;
  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div style="grid-column:1/-1">
        <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px">Full Name *</label>
        <input id="uf-name" type="text" value="${isEdit?u.full_name:''}" placeholder="e.g. Juan dela Cruz" maxlength="80" autocomplete="name" style="width:100%;box-sizing:border-box"/>
      </div>
      <div>
        <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px">ID Number *</label>
        <input id="uf-id" type="text" value="${isEdit?u.id_number:''}" placeholder="e.g. STU2024010" maxlength="20" spellcheck="false" autocomplete="off" style="width:100%;box-sizing:border-box" ${isEdit?'readonly style="width:100%;box-sizing:border-box;background:#F9FAFB"':''}/>
      </div>
      <div>
        <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px">Role *</label>
        <select id="uf-role" onchange="userFormRoleChanged()" style="width:100%;box-sizing:border-box">
          <option value="student" ${isEdit&&u.role==='student'?'selected':''}>Student</option>
          <option value="faculty" ${isEdit&&u.role==='faculty'?'selected':''}>Faculty</option>
          <option value="super_admin" ${isEdit&&u.role==='super_admin'?'selected':''}>Super Admin</option>
        </select>
      </div>
      <div id="uf-section-wrap">
        <label id="uf-section-label" style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px">Section</label>
        <select id="uf-section" style="width:100%;box-sizing:border-box">
          <option value="">— Select section —</option>
          ${sections.map(s=>`<option value="${s}" ${isEdit&&u.section===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      <div id="uf-dept-wrap" style="display:none">
        <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px">Department</label>
        <input id="uf-dept" type="text" value="${isEdit?u.department||'':''}" placeholder="e.g. Science" maxlength="40" style="width:100%;box-sizing:border-box"/>
      </div>
      <div>
        <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px">Email *</label>
        <input id="uf-email" type="email" value="${isEdit?u.email||'':''}" placeholder="user@school.edu" maxlength="120" autocomplete="email" style="width:100%;box-sizing:border-box"/>
      </div>
      <div>
        <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px">Mobile</label>
        <input id="uf-phone" type="tel" inputmode="numeric" data-digits value="${isEdit?u.phone||'':''}" placeholder="09XXXXXXXXX" maxlength="13" autocomplete="tel" style="width:100%;box-sizing:border-box"/>
      </div>
      <div>
        <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px">Parent / Guardian</label>
        <input id="uf-parent" type="text" value="${isEdit?u.parent_name||'':''}" placeholder="Name" maxlength="80" autocomplete="name" style="width:100%;box-sizing:border-box"/>
      </div>
      <div>
        <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px">Parent Contact</label>
        <input id="uf-parent-contact" type="tel" inputmode="numeric" data-digits value="${isEdit?u.parent_contact||'':''}" placeholder="09XXXXXXXXX" maxlength="13" style="width:100%;box-sizing:border-box"/>
      </div>
      <div style="grid-column:1/-1">
        <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px">Address</label>
        <input id="uf-address" type="text" value="${isEdit?u.address||'':''}" placeholder="Street, City, Province" maxlength="120" autocomplete="street-address" style="width:100%;box-sizing:border-box"/>
      </div>
      <div>
        <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px">Account Status</label>
        <select id="uf-status" style="width:100%;box-sizing:border-box">
          <option value="active" ${!isEdit||u.status==='active'?'selected':''}>Active</option>
          <option value="inactive" ${isEdit&&u.status==='inactive'?'selected':''}>Inactive</option>
        </select>
      </div>
      <div style="grid-column:1/-1">
        <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px">${isEdit?'New Password':'Password *'}</label>
        <div style="position:relative">
          <input id="uf-password" type="password" placeholder="${isEdit?'Leave blank to keep the current password':'At least 8 characters'}" maxlength="128" autocomplete="new-password" style="width:100%;box-sizing:border-box;padding-right:40px"/>
          <button type="button" onclick="toggleUserPw()" title="Show / hide password" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:14px;color:#6B7280;padding:2px">👁</button>
        </div>
        <div style="font-size:11px;color:#6B7280;margin-top:4px">${isEdit?'Optional — fill this in only if you want to reset this user\'s password.':'Required — minimum 8 characters.'}${demoMode?' Demo mode does not change login passwords.':''}</div>
      </div>
    </div>
    <div id="uf-error" style="color:#DC2626;font-size:12px;margin-top:12px;display:none"></div>
    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;padding-top:16px;border-top:1px solid #F3F4F6">
      <button class="btn btn-secondary" onclick="closeUserModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveUser(${isEdit?`'${u.id}'`:'null'})">${isEdit?'Save Changes':'Create User'}</button>
    </div>`;
}

function toggleUserPw(){
  const input=document.getElementById('uf-password');
  if(input) input.type=input.type==='password'?'text':'password';
}

function userFormRoleChanged(){
  const role=document.getElementById('uf-role')?.value;
  const secWrap=document.getElementById('uf-section-wrap');
  const deptWrap=document.getElementById('uf-dept-wrap');
  const secLabel=document.getElementById('uf-section-label');
  // A faculty member's advisory section lives in users.section too — that is the
  // column the API scopes attendance and excuse requests by (routers/attendance.py
  // and routers/excuses.py both filter on User.section == current_user.section).
  // Hiding it for faculty left every UI-created adviser with a NULL section, which
  // silently hid their class from them. Faculty therefore need BOTH fields.
  if(secWrap)secWrap.style.display=role==='super_admin'?'none':'';
  if(deptWrap)deptWrap.style.display=role==='student'?'none':'';
  if(secLabel)secLabel.textContent=role==='faculty'?'Advisory Section':'Section';
}

function openUserModal(userId){
  const modal=document.getElementById('user-modal');
  const title=document.getElementById('user-modal-title');
  const body=document.getElementById('user-modal-body');
  if(!modal||!body) return;
  const u=userId?appUsers().find(x=>x.id===userId):null;
  title.textContent=u?'Edit User':'Add New User';
  body.innerHTML=_userFormHtml(u);
  modal.style.display='flex';
  userFormRoleChanged();
}

function closeUserModal(){ document.getElementById('user-modal').style.display='none'; }

async function saveUser(userId){
  const name=(document.getElementById('uf-name')?.value||'').trim();
  const idNum=(document.getElementById('uf-id')?.value||'').trim();
  const role=document.getElementById('uf-role')?.value||'student';
  const section=document.getElementById('uf-section')?.value||'';
  const dept=(document.getElementById('uf-dept')?.value||'').trim();
  const email=(document.getElementById('uf-email')?.value||'').trim();
  const phone=(document.getElementById('uf-phone')?.value||'').trim();
  const parentName=(document.getElementById('uf-parent')?.value||'').trim();
  const parentContact=(document.getElementById('uf-parent-contact')?.value||'').trim();
  const address=(document.getElementById('uf-address')?.value||'').trim();
  const status=document.getElementById('uf-status')?.value||'active';
  // Only present in the edit modal. Blank means "keep the current password".
  const newPassword=document.getElementById('uf-password')?.value||'';
  const errEl=document.getElementById('uf-error');

  const ok=vValidate([
    [document.getElementById('uf-name'), V.name(name,'Full Name')],
    [document.getElementById('uf-id'), userId?'':V.idNumber(idNum,'ID Number')],
    [document.getElementById('uf-dept'), V.label(dept,false,'Department')],
    [document.getElementById('uf-email'), V.email(email,true)],
    [document.getElementById('uf-phone'), V.phone(phone)],
    [document.getElementById('uf-parent'), V.nameOpt(parentName,'Parent / Guardian name')],
    [document.getElementById('uf-parent-contact'), V.phone(parentContact)],
    [document.getElementById('uf-address'), V.text(120,false,'Address')(address)]
  ]);
  if(!ok){if(errEl){errEl.textContent='Please correct the highlighted fields.';errEl.style.display='block';}return;}
  if(!userId && newPassword.length<8){
    if(errEl){errEl.textContent='Password must be at least 8 characters.';errEl.style.display='block';}
    return;
  }
  if(newPassword && (newPassword.length<8||newPassword.length>128)){
    if(errEl){errEl.textContent='New password must be 8–128 characters, or leave it blank to keep the current password.';errEl.style.display='block';}
    return;
  }
  if(errEl) errEl.style.display='none';
  // Check duplicate ID (on create)
  if(demoMode&&!userId && appUsers().find(u=>u.id_number===idNum)){
    errEl.textContent='ID Number already exists.';errEl.style.display='block';return;
  }

  if(!demoMode){
    const payload={full_name:name,email:email||null,department:role==='student'?null:dept||null,section:role==='super_admin'?null:section||null,phone:phone||null,address:address||null,parent_name:parentName||null,parent_contact:parentContact||null,status};
    if(userId&&newPassword) payload.password=newPassword;
    let response;
    if(userId) response=await apiFetch(`/users/${userId}`,{method:'PATCH',body:JSON.stringify(payload)});
    else {
      payload.id_number=idNum;payload.role=role;payload.password=newPassword;
      response=await apiFetch('/users/',{method:'POST',body:JSON.stringify(payload)});
    }
    if(!response?.ok){let msg='Could not save user.';try{const data=await response.json();msg=data.detail||msg;}catch{}errEl.textContent=msg;errEl.style.display='block';return;}
    closeUserModal();await loadUsers();
  } else if(userId){
    // UPDATE
    const u=appUsers().find(x=>x.id===userId);
    if(u){
      u.full_name=name;u.role=role;u.email=email;u.phone=phone;
      u.parent_name=parentName;u.parent_contact=parentContact;u.address=address;u.status=status;
      if(role==='super_admin'){u.section='';u.department=dept;}
      else if(role==='student'){u.section=section;u.department='';}
      else{u.section=section;u.department=dept;}
    }
  } else {
    // CREATE
    const newId='u-'+Date.now();
    const newUser={id:newId,id_number:idNum,full_name:name,role,email,phone,
      parent_name:parentName,parent_contact:parentContact,address,status,
      has_rfid:false,has_face:false,rfid_uid:'',
      section:role==='super_admin'?'':section,
      department:role==='student'?'':dept};
    MOCK.users.push(newUser);
  }
  closeUserModal();
  loadUsers();
  // Toast
  const toast=document.createElement('div');
  toast.style.cssText=`position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999;
    background:#1F2937;color:#fff;border-radius:12px;padding:12px 20px;font-size:13px;font-weight:600;
    display:flex;align-items:center;gap:10px;box-shadow:0 8px 24px rgba(0,0,0,.4);animation:slideUp .3s ease-out`;
  toast.innerHTML=`<span style="color:#4ADE80;font-size:18px">${userId?'✔':'＋'}</span> User ${userId?'updated':'created'} successfully`;
  document.body.appendChild(toast);
  setTimeout(()=>toast.remove(),3000);
}

let _delTargetId=null;

function openDelModal(userId){
  const u=appUsers().find(x=>x.id===userId);
  if(!u) return;
  _delTargetId=userId;
  document.getElementById('user-del-name').textContent=`${u.full_name} (${u.id_number}) — this action cannot be undone.`;
  const modal=document.getElementById('user-del-modal');
  modal.style.display='flex';
  document.getElementById('user-del-confirm-btn').onclick=()=>{
    if(!demoMode){
      (async()=>{const r=await apiFetch(`/users/${_delTargetId}`,{method:'DELETE'});if(!r?.ok){alert('Could not delete user.');return;}closeDelModal();await loadUsers();})();
      return;
    }
    MOCK.users=MOCK.users.filter(x=>x.id!==_delTargetId);
    closeDelModal();loadUsers();
    const toast=document.createElement('div');
    toast.style.cssText=`position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999;
      background:#1F2937;color:#fff;border-radius:12px;padding:12px 20px;font-size:13px;font-weight:600;
      display:flex;align-items:center;gap:10px;box-shadow:0 8px 24px rgba(0,0,0,.4);animation:slideUp .3s ease-out`;
    toast.innerHTML=`<span style="color:#F87171;font-size:18px">🗑</span> User deleted`;
    document.body.appendChild(toast);setTimeout(()=>toast.remove(),3000);
  };
}

function closeDelModal(){document.getElementById('user-del-modal').style.display='none';_delTargetId=null;}


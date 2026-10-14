/* ECSI Attendance System — attendance
   Extracted verbatim from index.html (original lines 2739–2824).
   Loaded as a classic global script via /js/attendance.js. */

// ═══════════════════════════════════════════════════════════
// ATTENDANCE
// ═══════════════════════════════════════════════════════════

// Returns sections a faculty member advises (matched by adviser name in MOCK.sections)
function getFacultyAdvisorySections(facultyUser){
  if(!demoMode) return [...new Set(appUsers().filter(u=>u.role==='faculty'&&u.full_name===facultyUser.full_name&&u.section).map(u=>u.section))];
  return appSections().filter(sec=>
    appSectionInfo(sec).adviser===facultyUser.full_name
  );
}

// Returns true if an attendance record belongs to the faculty's advisory class

function isInAdvisoryClass(rec, advisorySections){
  if(!advisorySections||!advisorySections.length) return false;
  const student=appUsers().find(u=>u.id_number===rec.id_number);
  return student ? advisorySections.includes(student.section||'') : false;
}

function renderAttendance(el,myOnly){
  const today=new Date().toISOString().split('T')[0];
  const isFaculty=currentUser?.role==='faculty';
  const advisorySections=isFaculty&&!myOnly?getFacultyAdvisorySections(currentUser):[];
  const sectionLabel=advisorySections.length?`Advisory: ${advisorySections.join(', ')}`:'';
  el.innerHTML=`
    <div class="topbar">
      <span class="font-bold">${myOnly?'My Attendance':'Attendance Records'}</span>
      ${sectionLabel?`<span style="font-size:12px;color:#6B7280;background:#F3F4F6;padding:3px 10px;border-radius:20px">${sectionLabel}</span>`:''}
      ${!myOnly&&!isFaculty&&!demoMode?`<a href="${API}/admin/export/attendance" download class="btn btn-secondary" style="font-size:12px">↓ Export CSV</a>`:''}
    </div>
    ${demoMode?`<div class="demo-banner"><div class="demo-banner-dot"></div>Demo Mode — showing sample records</div>`:''}
    <div class="page-content">
      <div class="filter-row">
        <div><label>From</label><input type="date" id="att-from" value="${today}"/></div>
        <div><label>To</label><input type="date" id="att-to" value="${today}"/></div>
        <button class="btn btn-primary" onclick="loadAttendance(${myOnly})">Filter</button>
      </div>
      <div class="card"><div class="table-wrap"><table>
        <thead><tr>${!myOnly?'<th>Student</th>':''}<th>Status</th><th>Type</th><th>Distance</th><th>Terminal</th><th>Time</th></tr></thead>
        <tbody id="att-tbody"><tr class="empty-row"><td colspan="${myOnly?5:6}">Loading…</td></tr></tbody>
      </table></div></div>
    </div>`;
  loadAttendance(myOnly);
}
async function loadAttendance(myOnly){
  const from=document.getElementById('att-from')?.value;
  const to=document.getElementById('att-to')?.value;
  const tbody=document.getElementById('att-tbody');
  const cols=myOnly?5:6;
  if(!tbody) return;
  const fromEl=document.getElementById('att-from');
  const toEl=document.getElementById('att-to');
  const rangeErr=vDateRange(fromEl,toEl);
  if(rangeErr){
    vShow(toEl,rangeErr);
    tbody.innerHTML=`<tr class="empty-row"><td colspan="${cols}">${rangeErr}</td></tr>`;
    return;
  }
  vHide(toEl);
  tbody.innerHTML=`<tr class="empty-row"><td colspan="${cols}">Loading…</td></tr>`;
  const isFaculty=currentUser?.role==='faculty';
  const advisorySections=isFaculty&&!myOnly?getFacultyAdvisorySections(currentUser):[];
  let recs;
  if(demoMode){
    if(myOnly){
      recs=appAttendance().filter(r=>r.id_number===currentUser.id_number);
    } else if(isFaculty){
      // Faculty: only advisory class students
      recs=advisorySections.length
        ? appAttendance().filter(r=>isInAdvisoryClass(r,advisorySections))
        : [];
    } else {
      recs=MOCK.attendance;
    }
  } else {
    const params=new URLSearchParams({page_size:50});
    if(from) params.set('date_from',from);
    if(to) params.set('date_to',to);
    const r=await apiFetch('/attendance?'+params);
    if(!r||!r.ok){tbody.innerHTML=`<tr class="empty-row"><td colspan="${cols}">Failed to load.</td></tr>`;return;}
    recs=await r.json();
    backendAttendance=recs;
  }
  if(!recs.length){tbody.innerHTML=`<tr class="empty-row"><td colspan="${cols}">No records for this range.</td></tr>`;return;}
  tbody.innerHTML=recs.map(rec=>`<tr>
    ${!myOnly?`<td><div style="font-weight:500">${rec.full_name||'—'}</div><div style="font-size:11px;color:#6B7280">${rec.id_number||''}</div></td>`:''}
    <td>${badgeHtml(rec.status)}</td>
    <td style="color:#6B7280;text-transform:capitalize;font-size:12px">${(rec.check_type||'').replace('_',' ')}</td>
    <td>${rec.cosine_distance!=null?`<span style="font-family:monospace;font-weight:700;font-size:12px;color:${rec.cosine_distance<=0.4?'#41A638':'#EF4444'}">${rec.cosine_distance.toFixed(4)}</span>`:'<span style="color:#9CA3AF">—</span>'}</td>
    <td style="color:#6B7280;font-size:12px">${rec.terminal_id||'—'}</td>
    <td style="color:#6B7280;font-size:12px;white-space:nowrap">${rec.timestamp?new Date(rec.timestamp).toLocaleString():'—'}</td>
  </tr>`).join('');
}


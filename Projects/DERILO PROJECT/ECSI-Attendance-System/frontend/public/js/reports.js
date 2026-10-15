/* ECSI Attendance System — reports
   Extracted verbatim from index.html (original lines 2825–3069).
   Loaded as a classic global script via /js/reports.js. */

// ═══════════════════════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════════════════════

function renderReports(el){
  const isFaculty=currentUser?.role==='faculty';
  const weeklyData=demoMode?MOCK.weeklyAttendance:Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));const key=d.toISOString().slice(0,10);const day=appAttendance().filter(r=>(r.timestamp||'').slice(0,10)===key);return{day:d.toLocaleDateString('en',{weekday:'short'}),verified:day.filter(r=>r.status==='verified').length,proxy:day.filter(r=>r.status==='proxy_anomaly').length};});
  const advisorySections=isFaculty?getFacultyAdvisorySections(currentUser):[];
  const sectionLabel=advisorySections.length?`Advisory: ${advisorySections.join(', ')}`:'';
  // Filter attendance data to advisory class if faculty
  const reportRecs=isFaculty&&advisorySections.length
    ? appAttendance().filter(r=>isInAdvisoryClass(r,advisorySections))
    : appAttendance();
  el.innerHTML=`
    <div class="topbar">
      <span class="font-bold">Reports & Analytics</span>
      <div style="display:flex;align-items:center;gap:8px">
        ${sectionLabel?`<span style="font-size:12px;color:#6B7280;background:#F3F4F6;padding:3px 10px;border-radius:20px">${sectionLabel}</span>`:''}
        <button class="btn btn-secondary" style="font-size:12px" onclick="exportAttendanceCSV()">↓ Export CSV</button>
        <button class="btn btn-primary" style="font-size:12px" onclick="openGenerateReport()">📄 Generate Report</button>
      </div>
    </div>
    ${demoMode?`<div class="demo-banner"><div class="demo-banner-dot"></div>Demo Mode — showing sample analytics</div>`:''}
    <div class="page-content">
      <div class="stat-grid" id="report-stats">${skelStats(6)}</div>

      <!-- Weekly bar chart (hidden for faculty — school-wide data) -->
      <div class="card p-5" style="margin-bottom:20px${isFaculty?';display:none':''}">
        <div style="font-weight:700;margin-bottom:4px">Weekly Attendance Overview</div>
        <p style="font-size:12px;color:#6B7280;margin-bottom:16px">Check-ins per day — current week</p>
        <div id="weekly-chart-bars" style="display:flex;align-items:flex-end;gap:8px;height:120px;padding-bottom:24px;position:relative">
          ${weeklyData.map(d=>{
            const maxV=Math.max(...weeklyData.map(x=>x.verified));
            const vH=maxV?Math.round((d.verified/maxV)*100):0;
            return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;position:relative">
              <div style="font-size:10px;font-weight:700;color:#1F2937">${d.verified||''}</div>
              <div style="width:100%;background:#41A638;border-radius:4px 4px 0 0;height:${vH}px;min-height:${d.verified?4:0}px;transition:height .3s;position:relative">
                ${d.proxy?`<div style="position:absolute;top:-2px;right:-2px;width:8px;height:8px;background:#EF4444;border-radius:50%;border:1px solid #fff" title="${d.proxy} proxy"></div>`:''}
              </div>
              <div style="position:absolute;bottom:-20px;font-size:10px;color:#6B7280;font-weight:600">${d.day}</div>
            </div>`;
          }).join('')}
        </div>
        <div style="display:flex;gap:16px;margin-top:8px">
          <div style="display:flex;align-items:center;gap:5px;font-size:11px;color:#6B7280"><div style="width:10px;height:10px;background:#41A638;border-radius:2px"></div>Verified</div>
          <div style="display:flex;align-items:center;gap:5px;font-size:11px;color:#6B7280"><div style="width:10px;height:10px;background:#EF4444;border-radius:50%"></div>Proxy dot</div>
        </div>
      </div>

      <!-- Database record table -->
      <div class="card" style="margin-bottom:20px">
        <div style="padding:16px 20px;border-bottom:1px solid #E5E7EB;display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-weight:700">Attendance Database</div>
            <div style="font-size:12px;color:#6B7280">${isFaculty&&sectionLabel?`Filtered to ${sectionLabel}`:'Live records stored in PostgreSQL · queryable via API'}</div>
          </div>
          <span class="badge badge-yellow">${demoMode?'Demo data':'Live data'}</span>
        </div>
        <!-- Filters -->
        <div style="padding:12px 20px;border-bottom:1px solid #F3F4F6;display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;background:#FAFAFA">
          <div style="display:flex;flex-direction:column;gap:4px">
            <label style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.05em">Student Name</label>
            <input type="text" id="rpt-name-filter" placeholder="Search name or ID…" maxlength="60" spellcheck="false" oninput="applyReportFilter()"
              style="padding:6px 10px;border:1px solid #E5E7EB;border-radius:8px;font-size:12px;width:190px;outline:none"/>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px">
            <label style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.05em">From</label>
            <input type="date" id="rpt-date-from" oninput="applyReportFilter()"
              style="padding:6px 10px;border:1px solid #E5E7EB;border-radius:8px;font-size:12px;outline:none"/>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px">
            <label style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.05em">To</label>
            <input type="date" id="rpt-date-to" oninput="applyReportFilter()"
              style="padding:6px 10px;border:1px solid #E5E7EB;border-radius:8px;font-size:12px;outline:none"/>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px">
            <label style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.05em">Status</label>
            <select id="rpt-status-filter" onchange="applyReportFilter()"
              style="padding:6px 10px;border:1px solid #E5E7EB;border-radius:8px;font-size:12px;background:#fff;outline:none">
              <option value="">All Statuses</option>
              <option value="verified">Verified</option>
              <option value="proxy_anomaly">Proxy Anomaly</option>
              <option value="no_face_template">No Face Template</option>
              <option value="rfid_only">RFID Only</option>
            </select>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px">
            <label style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.05em">Type</label>
            <select id="rpt-type-filter" onchange="applyReportFilter()"
              style="padding:6px 10px;border:1px solid #E5E7EB;border-radius:8px;font-size:12px;background:#fff;outline:none">
              <option value="">All Types</option>
              <option value="time_in">Time In</option>
              <option value="time_out">Time Out</option>
            </select>
          </div>
          <button onclick="clearReportFilter()" style="padding:7px 12px;border:1px solid #E5E7EB;border-radius:8px;font-size:12px;background:#fff;color:#6B7280;cursor:pointer;height:32px;margin-top:auto">✕ Clear</button>
          <span id="rpt-count" style="margin-left:auto;font-size:12px;color:#6B7280;align-self:flex-end;padding-bottom:2px"></span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Student</th><th>Status</th><th>Cosine Dist.</th><th>Terminal</th><th>Check Type</th><th>Timestamp</th>
            </tr></thead>
            <tbody id="report-records">
              ${reportRecs.length?reportRecs.map(r=>`<tr>
                <td><div style="font-weight:500;font-size:13px">${r.full_name}</div><div style="font-size:11px;color:#6B7280;font-family:monospace">${r.id_number}</div></td>
                <td>${badgeHtml(r.status)}</td>
                <td>${r.cosine_distance!=null?`<span style="font-family:monospace;font-weight:700;font-size:12px;color:${r.cosine_distance<=0.4?'#41A638':'#EF4444'}">${r.cosine_distance.toFixed(4)}</span>`:'<span style="color:#9CA3AF">—</span>'}</td>
                <td style="color:#6B7280;font-size:12px">${r.terminal_id}</td>
                <td style="color:#6B7280;font-size:12px;text-transform:capitalize">${(r.check_type||'').replace('_',' ')}</td>
                <td style="color:#6B7280;font-size:12px;white-space:nowrap">${new Date(r.timestamp).toLocaleString()}</td>
              </tr>`).join(''):`<tr class="empty-row"><td colspan="6">No records found.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>

      <div class="dark-box" ${isFaculty?'style="display:none"':''}>
        <div class="dark-box-title">🗄️ Database Architecture</div>
        <p>All attendance data is persisted in <code>PostgreSQL</code> (dev: SQLite) via SQLAlchemy async ORM. Five core tables:</p>
        <ol>
          <li><code>users</code> — roles, credentials, profile</li>
          <li><code>rfid_cards</code> — card UIDs bound to users</li>
          <li><code>face_embeddings</code> — 512-dim ArcFace vectors (JSON column)</li>
          <li><code>attendance_records</code> — every tap event with cosine distance</li>
          <li><code>proxy_audit_logs</code> — intruder captures & metadata</li>
        </ol>
      </div>
    </div>`;
  loadReportStats();
  if(!demoMode) loadReportData();
}

async function loadReportData(){
  const [records,users]=await Promise.all([apiFetchAll('/attendance/',200),apiFetchAll('/users/',100)]);
  if(!records) return;
  backendAttendance=records;
  if(users) backendUsers=users;
  const body=document.getElementById('report-records');
  if(body) body.innerHTML=renderReportRows(_getReportRecs());
  const chart=document.getElementById('weekly-chart-bars');
  if(chart&&!demoMode){
    const data=Array.from({length:7},(_,i)=>{const date=new Date();date.setDate(date.getDate()-(6-i));const key=date.toISOString().slice(0,10);const day=backendAttendance.filter(x=>(x.timestamp||'').slice(0,10)===key);return{day:date.toLocaleDateString('en',{weekday:'short'}),verified:day.filter(x=>x.status==='verified').length,proxy:day.filter(x=>x.status==='proxy_anomaly').length};});
    chart.innerHTML=renderWeeklyBars(data);
  }
  applyReportFilter();
  if(currentUser?.role==='faculty') loadReportStats();
}
function renderWeeklyBars(data){
  const maxV=Math.max(0,...data.map(x=>x.verified));
  return data.map(d=>{const h=maxV?Math.round(d.verified/maxV*100):0;return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;position:relative"><div style="font-size:10px;font-weight:700;color:#1F2937">${d.verified||''}</div><div style="width:100%;background:#41A638;border-radius:4px 4px 0 0;height:${h}px;min-height:${d.verified?4:0}px;transition:height .3s;position:relative">${d.proxy?`<div style="position:absolute;top:-2px;right:-2px;width:8px;height:8px;background:#EF4444;border-radius:50%;border:1px solid #fff" title="${d.proxy} proxy"></div>`:''}</div><div style="position:absolute;bottom:-20px;font-size:10px;color:#6B7280;font-weight:600">${d.day}</div></div>`;}).join('');
}

function renderReportRows(records){
  return records.length?records.map(r=>`<tr>
    <td><div style="font-weight:500;font-size:13px">${r.full_name||'—'}</div><div style="font-size:11px;color:#6B7280;font-family:monospace">${r.id_number||''}</div></td>
    <td>${badgeHtml(r.status)}</td>
    <td>${r.cosine_distance!=null?`<span style="font-family:monospace;font-weight:700;font-size:12px;color:${r.cosine_distance<=0.4?'#41A638':'#EF4444'}">${r.cosine_distance.toFixed(4)}</span>`:'<span style="color:#9CA3AF">—</span>'}</td>
    <td style="color:#6B7280;font-size:12px">${r.terminal_id||'—'}</td>
    <td style="color:#6B7280;font-size:12px;text-transform:capitalize">${(r.check_type||'').replace('_',' ')}</td>
    <td style="color:#6B7280;font-size:12px;white-space:nowrap">${new Date(r.timestamp).toLocaleString()}</td>
  </tr>`).join(''):'<tr class="empty-row"><td colspan="6">No records found.</td></tr>';
}
async function loadReportStats(){
  const g=document.getElementById('report-stats');
  if(!g) return;
  const isFaculty=currentUser?.role==='faculty';
  if(isFaculty){
    // Compute stats from advisory class records only
    const advisorySections=getFacultyAdvisorySections(currentUser);
    const recs=advisorySections.length
      ? appAttendance().filter(r=>isInAdvisoryClass(r,advisorySections))
      : [];
    const advisoryStudents=appUsers().filter(u=>u.role==='student'&&u.status==='active'&&advisorySections.includes(u.section||''));
    g.innerHTML=[
      {label:'Verified (Advisory)',      value:recs.filter(r=>r.status==='verified').length,      color:'#41A638'},
      {label:'Proxy Anomalies',          value:recs.filter(r=>r.status==='proxy_anomaly').length,  color:'#EF4444'},
      {label:'Time IN Today',            value:recs.filter(r=>r.check_type==='time_in').length,    color:'#F2C111'},
      {label:'Time OUT Today',           value:recs.filter(r=>r.check_type==='time_out').length,   color:'#3B82F6'},
      {label:'Advisory Students',        value:advisoryStudents.length,                            color:'#7C3AED'},
      {label:'With Face Enrolled',       value:advisoryStudents.filter(u=>u.has_face).length,      color:'#41A638'},
    ].map(s=>`<div class="stat-card"><div class="stat-label">${s.label}</div><div class="stat-value" style="color:${s.color}">${s.value}</div></div>`).join('');
    return;
  }
  let d=MOCK.analytics;
  if(!demoMode){
    const r=await apiFetch('/admin/analytics/overview');
    if(r?.ok) d=await r.json();
  }
  g.innerHTML=[
    {label:'Verified Today',        value:d.today_verified,               color:'#41A638'},
    {label:'Proxy Anomalies Today', value:d.today_proxy_anomaly,          color:'#EF4444'},
    {label:'Manual Overrides',      value:d.today_manual_override,        color:'#3B82F6'},
    {label:'Total Check-ins Today', value:d.today_total,                  color:'#F2C111'},
    {label:'Enrolled Users',        value:d.total_users,                  color:'#7C3AED'},
    {label:'All-Time Proxies',      value:d.total_proxy_attempts_all_time,color:'#EF4444'},
  ].map(s=>`<div class="stat-card"><div class="stat-label">${s.label}</div><div class="stat-value" style="color:${s.color}">${s.value}</div></div>`).join('');
}

// ── Report table filter ──────────────────────────────────────

function applyReportFilter(){
  const name=(document.getElementById('rpt-name-filter')?.value||'').toLowerCase().trim();
  const from=document.getElementById('rpt-date-from')?.value;   // 'YYYY-MM-DD' or ''
  const to=document.getElementById('rpt-date-to')?.value;
  const status=document.getElementById('rpt-status-filter')?.value||'';
  const type=document.getElementById('rpt-type-filter')?.value||'';
  const tbody=document.getElementById('report-records');
  const cnt=document.getElementById('rpt-count');
  if(!tbody) return;

  const fromEl=document.getElementById('rpt-date-from');
  const toEl=document.getElementById('rpt-date-to');
  const rangeErr=vDateRange(fromEl,toEl);
  if(rangeErr){
    vShow(toEl,rangeErr);
    tbody.innerHTML=`<tr class="empty-row"><td colspan="6">${rangeErr}</td></tr>`;
    if(cnt) cnt.textContent='';
    return;
  }
  vHide(toEl);

  const isFaculty=currentUser?.role==='faculty';
  const secs=isFaculty?getFacultyAdvisorySections(currentUser):[];
  let recs=isFaculty&&secs.length
    ? appAttendance().filter(r=>isInAdvisoryClass(r,secs))
    : appAttendance();

  // Name / ID search
  if(name) recs=recs.filter(r=>(r.full_name||'').toLowerCase().includes(name)||(r.id_number||'').toLowerCase().includes(name));
  // Date range
  if(from) recs=recs.filter(r=>r.timestamp&&r.timestamp.slice(0,10)>=from);
  if(to)   recs=recs.filter(r=>r.timestamp&&r.timestamp.slice(0,10)<=to);
  // Status
  if(status) recs=recs.filter(r=>r.status===status);
  // Check type
  if(type) recs=recs.filter(r=>r.check_type===type);

  if(cnt) cnt.textContent=recs.length+' record'+(recs.length!==1?'s':'');
  tbody.innerHTML=recs.length?recs.map(r=>`<tr>
    <td><div style="font-weight:500;font-size:13px">${r.full_name}</div><div style="font-size:11px;color:#6B7280;font-family:monospace">${r.id_number}</div></td>
    <td>${badgeHtml(r.status)}</td>
    <td>${r.cosine_distance!=null?`<span style="font-family:monospace;font-weight:700;font-size:12px;color:${r.cosine_distance<=0.4?'#41A638':'#EF4444'}">${r.cosine_distance.toFixed(4)}</span>`:'<span style="color:#9CA3AF">—</span>'}</td>
    <td style="color:#6B7280;font-size:12px">${r.terminal_id}</td>
    <td style="color:#6B7280;font-size:12px;text-transform:capitalize">${(r.check_type||'').replace('_',' ')}</td>
    <td style="color:#6B7280;font-size:12px;white-space:nowrap">${r.timestamp?new Date(r.timestamp).toLocaleString():'—'}</td>
  </tr>`).join(''):`<tr class="empty-row"><td colspan="6">No records match the filter.</td></tr>`;
}

function clearReportFilter(){
  ['rpt-name-filter','rpt-date-from','rpt-date-to'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  ['rpt-status-filter','rpt-type-filter'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const cnt=document.getElementById('rpt-count');if(cnt)cnt.textContent='';
  applyReportFilter();
}


/* ECSI Attendance System — parent
   Extracted verbatim from index.html (original lines 5291–5706).
   Loaded as a classic global script via /js/parent.js. */

// ═══════════════════════════════════════════════════════════
// PARENT PORTAL
// ═══════════════════════════════════════════════════════════

function _parentGetChildren(){
  if (demoMode) {
    const ids = currentUser.children || [];
    return ids.map(id => appUsers().find(u => u.id === id)).filter(Boolean);
  }

  const users = appUsers().filter(u => (currentUser.children || []).includes(u.id));
  return users;
}

function _parentGetAttendance(childId){
  if (demoMode) {
    const mockRecs = appAttendance().filter(a => {
      const u = appUsers().find(x => x.id === childId);
      return u && a.id_number === u.id_number;
    });
    const liveRecs = feedItems.filter(a => {
      const u = appUsers().find(x => x.id === childId);
      return u && a.id_number === u.id_number;
    });
    return [...liveRecs, ...mockRecs].sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  const children = _parentGetChildren();
  const child = children.find(c => c.id === childId);
  if (!child) return [];

  const records = (backendAttendance || []).filter(a => a.user_id === childId || a.id_number === child.id_number);
  return records.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
}

function _parentStats(childId){
  const recs = _parentGetAttendance(childId);
  const verified = recs.filter(r => r.status === 'verified' || r.status === 'manual_override').length;
  const proxy = recs.filter(r => r.status === 'proxy_anomaly').length;
  const timeIns = recs.filter(r => r.check_type === 'time_in');
  const days = new Set(timeIns.map(r => r.timestamp ? r.timestamp.slice(0,10) : '')).size;
  const totalSchoolDays = 20;
  const rate = days > 0 ? Math.min(100, Math.round((days / totalSchoolDays) * 100)) : 0;
  return {verified, proxy, days, rate, total: recs.length};
}

// ── Parent Dashboard ──────────────────────────────────────
async function renderParentDashboard(el){
  const children = _parentGetChildren();
  const child = children[0];
  let stats = child ? _parentStats(child.id) : {};
  let recs = child ? _parentGetAttendance(child.id).slice(0,6) : [];
  let excuses = child ? MOCK.excuseRequests.filter(e => e.student_id === child.id) : [];

  if (!demoMode && currentUser?.role === 'parent') {
    try {
      const [childrenResp, attendanceResp, excuseResp] = await Promise.all([
        apiFetch('/users/me/children'),
        apiFetch('/attendance/parent-summary'),
        apiFetch('/excuses/parent')
      ]);

      if (childrenResp?.ok) {
        const childList = await childrenResp.json();
        currentUser.children = childList.map(c => c.id);
        backendUsers = [...backendUsers.filter(u => !childList.some(c => c.id === u.id)), ...childList];
      }

      if (attendanceResp?.ok) {
        const summary = await attendanceResp.json();
        const mapped = [];
        for (const item of summary.children || []) {
          for (const rec of item.records || []) mapped.push({ ...rec, user_id: item.child_id });
        }
        backendAttendance = [...(backendAttendance || []).filter(r => !mapped.some(m => m.id === r.id)), ...mapped];
      }

      if (excuseResp?.ok) {
        backendExcuses = await excuseResp.json();
      }

      const nextChildren = _parentGetChildren();
      const nextChild = nextChildren[0];
      stats = nextChild ? _parentStats(nextChild.id) : {};
      recs = nextChild ? _parentGetAttendance(nextChild.id).slice(0,6) : [];
      excuses = nextChild ? appExcuseRequests().filter(e => e.student_id === nextChild.id) : [];
    } catch (err) {
      console.warn('Parent dashboard backend sync failed:', err);
    }
  }

  const todayRec = recs.find(r => r.timestamp && r.timestamp.slice(0,10) === new Date().toISOString().slice(0,10));
  const todayStatus = todayRec ? '✅ Present' : '⚠️ Not yet recorded';
  const todayColor = todayRec ? '#16A34A' : '#D97706';

  el.innerHTML = `
    <div class="topbar" style="display:flex;align-items:center;justify-content:space-between">
      <span class="font-bold">🏠 Parent Portal</span>
      <span style="font-size:12px;color:#6B7280">${new Date().toLocaleDateString('en-PH',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</span>
    </div>
    ${demoMode ? `<div class="demo-banner"><div class="demo-banner-dot"></div>Demo Mode</div>` : ''}
    <div class="page-content">
      <div class="card p-4" style="margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div style="display:flex;align-items:center;gap:14px">
          <div style="width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#9333EA,#7C3AED);display:flex;align-items:center;justify-content:center;font-size:22px;color:#fff;font-weight:700;flex-shrink:0">
            ${(child || _parentGetChildren()[0]) ? ((_parentGetChildren()[0]?.full_name || currentUser.full_name)[0] || '?') : '?'
          }</div>
          <div>
            <div style="font-size:14px;color:#6B7280">Monitoring child of</div>
            <div style="font-weight:700;font-size:16px">${currentUser.full_name}</div>
            ${(_parentGetChildren()[0]) ? `
              <div style="margin-top:4px;display:flex;align-items:center;gap:8px">
                <span style="font-size:13px;font-weight:600;color:#1F2937">👦 ${_parentGetChildren()[0].full_name}</span>
                <span style="font-size:11px;color:#fff;background:#9333EA;padding:2px 8px;border-radius:99px">${_parentGetChildren()[0].section || 'No section'}</span>
                <span style="font-size:11px;color:#6B7280">${_parentGetChildren()[0].id_number}</span>
              </div>` : '<div style="color:#EF4444;font-size:12px">No linked child found</div>'}
          </div>
        </div>
        <div style="display:flex;gap:8px">
          ${_parentGetChildren().slice(1).map(c=>`<span style="font-size:11px;padding:4px 10px;border-radius:99px;background:#F3F4F6;color:#374151">👦 ${c.full_name}</span>`).join('')}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:16px">
        <div class="card p-4" style="border-left:4px solid ${todayColor}">
          <div class="stat-label">Today's Status</div>
          <div style="font-size:20px;font-weight:800;color:${todayColor};margin-top:4px">${todayStatus}</div>
          <div style="font-size:10px;color:#9CA3AF;margin-top:2px">${todayRec ? new Date(todayRec.timestamp).toLocaleTimeString() : 'Check back later'}</div>
        </div>
        <div class="card p-4" style="border-left:4px solid #3B82F6">
          <div class="stat-label">Attendance Rate</div>
          <div class="stat-value" style="color:#3B82F6">${stats.rate || 0}%</div>
          <div style="font-size:10px;color:#9CA3AF;margin-top:2px">${stats.days || 0} school days present</div>
        </div>
        <div class="card p-4" style="border-left:4px solid #F59E0B">
          <div class="stat-label">Excuses Filed</div>
          <div class="stat-value" style="color:#F59E0B">${excuses.length}</div>
          <div style="font-size:10px;color:#9CA3AF;margin-top:2px">${excuses.filter(e=>e.status==='pending').length} pending review</div>
        </div>
        <div class="card p-4" style="border-left:4px solid #EF4444">
          <div class="stat-label">Proxy Alerts</div>
          <div class="stat-value" style="color:#EF4444">${stats.proxy || 0}</div>
          <div style="font-size:10px;color:#9CA3AF;margin-top:2px">Anomaly detections</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="card p-4">
          <div style="font-weight:700;font-size:13px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">
            <span>📋 Recent Attendance</span>
            <button onclick="navigate('parent-attendance')" style="font-size:11px;color:#9333EA;background:none;border:none;cursor:pointer;font-weight:600">View All →</button>
          </div>
          ${recs.length === 0 ? '<div style="text-align:center;color:#9CA3AF;padding:20px;font-size:12px">No records yet</div>' : recs.map(r => {
            const isIn = r.check_type === 'time_in';
            const isProxy = r.status === 'proxy_anomaly';
            const color = isProxy ? '#EF4444' : isIn ? '#16A34A' : '#3B82F6';
            const label = isProxy ? '⚠ PROXY' : isIn ? '↗ IN' : '↙ OUT';
            return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #F3F4F6">
              <div style="width:7px;height:7px;border-radius:50%;background:${color};flex-shrink:0"></div>
              <div style="flex:1;min-width:0">
                <div style="font-size:12px;font-weight:600">${new Date(r.timestamp).toLocaleDateString('en-PH',{month:'short',day:'numeric'})}</div>
                <div style="font-size:10px;color:#9CA3AF">${new Date(r.timestamp).toLocaleTimeString()} · ${r.terminal_id || ''}</div>
              </div>
              <span style="font-size:10px;padding:2px 8px;border-radius:99px;background:${isProxy ? '#FEE2E2' : isIn ? '#DCFCE7' : '#DBEAFE'};color:${color};font-weight:600">${label}</span>
            </div>`;
          }).join('')}
        </div>

        <div class="card p-4">
          <div style="font-weight:700;font-size:13px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">
            <span>📝 Excuse Requests</span>
            <button onclick="navigate('parent-excuse')" style="font-size:11px;color:#9333EA;background:none;border:none;cursor:pointer;font-weight:600">File New →</button>
          </div>
          ${excuses.length === 0 ? '<div style="text-align:center;color:#9CA3AF;padding:20px;font-size:12px">No excuses filed</div>' : excuses.slice(0,4).map(ex => {
            const sc = {approved:'#16A34A',pending:'#D97706',rejected:'#EF4444'}[ex.status] || '#6B7280';
            const bg = {approved:'#DCFCE7',pending:'#FEF9C3',rejected:'#FEE2E2'}[ex.status] || '#F3F4F6';
            return `<div style="padding:8px 0;border-bottom:1px solid #F3F4F6">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">
                <span style="font-size:12px;font-weight:600">${ex.date}</span>
                <span style="font-size:10px;padding:2px 8px;border-radius:99px;background:${bg};color:${sc};font-weight:600">${ex.status}</span>
              </div>
              <div style="font-size:11px;color:#6B7280;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${ex.reason}</div>
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>`;
}

// ── Parent Attendance ─────────────────────────────────────
function renderParentAttendance(el){
  const children = _parentGetChildren();
  const child = children[0];
  const recs = child ? _parentGetAttendance(child.id) : [];

  el.innerHTML = `
    <div class="topbar" style="display:flex;align-items:center;justify-content:space-between">
      <span class="font-bold">📋 Child Attendance</span>
      ${child ? `<span style="font-size:12px;color:#6B7280">👦 ${child.full_name} · ${child.section}</span>` : ''}
    </div>
    ${demoMode ? `<div class="demo-banner"><div class="demo-banner-dot"></div>Demo Mode</div>` : ''}
    <div class="page-content">
      <div class="card p-4">
        <!-- Stats bar -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid #F3F4F6">
          <div style="text-align:center">
            <div style="font-size:22px;font-weight:800;color:#16A34A">${recs.filter(r=>r.status==='verified'||r.status==='manual_override').length}</div>
            <div style="font-size:10px;color:#6B7280;text-transform:uppercase;font-weight:600">Verified</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:22px;font-weight:800;color:#EF4444">${recs.filter(r=>r.status==='proxy_anomaly').length}</div>
            <div style="font-size:10px;color:#6B7280;text-transform:uppercase;font-weight:600">Proxy Alert</div>
          </div>
          <div style="font-size:22px;font-weight:800;color:#3B82F6;text-align:center">
            <div>${recs.filter(r=>r.check_type==='time_in').length}</div>
            <div style="font-size:10px;color:#6B7280;text-transform:uppercase;font-weight:600">Time-Ins</div>
          </div>
          <div style="font-size:22px;font-weight:800;color:#F59E0B;text-align:center">
            <div>${recs.filter(r=>r.check_type==='time_out').length}</div>
            <div style="font-size:10px;color:#6B7280;text-transform:uppercase;font-weight:600">Time-Outs</div>
          </div>
        </div>

        <!-- Table -->
        ${recs.length === 0 ? '<div style="text-align:center;color:#9CA3AF;padding:40px;font-size:13px">No attendance records found</div>' : `
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="background:#F9FAFB">
              <th style="padding:8px 12px;text-align:left;font-weight:700;color:#6B7280;border-bottom:1px solid #E5E7EB">Date & Time</th>
              <th style="padding:8px 12px;text-align:left;font-weight:700;color:#6B7280;border-bottom:1px solid #E5E7EB">Type</th>
              <th style="padding:8px 12px;text-align:left;font-weight:700;color:#6B7280;border-bottom:1px solid #E5E7EB">Status</th>
              <th style="padding:8px 12px;text-align:left;font-weight:700;color:#6B7280;border-bottom:1px solid #E5E7EB">Terminal</th>
              <th style="padding:8px 12px;text-align:right;font-weight:700;color:#6B7280;border-bottom:1px solid #E5E7EB">Confidence</th>
            </tr>
          </thead>
          <tbody>
            ${recs.map((r,i) => {
              const isIn = r.check_type==='time_in';
              const isProxy = r.status==='proxy_anomaly';
              const sc = {verified:'#16A34A',proxy_anomaly:'#EF4444',manual_override:'#F59E0B',pending_review:'#6B7280'}[r.status]||'#6B7280';
              const bg = {verified:'#DCFCE7',proxy_anomaly:'#FEE2E2',manual_override:'#FEF9C3',pending_review:'#F3F4F6'}[r.status]||'#F3F4F6';
              const statusLabel = {verified:'✅ Verified',proxy_anomaly:'🚨 Proxy Alert',manual_override:'🔓 Manual',pending_review:'⏳ Pending'}[r.status]||r.status;
              return `<tr style="border-bottom:1px solid #F3F4F6;${i%2===0?'':'background:#FAFAFA'}">
                <td style="padding:10px 12px">
                  <div style="font-weight:600">${new Date(r.timestamp).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'})}</div>
                  <div style="color:#9CA3AF;font-size:10px">${new Date(r.timestamp).toLocaleTimeString()}</div>
                </td>
                <td style="padding:10px 12px">
                  <span style="font-size:11px;padding:2px 8px;border-radius:99px;background:${isIn?'#DBEAFE':'#EDE9FE'};color:${isIn?'#1D4ED8':'#7C3AED'};font-weight:600">${isIn?'↗ Time IN':'↙ Time OUT'}</span>
                </td>
                <td style="padding:10px 12px">
                  <span style="font-size:11px;padding:2px 8px;border-radius:99px;background:${bg};color:${sc};font-weight:600">${statusLabel}</span>
                </td>
                <td style="padding:10px 12px;color:#6B7280">${r.terminal_id||'—'}</td>
                <td style="padding:10px 12px;text-align:right;font-family:monospace;color:#6B7280">${r.cosine_distance!=null?(100-Math.round(r.cosine_distance*100))+'%':'—'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>`}
      </div>
    </div>`;
}

// ── Parent Performance ────────────────────────────────────
function renderParentPerformance(el){
  const children = _parentGetChildren();
  const child = children[0];
  const recs = child ? _parentGetAttendance(child.id) : [];
  const stats = child ? _parentStats(child.id) : {};

  // Build weekly data from records
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const weeklyMap = {};
  recs.forEach(r => {
    if(!r.timestamp) return;
    const d = new Date(r.timestamp);
    const key = days[d.getDay()];
    if(!weeklyMap[key]) weeklyMap[key] = {present:0,proxy:0};
    if(r.check_type==='time_in'){
      if(r.status==='proxy_anomaly') weeklyMap[key].proxy++;
      else weeklyMap[key].present++;
    }
  });
  const weekDays = ['Mon','Tue','Wed','Thu','Fri'];
  const maxVal = Math.max(1, ...weekDays.map(d => (weeklyMap[d]?.present||0)+(weeklyMap[d]?.proxy||0)));

  el.innerHTML = `
    <div class="topbar" style="display:flex;align-items:center;justify-content:space-between">
      <span class="font-bold">📊 Performance</span>
      ${child ? `<span style="font-size:12px;color:#6B7280">👦 ${child.full_name} · ${child.section}</span>` : ''}
    </div>
    ${demoMode ? `<div class="demo-banner"><div class="demo-banner-dot"></div>Demo Mode</div>` : ''}
    <div class="page-content">

      <!-- Attendance Rate Circle + Stats -->
      <div style="display:grid;grid-template-columns:1fr 2fr;gap:16px;margin-bottom:16px">
        <div class="card p-4" style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
          <div style="position:relative;width:110px;height:110px;margin-bottom:12px">
            <svg viewBox="0 0 36 36" style="width:110px;height:110px;transform:rotate(-90deg)">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#E5E7EB" stroke-width="3.2"/>
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#9333EA" stroke-width="3.2"
                stroke-dasharray="${stats.rate||0} ${100-(stats.rate||0)}" stroke-linecap="round"/>
            </svg>
            <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
              <div style="font-size:22px;font-weight:800;color:#9333EA">${stats.rate||0}%</div>
              <div style="font-size:9px;color:#9CA3AF;font-weight:600">ATTENDANCE</div>
            </div>
          </div>
          <div style="font-size:13px;font-weight:700">${child ? child.full_name : '—'}</div>
          <div style="font-size:11px;color:#6B7280">${child ? child.section : ''}</div>
        </div>

        <div class="card p-4">
          <div style="font-weight:700;font-size:13px;margin-bottom:14px">📈 Attendance Summary</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            ${[
              {label:'Days Present',val:stats.days||0,color:'#16A34A'},
              {label:'Proxy Alerts',val:stats.proxy||0,color:'#EF4444'},
              {label:'Total Records',val:stats.total||0,color:'#3B82F6'},
              {label:'School Days (est.)',val:20,color:'#F59E0B'},
            ].map(s=>`<div style="background:#F9FAFB;border-radius:10px;padding:12px">
              <div style="font-size:22px;font-weight:800;color:${s.color}">${s.val}</div>
              <div style="font-size:10px;color:#6B7280;font-weight:600;text-transform:uppercase;margin-top:2px">${s.label}</div>
            </div>`).join('')}
          </div>
        </div>
      </div>

      <!-- Weekly Bar Chart -->
      <div class="card p-4">
        <div style="font-weight:700;font-size:13px;margin-bottom:16px">📅 This Week's Attendance</div>
        <div style="display:flex;align-items:flex-end;gap:12px;height:130px;padding-bottom:8px">
          ${weekDays.map(d => {
            const p = weeklyMap[d]?.present||0;
            const pr = weeklyMap[d]?.proxy||0;
            const tot = p + pr;
            const ph = maxVal > 0 ? Math.round((p/maxVal)*110) : 0;
            const prh = maxVal > 0 ? Math.round((pr/maxVal)*110) : 0;
            return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
              <div style="font-size:10px;color:#6B7280">${tot||''}</div>
              <div style="width:100%;display:flex;flex-direction:column;justify-content:flex-end;height:110px;gap:2px">
                ${prh>0?`<div style="width:100%;height:${prh}px;background:#FCA5A5;border-radius:4px 4px 0 0"></div>`:''}
                ${ph>0?`<div style="width:100%;height:${ph}px;background:#9333EA;border-radius:${prh>0?'0':'4px 4px'} 0 0"></div>`:''}
                ${tot===0?`<div style="width:100%;height:4px;background:#E5E7EB;border-radius:4px"></div>`:''}
              </div>
              <div style="font-size:11px;font-weight:600;color:#374151">${d}</div>
            </div>`;
          }).join('')}
        </div>
        <div style="display:flex;gap:16px;margin-top:8px;padding-top:8px;border-top:1px solid #F3F4F6">
          <div style="display:flex;align-items:center;gap:6px;font-size:11px"><div style="width:12px;height:12px;border-radius:2px;background:#9333EA"></div>Present</div>
          <div style="display:flex;align-items:center;gap:6px;font-size:11px"><div style="width:12px;height:12px;border-radius:2px;background:#FCA5A5"></div>Proxy Alert</div>
        </div>
      </div>

    </div>`;
}

// ── Parent Excuse (file on behalf of child) ───────────────
function renderParentExcuse(el){
  const children = _parentGetChildren();
  const child = children[0];
  const excuses = child ? MOCK.excuseRequests.filter(e => e.student_id === child.id) : [];

  el.innerHTML = `
    <div class="topbar" style="display:flex;align-items:center;justify-content:space-between">
      <span class="font-bold">📝 File Excuse</span>
      ${child ? `<span style="font-size:12px;color:#6B7280">For: ${child.full_name}</span>` : ''}
    </div>
    ${demoMode ? `<div class="demo-banner"><div class="demo-banner-dot"></div>Demo Mode</div>` : ''}
    <div class="page-content" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start">

      <!-- File New Excuse -->
      <div class="card p-4">
        <div style="font-weight:700;font-size:13px;margin-bottom:14px">📨 New Excuse Letter</div>
        ${!child ? '<div style="color:#EF4444;font-size:12px">No child linked to your account.</div>' : `
        <div style="margin-bottom:12px">
          <label>Child</label>
          <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:9px 12px;font-size:13px;color:#374151">${child.full_name} — ${child.id_number} (${child.section})</div>
        </div>
        <div style="margin-bottom:12px"><label>Absent Date</label><input type="date" id="par-ex-date" value="${new Date().toISOString().slice(0,10)}" max="${new Date().toISOString().slice(0,10)}"/></div>
        <div style="margin-bottom:12px">
          <label>Reason</label>
          <select id="par-ex-reason-sel" style="margin-bottom:8px" onchange="document.getElementById('par-ex-custom').style.display=this.value==='Other'?'':'none'">
            <option>Medical / Illness</option>
            <option>Medical appointment</option>
            <option>Family Emergency</option>
            <option>Bereavement</option>
            <option>School-sanctioned event</option>
            <option>Other</option>
          </select>
          <input type="text" id="par-ex-custom" placeholder="Describe reason…" maxlength="80" style="display:none"/>
        </div>
        <div style="margin-bottom:14px">
          <label>Additional Notes (optional)</label>
          <textarea id="par-ex-notes" maxlength="500" style="width:100%;border:1px solid #E5E7EB;border-radius:8px;padding:9px 12px;font-size:13px;font-family:inherit;resize:vertical;min-height:70px;outline:none" placeholder="Doctor's note reference, contact number, etc."></textarea>
        </div>
        <button class="btn btn-primary w-full" onclick="_parentSubmitExcuse('${child.id}','${child.full_name}','${child.id_number}','${child.section}')">📨 Submit Excuse Letter</button>
        <div id="par-ex-msg" style="margin-top:10px;display:none"></div>
        `}
      </div>

      <!-- Past Excuses -->
      <div class="card p-4">
        <div style="font-weight:700;font-size:13px;margin-bottom:14px">📁 Filed Excuses</div>
        ${excuses.length === 0 ? '<div style="text-align:center;color:#9CA3AF;padding:20px;font-size:12px">No excuses filed yet</div>' :
          excuses.map(ex => {
            const sc = {approved:'#16A34A',pending:'#D97706',rejected:'#EF4444'}[ex.status]||'#6B7280';
            const bg = {approved:'#DCFCE7',pending:'#FEF9C3',rejected:'#FEE2E2'}[ex.status]||'#F3F4F6';
            return `<div style="border:1px solid #E5E7EB;border-radius:10px;padding:12px;margin-bottom:10px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                <span style="font-weight:700;font-size:13px">${ex.date}</span>
                <span style="font-size:11px;padding:2px 10px;border-radius:99px;background:${bg};color:${sc};font-weight:600">${ex.status}</span>
              </div>
              <div style="font-size:12px;color:#374151;margin-bottom:4px">${ex.reason}</div>
              ${ex.adviser_note ? `<div style="font-size:11px;color:#6B7280;background:#F9FAFB;border-radius:6px;padding:6px 8px">💬 ${ex.adviser_note}</div>` : ''}
            </div>`;
          }).join('')}
      </div>
    </div>`;
}

function _parentSubmitExcuse(childId, childName, idNum, section){
  const dateEl = document.getElementById('par-ex-date');
  const reasonSel = document.getElementById('par-ex-reason-sel');
  const customEl = document.getElementById('par-ex-custom');
  const notesEl = document.getElementById('par-ex-notes');
  const msgEl = document.getElementById('par-ex-msg');

  const date = dateEl?.value;
  const isOther = reasonSel?.value === 'Other';
  const customVal = customEl?.value.trim()||'';
  const reason = isOther ? (customVal||'Other') : reasonSel?.value;
  const notes = notesEl?.value.trim();
  const ok = vValidate([
    [dateEl, V.pastDate(date,'Absent date')],
    [reasonSel, V.select(reasonSel?.value,'a reason')],
    [customEl, isOther ? V.text(80,true,'Reason')(customVal) : ''],
    [notesEl, V.text(500,false,'Notes')(notes)]
  ]);
  if(!ok){ if(msgEl){msgEl.style.display='';msgEl.style.color='#EF4444';msgEl.textContent='Please correct the highlighted fields.';} return; }

  const ex = {
    id:'ex-'+Date.now(),
    student_id: childId,
    student_name: childName,
    id_number: idNum,
    section: section,
    date: date,
    reason: reason + (notes ? ' — ' + notes : ''),
    status: 'pending',
    adviser_note: '',
    filed_at: new Date().toISOString(),
    proof_data: null, proof_name: null, proof_type: null,
  };
  MOCK.excuseRequests.unshift(ex);
  if(msgEl){
    msgEl.style.display='';
    msgEl.style.cssText='margin-top:10px;padding:10px 12px;background:#DCFCE7;border-radius:8px;color:#16A34A;font-size:12px;font-weight:600';
    msgEl.textContent='✅ Excuse letter submitted successfully! Awaiting adviser review.';
  }
  setTimeout(()=>navigate('parent-excuse'), 1500);
}


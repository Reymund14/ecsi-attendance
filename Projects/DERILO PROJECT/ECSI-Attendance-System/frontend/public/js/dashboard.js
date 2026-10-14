/* ECSI Attendance System — dashboard
   Extracted verbatim from index.html (original lines 594–724).
   Loaded as a classic global script via /js/dashboard.js. */

// ═══════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════
function renderDashboard(el){
  el.innerHTML=`
    <div class="topbar">
      <span class="font-bold">Live Dashboard</span>
      <div id="ws-badge" class="ws-badge ws-off"><span style="width:7px;height:7px;border-radius:50%;background:#9CA3AF;display:inline-block"></span> connecting</div>
    </div>
    ${demoMode?`<div class="demo-banner"><div class="demo-banner-dot"></div><span>Demo Mode — showing sample data. Connect the backend at <code style="color:#F2C111">http://127.0.0.1:8000</code> for live data.</span></div>`:''}
    <div class="page-content">
      <div class="stat-grid" id="stat-grid">${skelStats(4)}</div>
      <div class="card p-5" style="margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <span class="font-bold">Live Attendance Feed${currentUser?.role==='faculty'?` <span style="font-size:11px;font-weight:400;color:#6B7280">(Advisory class)</span>`:''}</span>
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:11px;color:#6B7280" id="feed-count">0 events</span>
            ${currentUser?.role!=='faculty'?`<button class="btn btn-primary" style="font-size:11px;padding:5px 12px" onclick="navigate('monitor')">📹 Open Live Monitor</button>`:''}
          </div>
        </div>
        <div id="feed-list">
          <div class="feed-empty">
            <div class="feed-empty-icon">📡</div>
            <div style="font-weight:600;font-size:13px">${demoMode?'Demo mode — no live RFID feed':'Waiting for RFID taps…'}</div>
            <div style="font-size:12px;color:#9CA3AF;margin-top:4px">${demoMode?'Live events appear here when the backend is connected':'Events appear here in real time when a card is scanned'}</div>
          </div>
        </div>
      </div>
      <!-- Excuse Requests panel — faculty dashboard only -->
      ${currentUser?.role==='faculty'?`
      <div class="card" style="margin-bottom:20px" id="dash-excuse-card">
        <div style="padding:14px 20px;border-bottom:1px solid #E5E7EB;display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="font-weight:700;font-size:14px">📝 Student Excuse Requests</div>
            <div style="font-size:12px;color:#6B7280;margin-top:2px">From your advisory class</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span id="dash-excuse-badge" style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;background:#FEF3C7;color:#92400E">0 pending</span>
            <button onclick="navigate('notifications')" style="background:#EFF6FF;border:none;color:#2563EB;border-radius:8px;padding:5px 12px;font-size:11px;font-weight:600;cursor:pointer">View All →</button>
          </div>
        </div>
        <div id="dash-excuse-list" style="max-height:380px;overflow-y:auto"></div>
      </div>`:''}

      <div class="dark-box" ${currentUser?.role==='faculty'?'style="display:none"':''}>
        <div class="dark-box-title">🔌 Dual-Factor Verification Pipeline</div>
        <p>Each RFID tap triggers the following sequence server-side:</p>
        <ol>
          <li>Camera frame captured → ArcFace 512-dim embedding extracted via DeepFace</li>
          <li>Cosine distance vs. enrolled face template (threshold ≤ 0.40)</li>
          <li>Result written to DB → WebSocket broadcast within milliseconds</li>
          <li>Proxy detected? Intruder face crop saved to <code>audit_captures/intruders/</code></li>
        </ol>
      </div>
    </div>
`;
  setWsBadge(demoMode?'demo':wsConn?.readyState===1?'live':'offline');
  loadStats();
  refreshFeed();
  if(currentUser?.role==='faculty') renderDashExcuse();
}
function skelStats(n){return Array(n).fill(0).map(()=>`<div class="stat-card" style="animation:pulse 1.5s ease-in-out infinite"><div style="height:10px;background:#F3F4F6;border-radius:4px;width:60%;margin-bottom:12px"></div><div style="height:32px;background:#F3F4F6;border-radius:4px;width:40%"></div></div>`).join('');}
async function loadStats(){
  const g=document.getElementById('stat-grid');
  if(!g) return;
  if(currentUser?.role==='faculty'){
    // Advisory-scoped stats only
    const advisorySections=getFacultyAdvisorySections(currentUser);
    const recs=advisorySections.length
      ? appAttendance().filter(r=>isInAdvisoryClass(r,advisorySections))
      : [];
    const advisoryStudents=appUsers().filter(u=>u.role==='student'&&u.status==='active'&&advisorySections.includes(u.section||''));
    g.innerHTML=[
      {label:'Verified Today',     value:recs.filter(r=>r.status==='verified').length,     color:'#41A638'},
      {label:'Proxy Attempts',     value:recs.filter(r=>r.status==='proxy_anomaly').length, color:'#EF4444'},
      {label:'Total Check-ins',    value:recs.length,                                       color:'#F2C111'},
      {label:'Advisory Students',  value:advisoryStudents.length,                           color:'#3B82F6'},
    ].map(s=>`<div class="stat-card"><div class="stat-label">${s.label}</div><div class="stat-value" style="color:${s.color}">${s.value}</div></div>`).join('');
    return;
  }
  let d=MOCK.analytics;
  if(!demoMode){
    const r=await apiFetch('/admin/analytics/overview');
    if(r?.ok) d=await r.json();
  }
  g.innerHTML=[
    {label:'Verified Today', value:d.today_verified,      color:'#41A638'},
    {label:'Proxy Attempts', value:d.today_proxy_anomaly, color:'#EF4444'},
    {label:'Total Check-ins',value:d.today_total,         color:'#F2C111'},
    {label:'Enrolled Users', value:d.total_users,         color:'#3B82F6'},
  ].map(s=>`<div class="stat-card"><div class="stat-label">${s.label}</div><div class="stat-value" style="color:${s.color}">${s.value}</div></div>`).join('');
}
function feedItemKey(ev){return String(ev.record_id||ev.id||`${ev.id_number||''}:${ev.timestamp||''}:${ev.status||''}`);}
function prepareFeedRender(el,items,limit){
  const visible=items.slice(0,limit);
  const signature=visible.length?visible.map(ev=>[feedItemKey(ev),ev.status||'',ev.timestamp||'',ev.cosine_distance??'',ev.detail||''].join(':')).join('|'):'empty';
  if(el.dataset.feedSignature===signature)return null;
  const previous=new Set(Array.from(el.querySelectorAll('[data-feed-key]'),node=>node.dataset.feedKey));
  el.dataset.feedSignature=signature;
  return previous;
}
function finishFeedRender(el,previous){
  el.querySelectorAll('.slide-in[data-feed-key]').forEach(node=>{if(previous.has(node.dataset.feedKey))node.classList.remove('slide-in');});
}

function refreshFeed(){
  const el=document.getElementById('feed-list'),cnt=document.getElementById('feed-count');
  if(!el) return;
  // Faculty: only show advisory class events in the dashboard feed
  let items=feedItems;
  if(currentUser?.role==='faculty'){
    const advisorySections=getFacultyAdvisorySections(currentUser);
    items=feedItems.filter(ev=>isInAdvisoryClass(ev,advisorySections));
  }
  if(cnt) cnt.textContent=items.length+' event'+(items.length!==1?'s':'');
  const previousFeedKeys=prepareFeedRender(el,items,100);if(previousFeedKeys===null)return;
  if(!items.length){el.innerHTML='<div class="feed-empty"><div class="feed-empty-icon">&#128247;</div><div style="font-weight:600;font-size:13px">Waiting for RFID taps&hellip;</div><div style="font-size:12px;color:#9CA3AF;margin-top:4px">Events appear here in real time when a card is scanned</div></div>';return;}
  el.innerHTML=items.map(ev=>{
    const cls=ev.status==='proxy_anomaly'||ev.status==='face_mismatch'?'proxy':ev.status==='unregistered_rfid'||ev.status==='no_face_template'?'danger':ev.status==='verified'?'verified':'warning';
    const surname=attendanceSurname(ev.full_name||ev.label);
    const avatar=ev.status==='unregistered_rfid'?'⛔':ev.status==='face_mismatch'||ev.status==='no_face_template'?'🚷':surname[0];
    return `<div class="feed-item ${cls} slide-in" data-feed-key="${feedItemKey(ev)}">
      <div class="feed-avatar" style="${cls==='danger'||cls==='proxy'?'background:rgba(239,68,68,.15)':''}">${avatar}</div>
      <div style="flex:1;min-width:0">
        <div class="feed-name">${surname}</div>
        <div class="feed-sub">${ev.id_number?ev.id_number+' · ':''} ${ev.terminal_id||'Terminal-1'}${ev.detail?' · '+ev.detail:''}</div>
      </div>
      ${badgeHtml(ev.status)}</div>`;
  }).join('');
  finishFeedRender(el,previousFeedKeys);
}


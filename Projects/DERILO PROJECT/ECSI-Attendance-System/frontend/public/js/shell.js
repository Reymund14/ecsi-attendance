/* ECSI Attendance System — shell
   Extracted verbatim from index.html (original lines 480–550).
   Loaded as a classic global script via /js/shell.js. */

// ═══════════════════════════════════════════════════════════
// APP SHELL
// ═══════════════════════════════════════════════════════════
const NAV={
  super_admin:[{id:'dashboard',icon:'⬡',label:'Dashboard'},{id:'monitor',icon:'📹',label:'Live Monitor'},{id:'users',icon:'👥',label:'Users'},{id:'enrollment',icon:'🪪',label:'Enrollment'},{id:'attendance',icon:'📋',label:'Attendance'},{id:'reports',icon:'📊',label:'Reports'},{id:'notifications',icon:'🔔',label:'Notifications'}],
  faculty:[{id:'dashboard',icon:'⬡',label:'Dashboard'},{id:'attendance',icon:'📋',label:'Attendance'},{id:'attendance-eval',icon:'📝',label:'Attendance Evaluation'},{id:'reports',icon:'📊',label:'Reports'},{id:'notifications',icon:'🔔',label:'Notifications'}],
  student:[{id:'my-attendance',icon:'📋',label:'My Attendance'},{id:'student-profile',icon:'👤',label:'My Account'},{id:'student-excuse',icon:'📝',label:'Excuse Request'}],
  parent:[{id:'parent-dashboard',icon:'🏠',label:'Dashboard'},{id:'parent-attendance',icon:'📋',label:'Child Attendance'},{id:'parent-performance',icon:'📊',label:'Performance'},{id:'parent-excuse',icon:'📝',label:'File Excuse'},{id:'notifications',icon:'🔔',label:'Notifications'}],
};

async function refreshBackendData(){
  const [users,attendance,notifications,excuses]=await Promise.all([apiFetchAll('/users/',100),apiFetchAll('/attendance/',200),apiFetch('/notifications/'),apiFetch('/excuses/')]);
  if(users) backendUsers=users;
  if(attendance){backendAttendance=attendance;feedItems=attendance.slice(0,100).map(row=>({...row,record_id:row.id||row.record_id,event:'attendance_update'}));}
  if(notifications?.ok) backendNotifications=await notifications.json();
  if(excuses?.ok) backendExcuses=(await excuses.json()).map(normalizeExcuseRequest);
  refreshFeed();refreshMonFeed();
  buildNav();
  if(currentPage) navigate(currentPage);
  _updateNotifNavBadge();
}

function showApp(){
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('sb-name').textContent=currentUser.full_name;
  document.getElementById('sb-role').textContent=currentUser.role.replace('_',' ');
  buildNav();
  navigate(currentUser.role==='student'?'my-attendance':currentUser.role==='parent'?'parent-dashboard':'dashboard');
  if(!demoMode){connectWS();refreshBackendData();}
}

function buildNav(){
  const items=NAV[currentUser.role]||[];
  const badgeCount=_getMySystemNotifs().filter(x=>!_seenNotifIds.has(x.id)).length;
  document.getElementById('nav-items').innerHTML=items.map(n=>{
    const showBadge=n.id==='notifications'&&badgeCount>0;
    return `<button class="sb-item" id="nav-${n.id}" onclick="navigate('${n.id}')" style="position:relative">
      ${n.icon} ${n.label}
      ${showBadge?`<span class="nav-notif-badge" style="position:absolute;top:6px;right:10px;background:#EF4444;color:#fff;border-radius:99px;font-size:9px;font-weight:700;padding:1px 6px;min-width:16px;text-align:center">${badgeCount}</span>`:''}
    </button>`;
  }).join('');
}

function navigate(page){
  if(currentPage){
    // Clean up monitor resources when leaving
    if(currentPage==='monitor'){
      if(monitorCamStream){monitorCamStream.getTracks().forEach(t=>t.stop());monitorCamStream=null;}
      autoScanEnabled=false; clearTimeout(autoScanTimer); autoScanTimer=null;
      authState='idle'; lastRfidStudent=null;
      clearInterval(monitorFeedInterval);monitorFeedInterval=null;
      _stopPhysicalRfid();
      document.body.classList.remove('mon-page-fs'); // exit expand mode
    }
    // Clean up enrollment camera when leaving
    if(currentPage==='enrollment') enrolCamStop();
    document.getElementById('page-'+currentPage)?.classList.add('hidden');
    document.getElementById('nav-'+currentPage)?.classList.remove('active');
  }
  currentPage=page;
  document.getElementById('nav-'+page)?.classList.add('active');
  const el=document.getElementById('page-'+page);
  if(!el) return;
  el.classList.remove('hidden');
  renderPage(page,el);
}
function renderPage(page,el){
  ({dashboard:renderDashboard,monitor:renderMonitor,users:renderUsers,attendance:()=>renderAttendance(el,false),'my-attendance':()=>renderAttendance(el,true),enrollment:renderEnrollment,reports:renderReports,notifications:renderNotifications,'student-profile':renderStudentProfile,'student-excuse':renderStudentExcuse,'attendance-eval':renderAttendanceEval,'parent-dashboard':renderParentDashboard,'parent-attendance':renderParentAttendance,'parent-performance':renderParentPerformance,'parent-excuse':renderParentExcuse}[page]||function(){})(el);
}


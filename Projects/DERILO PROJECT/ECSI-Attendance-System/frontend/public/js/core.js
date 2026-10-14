/* ECSI Attendance System — core
   Extracted verbatim from index.html (original lines 349–405).
   Loaded as a classic global script via /js/core.js. */

// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════
// Deployment endpoints — overridden at build time via VITE_API_BASE_URL / VITE_WS_URL.
// Defaults in frontend/.env point at a local backend on port 8000.
const configuredApi = document.querySelector('meta[name="ecsi-api-base"]')?.content || '';
const API = (localStorage.getItem('ecsi_api_base') || (configuredApi && !configuredApi.startsWith('%VITE_') ? configuredApi : `${location.origin}/api/v1`)).replace(/\/$/, '');
const API_ORIGIN = new URL(API, location.href).origin;
const configuredWs = document.querySelector('meta[name="ecsi-ws-url"]')?.content || '';
const WS_API = localStorage.getItem('ecsi_ws_url') || (configuredWs && !configuredWs.startsWith('%VITE_') ? configuredWs : `${API_ORIGIN.replace(/^http/i, 'ws')}/ws/dashboard`);
let currentUser = null;
let demoMode = false;
let currentPage = null;
let wsConn = null;
let feedItems = [];
let backendUsers = [];
let backendAttendance = [];
let backendNotifications = [];
let backendExcuses = [];
// Live notification settings, seeded to mirror the backend's DEFAULT_SETTINGS so
// the first paint can never show the demo providers ("Semaphore"/"Gmail SMTP") or
// pre-enabled channels before the server responds.
let notifSettings = {sms_enabled:false,email_enabled:false,sms_provider:'Not configured',email_provider:'Not configured',recipients:{parents:true,admins:true,faculty:true},triggers:{proxy_alert:true,daily_summary:false,absence_3days:true,new_enrollment:true}};
function notifCfg(){return demoMode?MOCK.notifSettings:notifSettings;}
function appUsers(){
  if (demoMode) return MOCK.users;
  const base = [...backendUsers.filter(u => u.id !== currentUser?.id)];
  if (currentUser) base.push(currentUser);
  return base;
}
function appAttendance(){return demoMode?MOCK.attendance:backendAttendance;}
function appSections(){return demoMode?Object.keys(MOCK.sections):[...new Set(appUsers().map(u=>u.section).filter(Boolean))].sort();}
function appAdviserFor(section){return appUsers().find(u=>u.role==='faculty'&&u.section===section)?.full_name||'';}
function appSectionInfo(section){const sample=demoMode?MOCK.sections[section]:null;const student=appUsers().find(u=>u.role==='student'&&u.section===section);return sample||{department:student?.department||'',adviser:appAdviserFor(section)};}
function appSectionsMap(){return Object.fromEntries(appSections().map(section=>[section,appSectionInfo(section)]));}
function appNotifications(){return demoMode?MOCK.notifLog:backendNotifications.map(n=>({...n,type:n.channel,recipient:n.recipient_label,recipient_id:n.recipient_user_id,recipient_role:n.recipient_role,sender:n.sender_name,sent_at:n.created_at}));}
function appExcuseRequests(){return demoMode?MOCK.excuseRequests:backendExcuses;}
function normalizeExcuseRequest(r){return {...r,proof_data:r.proof_url||null};}

function saveAuth(d){ try{localStorage.setItem('ecsi_auth',JSON.stringify(d));}catch{} }
function loadAuth(){ try{return JSON.parse(localStorage.getItem('ecsi_auth')||'null');}catch{return null;} }
function clearAuthStore(){ try{localStorage.removeItem('ecsi_auth');}catch{} }

async function apiFetch(path, opts={}){
  if(demoMode) return null;
  const headers={};
  if(!(opts.body instanceof FormData)) headers['Content-Type']='application/json';
  if(currentUser?.token) headers['Authorization']='Bearer '+currentUser.token;
  Object.assign(headers, opts.headers||{});
  try{
    const r=await fetch(API+path,{...opts,headers});
    if(r.status===401){ doLogout(); return null; }
    return r;
  }catch{ return null; }
}

async function apiFetchAll(path,pageSize=100){
  const [route,query='']=path.split('?');const params=new URLSearchParams(query);params.set('page_size',String(pageSize));const records=[];
  for(let page=1;page<=50;page++){params.set('page',String(page));const response=await apiFetch(`${route}?${params}`);if(!response?.ok)return null;const batch=await response.json();records.push(...batch);if(batch.length<pageSize)return records;}
  return records;
}


/* ECSI Attendance System — monitor
   Extracted verbatim from index.html (original lines 725–1427).
   Loaded as a classic global script via /js/monitor.js. */

// ═══════════════════════════════════════════════════════════
// LIVE MONITOR
// ═══════════════════════════════════════════════════════════
let monitorCamStream=null;
function toggleMonPageFullscreen(){
  const on=document.body.classList.toggle('mon-page-fs');
  const btn=document.getElementById('mon-expand-btn');
  if(btn){btn.textContent=on?'⤡ Collapse':'⤢ Expand';}
  // Resize cam-box to fill available height when expanded
  const camBox=document.getElementById('cam-box');
  const rfidBox=document.getElementById('rfid-display');
  if(on){
    if(camBox) camBox.style.height='calc(100vh - 280px)';
    if(rfidBox) rfidBox.style.minHeight='calc(100vh - 340px)';
  } else {
    if(camBox) camBox.style.height='';
    if(rfidBox) rfidBox.style.minHeight='190px';
  }
}
let monitorFeedInterval=null;
let monitorRfidSim=null;

// Auth state machine: idle → rfid_ok → face_scanning → face_done → idle
let authState='idle';
let autoScanEnabled=false;
let autoScanTimer=null;

function renderMonitor(el){
  el.innerHTML=`
    <div class="topbar" style="display:flex;align-items:center;justify-content:space-between">
      <span class="font-bold">📹 Live Monitor</span>
      <div style="display:flex;gap:8px;align-items:center">
        <div id="mon-ws-badge" class="ws-badge ws-off"><span style="width:7px;height:7px;border-radius:50%;background:#9CA3AF;display:inline-block"></span> offline</div>
        <button id="mon-expand-btn" class="btn btn-secondary" style="font-size:12px;padding:6px 14px" onclick="toggleMonPageFullscreen()" title="Expand monitor to full page width">⤢ Expand</button>
        <button class="btn btn-primary" style="font-size:12px;padding:6px 14px" onclick="openMonitorFullscreen()" title="Open fullscreen overlay (dark mode)">⛶ Fullscreen</button>
      </div>
    </div>
    ${demoMode?`<div class="demo-banner"><div class="demo-banner-dot"></div>Demo Mode — camera & RFID simulation active</div>`:''}
    <div class="page-content" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start" id="mon-page-grid">

      <!-- Camera Panel -->
      <div class="card p-4">
        <div style="font-weight:700;font-size:13px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">
          <span>📷 Camera — Face Authentication</span>
          <span id="cam-status-badge" style="font-size:10px;padding:3px 8px;border-radius:99px;background:#F3F4F6;color:#6B7280">Inactive</span>
        </div>
        <div id="cam-box" style="background:#0D1117;border-radius:10px;overflow:hidden;position:relative;aspect-ratio:4/3;display:flex;align-items:center;justify-content:center">
          <video id="mon-video" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover;display:none"></video>
          <div id="cam-placeholder" style="text-align:center;color:#4B5563;position:relative;z-index:1">
            <div style="font-size:40px;margin-bottom:8px">📷</div>
            <div style="font-size:12px">Start camera to begin</div>
          </div>
          <div id="scan-line" style="display:none;position:absolute;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,#F2C111,transparent);animation:scanMove 2s linear infinite;pointer-events:none;z-index:2"></div>
          <!-- Persistent state overlay — content injected by monSetCamOverlay() -->
          <div id="auth-result" style="display:none;position:absolute;inset:0;align-items:flex-start;justify-content:center;border-radius:10px;z-index:3;overflow-y:auto"></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button id="cam-start-btn" class="btn btn-primary" style="flex:1;font-size:12px" onclick="monitorStartCam()">▶ Start Camera</button>
          <button id="cam-stop-btn" class="btn btn-secondary" style="font-size:12px;display:none" onclick="monitorStopCam()">■ Stop Camera</button>
        </div>
        <div id="cam-error" style="display:none;margin-top:8px;font-size:11px;color:#EF4444;background:#FFF1F2;border-radius:6px;padding:6px 10px"></div>
      </div>

      <!-- RFID Panel -->
      <div class="card p-4">
        <div style="font-weight:700;font-size:13px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center">
          <span>💳 RFID Scanner</span>
          <span id="rfid-status-badge" style="font-size:10px;padding:3px 8px;border-radius:99px;background:#F3F4F6;color:#6B7280">Ready</span>
        </div>
        <!-- Mode toggle -->
        <div style="display:flex;background:#F3F4F6;border-radius:8px;padding:3px;margin-bottom:10px">
          <button id="rfid-mode-sim" onclick="setRfidMode('sim')"
            style="flex:1;padding:5px 8px;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;background:#F2C111;color:#1F2937;transition:all .2s">
            🎮 Simulate
          </button>
          <button id="rfid-mode-hw" onclick="setRfidMode('hw')"
            style="flex:1;padding:5px 8px;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;background:transparent;color:#6B7280;transition:all .2s">
            📡 Physical Scanner
          </button>
        </div>
        <div id="rfid-display" style="background:#0D1117;border-radius:10px;padding:20px;text-align:center;min-height:190px;display:flex;flex-direction:column;align-items:center;justify-content:center">
          <div id="rfid-ring" style="width:90px;height:90px;border-radius:50%;border:3px solid #374151;display:flex;align-items:center;justify-content:center;margin-bottom:14px;transition:all .3s">
            <div style="font-size:36px">💳</div>
          </div>
          <div id="rfid-uid" style="font-family:monospace;color:#6B7280;font-size:12px;margin-bottom:6px">Ready — waiting for card…</div>
          <div id="rfid-user" style="font-size:12px;min-height:16px"></div>
        </div>
        <!-- Simulate mode controls -->
        <div id="rfid-sim-controls">
          <select id="rfid-student-sel" style="width:100%;margin-top:10px;padding:6px 8px;border-radius:8px;border:1px solid #E5E7EB;font-size:12px;background:#F9FAFB;color:#1F2937">
            <option value="">🎲 Random registered card</option>
            ${appUsers().filter(x=>x.has_rfid&&x.rfid_uid&&x.status==='active').map(x=>`<option value="${x.id}">${x.full_name} — ${x.id_number} [${x.rfid_uid}]</option>`).join('')}
          </select>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button id="rfid-tap-btn" class="btn btn-primary" style="flex:1;font-size:12px" onclick="monitorTapRfid()">💳 Simulate Card Tap</button>
            <button id="auto-scan-btn" class="btn btn-secondary" style="font-size:12px" onclick="monitorToggleAutoScan()">▶ Auto</button>
          </div>
        </div>
        <!-- Physical scanner controls -->
        <div id="rfid-hw-controls" style="display:none;margin-top:10px">
          <div id="rfid-hw-status" style="background:#0D1117;border-radius:8px;padding:12px;margin-bottom:8px;text-align:center">
            <div style="font-size:11px;color:#6B7280">Connect your USB RFID reader and click Activate</div>
          </div>
          <button id="rfid-hw-btn" class="btn btn-primary" style="width:100%;font-size:12px" onclick="togglePhysicalRfid()">
            📡 Activate Physical Scanner
          </button>
          <div style="margin-top:6px;font-size:10px;color:#6B7280;text-align:center;line-height:1.5">
            Works with any USB HID RFID reader (keyboard-emulation mode).<br>
            Card UID is read automatically when card is tapped.
          </div>
        </div>
        <div style="margin-top:8px;font-size:10px;color:#9CA3AF;text-align:center">Camera must be on for face verification to run</div>
      </div>

      <!-- Live Feed Panel (full width) -->
      <div class="card p-4" style="grid-column:1/-1">
        <div style="font-weight:700;font-size:13px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">
          <span>📋 Attendance Feed</span>
          <span id="mon-feed-count" style="font-size:11px;color:#6B7280">0 events</span>
        </div>
        <div id="mon-feed-list" style="max-height:260px;overflow-y:auto">
          <div class="feed-empty">
            <div class="feed-empty-icon">📡</div>
            <div style="font-weight:600;font-size:13px">No events yet</div>
            <div style="font-size:12px;color:#9CA3AF;margin-top:4px">Tap a card to start authentication</div>
          </div>
        </div>
      </div>

    </div>`;

  // Set WS badge
  setMonBadge(demoMode?'demo':wsConn?.readyState===1?'live':'offline');
  clearInterval(monitorFeedInterval);
  loadMonitorFeed();
  monitorFeedInterval=setInterval(loadMonitorFeed,10000);
}

function setMonBadge(state){
  const b=document.getElementById('mon-ws-badge');
  if(!b) return;
  const map={live:['#41A638','live'],demo:['#F2C111','demo'],offline:['#9CA3AF','offline']};
  const [col,lbl]=map[state]||map.offline;
  b.innerHTML=`<span style="width:7px;height:7px;border-radius:50%;background:${col};display:inline-block"></span> ${lbl}`;
}

function attendanceSurname(fullName){
  const name=String(fullName||'').trim();
  if(!name) return 'Unknown';
  if(name.includes(',')) return name.split(',')[0].trim()||'Unknown';
  const parts=name.split(/\s+/);
  if(parts.length<2) return name;
  const surnameParts=[parts.pop()];
  const particles=new Set(['da','das','de','del','dela','di','dos','la','las','los','san','santa','van','von']);
  while(parts.length&&particles.has(parts[parts.length-1].toLowerCase())) surnameParts.unshift(parts.pop());
  return surnameParts.join(' ');
}

function refreshMonFeed(){
  const el=document.getElementById('mon-feed-list');
  const cnt=document.getElementById('mon-feed-count');
  if(!el) return;
  if(cnt) cnt.textContent=feedItems.length+' event'+(feedItems.length!==1?'s':'');
  const previousFeedKeys=prepareFeedRender(el,feedItems,30);if(previousFeedKeys===null)return;
  if(!feedItems.length){el.innerHTML='<div class="feed-empty"><div class="feed-empty-icon">&#128241;</div><div style="font-weight:600;font-size:13px">No events yet</div><div style="font-size:12px;color:#9CA3AF;margin-top:4px">Tap a card to start authentication</div></div>';return;}
  el.innerHTML=feedItems.slice(0,30).map(ev=>{
    const isProxy=ev.status==='proxy_anomaly'||ev.status==='face_mismatch';
    const isDanger=ev.status==='unregistered_rfid'||ev.status==='no_face_template';
    const cls=isDanger?'danger':isProxy?'proxy':ev.status==='verified'?'verified':'warning';
    const dist=ev.cosine_distance!=null?` · dist: ${typeof ev.cosine_distance==='number'?ev.cosine_distance.toFixed(4):ev.cosine_distance}`:'';
    const sec=ev.section?` · ${ev.section}`:'';
    const inOutBadge=ev.check_type==='time_in'
      ?'<span style="font-size:9px;background:#D1FAE5;color:#065F46;padding:1px 6px;border-radius:99px;font-weight:700;margin-right:4px">↗ IN</span>'
      :ev.check_type==='time_out'
      ?'<span style="font-size:9px;background:#FEE2E2;color:#991B1B;padding:1px 6px;border-radius:99px;font-weight:700;margin-right:4px">↙ OUT</span>':'';
    const surname=attendanceSurname(ev.full_name||ev.label);
    const avatar=ev.status==='unregistered_rfid'?'⛔':ev.status==='no_face_template'?'🚷':isProxy?'🚫':surname[0];
    const avatarBg=isDanger||isProxy?'background:rgba(239,68,68,.15)':'';
    return `<div class="feed-item ${cls} slide-in" data-feed-key="${feedItemKey(ev)}">
      <div class="feed-avatar" style="${avatarBg}">${avatar}</div>
      <div style="flex:1;min-width:0"><div class="feed-name">${inOutBadge}${surname}</div><div class="feed-sub">${ev.id_number||''}${sec} · ${new Date(ev.timestamp||Date.now()).toLocaleTimeString()}${dist}${ev.detail?' · '+ev.detail:''}</div></div>
      ${badgeHtml(ev.status)}</div>`;
  }).join('');
  finishFeedRender(el,previousFeedKeys);
}

async function loadMonitorFeed(){
  if(demoMode) { refreshMonFeed(); return; }
  const response=await apiFetch('/attendance/?page_size=30');
  if(!response?.ok) return;
  const records=(await response.json()).filter(record=>!isSeededAttendanceRecord(record));
  feedItems=records;
  backendAttendance=records;
  refreshFeed();
  refreshMonFeed();
  if(typeof fsFeedRefresh==='function') fsFeedRefresh();
}

function upsertMonitorFeedRecord(record){
  if(!record?.id&&!record?.record_id) return;
  const id=record.id||record.record_id;
  feedItems=[record,...feedItems.filter(item=>(item.id||item.record_id)!==id)].slice(0,100);
  backendAttendance=[record,...backendAttendance.filter(item=>(item.id||item.record_id)!==id)].slice(0,500);
  refreshFeed();
  refreshMonFeed();
  if(typeof fsFeedRefresh==='function') fsFeedRefresh();
}

function addMonitorLocalEvent(event){
  // Live attendance feeds contain backend records and backend WebSocket events
  // only. Local simulation entries belong to Demo Mode.
  if(!demoMode) return;
  feedItems.unshift(event);
  if(feedItems.length>100) feedItems.pop();
  refreshFeed();
  refreshMonFeed();
  if(typeof fsFeedRefresh==='function') fsFeedRefresh();
}

function pickRandomMonitorCard(){
  const registered=appUsers().filter(user=>user.status==='active'&&user.has_rfid&&user.rfid_uid);
  if(demoMode&&Math.random()<0.10){
    return {user:null,uid:GHOST_UIDS[Math.floor(Math.random()*GHOST_UIDS.length)],isGhost:true};
  }
  if(!registered.length){
    return {user:null,uid:GHOST_UIDS[0],isGhost:true};
  }
  const user=registered[Math.floor(Math.random()*registered.length)];
  return {user,uid:user.rfid_uid,isGhost:false};
}

// ── Camera ──────────────────────────────────────────────────
async function monitorStartCam(){
  const errEl=document.getElementById('cam-error');
  errEl.style.display='none';
  try{
    const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:640,height:480},audio:false});
    monitorCamStream=stream;
    const vid=document.getElementById('mon-video');
    const ph=document.getElementById('cam-placeholder');
    const sl=document.getElementById('scan-line');
    vid.srcObject=stream; vid.style.display='block';
    if(ph) ph.style.display='none';
    if(sl) sl.style.display='block';
    document.getElementById('cam-status-badge').textContent='Active';
    document.getElementById('cam-status-badge').style.cssText='font-size:10px;padding:3px 8px;border-radius:99px;background:#D1FAE5;color:#065F46';
    document.getElementById('cam-start-btn').style.display='none';
    document.getElementById('cam-stop-btn').style.display='';
    // Show idle overlay — camera waits for RFID
    monSetCamOverlay('idle');
  }catch(e){
    errEl.style.display='block';
    errEl.textContent='Camera access denied. Please allow camera permission in your browser settings.';
  }
}
function monitorStopCam(){
  if(monitorCamStream){monitorCamStream.getTracks().forEach(t=>t.stop());monitorCamStream=null;}
  const vid=document.getElementById('mon-video');
  if(vid){vid.srcObject=null;vid.style.display='none';}
  document.getElementById('cam-placeholder').style.display='flex';
  document.getElementById('scan-line').style.display='none';
  document.getElementById('auth-result').style.display='none';
  document.getElementById('cam-status-badge').textContent='Inactive';
  document.getElementById('cam-status-badge').style.cssText='font-size:10px;padding:3px 8px;border-radius:99px;background:#F3F4F6;color:#6B7280';
  document.getElementById('cam-start-btn').style.display='';
  document.getElementById('cam-stop-btn').style.display='none';
}

// ── Camera overlay state ─────────────────────────────────────
// Pipeline steps matching the system objectives:
// Step 1-2: RFID read + UID lookup
// Step 3:   Camera captures face frame
// Step 4:   OpenCV detects landmarks & encodes features
// Step 5:   CNN/FaceNet matches face to database
// Step 6:   Liveness check → record timestamp
// Step 7:   Log attendance → push notification to parent
function monSetCamOverlay(state, data){
  const res=document.getElementById('auth-result');
  if(!res) return;
  res.style.display='flex';
  res.style.transition='background .2s ease';

  const STEPS=['RFID Read','Frame Capture','Landmark Detection','Face Match','Liveness Check','Log & Notify'];
  const activeStep={
    fetching:0, capturing:1, landmarks:2, matching:3, liveness:4,
    verified_inout:5, proxy:3, liveness_fail:4, no_face:-1, no_cam:-1, denied:-1, idle:-1
  }[state]??-1;

  const cfg={
    idle:         {bg:'rgba(17,24,39,.75)',   ic:'⏳', name:'Waiting for RFID Card',                  detail:'Present a registered RFID card to begin'},
    fetching:     {bg:'rgba(30,64,175,.85)',  ic:'🪪', name:`Step 1–2 · RFID Read`,                   detail:`UID detected · Fetching profile for ${data?.full_name||'student'}…`},
    capturing:    {bg:'rgba(30,41,59,.92)',   ic:'📷', name:'Step 3 · Frame Capture',                 detail:'Camera frame locked at tap timestamp · Extracting image'},
    landmarks:    {bg:'rgba(67,20,122,.88)',  ic:'👁', name:'Step 4 · Landmark Detection',            detail:'OpenCV detecting face landmarks · Encoding 512-dim feature vector'},
    matching:     {bg:'rgba(109,40,217,.88)', ic:'🧠', name:'Step 5 · CNN / FaceNet Matching',        detail:`Comparing live embedding vs. stored template · Cosine distance…`},
    liveness:     {bg:'rgba(14,116,144,.90)', ic:'💡', name:'Step 6 · Liveness Check',               detail:'Anti-spoofing · Verifying real face (not photo/screen)…'},
    verified_inout:{bg:data?.checkType==='time_in'?'rgba(22,101,52,.90)':'rgba(29,78,216,.90)',
                    ic:data?.checkType==='time_in'?'🟢':'🔵',
                    name:`Step 7 · ${data?.checkType==='time_in'?'Time IN ↗ Recorded':'Time OUT ↙ Recorded'}`,
                    detail:`${data?.student?.full_name||''} · ${data?.student?.id_number||''} · dist: ${data?.cosine} ✓ · Parent notified`},
    proxy:        {bg:'rgba(127,29,29,.92)',  ic:'🚫', name:'Step 5 · Face Mismatch — BLOCKED',       detail:`FaceNet dist: ${data?.cosine} > 0.40 · Proxy attempt flagged · Access denied`},
    liveness_fail:{bg:'rgba(127,29,29,.92)',  ic:'🕵️', name:'Step 6 · Liveness Check FAILED',         detail:'Anti-spoofing detected possible photo/spoof attack · Login blocked'},
    no_face:      {bg:'rgba(127,29,29,.92)',  ic:'🚷', name:'Face Not Enrolled — LOGIN BLOCKED',       detail:`${data?.full_name||data?.student?.full_name||''} has no registered face template`},
    no_cam:           {bg:'rgba(127,29,29,.92)',  ic:'📵', name:'Camera Required — LOGIN BLOCKED',            detail:'Face authentication is mandatory. Start the camera first.'},
    no_face_in_frame: {bg:'rgba(120,53,15,.90)', ic:'👁', name:'Step 3 · No Face Detected — RETRY',          detail:`${data?.full_name||''} — No face found in camera frame · Face the camera and tap RFID again`},
    denied:           {bg:'rgba(153,27,27,.88)', ic:'⛔', name:'Step 2 · Unknown RFID — BLOCKED',            detail:'UID not found in database · Access terminated immediately'},
  };
  const c=cfg[state]||cfg.idle;
  res.style.background=c.bg;

  // Build overlay HTML with step tracker during processing
  const isProcessing=activeStep>=0&&activeStep<5;
  const isResult=['verified_inout','proxy','liveness_fail','no_face','no_cam','denied'].includes(state);

  res.innerHTML=`
    <div style="width:100%;padding:16px;display:flex;flex-direction:column;align-items:center;gap:10px">
      <!-- Icon + title -->
      <div style="font-size:${isResult?'44px':'34px'};line-height:1">${c.ic}</div>
      <div style="color:#fff;font-weight:700;font-size:${isResult?'14px':'13px'};text-align:center;max-width:90%">${c.name}</div>
      <div style="color:rgba(255,255,255,.72);font-size:11px;text-align:center;max-width:92%;line-height:1.5">${c.detail}</div>
      <!-- Step tracker (shown only during pipeline) -->
      ${isProcessing?`
      <div style="width:100%;margin-top:6px">
        <div style="display:flex;align-items:center;justify-content:center;gap:0">
          ${STEPS.map((lbl,i)=>{
            const done=i<activeStep;
            const active=i===activeStep;
            const nodeColor=done?'#4ADE80':active?'#F2C111':'rgba(255,255,255,.2)';
            const lineColor=done?'#4ADE80':'rgba(255,255,255,.15)';
            return `${i>0?`<div style="flex:1;height:2px;background:${lineColor};max-width:24px"></div>`:''}
              <div title="${lbl}" style="width:22px;height:22px;border-radius:50%;background:${nodeColor};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;color:${done?'#14532D':active?'#1F2937':'rgba(255,255,255,.4)'};flex-shrink:0;transition:background .3s ease">${done?'✓':i+1}</div>`;
          }).join('')}
        </div>
        <div style="text-align:center;color:${activeStep>=0?'#F2C111':'rgba(255,255,255,.5)'};font-size:10px;font-weight:600;margin-top:6px">${STEPS[activeStep]||''}</div>
      </div>`:''}
    </div>`;
}

function _monCaptureFlash(){
  // Brief white flash on camera box to simulate frame grab at card-tap timestamp
  const panel=document.getElementById('cam-box');
  if(!panel) return;
  const flash=document.createElement('div');
  flash.style.cssText='position:absolute;inset:0;background:#fff;opacity:0;border-radius:10px;pointer-events:none;z-index:20;transition:opacity .07s ease';
  panel.appendChild(flash);
  requestAnimationFrame(()=>{
    flash.style.opacity='0.65';
    setTimeout(()=>{flash.style.opacity='0';setTimeout(()=>flash.remove(),150);},90);
  });
}

// ── Shared auth engine ──────────────────────────────────────
const GHOST_UIDS=['FF:FF:FF:FF','DE:AD:BE:EF','00:00:00:01','BA:DC:AF:E0'];
let lastRfidStudent=null;
let _pipelineToken=0; // incremented to cancel in-flight pipeline steps

// ── IN / OUT toggle per student (resets at midnight) ─────────
// todayAttendance[id_number] = 'in' means they have timed-in → next tap = time_out
const todayAttendance={};
function getCheckType(id_number){
  return todayAttendance[id_number]==='in'?'time_out':'time_in';
}
function recordCheckType(id_number, type){
  todayAttendance[id_number]=type==='time_in'?'in':'out';
}

// ── Debounce: prevent accidental double-tap within 20 seconds ────────────
const _lastTapMs={};
const TAP_DEBOUNCE_MS=20000;   // same-direction block: 20s
const MIN_TAP_INTERVAL_MS=5000; // hard minimum between ANY tap: 5s
function _isTapTooSoon(id_number){
  const last=_lastTapMs[id_number]||0;
  return (Date.now()-last) < TAP_DEBOUNCE_MS;
}
function _recordTap(id_number){ _lastTapMs[id_number]=Date.now(); }

// ── Success popup ─────────────────────────────────────────────────────────
function showVerifiedPopup(student, checkType, cosine, capturedFrame){
  document.getElementById('verified-popup')?.remove();
  const isIn=checkType==='time_in';

  // GREEN for Time IN, RED for Time OUT
  const accentColor  = isIn ? '#16a34a' : '#DC2626';
  const accentLight  = isIn ? 'rgba(22,163,74,.18)'  : 'rgba(220,38,38,.18)';
  const accentText   = isIn ? '#4ADE80'  : '#F87171';
  const gradBg       = isIn ? 'linear-gradient(135deg,#14532d,#16a34a)' : 'linear-gradient(135deg,#7F1D1D,#DC2626)';
  const borderColor  = isIn ? '#166534'  : '#991B1B';
  const icon         = isIn ? '✅' : '🔴';
  const label        = isIn ? 'TIME IN RECORDED' : 'TIME OUT RECORDED';

  const section    = student.section||student.department||'—';
  const sectionData= appSectionInfo(section)||{};
  const adviser    = sectionData.adviser||'—';
  const dept       = sectionData.department||student.department||'—';
  const time       = new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});

  // ── Face comparison row ─────────────────────────────────────────────────
  // Left: enrolled photo | Middle: match badge | Right: live camera snapshot
  const enrolledHtml = student.face_photo
    ? `<img src="${student.face_photo}" style="width:68px;height:68px;border-radius:10px;object-fit:cover;border:2px solid ${accentColor};display:block">`
    : `<div style="width:68px;height:68px;border-radius:10px;background:${accentLight};display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:800;color:${accentText}">${(student.full_name||'?')[0]}</div>`;

  const capturedHtml = capturedFrame
    ? `<img src="${capturedFrame}" style="width:68px;height:68px;border-radius:10px;object-fit:cover;border:2px solid ${accentColor};display:block">`
    : `<div style="width:68px;height:68px;border-radius:10px;background:#1F2937;display:flex;align-items:center;justify-content:center;font-size:10px;color:#6B7280;text-align:center;line-height:1.3">No<br>camera</div>`;

  const popup=document.createElement('div');
  popup.id='verified-popup';
  popup.style.cssText=`position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.62);backdrop-filter:blur(6px);animation:fadeIn .18s ease`;
  popup.innerHTML=`
    <div style="background:#0F172A;border-radius:22px;width:380px;max-width:95vw;overflow:hidden;box-shadow:0 28px 72px rgba(0,0,0,.7);border:1.5px solid ${borderColor}">

      <!-- Header banner -->
      <div style="background:${gradBg};padding:22px 24px 18px;text-align:center">
        <div style="font-size:46px;margin-bottom:6px;line-height:1">${icon}</div>
        <div style="color:#fff;font-size:19px;font-weight:900;letter-spacing:.8px;text-shadow:0 1px 4px rgba(0,0,0,.3)">${label}</div>
        <div style="color:rgba(255,255,255,.7);font-size:12px;margin-top:5px;font-weight:600">🕐 ${time}</div>
      </div>

      <!-- Face authentication comparison -->
      <div style="background:#111827;padding:14px 20px;border-bottom:1px solid #1F2937">
        <div style="font-size:9px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:1px;text-align:center;margin-bottom:10px">📷 Camera Facial Authentication</div>
        <div style="display:flex;align-items:center;justify-content:center;gap:12px">
          <div style="text-align:center">
            ${enrolledHtml}
            <div style="font-size:9px;color:#6B7280;margin-top:4px;font-weight:600">Enrolled</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
            <div style="background:${accentLight};border:1.5px solid ${accentColor};border-radius:8px;padding:4px 10px">
              <div style="font-size:11px;font-weight:800;color:${accentText}">MATCH ✓</div>
              <div style="font-size:9px;color:${accentText};text-align:center">dist: ${cosine}</div>
            </div>
            <div style="width:28px;height:2px;background:${accentColor};border-radius:1px"></div>
          </div>
          <div style="text-align:center">
            ${capturedHtml}
            <div style="font-size:9px;color:#6B7280;margin-top:4px;font-weight:600">Live Capture</div>
          </div>
        </div>
      </div>

      <!-- Student info -->
      <div style="padding:16px 20px">
        <div style="display:flex;align-items:center;gap:12px;padding-bottom:14px;border-bottom:1px solid #1F2937;margin-bottom:14px">
          <div style="width:44px;height:44px;border-radius:50%;background:${accentLight};display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:${accentText};flex-shrink:0">${(student.full_name||'?')[0]}</div>
          <div>
            <div style="color:#F9FAFB;font-size:15px;font-weight:700;line-height:1.2">${student.full_name}</div>
            <div style="color:#6B7280;font-size:11px;margin-top:1px">${student.id_number||''}</div>
          </div>
          <div style="margin-left:auto">
            <span style="background:${accentLight};color:${accentText};font-size:10px;font-weight:800;padding:3px 8px;border-radius:99px;border:1px solid ${accentColor}">${isIn?'↗ IN':'↙ OUT'}</span>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
          <div style="background:#1F2937;border-radius:8px;padding:9px 11px">
            <div style="color:#6B7280;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">Section</div>
            <div style="color:#F9FAFB;font-size:12px;font-weight:600">${section}</div>
          </div>
          <div style="background:#1F2937;border-radius:8px;padding:9px 11px">
            <div style="color:#6B7280;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">Department</div>
            <div style="color:#F9FAFB;font-size:12px;font-weight:600">${dept}</div>
          </div>
          <div style="background:#1F2937;border-radius:8px;padding:9px 11px;grid-column:1/-1">
            <div style="color:#6B7280;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">Class Adviser</div>
            <div style="color:#F9FAFB;font-size:12px;font-weight:600">${adviser}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;background:#0D1117;border-radius:8px;padding:7px 11px">
          <span style="color:#6B7280;font-size:10px">ArcFace cosine distance</span>
          <span style="color:${accentText};font-size:11px;font-weight:700">${cosine} ≤ 0.40 ✓</span>
        </div>
      </div>

      <!-- Auto-dismiss progress bar -->
      <div id="popup-progress" style="height:4px;background:${accentColor};width:100%;transition:width 4s linear;border-radius:0 0 4px 4px"></div>
    </div>`;

  document.body.appendChild(popup);
  popup.addEventListener('click',()=>popup.remove());
  requestAnimationFrame(()=>{
    const bar=document.getElementById('popup-progress');
    if(bar) setTimeout(()=>{bar.style.width='0%';},50);
  });
  setTimeout(()=>popup?.remove(), 4200);
}

// ── Parent notification — SMS + Email + In-System (all channels) ─────────────
function sendParentSms(student, checkType, time){
  // Find parent linked to this student via children array
  const parent = appUsers().find(u => u.role==='parent' && Array.isArray(u.children) && u.children.includes(student.id));
  if(!parent) return; // no parent linked — skip

  const isIn      = checkType==='time_in';
  const action    = isIn ? 'arrived at school (Time IN)' : 'left school (Time OUT)';
  const subject   = `${isIn?'📥 Time IN':'📤 Time OUT'} — ${student.full_name}`;
  const shortMsg  = `ECSI: ${student.full_name} has ${action} at ${time}.`;
  const fullBody  = `Dear ${parent.full_name},\n\nThis is to inform you that your child, ${student.full_name} (${student.id_number}), has ${action} at ${time}.\n\nSection: ${student.section||student.department||'—'}\n\n— ECSI Attendance System`;
  const sysMsg    = `Your child ${student.full_name} has ${action} at ${time}. Tap to view attendance details.`;
  const now       = new Date().toISOString();
  const baseId    = Date.now();

  // 1. SMS
  MOCK.notifLog.unshift({
    id:'sms-'+baseId, type:'sms',
    recipient: parent.full_name,
    subject, body: shortMsg,
    status:'delivered', sent_at: now,
  });

  // 2. Email
  MOCK.notifLog.unshift({
    id:'email-'+baseId, type:'email',
    recipient: parent.full_name,
    subject, body: fullBody,
    status:'delivered', sent_at: now,
  });

  // 3. In-system (targeted to the parent — will appear in their Notifications)
  MOCK.notifLog.unshift({
    id:'sys-'+baseId, type:'system',
    recipient: parent.full_name,
    recipient_id: parent.id,
    subject, body: sysMsg,
    status:'delivered', sent_at: now,
  });

  // Update nav badge so parent sees unread count immediately
  _updateNotifNavBadge();

  // Show SMS toast on the monitor screen
  showSmsToast(parent.full_name, parent.id_number, student.full_name, checkType, time);
}

function _monWarnToast(type, detail){
  document.getElementById('warn-toast')?.remove();
  const cfg={
    unregistered_rfid:{border:'#F97316',bg:'rgba(249,115,22,.2)',text:'#FED7AA',icon:'⛔',title:'Unregistered RFID — Login Blocked'},
    no_cam:           {border:'#F59E0B',bg:'rgba(245,158,11,.2)',text:'#FDE68A',icon:'📵',title:'Camera Required — Login Blocked'},
    no_face:          {border:'#EF4444',bg:'rgba(239,68,68,.2)', text:'#FECACA',icon:'🚷',title:'Face Not Enrolled — Login Blocked'},
    no_face_in_frame: {border:'#F97316',bg:'rgba(249,115,22,.2)',text:'#FED7AA',icon:'👁', title:'No Face Detected — Tap RFID to Retry'},
    face_mismatch:    {border:'#EF4444',bg:'rgba(239,68,68,.2)', text:'#FECACA',icon:'🚫',title:'Face Mismatch — Login Terminated'},
  }[type]||{border:'#EF4444',bg:'rgba(239,68,68,.2)',text:'#FECACA',icon:'⚠️',title:'Authentication Failed'};

  const toast=document.createElement('div');
  toast.id='warn-toast';
  toast.style.cssText=`position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:9999;
    background:#1F2937;color:#fff;border-radius:12px;padding:14px 20px;font-size:12px;
    display:flex;align-items:center;gap:12px;box-shadow:0 8px 32px rgba(0,0,0,.5);
    animation:slideUp .25s ease-out;min-width:340px;max-width:520px;pointer-events:none;
    border-left:4px solid ${cfg.border}`;
  toast.innerHTML=`
    <div style="width:38px;height:38px;border-radius:50%;background:${cfg.bg};display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">${cfg.icon}</div>
    <div style="flex:1">
      <div style="font-weight:700;color:${cfg.text};margin-bottom:3px">${cfg.title}</div>
      <div style="color:#9CA3AF;font-size:11px">${detail}</div>
    </div>
    <div style="font-size:9px;font-weight:700;padding:3px 7px;border-radius:6px;background:rgba(239,68,68,.3);color:#FCA5A5;white-space:nowrap">⚠ ALERT</div>`;
  document.body.appendChild(toast);
  setTimeout(()=>toast.remove(), 5000);
}

function showSmsToast(parentName, contact, studentName, checkType, time){
  // Remove any existing toast
  document.getElementById('sms-toast')?.remove();
  const isIn=checkType==='time_in';
  const toast=document.createElement('div');
  toast.id='sms-toast';
  toast.style.cssText=`position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999;
    background:#1F2937;color:#fff;border-radius:12px;padding:12px 18px;font-size:12px;
    display:flex;align-items:center;gap:12px;box-shadow:0 8px 30px rgba(0,0,0,.4);
    animation:slideUp .3s ease-out;min-width:320px;max-width:480px;pointer-events:none`;
  toast.innerHTML=`
    <div style="width:36px;height:36px;border-radius:50%;background:${isIn?'#41A638':'#3B82F6'};display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">📱</div>
    <div style="flex:1">
      <div style="font-weight:700;margin-bottom:2px">SMS sent to ${parentName}</div>
      <div style="color:#9CA3AF;font-size:11px">${contact} · ${studentName} — ${isIn?'🟢 Time IN':'🔵 Time OUT'} at ${time}</div>
    </div>
    <div style="color:${isIn?'#41A638':'#3B82F6'};font-size:18px">${isIn?'↗':'↙'}</div>`;
  document.body.appendChild(toast);
  setTimeout(()=>toast.remove(), 4500);
}

// ── Face presence detection helper ───────────────────────────────────────────
// Draws a 32×32 thumbnail from the live video synchronously and runs three checks:
//   1. Minimum average brightness (rules out dark/covered camera)
//   2. Minimum pixel variance (rules out solid-color / blank frames)
//   3. Skin-tone presence in centre region (rules out scenes with no face)
// Returns {ok:true} or {ok:false, reason:string}
async function captureCameraFrame(vid, timeoutMs=1500){
  if(!vid) return null;
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){
    if(vid.readyState>=HTMLMediaElement.HAVE_CURRENT_DATA && vid.videoWidth>0 && vid.videoHeight>0){
      const cv=document.createElement('canvas');
      cv.width=vid.videoWidth; cv.height=vid.videoHeight;
      const ctx=cv.getContext('2d');
      if(!ctx) return null;
      ctx.drawImage(vid,0,0);
      return cv.toDataURL('image/jpeg',0.82);
    }
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  return null;
}

async function checkCameraFace(frameDataUrl){
  if(!frameDataUrl) return {ok:false,reason:'no_video'};
  if(typeof window.detectFaceInFrame!=='function') return {ok:false,reason:'detector_unavailable'};
  return window.detectFaceInFrame(frameDataUrl);
}

async function verifyFaceFrame(student, frameDataUrl, cardUid, checkType){
  if(demoMode) return simFaceMatch(student, await extractImageFeatures(frameDataUrl));
  if(!frameDataUrl) return {matched:false,student,cosine:null,status:'proxy_anomaly'};
  try{
    const frameBlob=await (await fetch(frameDataUrl)).blob();
    const form=new FormData();
    form.append('frame',frameBlob,'attendance-frame.jpg');
    form.append('card_uid',cardUid||student.rfid_uid||'');
    form.append('check_type',checkType||'time_in');
    form.append('terminal_id','Terminal-1');
    const response=await apiFetch(`/attendance/verify-face/${encodeURIComponent(student.id)}`,{method:'POST',body:form});
    if(response?.status===409){
      const body=await response.json().catch(()=>({}));
      const detail=String(body.detail||'');
      const normalized=detail.toLowerCase();
      if(normalized.includes('old arcface')) return {matched:false,student,cosine:null,status:'legacy_face_template',detail};
      if(normalized.includes('no face template')) return {matched:false,student,cosine:null,status:'no_face_template',detail};
      return {matched:false,student,cosine:null,status:'verification_unavailable',detail};
    }
    if(!response?.ok) return {matched:false,student,cosine:null,status:'verification_unavailable'};
    const result=await response.json();
    if(!result.record) return {matched:false,student,cosine:null,status:'verification_unavailable'};
    return {matched:result.matched===true,student,cosine:result.cosine_distance,status:result.matched?'verified':'proxy_anomaly',record:result.record};
  }catch{
    return {matched:false,student,cosine:null,status:'proxy_anomaly'};
  }
}


// ── Uniform-LBP lookup table (58 uniform patterns + 1 non-uniform = 59 bins) ──
const _ULBP=(()=>{
  const t=new Uint8Array(256);
  let idx=0;
  for(let v=0;v<256;v++){
    let tr=0;
    for(let i=0;i<8;i++) if(((v>>i)&1)!==((v>>((i+1)%8))&1)) tr++;
    t[v]=tr<=2?idx++:58;
  }
  return t;
})();

// ── Image feature extraction (LBPH — Local Binary Patterns Histograms) ──────
// 64×64 tight face-crop → 4×4 spatial grid → 59-bin uniform LBP per cell = 944 values
// LBP is invariant to monotonic lighting changes and captures local facial texture.
function extractImageFeatures(dataUrl){
  return new Promise(resolve=>{
    if(!dataUrl){resolve(null);return;}
    const img=new Image();
    img.onload=()=>{
      try{
        const S=64, cells=4, cellS=16, bins=59;
        const cv=document.createElement('canvas');
        cv.width=S;cv.height=S;
        const ctx=cv.getContext('2d');
        // Tight crop: centre 50% width × 60% height — face region only
        const iw=img.naturalWidth||img.width||320;
        const ih=img.naturalHeight||img.height||240;
        ctx.drawImage(img, iw*0.25, ih*0.15, iw*0.50, ih*0.60, 0, 0, S, S);
        const d=ctx.getImageData(0,0,S,S).data;
        // Grayscale
        const gray=new Float32Array(S*S);
        for(let i=0;i<S*S;i++)
          gray[i]=d[i*4]*0.299+d[i*4+1]*0.587+d[i*4+2]*0.114;
        // LBPH: compute uniform LBP histogram per spatial cell
        const feat=new Float32Array(cells*cells*bins);
        for(let cy=0;cy<cells;cy++){
          for(let cx=0;cx<cells;cx++){
            const hist=new Float32Array(bins);
            let cnt=0;
            for(let py=1;py<cellS-1;py++){
              for(let px=1;px<cellS-1;px++){
                const y=cy*cellS+py, x=cx*cellS+px;
                const c=gray[y*S+x];
                let lbp=0;
                if(gray[(y-1)*S+(x-1)]>=c) lbp|=1;
                if(gray[(y-1)*S+x    ]>=c) lbp|=2;
                if(gray[(y-1)*S+(x+1)]>=c) lbp|=4;
                if(gray[y    *S+(x+1)]>=c) lbp|=8;
                if(gray[(y+1)*S+(x+1)]>=c) lbp|=16;
                if(gray[(y+1)*S+x    ]>=c) lbp|=32;
                if(gray[(y+1)*S+(x-1)]>=c) lbp|=64;
                if(gray[y    *S+(x-1)]>=c) lbp|=128;
                hist[_ULBP[lbp]]++;
                cnt++;
              }
            }
            if(cnt>0) for(let b=0;b<bins;b++) hist[b]/=cnt;
            feat.set(hist,(cy*cells+cx)*bins);
          }
        }
        resolve(feat);
      }catch(e){resolve(null);}
    };
    img.onerror=()=>resolve(null);
    img.src=dataUrl;
  });
}

// Histogram intersection similarity: Σ min(h1,h2) averaged per cell → [0,1]
// Values near 1 = same texture distribution; different faces → significantly lower
function compareImageFeatures(f1,f2){
  if(!f1||!f2||f1.length!==f2.length) return null;
  const cells=f1.length/59;
  let sim=0;
  for(let i=0;i<f1.length;i++) sim+=Math.min(f1[i],f2[i]);
  return sim/cells; // average intersection per cell
}


const FACE_SIM_THRESHOLD=0.55; // LBPH histogram intersection; same person≈0.65-0.80, diff≈0.35-0.50

function simFaceMatch(student, liveFeatures){
  if(!student.has_face) return {matched:false,student,cosine:null,status:'no_face_template'};

  // ── Enrolled-photo users: compare real pixel histograms ──────────────────────
  if(student.face_photo){
    if(student._faceFeatures && liveFeatures){
      const sim=compareImageFeatures(student._faceFeatures, liveFeatures);
      if(sim!==null){
        const matched=sim>=FACE_SIM_THRESHOLD;
        // Map similarity → cosine distance (same scale as ArcFace display)
        const cosine=parseFloat((1-sim).toFixed(4));
        return {matched,student,cosine,status:matched?'verified':'proxy_anomaly'};
      }
    }
    // Cannot extract features → fail secure (never auto-approve)
    return {matched:false,student,cosine:0.99,status:'proxy_anomaly'};
  }

  // ── Pre-seeded users (has_face=true but no enrolled photo) ─────────────────
  // Demo accounts without an enrolled template must fail closed.
  if(!student._faceFeatures){
    return {matched:false,student,cosine:null,status:'no_face_template'};
  }
  // Subsequent taps: compare live against stored template
  if(liveFeatures){
    const sim=compareImageFeatures(student._faceFeatures,liveFeatures);
    if(sim!==null){
      const matched=sim>=FACE_SIM_THRESHOLD;
      const cosine=parseFloat((1-sim).toFixed(4));
      return {matched,student,cosine,status:matched?'verified':'proxy_anomaly'};
    }
  }
  // Cannot extract live features → fail secure
  return {matched:false,student,cosine:0.99,status:'proxy_anomaly'};
}

// ── Refresh student dropdowns in monitor/fullscreen RFID panels ──
function _refreshRfidSelectors(){
  const opts=`<option value="">🎲 Random registered card</option>`+
    appUsers().filter(x=>x.has_rfid&&x.rfid_uid&&x.status==='active')
      .map(x=>`<option value="${x.id}">${x.full_name} — ${x.id_number} [${x.rfid_uid}]</option>`).join('');
  const mon=document.getElementById('rfid-student-sel');
  if(mon){const v=mon.value;mon.innerHTML=opts;mon.value=v;}
  const fs=document.getElementById('fs-rfid-student-sel');
  if(fs){const v=fs.value;
    fs.innerHTML=opts.replace('🎲 Random registered card','🎲 Random card').replace(/\s\[.*?\]/g,'');
    fs.value=v;}
}


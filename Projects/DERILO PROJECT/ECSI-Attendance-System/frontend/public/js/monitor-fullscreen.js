/* ECSI Attendance System — monitor-fullscreen
   Extracted verbatim from index.html (original lines 1964–2456).
   Loaded as a classic global script via /js/monitor-fullscreen.js. */

// ── Auto Scan toggle ─────────────────────────────────────────
function monitorToggleAutoScan(){
  autoScanEnabled=!autoScanEnabled;
  const btn=document.getElementById('auto-scan-btn');
  if(autoScanEnabled){
    if(btn){btn.textContent='⏸ Auto';btn.className='btn btn-primary';}
    function schedNext(){
      if(!autoScanEnabled) return;
      autoScanTimer=setTimeout(()=>{
        if(autoScanEnabled&&authState==='idle') monitorTapRfid();
        schedNext();
      }, 5000+Math.random()*3000);
    }
    schedNext();
  } else {
    clearTimeout(autoScanTimer);autoScanTimer=null;
    if(btn){btn.textContent='▶ Auto';btn.className='btn btn-secondary';}
  }
}

// ── Fullscreen Monitor ───────────────────────────────────────
function openMonitorFullscreen(){
  // Pause the regular monitor auto-scan — its pipeline checks monitorCamStream (regular cam),
  // not fsCamStream (fullscreen cam), so it would falsely trigger "Camera Required" while
  // the fullscreen camera is running.
  if(autoScanEnabled){
    autoScanEnabled=false;
    clearTimeout(autoScanTimer);
    autoScanTimer=null;
    const btn=document.getElementById('auto-scan-btn');
    if(btn){btn.textContent='▶ Auto';btn.className='btn btn-secondary';}
  }
  // Cancel any in-flight regular pipeline steps
  _pipelineToken++; // invalidates all queued Steps 4-7 from regular monitor
  authState='idle'; lastRfidStudent=null; _monResetRfid();

  const ov=document.getElementById('monitor-overlay');
  ov.style.display='flex';
  ov.style.background='#0D1117';
  ov.innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid #1F2937;flex-shrink:0">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:30px;height:30px;background:#F2C111;border-radius:7px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:14px;color:#1F2937">E</div>
        <div>
          <div style="color:#fff;font-weight:700;font-size:14px">ECSI Attendance System</div>
          <div style="color:#6B7280;font-size:10px">Live Monitor — Fullscreen</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <div id="fs-clock" style="color:#9CA3AF;font-size:13px;font-family:monospace"></div>
        <div id="fs-ws-badge" class="ws-badge ws-off" style="font-size:11px"><span style="width:7px;height:7px;border-radius:50%;background:#F2C111;display:inline-block"></span> ${demoMode?'demo':'offline'}</div>
        <button onclick="closeMonitorFullscreen()" style="background:#374151;border:none;color:#fff;border-radius:7px;padding:6px 14px;cursor:pointer;font-size:12px">✕ Exit</button>
      </div>
    </div>
    <div style="flex:1;display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;padding:14px;overflow:hidden">

      <!-- Cam -->
      <div style="background:#161B22;border-radius:12px;padding:14px;display:flex;flex-direction:column">
        <div style="color:#9CA3AF;font-size:10px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;display:flex;justify-content:space-between">
          <span>📷 Camera Auth</span>
          <span id="fs-cam-badge" style="color:#6B7280">—</span>
        </div>
        <div style="flex:1;background:#0D1117;border-radius:8px;overflow:hidden;position:relative;min-height:0;display:flex;align-items:center;justify-content:center">
          <video id="fs-video" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover;display:none"></video>
          <div id="fs-cam-ph" style="text-align:center;color:#4B5563">
            <div style="font-size:32px;margin-bottom:6px">📷</div>
            <div style="font-size:11px">Camera off</div>
          </div>
          <div id="fs-scan-line" style="display:none;position:absolute;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,#F2C111,transparent);animation:scanMove 2s linear infinite"></div>
          <div id="fs-auth-result" style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;flex-direction:column;border-radius:8px;transition:background .3s;z-index:3">
            <div id="fs-auth-icon" style="font-size:48px;margin-bottom:6px"></div>
            <div id="fs-auth-name" style="color:#fff;font-weight:700;font-size:14px;text-align:center;padding:0 10px"></div>
            <div id="fs-auth-detail" style="color:rgba(255,255,255,.6);font-size:11px;margin-top:3px;text-align:center;padding:0 10px"></div>
          </div>
        </div>
        <button id="fs-cam-btn" class="btn btn-primary" style="margin-top:10px;font-size:12px" onclick="fsStartCam()">▶ Start Camera</button>
      </div>

      <!-- RFID -->
      <div style="background:#161B22;border-radius:12px;padding:14px;display:flex;flex-direction:column">
        <div style="color:#9CA3AF;font-size:10px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;display:flex;justify-content:space-between">
          <span>💳 RFID Scanner</span>
          <span id="fs-rfid-badge" style="color:#6B7280">Idle</span>
        </div>
        <!-- Mode toggle -->
        <div style="display:flex;background:#0D1117;border-radius:8px;padding:3px;margin-bottom:10px">
          <button id="fs-rfid-mode-sim" onclick="fsSetRfidMode('sim')"
            style="flex:1;padding:5px 8px;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;background:#F2C111;color:#1F2937;transition:all .2s">
            🎮 Simulate
          </button>
          <button id="fs-rfid-mode-hw" onclick="fsSetRfidMode('hw')"
            style="flex:1;padding:5px 8px;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;background:transparent;color:#6B7280;transition:all .2s">
            📡 Physical Scanner
          </button>
        </div>
        <div style="flex:1;background:#0D1117;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px">
          <div id="fs-rfid-ring" style="width:80px;height:80px;border-radius:50%;border:3px solid #374151;display:flex;align-items:center;justify-content:center;margin-bottom:12px;transition:all .3s">
            <div style="font-size:32px">💳</div>
          </div>
          <div id="fs-rfid-uid" style="font-family:monospace;color:#6B7280;font-size:11px;margin-bottom:4px">No card detected</div>
          <div id="fs-rfid-user" style="color:#9CA3AF;font-size:12px;text-align:center"></div>
        </div>
        <!-- Simulate controls -->
        <div id="fs-rfid-sim-controls">
          <select id="fs-rfid-student-sel" style="width:100%;margin-top:8px;padding:5px 8px;border-radius:8px;border:1px solid #374151;font-size:11px;background:#1F2937;color:#E5E7EB">
            <option value="">🎲 Random card</option>
            ${appUsers().filter(x=>x.has_rfid&&x.rfid_uid&&x.status==='active').map(x=>`<option value="${x.id}">${x.full_name} (${x.id_number})</option>`).join('')}
          </select>
          <div style="display:flex;gap:6px;margin-top:8px">
            <button id="fs-rfid-btn" class="btn btn-primary" style="flex:1;font-size:12px" onclick="fsTapRfid()">💳 Tap Card</button>
            <button id="fs-auto-btn" class="btn btn-secondary" style="font-size:12px" onclick="fsToggleAuto()">▶ Auto</button>
          </div>
        </div>
        <!-- Physical scanner controls -->
        <div id="fs-rfid-hw-controls" style="display:none;margin-top:8px">
          <div id="fs-rfid-hw-status" style="background:#0D1117;border:1px solid #374151;border-radius:8px;padding:10px;margin-bottom:8px;text-align:center">
            <div style="font-size:11px;color:#6B7280">Connect your USB RFID reader and click Activate</div>
          </div>
          <button id="fs-rfid-hw-btn" class="btn btn-primary" style="width:100%;font-size:12px" onclick="togglePhysicalRfid()">
            📡 Activate Physical Scanner
          </button>
          <div style="margin-top:6px;font-size:10px;color:#6B7280;text-align:center;line-height:1.5">
            Works with any USB HID RFID reader.<br>Card UID is read automatically when tapped.
          </div>
        </div>
      </div>

      <!-- Feed -->
      <div style="background:#161B22;border-radius:12px;padding:14px;display:flex;flex-direction:column;overflow:hidden">
        <div style="color:#9CA3AF;font-size:10px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;display:flex;justify-content:space-between">
          <span>📋 Attendance Feed</span>
          <span id="fs-count" style="color:#6B7280">0 events</span>
        </div>
        <div id="fs-feed" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:6px">
          <div style="text-align:center;color:#4B5563;font-size:12px;padding:20px">Waiting for events…</div>
        </div>
      </div>

    </div>`;

  // Clock
  const clockEl=document.getElementById('fs-clock');
  const clockInt=setInterval(()=>{if(clockEl)clockEl.textContent=new Date().toLocaleTimeString();else clearInterval(clockInt);},1000);
  clockEl.textContent=new Date().toLocaleTimeString();

  // Feed refresh
  const feedInt=setInterval(()=>{fsFeedRefresh();},1000);
  ov._intervals=[clockInt,feedInt];
  ov._fsRfid=null;
  ov._fsCamStream=null;

  // Fullscreen API
  try{ov.requestFullscreen&&ov.requestFullscreen();}catch(e){}

  // Auto-start camera once the overlay is rendered (user gesture already happened)
  fsStartCam();
}
function closeMonitorFullscreen(){
  const ov=document.getElementById('monitor-overlay');
  if(!ov||ov.style.display==='none') return; // already closed
  (ov._intervals||[]).forEach(clearInterval);
  clearTimeout(ov._fsRfid);
  // Stop fullscreen camera
  if(ov._fsCamStream){ov._fsCamStream.getTracks().forEach(t=>t.stop());ov._fsCamStream=null;}
  if(fsCamStream){fsCamStream.getTracks().forEach(t=>t.stop());fsCamStream=null;}
  // Reset all fullscreen state so reopening starts clean
  fsAuthState='idle';
  fsAutoEnabled=false;
  clearTimeout(fsAutoTimer); fsAutoTimer=null;
  ov.style.display='none';
  ov.innerHTML='';
  try{document.exitFullscreen&&document.exitFullscreen();}catch(e){}
}
// Handle browser Escape key exiting native fullscreen without clicking ✕ Exit
document.addEventListener('fullscreenchange',()=>{
  if(!document.fullscreenElement){
    // Native fullscreen was exited (Escape pressed) — close our overlay too
    const ov=document.getElementById('monitor-overlay');
    if(ov&&ov.style.display!=='none') closeMonitorFullscreen();
  }
});

function fsFeedRefresh(){
  const el=document.getElementById('fs-feed');
  const cnt=document.getElementById('fs-count');
  if(!el) return;
  if(cnt) cnt.textContent=feedItems.length+' event'+(feedItems.length!==1?'s':'');
  const previousFeedKeys=prepareFeedRender(el,feedItems,40);if(previousFeedKeys===null)return;
  if(!feedItems.length){el.innerHTML='<div class="feed-empty"><div class="feed-empty-icon">&#128241;</div><div style="font-weight:600;font-size:13px">No events yet</div><div style="font-size:12px;color:#9CA3AF;margin-top:4px">Tap a card to start authentication</div></div>';return;}
  el.innerHTML=feedItems.slice(0,40).map(ev=>{
    const isProxy=ev.status==='proxy_anomaly';
    const dist=ev.cosine_distance!=null?` · ${typeof ev.cosine_distance==='number'?ev.cosine_distance.toFixed(4):ev.cosine_distance}`:'';
    const sec=ev.section?` · ${ev.section}`:'';
    const isIn=ev.check_type==='time_in', isOut=ev.check_type==='time_out';
    const inOutColor=isIn?'#41A638':isOut?'#DC2626':'#41A638';
    const inOutLabel=isIn?'↗ IN':isOut?'↙ OUT':'✓ OK';
    const rowBg=isProxy?'rgba(239,68,68,.1)':isIn?'rgba(65,166,56,.08)':isOut?'rgba(220,38,38,.08)':'rgba(65,166,56,.08)';
    const borderColor=isProxy?'#7F1D1D':isIn?'#14532D':'#1E3A5F';
    const avatarBg=isProxy?'#EF4444':isIn?'#41A638':'#3B82F6';
    return `<div data-feed-key="${feedItemKey(ev)}" style="background:${rowBg};border:1px solid ${borderColor};border-radius:8px;padding:8px 10px;display:flex;align-items:center;gap:8px">
      <div style="width:30px;height:30px;border-radius:50%;background:${avatarBg};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;color:#fff;flex-shrink:0">${(ev.full_name||'?')[0]}</div>
      <div style="flex:1;min-width:0">
        <div style="color:#F9FAFB;font-weight:600;font-size:12px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${ev.full_name||'Unknown'}</div>
        <div style="color:#6B7280;font-size:10px">${ev.id_number||''}${sec} · ${new Date(ev.timestamp||Date.now()).toLocaleTimeString()}${dist}</div>
      </div>
      <span style="font-size:10px;padding:2px 7px;border-radius:99px;background:${isProxy?'#EF4444':inOutColor};color:#fff;flex-shrink:0;white-space:nowrap">${isProxy?'⚠ PROXY':inOutLabel}</span>
    </div>`;
  }).join('');
  finishFeedRender(el,previousFeedKeys);
}

// ── Fullscreen Camera ─────────────────────────────────────────
let fsCamStream=null,fsAutoTimer=null,fsAutoEnabled=false,fsAuthState='idle';
function fsSetRfidMode(mode){
  const sim=document.getElementById('fs-rfid-sim-controls');
  const hw=document.getElementById('fs-rfid-hw-controls');
  const btnSim=document.getElementById('fs-rfid-mode-sim');
  const btnHw=document.getElementById('fs-rfid-mode-hw');
  if(mode==='sim'){
    if(sim) sim.style.display='';
    if(hw) hw.style.display='none';
    if(btnSim){btnSim.style.background='#F2C111';btnSim.style.color='#1F2937';}
    if(btnHw){btnHw.style.background='transparent';btnHw.style.color='#6B7280';}
  } else {
    if(sim) sim.style.display='none';
    if(hw) hw.style.display='';
    if(btnHw){btnHw.style.background='#F2C111';btnHw.style.color='#1F2937';}
    if(btnSim){btnSim.style.background='transparent';btnSim.style.color='#6B7280';}
  }
}
async function fsStartCam(){
  const btn=document.getElementById('fs-cam-btn');
  const ov=document.getElementById('monitor-overlay');
  try{
    const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:false});
    fsCamStream=stream; if(ov) ov._fsCamStream=stream;
    const vid=document.getElementById('fs-video');
    const ph=document.getElementById('fs-cam-ph');
    const sl=document.getElementById('fs-scan-line');
    vid.srcObject=stream; vid.style.display='block';
    if(ph) ph.style.display='none';
    if(sl) sl.style.display='block';
    if(btn){btn.textContent='■ Stop Camera';btn.onclick=fsStopCam;}
    const badge=document.getElementById('fs-cam-badge');
    if(badge){badge.textContent='● Live';badge.style.color='#41A638';}
    fsSetCamOverlay('idle');
  }catch(e){
    if(btn) btn.textContent='Permission denied';
  }
}
function fsStopCam(){
  if(fsCamStream){fsCamStream.getTracks().forEach(t=>t.stop());fsCamStream=null;}
  const vid=document.getElementById('fs-video'); if(vid){vid.srcObject=null;vid.style.display='none';}
  const ph=document.getElementById('fs-cam-ph'); if(ph) ph.style.display='flex';
  const sl=document.getElementById('fs-scan-line'); if(sl) sl.style.display='none';
  const res=document.getElementById('fs-auth-result'); if(res) res.style.display='none';
  const btn=document.getElementById('fs-cam-btn'); if(btn){btn.textContent='▶ Start Camera';btn.onclick=fsStartCam;}
  const badge=document.getElementById('fs-cam-badge'); if(badge){badge.textContent='—';badge.style.color='#6B7280';}
}
function fsSetCamOverlay(state, data){
  const res=document.getElementById('fs-auth-result');
  const icon=document.getElementById('fs-auth-icon');
  const nm=document.getElementById('fs-auth-name');
  const det=document.getElementById('fs-auth-detail');
  if(!res) return;
  res.style.display='flex';
  const cfg={
    idle:          {bg:'rgba(17,24,39,.72)',   ic:'⏳', name:'Waiting for RFID Card',            detail:'Present a registered card to begin'},
    scanning:      {bg:'rgba(37,99,235,.78)',  ic:'🔍', name:`Verifying: ${data?.full_name||''}`, detail:'Scanning face — look at the camera…'},
    verified:      {bg:'rgba(22,101,52,.85)',  ic:'✅', name:data?.student?.full_name||'',         detail:`${data?.student?.id_number||''} · dist: ${data?.cosine} ✓ Access granted`},
    verified_inout:{bg:data?.checkType==='time_in'?'rgba(22,101,52,.9)':'rgba(153,27,27,.9)', ic:data?.checkType==='time_in'?'🟢':'🔴', name:data?.student?.full_name||'', detail:`${data?.checkType==='time_in'?'Time IN ↗':'Time OUT ↙'} · ${data?.student?.id_number||''} · dist: ${data?.cosine} ✓`},
    proxy:         {bg:'rgba(153,27,27,.88)',  ic:'🚫', name:'Proxy Detected',                    detail:`Expected: ${data?.student?.full_name||''} · dist: ${data?.cosine} ✗ Denied`},
    no_face:       {bg:'rgba(120,53,15,.85)',  ic:'⚠️', name:data?.full_name||data?.student?.full_name||'', detail:'No face template — manual verification required'},
    no_face_in_frame:{bg:'rgba(120,53,15,.90)',ic:'👁', name:'No Face Detected',                  detail:`${data?.full_name||''} — Face the camera and tap RFID again`},
    denied:        {bg:'rgba(153,27,27,.88)',  ic:'⛔', name:'RFID Not Registered',                detail:'This card is not linked to any account'},
  };
  const c=cfg[state]||cfg.idle;
  res.style.background=c.bg;
  if(icon) icon.textContent=c.ic;
  if(nm) nm.textContent=c.name;
  if(det) det.textContent=c.detail;
}

// ── Fullscreen RFID — single event-driven tap ─────────────────
function fsTapRfid(){
  if(fsAuthState!=='idle') return;
  const selEl=document.getElementById('fs-rfid-student-sel');
  const selId=selEl?.value||'';
  let u=null, uid='', isGhost=false;

  if(selId){
    u=appUsers().find(x=>x.id===selId);
    uid=u?.rfid_uid||'';
    if(!u||!uid||u.status!=='active'){isGhost=true;u=null;uid=GHOST_UIDS[0];}
  } else {
    isGhost=Math.random()<0.10;
    if(isGhost){
      uid=GHOST_UIDS[Math.floor(Math.random()*GHOST_UIDS.length)];
    } else {
      const uids=Object.keys(MOCK.rfidCards);
      if(!uids.length){isGhost=true;uid=GHOST_UIDS[0];}
      else{
        uid=uids[Math.floor(Math.random()*uids.length)];
        const userId=MOCK.rfidCards[uid];
        u=appUsers().find(x=>x.id===userId&&x.status==='active');
        if(!u) isGhost=true;
      }
    }
  }

  // Hard minimum: 5s between ANY tap
  if(u && !isGhost){
    const elapsed=Date.now()-(_lastTapMs[u.id_number]||0);
    if(elapsed < MIN_TAP_INTERVAL_MS) return; // silent
  }

  // Smart debounce guard for fullscreen monitor (allows direction changes)
  if(u && !isGhost && _isTapTooSoon(u.id_number)){
    const nextCheckType=getCheckType(u.id_number);
    const lastDir=todayAttendance[u.id_number];
    const isDirectionChange=(nextCheckType==='time_out'&&lastDir==='in')||(nextCheckType==='time_in'&&lastDir==='out');
    if(!isDirectionChange){
      const remaining=Math.ceil((TAP_DEBOUNCE_MS-(Date.now()-(_lastTapMs[u.id_number]||0)))/1000);
      document.getElementById('warn-toast')?.remove();
      const toast=document.createElement('div');
      toast.id='warn-toast';
      toast.style.cssText=`position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:99999;
        background:#1F2937;color:#fff;border-radius:12px;padding:14px 20px;font-size:12px;
        display:flex;align-items:center;gap:12px;box-shadow:0 8px 32px rgba(0,0,0,.5);
        animation:slideUp .25s ease-out;min-width:320px;pointer-events:none;border-left:4px solid #F59E0B`;
      toast.innerHTML=`<div style="font-size:22px">⏱</div>
        <div><div style="font-weight:700;color:#FDE68A">Double-Tap Detected</div>
        <div style="color:#9CA3AF;font-size:11px">${u.full_name} — already recorded ${lastDir==='in'?'Time IN':'Time OUT'}. Wait ${remaining}s.</div></div>`;
      document.body.appendChild(toast);
      setTimeout(()=>toast.remove(), 3000);
      return;
    }
  }

  fsAuthState='rfid_ok';
  const tapBtn=document.getElementById('fs-rfid-btn'); if(tapBtn) tapBtn.disabled=true;
  const ring=document.getElementById('fs-rfid-ring');
  const uidEl=document.getElementById('fs-rfid-uid');
  const userEl=document.getElementById('fs-rfid-user');
  const badge=document.getElementById('fs-rfid-badge');
  const color=(isGhost||!u)?'#EF4444':'#F2C111';
  if(ring){ring.style.border=`3px solid ${color}`;ring.style.boxShadow=`0 0 22px ${color}55`;}
  if(uidEl) uidEl.textContent='UID: '+uid;
  setTimeout(()=>{if(ring){ring.style.border='3px solid #374151';ring.style.boxShadow='none';}},700);

  if(isGhost||!u){
    if(userEl){userEl.textContent='⛔ Unregistered — access denied';userEl.style.color='#EF4444';}
    if(badge){badge.textContent='Denied';badge.style.color='#EF4444';}
    if(fsCamStream) fsSetCamOverlay('denied');
    setTimeout(()=>{fsAuthState='idle';if(tapBtn)tapBtn.disabled=false;fsRfidReset();if(fsCamStream)fsSetCamOverlay('idle');},2500);
    return;
  }

  // Valid card — determine IN or OUT
  const checkType=getCheckType(u.id_number);
  const checkLabel=checkType==='time_in'?'🟢 Time IN':'🔵 Time OUT';
  const label=u.role==='student'?`${u.full_name} · ${u.section||u.department||'—'}`:u.full_name;
  if(userEl){userEl.textContent=`✓ ${label} — ${checkLabel}`;userEl.style.color='#41A638';}
  if(badge){badge.textContent='RFID ✓';badge.style.color='#41A638';}

  setTimeout(()=>{
    if(!fsCamStream){
      // No camera — log RFID-only with IN/OUT
      const now=new Date();
      const ev={full_name:u.full_name,id_number:u.id_number,status:'rfid_only',check_type:checkType,
        terminal_id:'Terminal-1',timestamp:now.toISOString(),rfid_uid:uid,section:u.section||u.department||''};
      feedItems.unshift(ev); if(feedItems.length>100) feedItems.pop();
      recordCheckType(u.id_number, checkType);
      _recordTap(u.id_number); // update debounce timer even without camera auth
      refreshFeed(); refreshMonFeed(); fsFeedRefresh();
      const isIn=checkType==='time_in';
      if(badge){badge.textContent=isIn?'✅ Time IN':'🔴 Time OUT';badge.style.color=isIn?'#41A638':'#DC2626';}
      if(userEl){userEl.style.color=isIn?'#41A638':'#DC2626';}
      fsAuthState='face_done';
      // Keep result visible 2s, then reset
      setTimeout(()=>{fsAuthState='idle';fsRfidReset();if(tapBtn)tapBtn.disabled=false;},2000);
      return;
    }
    fsAuthState='face_scanning';
    fsSetCamOverlay('scanning', u);
    if(badge){badge.textContent='Face scan…';badge.style.color='#3B82F6';}
    const fsTok=++_pipelineToken; // token so face-detect failure cancels simFaceMatch step

    // Step A @ 250ms: capture frame + face detection
    setTimeout(()=>{
      if(fsTok!==_pipelineToken) return;
      let fsCapturedFrame=null;
      const fsVid=document.getElementById('fs-video');
      if(fsVid&&fsCamStream&&fsVid.videoWidth>0){
        const cv=document.createElement('canvas');
        cv.width=fsVid.videoWidth; cv.height=fsVid.videoHeight;
        cv.getContext('2d').drawImage(fsVid,0,0);
        fsCapturedFrame=cv.toDataURL('image/jpeg',0.82);
      }
      // Face presence detection — brightness, variance, skin-tone centre check
      const _fsFaceCheck=fsVid ? detectFaceInFrame(fsVid) : {ok:false,reason:'no_video'};
      const facePresent=fsCapturedFrame&&_fsFaceCheck.ok;
      if(!facePresent){
        _pipelineToken++; // cancel step B
        fsAuthState='face_done';
        fsSetCamOverlay('no_face_in_frame', u);
        if(badge){badge.textContent='No face';badge.style.color='#F97316';}
        // Show toast in fullscreen
        document.getElementById('warn-toast')?.remove();
        const t=document.createElement('div'); t.id='warn-toast';
        t.style.cssText=`position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:99999;
          background:#1F2937;color:#fff;border-radius:12px;padding:14px 20px;font-size:12px;
          display:flex;align-items:center;gap:12px;box-shadow:0 8px 32px rgba(0,0,0,.5);
          animation:slideUp .25s ease-out;min-width:300px;pointer-events:none;border-left:4px solid #F97316`;
        const _fsReason=_fsFaceCheck?.reason;
        const _fsReasonText=_fsReason==='too_dark'?'Camera too dark — turn on the lights.':_fsReason==='no_content'?'No content detected — uncover the camera.':'Look directly at the camera.';
        t.innerHTML=`<div style="font-size:22px">👁</div>
          <div><div style="font-weight:700;color:#FED7AA">⚠ FACE NOT DETECTED — Tap RFID to Retry</div>
          <div style="color:#9CA3AF;font-size:11px">${u.full_name} — ${_fsReasonText}</div></div>`;
        document.body.appendChild(t); setTimeout(()=>t.remove(),3500);
        setTimeout(()=>{fsAuthState='idle';fsRfidReset();if(fsCamStream)fsSetCamOverlay('idle');if(tapBtn)tapBtn.disabled=false;},3400);
        return;
      }

      // Start async feature extraction so it's ready by Step B
      const fsLiveFeaturePromise=extractImageFeatures(fsCapturedFrame);

      // Step B @ 1200ms: face match using real pixel comparison
      if(fsTok!==_pipelineToken) return;
      setTimeout(async ()=>{
      if(fsTok!==_pipelineToken) return;
      const liveFeatures=await fsLiveFeaturePromise;
      if(fsTok!==_pipelineToken) return;
      const result=simFaceMatch(u, liveFeatures);
      // pass fsCapturedFrame through closure
      fsAuthState='face_done';
      const now=new Date();
      const timeStr=now.toLocaleTimeString();

      if(result.status==='no_face_template'){
        const ev={full_name:u.full_name,id_number:u.id_number,status:'no_face_template',
          check_type:checkType,terminal_id:'Terminal-1',timestamp:now.toISOString(),
          rfid_uid:uid,section:u.section||u.department||''};
        feedItems.unshift(ev); if(feedItems.length>100) feedItems.pop();
        refreshFeed(); refreshMonFeed(); fsFeedRefresh();
        fsSetCamOverlay('no_face',result);
        if(badge){badge.textContent='No template';badge.style.color='#F59E0B';}

      } else if(result.matched){
        recordCheckType(u.id_number, checkType);
        _recordTap(u.id_number);
        const ev={full_name:u.full_name,id_number:u.id_number,status:'verified',
          check_type:checkType,cosine_distance:result.cosine,terminal_id:'Terminal-1',
          timestamp:now.toISOString(),rfid_uid:uid,section:u.section||u.department||''};
        feedItems.unshift(ev); if(feedItems.length>100) feedItems.pop();
        refreshFeed(); refreshMonFeed(); fsFeedRefresh();
        fsSetCamOverlay('verified_inout',{...result,checkType,student:u});
        const isIn=checkType==='time_in';
        if(badge){badge.textContent=isIn?'✅ Time IN':'🔴 Time OUT';badge.style.color=isIn?'#41A638':'#DC2626';}
        sendParentSms(u, checkType, timeStr);
        showVerifiedPopup(u, checkType, result.cosine, fsCapturedFrame);

      } else {
        // Face mismatch — BLOCK time in/out, do NOT record attendance
        fsSetCamOverlay('proxy',result);
        if(badge){badge.textContent='🚫 Mismatch';badge.style.color='#EF4444';}
        _monWarnToast('face_mismatch',
          `⚠ Enrolled face doesn't Match — Time IN/OUT blocked for ${u.full_name}.`);
      }
      setTimeout(()=>{fsAuthState='idle';fsRfidReset();if(fsCamStream)fsSetCamOverlay('idle');if(tapBtn)tapBtn.disabled=false;},3500);
      },1200+Math.random()*800); // close Step B
    },250); // close Step A (face detect)
  },900); // close outer delay
}
function fsRfidReset(){
  const ring=document.getElementById('fs-rfid-ring'); if(ring){ring.style.border='3px solid #374151';ring.style.boxShadow='none';}
  const uidEl=document.getElementById('fs-rfid-uid'); if(uidEl) uidEl.textContent='Ready — waiting for card…';
  const userEl=document.getElementById('fs-rfid-user'); if(userEl) userEl.textContent='';
  const badge=document.getElementById('fs-rfid-badge'); if(badge){badge.textContent='Ready';badge.style.color='#6B7280';}
}
function fsToggleAuto(){
  fsAutoEnabled=!fsAutoEnabled;
  const btn=document.getElementById('fs-auto-btn');
  if(fsAutoEnabled){
    if(btn){btn.textContent='⏸ Auto';btn.className='btn btn-primary';}
    function sched(){if(!fsAutoEnabled)return;fsAutoTimer=setTimeout(()=>{if(fsAutoEnabled&&fsAuthState==='idle')fsTapRfid();sched();},5000+Math.random()*3000);}
    sched();
  }else{
    clearTimeout(fsAutoTimer);
    if(btn){btn.textContent='▶ Auto';btn.className='btn btn-secondary';}
  }
}


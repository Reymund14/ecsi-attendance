/* ECSI Attendance System — monitor-rfid-hardware
   Extracted verbatim from index.html (original lines 1749–1963).
   Loaded as a classic global script via /js/monitor-rfid-hardware.js. */

// ═══════════════════════════════════════════════════════════
// RFID MODE SWITCHER & PHYSICAL SCANNER
// ═══════════════════════════════════════════════════════════
let _rfidMode='sim'; // 'sim' | 'hw'
let _hwActive=false;
let _hwContext='monitor'; // 'monitor'|'fullscreen'
let _rfidBuffer='';
let _rfidLastKeyTime=0;
let _rfidFlushTimer=null;
const RFID_KEY_GAP=60;    // ms — keys faster than this = scanner input
const RFID_FLUSH_MS=120;  // ms — silence after last key = scan complete

function setRfidMode(mode){
  _rfidMode=mode;
  // If leaving hw mode, stop scanner
  if(mode!=='hw'&&_hwActive) _stopPhysicalRfid();

  const simBtn=document.getElementById('rfid-mode-sim');
  const hwBtn=document.getElementById('rfid-mode-hw');
  const simCtrl=document.getElementById('rfid-sim-controls');
  const hwCtrl=document.getElementById('rfid-hw-controls');
  if(mode==='hw'){
    if(simBtn){simBtn.style.background='transparent';simBtn.style.color='#6B7280';}
    if(hwBtn){hwBtn.style.background='#F2C111';hwBtn.style.color='#1F2937';}
    if(simCtrl) simCtrl.style.display='none';
    if(hwCtrl)  hwCtrl.style.display='';
    // Disable auto scan
    if(autoScanEnabled) monitorToggleAutoScan();
    document.getElementById('rfid-uid').textContent='Connect USB RFID reader and activate';
  } else {
    if(simBtn){simBtn.style.background='#F2C111';simBtn.style.color='#1F2937';}
    if(hwBtn){hwBtn.style.background='transparent';hwBtn.style.color='#6B7280';}
    if(simCtrl) simCtrl.style.display='';
    if(hwCtrl)  hwCtrl.style.display='none';
    document.getElementById('rfid-uid').textContent='Ready — waiting for card…';
  }
}

function togglePhysicalRfid(){
  const ov=document.getElementById('monitor-overlay');
  _hwContext=(ov&&ov.style.display!=='none')?'fullscreen':'monitor';
  if(_hwActive) _stopPhysicalRfid(); else _startPhysicalRfid();
}

function _startPhysicalRfid(){
  _hwActive=true;
  _rfidBuffer='';
  document.addEventListener('keydown', _rfidHwKeydown, true);

  const isFs=_hwContext==='fullscreen';
  const btn=document.getElementById(isFs?'fs-rfid-hw-btn':'rfid-hw-btn');
  const status=document.getElementById(isFs?'fs-rfid-hw-status':'rfid-hw-status');
  const badge=document.getElementById(isFs?'fs-rfid-badge':'rfid-status-badge');
  const uidEl=document.getElementById(isFs?'fs-rfid-uid':'rfid-uid');
  const ring=document.getElementById(isFs?'fs-rfid-ring':'rfid-ring');

  if(btn){btn.textContent='🔴 Deactivate Scanner';btn.style.background='#EF4444';}
  if(badge){badge.textContent='● Scanning';badge.style.cssText='font-size:10px;padding:3px 8px;border-radius:99px;background:#D1FAE5;color:#065F46;animation:stepPulse 1.5s ease-in-out infinite';}
  if(ring){ring.style.border='3px solid #41A638';ring.style.boxShadow='0 0 18px rgba(65,166,56,.4)';}
  if(uidEl) uidEl.textContent='Tap card on reader…';
  const bufId=isFs?'fs-rfid-hw-buffer':'rfid-hw-buffer';
  if(status){
    status.innerHTML=`
      <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:6px">
        <span style="width:8px;height:8px;border-radius:50%;background:#41A638;display:inline-block;animation:stepPulse 1.2s ease-in-out infinite"></span>
        <span style="font-size:12px;font-weight:700;color:#4ADE80">Scanner Active</span>
      </div>
      <div style="font-size:10px;color:#6B7280">Place card on reader — UID captured automatically</div>
      <div id="${bufId}" style="font-family:monospace;font-size:13px;color:#F2C111;margin-top:6px;letter-spacing:2px;min-height:18px"></div>`;
  }
}

function _stopPhysicalRfid(){
  _hwActive=false;
  clearTimeout(_rfidFlushTimer);
  document.removeEventListener('keydown', _rfidHwKeydown, true);

  const isFs=_hwContext==='fullscreen';
  const btn=document.getElementById(isFs?'fs-rfid-hw-btn':'rfid-hw-btn');
  const status=document.getElementById(isFs?'fs-rfid-hw-status':'rfid-hw-status');
  const badge=document.getElementById(isFs?'fs-rfid-badge':'rfid-status-badge');
  const ring=document.getElementById(isFs?'fs-rfid-ring':'rfid-ring');
  const uidEl=document.getElementById(isFs?'fs-rfid-uid':'rfid-uid');

  if(btn){btn.textContent='📡 Activate Physical Scanner';btn.style.background='';}
  if(badge){badge.textContent='Ready';badge.style.cssText='font-size:10px;padding:3px 8px;border-radius:99px;background:'+(isFs?'#374151;color:#9CA3AF':'#F3F4F6;color:#6B7280');}
  if(ring){ring.style.border='3px solid #374151';ring.style.boxShadow='none';}
  if(status){status.innerHTML='<div style="font-size:11px;color:#6B7280">Connect your USB RFID reader and click Activate</div>';}
  if(uidEl) uidEl.textContent=isFs?'No card detected':'Ready — waiting for card…';
}

function _rfidHwKeydown(e){
  const _curState=_hwContext==='fullscreen'?fsAuthState:authState;
  if(!_hwActive||_curState!=='idle') return;
  const now=Date.now();

  // Enter = end of scan
  if(e.key==='Enter'||e.key==='Tab'){
    e.preventDefault();e.stopPropagation();
    clearTimeout(_rfidFlushTimer);
    if(_rfidBuffer.length>=4) _dispatchHwRfid(_rfidBuffer.trim());
    _rfidBuffer='';
    return;
  }

  // Only printable ASCII
  if(e.key.length!==1){return;}

  // If there was a long pause, reset buffer (human keyboard, not scanner)
  if(now-_rfidLastKeyTime>200&&_rfidBuffer.length>0){
    _rfidBuffer='';
  }

  _rfidLastKeyTime=now;
  _rfidBuffer+=e.key;
  e.preventDefault();e.stopPropagation();

  // Update the live buffer display
  const buf=document.getElementById(_hwContext==='fullscreen'?'fs-rfid-hw-buffer':'rfid-hw-buffer');
  if(buf) buf.textContent=_rfidBuffer;

  // Auto-flush after silence
  clearTimeout(_rfidFlushTimer);
  _rfidFlushTimer=setTimeout(()=>{
    if(_rfidBuffer.length>=4){
      _dispatchHwRfid(_rfidBuffer.trim());
    }
    _rfidBuffer='';
    const b=document.getElementById(_hwContext==='fullscreen'?'fs-rfid-hw-buffer':'rfid-hw-buffer');
    if(b) b.textContent='';
  }, RFID_FLUSH_MS);
}

function _dispatchHwRfid(rawUid){
  // Normalize: uppercase, insert colons every 2 chars if not already formatted
  let uid=rawUid.toUpperCase().replace(/[^0-9A-F]/g,'');
  if(uid.length===8) uid=uid.match(/.{2}/g).join(':'); // e.g. A1B2C3D4 → A1:B2:C3:D4
  else uid=rawUid.toUpperCase(); // keep as-is for non-standard formats

  // Update visual (context-aware: regular monitor vs fullscreen)
  const uidEl=document.getElementById(_hwContext==='fullscreen'?'fs-rfid-uid':'rfid-uid');
  if(uidEl) uidEl.textContent='UID: '+uid;
  const buf=document.getElementById(_hwContext==='fullscreen'?'fs-rfid-hw-buffer':'rfid-hw-buffer');
  if(buf) buf.textContent='';

  // Lookup in registry (try both formatted and raw)
  let u=null;
  // Try exact match first
  u=appUsers().find(x=>x.rfid_uid&&(x.rfid_uid.toUpperCase()===uid||x.rfid_uid.toUpperCase()===rawUid.toUpperCase()));
  if(!u){
    // Try registry map
    const userId=MOCK.rfidCards[uid]||MOCK.rfidCards[rawUid.toUpperCase()];
    if(userId) u=appUsers().find(x=>x.id===userId&&x.status==='active');
  }

  const isGhost=!u;

  // Hard minimum 5s — same logic as simulated tap
  if(u && !isGhost && (Date.now()-(_lastTapMs[u.id_number]||0)) < MIN_TAP_INTERVAL_MS) return;

  // Smart debounce — same logic as simulated tap
  if(u && !isGhost && _isTapTooSoon(u.id_number)){
    const nextCheckType=getCheckType(u.id_number);
    const lastDir=todayAttendance[u.id_number];
    const isDirectionChange=(nextCheckType==='time_out'&&lastDir==='in')||(nextCheckType==='time_in'&&lastDir==='out');
    if(!isDirectionChange){
      const remaining=Math.ceil((TAP_DEBOUNCE_MS-(Date.now()-(_lastTapMs[u.id_number]||0)))/1000);
      document.getElementById('warn-toast')?.remove();
      const toast=document.createElement('div');
      toast.id='warn-toast';
      toast.style.cssText=`position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:9999;
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

  // Route to correct context
  if(_hwContext==='fullscreen'){
    const fsUidEl=document.getElementById('fs-rfid-uid');
    if(fsUidEl) fsUidEl.textContent='UID: '+uid;
    if(isGhost){
      // Ghost card in fullscreen — deny via fsSetCamOverlay
      const ring=document.getElementById('fs-rfid-ring');
      if(ring){ring.style.border='3px solid #EF4444';ring.style.boxShadow='0 0 22px rgba(239,68,68,.4)';}
      fsSetCamOverlay('denied');
      const tapBtn=document.getElementById('fs-rfid-btn');
      if(tapBtn) tapBtn.disabled=true;
      const warnEv={full_name:'Unknown RFID Card',label:'Unknown RFID Card',id_number:'',
        status:'unregistered_rfid',terminal_id:'Terminal-1',
        detail:'UID: '+uid+' — not found in database',timestamp:new Date().toISOString()};
      feedItems.unshift(warnEv); if(feedItems.length>100) feedItems.pop();
      refreshFeed();
      setTimeout(()=>{
        fsAuthState='idle'; fsRfidReset();
        if(fsCamStream) fsSetCamOverlay('idle');
        if(tapBtn) tapBtn.disabled=false;
      }, 3000);
    } else {
      // Real card — pre-select and delegate to fsTapRfid
      const fsSel=document.getElementById('fs-rfid-student-sel');
      if(fsSel) fsSel.value=u.id;
      fsTapRfid();
    }
    return;
  }
  // Send the canonical value returned by the API. Hardware readers may emit
  // the same card as raw hex while the database stores colon-separated bytes.
  _monApplyRfidTap(u, isGhost ? uid : (u.rfid_uid || uid), isGhost);
}


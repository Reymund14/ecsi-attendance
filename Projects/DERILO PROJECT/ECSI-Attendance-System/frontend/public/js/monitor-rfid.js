/* ECSI Attendance System — monitor-rfid
   Extracted verbatim from index.html (original lines 1428–1748).
   Loaded as a classic global script via /js/monitor-rfid.js. */

// ── Single RFID tap event ────────────────────────────────────
function monitorTapRfid(){
  if(authState!=='idle') return; // locked during auth cycle
  const selEl=document.getElementById('rfid-student-sel');
  const selId=selEl?.value||'';
  let u=null, uid='', isGhost=false;

  if(selId){
    // Specific student selected — look up their registered RFID card
    u=appUsers().find(x=>x.id===selId);
    uid=u?.rfid_uid||'';
    if(!u||!uid||u.status!=='active'){isGhost=true;u=null;uid=GHOST_UIDS[0];}
  } else {
    // Random: 10% ghost, 90% pick a real card from MOCK.rfidCards registry
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

  // ── Hard minimum: 5s between ANY tap (even direction changes) ──────────────
  // Prevents auto-scan from creating rapid IN→OUT→IN spam loops
  if(u && !isGhost){
    const elapsed=Date.now()-(_lastTapMs[u.id_number]||0);
    if(elapsed < MIN_TAP_INTERVAL_MS) return; // silent — too fast to be intentional
  }

  // ── Same-direction debounce: 20s block after a successful tap ───────────────
  // Allow direction changes (time_in → time_out) — those are intentional
  if(u && !isGhost && _isTapTooSoon(u.id_number)){
    const nextCheckType=getCheckType(u.id_number);
    const lastDir=todayAttendance[u.id_number]; // 'in' | 'out' | undefined
    // Direction change = genuine tap (student leaving after arriving, or arriving next day)
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

  _monApplyRfidTap(u, uid, isGhost||!u);
}

function _monApplyRfidTap(u, uid, isGhost){
  const ring=document.getElementById('rfid-ring');
  const uidEl=document.getElementById('rfid-uid');
  const userEl=document.getElementById('rfid-user');
  const badge=document.getElementById('rfid-status-badge');
  const tapBtn=document.getElementById('rfid-tap-btn');

  // Lock the tap button during the cycle
  authState='rfid_ok';
  if(tapBtn) tapBtn.disabled=true;

  const color=isGhost?'#EF4444':'#F2C111';
  if(ring){ring.style.border=`3px solid ${color}`;ring.style.boxShadow=`0 0 22px ${color}55`;}
  if(uidEl) uidEl.textContent='UID: '+uid;

  if(isGhost){
    if(userEl){userEl.textContent='⛔ Unregistered RFID — Login blocked';userEl.style.color='#EF4444';}
    if(badge){badge.textContent='⛔ Unknown Card';badge.style.cssText='font-size:10px;padding:3px 8px;border-radius:99px;background:#FEE2E2;color:#991B1B';}
    if(monitorCamStream) monSetCamOverlay('denied');

    // Push warning to live feed
    const warnEv={full_name:'Unknown RFID Card',label:'Unknown RFID Card',id_number:'',
      status:'unregistered_rfid',terminal_id:'Terminal-1',
      detail:'UID: '+uid+' — not found in database',
      timestamp:new Date().toISOString()};
    feedItems.unshift(warnEv); if(feedItems.length>100) feedItems.pop();
    refreshFeed(); refreshMonFeed();

    // Warning toast — top of screen
    _monWarnToast('unregistered_rfid', 'UID: '+uid+' is not linked to any account. Login process stopped.');

    // Reset after 3s — process fully terminated
    setTimeout(()=>{_monResetRfid();authState='idle';if(tapBtn)tapBtn.disabled=false;if(monitorCamStream)monSetCamOverlay('idle');},3000);
    return;
  }

  // Registered card found — immediately kick off AI pipeline
  lastRfidStudent=u;
  const checkType=getCheckType(u.id_number);
  const checkLabel=checkType==='time_in'?'🟢 Time IN':'🔵 Time OUT';
  const label=u.role==='student'?`${u.full_name} · ${u.section||u.department||'—'}`:u.full_name;
  if(userEl){userEl.textContent=`✓ ${label} (${u.id_number}) — ${checkLabel}`;userEl.style.color='#41A638';}
  if(badge){badge.textContent='AI Processing…';badge.style.cssText='font-size:10px;padding:3px 8px;border-radius:99px;background:#EDE9FE;color:#5B21B6';}

  // Step 1: Show "Fetching profile & embedding" on camera
  if(monitorCamStream) monSetCamOverlay('fetching', u);
  setTimeout(()=>{if(ring){ring.style.border='3px solid #374151';ring.style.boxShadow='none';}},400);

  // Run face auth immediately (no extra delay — matches real backend: frame grabbed at tap time)
  _monRunFaceAuth(u, uid, checkType);
}

function _monRunFaceAuth(student, uid, checkType){
  const badge=document.getElementById('rfid-status-badge');
  const tapBtn=document.getElementById('rfid-tap-btn');
  const now=new Date();
  let _capturedAuthFrame=null; // live frame captured at Step 3

  // ── GUARD 1: Face template must be enrolled ───────────────────────────
  if(!student.has_face){
    authState='face_done';
    monSetCamOverlay('no_face', student);
    if(badge){badge.textContent='🚷 No Face Enrolled';badge.style.cssText='font-size:10px;padding:3px 8px;border-radius:99px;background:#FEE2E2;color:#991B1B';}
    const ev={full_name:student.full_name,id_number:student.id_number,
      status:'no_face_template',check_type:checkType,terminal_id:'Terminal-1',
      timestamp:now.toISOString(),rfid_uid:uid,section:student.section||student.department||'',
      detail:'Face not enrolled'};
    feedItems.unshift(ev); if(feedItems.length>100) feedItems.pop();
    refreshFeed(); refreshMonFeed();
    _monWarnToast('no_face',
      `${student.full_name} (${student.id_number}) has no face template. Enroll face first. Time-in denied.`);
    setTimeout(()=>{_monResetRfid();authState='idle';if(tapBtn)tapBtn.disabled=false;monSetCamOverlay('idle');},3500);
    return;
  }

  // ── GUARD 2: Camera must be running — face auth is mandatory ─────────
  // Also abort silently if fullscreen overlay is open (it has its own auth path)
  const _fsOv=document.getElementById('monitor-overlay');
  if(_fsOv&&_fsOv.style.display!=='none'){
    authState='idle'; if(tapBtn) tapBtn.disabled=false; return;
  }
  if(!monitorCamStream){
    authState='face_done';
    monSetCamOverlay('no_cam');
    if(badge){badge.textContent='📵 Camera Off';badge.style.cssText='font-size:10px;padding:3px 8px;border-radius:99px;background:#FEE2E2;color:#991B1B';}
    const ev={full_name:student.full_name,id_number:student.id_number,
      status:'no_face_template',check_type:checkType,terminal_id:'Terminal-1',
      timestamp:now.toISOString(),rfid_uid:uid,section:student.section||student.department||'',
      detail:'Camera offline — login blocked'};
    feedItems.unshift(ev); if(feedItems.length>100) feedItems.pop();
    refreshFeed(); refreshMonFeed();
    _monWarnToast('no_cam',
      `Start the camera before tapping the RFID card. Face authentication is required for ${student.full_name}.`);
    setTimeout(()=>{_monResetRfid();authState='idle';if(tapBtn)tapBtn.disabled=false;},3500);
    return;
  }

  authState='face_scanning';

  // Each pipeline run gets a unique token — steps check this before running.
  // If face detection fails at Step 3, we increment _pipelineToken to cancel Steps 4–7.
  const tok=++_pipelineToken;

  const _abortPipeline=(overlayState, overlayData, badgeText, toastType, toastMsg)=>{
    _pipelineToken++; // invalidate any already-queued steps
    authState='face_done';
    monSetCamOverlay(overlayState, overlayData);
    if(badge){badge.textContent=badgeText;badge.style.cssText='font-size:10px;padding:3px 8px;border-radius:99px;background:#FEF3C7;color:#92400E';}
    _monWarnToast(toastType, toastMsg);
    setTimeout(()=>{
      authState='idle'; lastRfidStudent=null;
      _monResetRfid();
      if(monitorCamStream) monSetCamOverlay('idle');
      if(tapBtn) tapBtn.disabled=false;
    }, 3400);
  };

  // ══════════════════════════════════════════════════════════
  // 7-STEP AI PIPELINE (mirrors actual backend objectives)
  // Step 1–2 @ 0ms    : RFID read + UID lookup (shown in _monApplyRfidTap)
  // Step 3   @ 200ms  : Camera captures face frame + OpenCV face presence check
  // Step 4   @ 500ms  : Landmark detection + feature encoding
  // Step 5   @ 760ms  : CNN/FaceNet face match (cosine distance)
  // Step 6   @ 980ms  : Liveness check (anti-spoofing)
  // Step 7   @ 1200ms : Log attendance + push parent notification
  // ══════════════════════════════════════════════════════════

  // Step 3: Capture frame + face presence detection + start feature extraction
  let _frameCapturePromise=null; let _liveFeaturePromise=null; // resolved before Step 7 fires (~1000ms later)
  setTimeout(async ()=>{
    if(tok!==_pipelineToken) return;
    monSetCamOverlay('capturing');
    _monCaptureFlash();
    // Snapshot live video
    const vid=document.getElementById('mon-video');
    if(vid&&monitorCamStream){ _frameCapturePromise=captureCameraFrame(vid); _capturedAuthFrame=await _frameCapturePromise; }
    if(tok!==_pipelineToken) return;
    if(badge){badge.textContent='Step 3 · Capturing…';badge.style.cssText='font-size:10px;padding:3px 8px;border-radius:99px;background:#F3F4F6;color:#374151';}

    // A real captured frame is enough to proceed; face matching decides whether it matches.
    if(!_capturedAuthFrame){
      _abortPipeline(
        'no_face_in_frame', student,
        '👁 No Face Detected',
        'no_face_in_frame',
        `⚠ CAMERA FRAME NOT READY — ${student.full_name}: keep the camera on and tap RFID to retry.`
      );
      return;
    }
    // Start async feature extraction NOW so it's ready by Step 7 (1000ms away)
    _liveFeaturePromise=extractImageFeatures(_capturedAuthFrame);
  }, 200);

  // Step 4: OpenCV landmark detection
  setTimeout(()=>{
    if(tok!==_pipelineToken) return;
    monSetCamOverlay('landmarks');
    if(badge){badge.textContent='Step 4 · Landmarks…';badge.style.cssText='font-size:10px;padding:3px 8px;border-radius:99px;background:#F3E8FF;color:#7E22CE';}
  }, 500);

  // Step 5: CNN/FaceNet face match
  setTimeout(()=>{
    if(tok!==_pipelineToken) return;
    monSetCamOverlay('matching');
    if(badge){badge.textContent='Step 5 · FaceNet…';badge.style.cssText='font-size:10px;padding:3px 8px;border-radius:99px;background:#EDE9FE;color:#5B21B6';}
  }, 760);

  // Step 6: Liveness check
  setTimeout(()=>{
    if(tok!==_pipelineToken) return;
    monSetCamOverlay('liveness');
    if(badge){badge.textContent='Step 6 · Liveness…';badge.style.cssText='font-size:10px;padding:3px 8px;border-radius:99px;background:#CFFAFE;color:#0E7490';}
  }, 980);

  // Step 7: Decision + log + notify
  setTimeout(async ()=>{
    if(tok!==_pipelineToken) return;
    // Await live features (extraction started at Step 3, ~1000ms ago — already done)
    if(_frameCapturePromise) await _frameCapturePromise;
    if(tok!==_pipelineToken) return;
    const liveFeatures=_liveFeaturePromise ? await _liveFeaturePromise : null;
    if(tok!==_pipelineToken) return; // re-check after await
    const result=simFaceMatch(student, liveFeatures);
    // Liveness check: 0% failure for enrolled-photo users; 3% for pre-seeded
    const livenessOk=student.face_photo ? true : Math.random()>0.03;
    authState='face_done';
    const timeStr=now.toLocaleTimeString();

    if(result.status==='no_face_template'){
      monSetCamOverlay('no_face', {...result, full_name:student.full_name, id_number:student.id_number});
      if(badge){badge.textContent='🚷 No Template';badge.style.cssText='font-size:10px;padding:3px 8px;border-radius:99px;background:#FEE2E2;color:#991B1B';}
      const ev={full_name:student.full_name,id_number:student.id_number,status:'no_face_template',
        check_type:checkType,terminal_id:'Terminal-1',timestamp:now.toISOString(),
        rfid_uid:uid,section:student.section||student.department||'',detail:'Face not enrolled'};
      feedItems.unshift(ev); if(feedItems.length>100) feedItems.pop();
      refreshFeed(); refreshMonFeed();
      _monWarnToast('no_face', `${student.full_name} has no face template on record. Time-in denied.`);

    } else if(!livenessOk){
      monSetCamOverlay('liveness_fail');
      if(badge){badge.textContent='🕵️ Liveness Fail';badge.style.cssText='font-size:10px;padding:3px 8px;border-radius:99px;background:#FEE2E2;color:#991B1B';}
      const ev={full_name:student.full_name,id_number:student.id_number,
        status:'proxy_anomaly',check_type:checkType,cosine_distance:result.cosine,
        terminal_id:'Terminal-1',timestamp:now.toISOString(),rfid_uid:uid,
        detail:'Liveness check failed — possible photo spoof',
        section:student.section||student.department||''};
      feedItems.unshift(ev); if(feedItems.length>100) feedItems.pop();
      refreshFeed(); refreshMonFeed();
      _monWarnToast('face_mismatch',
        `Liveness check failed for ${student.full_name}. Possible photo or screen spoof detected. Login blocked.`);

    } else if(result.matched){
      // ✅ Steps 6–7: Verified + timestamp recorded + parent notified
      recordCheckType(student.id_number, checkType);
      _recordTap(student.id_number);
      const ev={full_name:student.full_name,id_number:student.id_number,status:'verified',
        check_type:checkType,cosine_distance:result.cosine,terminal_id:'Terminal-1',
        timestamp:now.toISOString(),rfid_uid:uid,section:student.section||student.department||''};
      feedItems.unshift(ev); if(feedItems.length>100) feedItems.pop();
      refreshFeed(); refreshMonFeed();
      const isIn=checkType==='time_in';
      monSetCamOverlay('verified_inout', {...result, checkType, student});
      if(badge){badge.textContent=isIn?'✅ Time IN':'🔴 Time OUT';badge.style.cssText=`font-size:10px;padding:3px 8px;border-radius:99px;background:${isIn?'#D1FAE5':'#FEE2E2'};color:${isIn?'#065F46':'#991B1B'}`;}
      sendParentSms(student, checkType, timeStr);
      showVerifiedPopup(student, checkType, result.cosine, _capturedAuthFrame);

    } else {
      // Step 5 FAIL: face mismatch — BLOCK time in/out, do NOT record attendance
      monSetCamOverlay('proxy', result);
      if(badge){badge.textContent='🚫 Mismatch';badge.style.cssText='font-size:10px;padding:3px 8px;border-radius:99px;background:#FEE2E2;color:#991B1B';}
      _monWarnToast('face_mismatch',
        `⚠ Enrolled face doesn't Match — Time IN/OUT blocked for ${student.full_name}.`);
    }

    setTimeout(()=>{
      authState='idle'; lastRfidStudent=null;
      _monResetRfid();
      if(monitorCamStream) monSetCamOverlay('idle');
      if(tapBtn) tapBtn.disabled=false;
    }, 3200);
  }, 1200); // Full pipeline completes at ~1200ms from card tap
}

function _monResetRfid(){
  const ring=document.getElementById('rfid-ring');
  const uidEl=document.getElementById('rfid-uid');
  const userEl=document.getElementById('rfid-user');
  const badge=document.getElementById('rfid-status-badge');
  if(ring){ring.style.border='3px solid #374151';ring.style.boxShadow='none';}
  if(uidEl) uidEl.textContent='Ready — waiting for card…';
  if(userEl) userEl.textContent='';
  if(badge){badge.textContent='Ready';badge.style.cssText='font-size:10px;padding:3px 8px;border-radius:99px;background:#F3F4F6;color:#6B7280';}
}


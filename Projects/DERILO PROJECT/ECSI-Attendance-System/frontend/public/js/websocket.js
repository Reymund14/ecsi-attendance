/* ECSI Attendance System — websocket
   Extracted verbatim from index.html (original lines 551–593).
   Loaded as a classic global script via /js/websocket.js. */

// ═══════════════════════════════════════════════════════════
// WEBSOCKET
// ═══════════════════════════════════════════════════════════
function connectWS(){
  try{
    wsConn=new WebSocket(WS_API);
    wsConn.onopen=()=>{wsConn.send(JSON.stringify({token:currentUser.token}));setWsBadge('live');};
    wsConn.onmessage=e=>{
      try{
        const d=JSON.parse(e.data);
        if(d.event==='connected'||d.event==='heartbeat') return;
        if(d.event==='auth_error'){setWsBadge('offline');return;}
        if(d.event==='attendance_update'){
          const id=d.record_id||d.id;
          const event={...d,id,record_id:id};
          feedItems=[event,...feedItems.filter(item=>(item.record_id||item.id)!==id)].slice(0,100);
          backendAttendance=[event,...backendAttendance.filter(item=>(item.id||item.record_id)!==id)].slice(0,500);
          refreshFeed();refreshMonFeed();
          if(currentPage==='attendance'||currentPage==='my-attendance') loadAttendance(currentPage==='my-attendance');
          if(currentPage==='reports') applyReportFilter();
        }
        if(d.event==='attendance_override'){
          const id=d.record_id;
          feedItems=feedItems.map(item=>(item.record_id||item.id)===id?{...item,status:d.new_status}:item);
          backendAttendance=backendAttendance.map(item=>(item.id||item.record_id)===id?{...item,status:d.new_status}:item);
          refreshFeed();refreshMonFeed();
          if(currentPage==='attendance'||currentPage==='my-attendance') loadAttendance(currentPage==='my-attendance');
          if(currentPage==='reports') applyReportFilter();
        }
      }catch{}
    };
    wsConn.onclose=()=>setWsBadge('offline');
    wsConn.onerror=()=>setWsBadge('offline');
  }catch{setWsBadge('offline');}
}
function setWsBadge(s){
  const el=document.getElementById('ws-badge');
  if(!el) return;
  if(demoMode){el.className='ws-badge ws-demo';el.innerHTML='<span style="width:7px;height:7px;border-radius:50%;background:#F59E0B;display:inline-block"></span> Demo Mode';return;}
  if(s==='live'){el.className='ws-badge ws-live';el.innerHTML='<span class="pulse" style="width:7px;height:7px;border-radius:50%;background:#41A638;display:inline-block"></span> WebSocket Live';}
  else{el.className='ws-badge ws-off';el.innerHTML=`<span style="width:7px;height:7px;border-radius:50%;background:#9CA3AF;display:inline-block"></span> WS: ${s}`;}
}


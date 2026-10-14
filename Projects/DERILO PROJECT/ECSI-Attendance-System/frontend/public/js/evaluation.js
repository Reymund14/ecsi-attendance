/* ECSI Attendance System — evaluation
   Extracted verbatim from index.html (original lines 5043–5290).
   Loaded as a classic global script via /js/evaluation.js. */

// ═══════════════════════════════════════════════════════════
// ATTENDANCE EVALUATION (Faculty)
// ═══════════════════════════════════════════════════════════

// Server-backed evaluation state. Rates, day counts and remarks all come from
// GET /evaluations/summary, which derives them from attendance_records and
// excuse_requests. The demo path below is the only place numbers are invented.
const _evalState={loading:false,loaded:false,section:null,dateFrom:null,dateTo:null,schoolDays:0,rows:[],error:''};

// Demo-only fallback (backend unreachable). Mirrors the old mock maths so the
// offline preview still renders; never used against a live API.
function _evalLoadMock(){
  const facSection=Object.entries(appSectionsMap()).find(([,v])=>v.adviser===currentUser?.full_name);
  const sectionName=facSection?facSection[0]:null;
  const students=appUsers().filter(u=>u.role==='student'&&u.status==='active'&&(!sectionName||u.section===sectionName));
  const totalDays=20;
  _evalState.rows=students.map(s=>{
    const recs=[...appAttendance(),...feedItems].filter(a=>a.id_number===s.id_number);
    const timeIns=recs.filter(r=>r.check_type==='time_in');
    const daysPresent=new Set(timeIns.map(r=>r.timestamp?.slice(0,10))).size;
    const verified=recs.filter(r=>r.status==='verified'||r.status==='manual_override').length;
    const proxy=recs.filter(r=>r.status==='proxy_anomaly').length;
    const excused=appExcuseRequests().filter(e=>e.student_id===s.id&&e.status==='approved').length;
    return {s,stats:{daysPresent,totalDays,verified,proxy,excused,pending:0,rate:Math.min(100,Math.round((daysPresent/totalDays)*100))},ev:null};
  });
  _evalState.section=sectionName;
  _evalState.schoolDays=totalDays;
  _evalState.loaded=true;
  _evalState.error='';
}

async function _evalLoad(){
  if(demoMode){_evalLoadMock();return;}
  _evalState.loading=true;_evalState.error='';
  const r=await apiFetch('/evaluations/summary');
  if(!r){_evalState.loading=false;_evalState.rows=[];_evalState.error='Could not reach the server. Check your connection and try again.';return;}
  if(!r.ok){
    let detail='';
    try{detail=(await r.json()).detail||'';}catch{}
    _evalState.loading=false;_evalState.rows=[];
    _evalState.error=detail||`Could not load evaluations (HTTP ${r.status}).`;
    return;
  }
  const data=await r.json();
  _evalState.section=data.section;
  _evalState.dateFrom=data.date_from;
  _evalState.dateTo=data.date_to;
  _evalState.schoolDays=data.school_days;
  _evalState.loaded=true;
  _evalState.error='';
  _evalState.rows=data.students.map(stu=>({
    s:{id:stu.student_id,full_name:stu.full_name,id_number:stu.id_number,section:stu.section},
    stats:{daysPresent:stu.days_present,totalDays:stu.school_days,verified:stu.verified,
           proxy:stu.proxy_anomaly,excused:stu.excused,pending:stu.pending_review,rate:stu.rate},
    ev:stu.standing?{status:stu.standing,note:stu.note||'',savedAt:stu.evaluated_at}:null
  }));
  _evalState.loading=false;
}

async function _evalSave(studentId){
  const statusEl=document.getElementById('eval-status-'+studentId);
  const noteEl=document.getElementById('eval-note-'+studentId);
  const btnEl=document.getElementById('eval-btn-'+studentId);
  const tagEl=document.getElementById('eval-tag-'+studentId);
  if(!statusEl) return;
  const standing=statusEl.value;
  const note=noteEl?.value.trim()||'';
  if(!standing){alert('Please choose an evaluation status first.');return;}

  if(demoMode){
    const row=_evalState.rows.find(r=>r.s.id===studentId);
    if(row) row.ev={status:standing,note,savedAt:new Date().toISOString()};
  }else{
    if(btnEl){btnEl.disabled=true;btnEl.textContent='…';}
    const r=await apiFetch('/evaluations/'+encodeURIComponent(studentId),{
      method:'PUT',
      body:JSON.stringify({standing,note,date_from:_evalState.dateFrom,date_to:_evalState.dateTo})
    });
    if(btnEl){btnEl.disabled=false;}
    if(!r?.ok){
      let msg='Could not save evaluation.';
      try{msg=(await r.json()).detail||msg;}catch{}
      alert(msg);
      if(btnEl){btnEl.textContent='Save';}
      return;
    }
    const row=_evalState.rows.find(r=>r.s.id===studentId);
    if(row) row.ev={status:standing,note,savedAt:new Date().toISOString()};
  }
  if(btnEl){ btnEl.textContent='✓ Saved'; btnEl.style.background='#16A34A'; btnEl.style.color='#fff'; setTimeout(()=>{btnEl.textContent='Save';btnEl.style.background='';btnEl.style.color='';},2000); }
  if(tagEl){ tagEl.textContent=standing; tagEl.style.display=''; }
}

function _evalRating(rate){
  if(rate >= 90) return {label:'Excellent',color:'#16A34A',bg:'#DCFCE7',icon:'🟢'};
  if(rate >= 80) return {label:'Good',color:'#2563EB',bg:'#DBEAFE',icon:'🔵'};
  if(rate >= 75) return {label:'At Risk',color:'#D97706',bg:'#FEF9C3',icon:'🟡'};
  return {label:'Critical',color:'#DC2626',bg:'#FEE2E2',icon:'🔴'};
}

async function renderAttendanceEval(el){
  await _evalLoad();
  if(_evalState.error){
    el.innerHTML=`
      <div class="topbar"><span class="font-bold">📝 Attendance Evaluation</span></div>
      <div class="page-content"><div class="card" style="padding:32px;text-align:center;color:#6B7280;font-size:13px">
        <div style="font-size:26px;margin-bottom:10px">⚠️</div>
        <div style="font-weight:700;color:#374151;margin-bottom:6px">Attendance data unavailable</div>
        <div>${_evalState.error}</div>
      </div></div>`;
    return;
  }
  const rows=[..._evalState.rows];
  const sectionName=_evalState.section||'All Students';
  // Live data carries no department label; the demo map still has one.
  let dept='';
  if(demoMode){
    const f=Object.entries(appSectionsMap()).find(([,v])=>v.adviser===currentUser?.full_name);
    dept=f?f[1].department:'';
  }

  const excellent = rows.filter(r=>r.stats.rate>=90).length;
  const good      = rows.filter(r=>r.stats.rate>=80&&r.stats.rate<90).length;
  const atRisk    = rows.filter(r=>r.stats.rate>=75&&r.stats.rate<80).length;
  const critical  = rows.filter(r=>r.stats.rate<75).length;

  // Sort: lowest rate first (needs attention)
  rows.sort((a,b)=>a.stats.rate-b.stats.rate);

  el.innerHTML = `
    <div class="topbar" style="display:flex;align-items:center;justify-content:space-between">
      <div>
        <span class="font-bold">📝 Attendance Evaluation</span>
        <span style="font-size:11px;color:#6B7280;margin-left:10px">${sectionName}${dept?' · '+dept:''}</span>
        ${!demoMode&&_evalState.dateFrom?`<div style="font-size:10px;color:#9CA3AF;margin-top:3px">Evaluated ${_evalState.dateFrom} → ${_evalState.dateTo} · ${_evalState.schoolDays} school days</div>`:''}
      </div>
      <button class="btn btn-primary" style="font-size:12px" onclick="renderAttendanceEval(document.getElementById('page-attendance-eval'))">↻ Refresh</button>
    </div>
    ${demoMode?`<div class="demo-banner"><div class="demo-banner-dot"></div>Demo Mode — sample attendance data</div>`:''}
    <div class="page-content">

      <!-- Summary Cards -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px">
        ${[
          {label:'Excellent',sublabel:'≥90% attendance',val:excellent,color:'#16A34A',bg:'#F0FDF4',icon:'🟢'},
          {label:'Good',sublabel:'80–89% attendance',val:good,color:'#2563EB',bg:'#EFF6FF',icon:'🔵'},
          {label:'At Risk',sublabel:'75–79% attendance',val:atRisk,color:'#D97706',bg:'#FFFBEB',icon:'🟡'},
          {label:'Critical',sublabel:'Below 75%',val:critical,color:'#DC2626',bg:'#FFF1F2',icon:'🔴'},
        ].map(c=>`
          <div class="card p-4" style="border-left:4px solid ${c.color};background:${c.bg}">
            <div style="font-size:11px;font-weight:700;color:${c.color};text-transform:uppercase;letter-spacing:.05em">${c.icon} ${c.label}</div>
            <div style="font-size:32px;font-weight:800;color:${c.color};line-height:1.2;margin:6px 0">${c.val}</div>
            <div style="font-size:10px;color:#6B7280">${c.sublabel}</div>
          </div>`).join('')}
      </div>

      <!-- Evaluation Table -->
      <div class="card">
        <div style="padding:14px 20px;border-bottom:1px solid #E5E7EB;display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-weight:700;font-size:14px">Student Attendance Evaluation</div>
            <div style="font-size:11px;color:#6B7280">${rows.length} student${rows.length!==1?'s':''} · sorted by attendance rate (lowest first)</div>
          </div>
          <div style="display:flex;gap:6px;font-size:10px;font-weight:700">
            <span style="padding:3px 8px;border-radius:99px;background:#DCFCE7;color:#16A34A">🟢 Excellent</span>
            <span style="padding:3px 8px;border-radius:99px;background:#DBEAFE;color:#2563EB">🔵 Good</span>
            <span style="padding:3px 8px;border-radius:99px;background:#FEF9C3;color:#D97706">🟡 At Risk</span>
            <span style="padding:3px 8px;border-radius:99px;background:#FEE2E2;color:#DC2626">🔴 Critical</span>
          </div>
        </div>

        ${rows.length===0?`<div style="text-align:center;padding:40px;color:#9CA3AF;font-size:13px">No students found in your advisory class</div>`:`
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="background:#F9FAFB;border-bottom:2px solid #E5E7EB">
              <th style="padding:10px 16px;text-align:left;font-weight:700;color:#374151">Student</th>
              <th style="padding:10px 12px;text-align:center;font-weight:700;color:#374151">Rate</th>
              <th style="padding:10px 12px;text-align:center;font-weight:700;color:#374151">Present</th>
              <th style="padding:10px 12px;text-align:center;font-weight:700;color:#374151">Verified</th>
              <th style="padding:10px 12px;text-align:center;font-weight:700;color:#374151">Proxy</th>
              <th style="padding:10px 12px;text-align:center;font-weight:700;color:#374151">Excused</th>
              <th style="padding:10px 16px;text-align:left;font-weight:700;color:#374151">Evaluation</th>
              <th style="padding:10px 16px;text-align:left;font-weight:700;color:#374151">Remarks</th>
              <th style="padding:10px 12px;font-weight:700;color:#374151"></th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(({s,stats,ev},i)=>{
              const rating = _evalRating(stats.rate);
              const barW = stats.rate;
              const savedStatus = ev?.status || '';
              const savedNote   = ev?.note   || '';
              return `<tr style="border-bottom:1px solid #F3F4F6;${i%2===1?'background:#FAFAFA':''}">
                <td style="padding:12px 16px">
                  <div style="display:flex;align-items:center;gap:10px">
                    <div style="width:32px;height:32px;border-radius:50%;background:${rating.color};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:#fff;flex-shrink:0">${s.full_name[0]}</div>
                    <div>
                      <div style="font-weight:600;color:#111827">${s.full_name}</div>
                      <div style="color:#9CA3AF;font-size:10px">${s.id_number} · ${s.section}</div>
                    </div>
                  </div>
                </td>
                <td style="padding:12px;text-align:center">
                  <div style="font-weight:800;font-size:16px;color:${rating.color}">${stats.rate}%</div>
                  <div style="width:60px;height:5px;background:#E5E7EB;border-radius:99px;margin:4px auto 0">
                    <div style="width:${barW}%;height:100%;background:${rating.color};border-radius:99px;transition:width .4s"></div>
                  </div>
                  <div style="font-size:10px;font-weight:600;color:${rating.color};margin-top:3px">${rating.label}</div>
                </td>
                <td style="padding:12px;text-align:center;font-weight:600;color:#374151">${stats.daysPresent}/${stats.totalDays}</td>
                <td style="padding:12px;text-align:center"><span style="background:#DCFCE7;color:#16A34A;padding:2px 8px;border-radius:99px;font-weight:600">${stats.verified}</span></td>
                <td style="padding:12px;text-align:center"><span style="background:${stats.proxy>0?'#FEE2E2':'#F3F4F6'};color:${stats.proxy>0?'#DC2626':'#9CA3AF'};padding:2px 8px;border-radius:99px;font-weight:600">${stats.proxy}</span></td>
                <td style="padding:12px;text-align:center"><span style="background:#DBEAFE;color:#2563EB;padding:2px 8px;border-radius:99px;font-weight:600">${stats.excused}</span></td>
                <td style="padding:12px 16px;min-width:160px">
                  <select id="eval-status-${s.id}" style="width:100%;padding:5px 8px;border:1px solid #E5E7EB;border-radius:7px;font-size:11px;background:#fff;color:#374151">
                    <option value="" ${!savedStatus?'selected':''}>— Select —</option>
                    <option value="Good Standing" ${savedStatus==='Good Standing'?'selected':''}>✅ Good Standing</option>
                    <option value="Needs Improvement" ${savedStatus==='Needs Improvement'?'selected':''}>⚠️ Needs Improvement</option>
                    <option value="Referred to Guidance" ${savedStatus==='Referred to Guidance'?'selected':''}>📋 Referred to Guidance</option>
                    <option value="On Probation" ${savedStatus==='On Probation'?'selected':''}>🔴 On Probation</option>
                    <option value="Dropped" ${savedStatus==='Dropped'?'selected':''}>⛔ Dropped</option>
                  </select>
                  ${savedStatus?`<span id="eval-tag-${s.id}" style="font-size:10px;color:#9CA3AF;margin-top:3px;display:block">Last: ${savedStatus}</span>`:`<span id="eval-tag-${s.id}" style="display:none;font-size:10px;color:#9CA3AF;margin-top:3px"></span>`}
                </td>
                <td style="padding:12px 16px;min-width:180px">
                  <input type="text" id="eval-note-${s.id}" placeholder="Add remarks…" value="${savedNote}" maxlength="200"
                    style="width:100%;padding:5px 8px;border:1px solid #E5E7EB;border-radius:7px;font-size:11px;background:#fff"/>
                </td>
                <td style="padding:12px">
                  <button id="eval-btn-${s.id}" onclick="_evalSave('${s.id}')"
                    class="btn btn-secondary" style="font-size:11px;padding:5px 12px;white-space:nowrap">Save</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>`}

        <!-- Summary Footer -->
        <div style="padding:12px 20px;background:#F9FAFB;border-top:1px solid #E5E7EB;display:flex;gap:16px;font-size:11px;color:#6B7280;flex-wrap:wrap">
          <span>📊 Class Average: <strong style="color:#374151">${rows.length?Math.round(rows.reduce((s,r)=>s+r.stats.rate,0)/rows.length):0}%</strong></span>
          <span>✏️ Evaluations saved: <strong style="color:#374151">${rows.filter(r=>r.ev).length}</strong></span>
          <span>⚠️ Needing attention: <strong style="color:#DC2626">${atRisk+critical}</strong></span>
          <span style="margin-left:auto;color:#9CA3AF">Last updated: ${new Date().toLocaleTimeString()}</span>
        </div>
      </div>
    </div>`;
}


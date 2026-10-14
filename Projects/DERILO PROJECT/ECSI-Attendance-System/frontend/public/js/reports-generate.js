/* ECSI Attendance System — reports-generate
   Extracted verbatim from index.html (original lines 3070–3271).
   Loaded as a classic global script via /js/reports-generate.js. */

// ═══════════════════════════════════════════════════════════
// REPORT GENERATION
// ═══════════════════════════════════════════════════════════
function _getReportRecs(){
  const isFaculty=currentUser?.role==='faculty';
  if(isFaculty){
    const secs=getFacultyAdvisorySections(currentUser);
    return secs.length?appAttendance().filter(r=>isInAdvisoryClass(r,secs)):[];
  }
  return appAttendance();
}

function exportAttendanceCSV(){
  const recs=_getReportRecs();
  const isFaculty=currentUser?.role==='faculty';
  const secs=isFaculty?getFacultyAdvisorySections(currentUser):[];
  const header=['Student Name','ID Number','Section','Status','Check Type','Cosine Distance','Terminal','Timestamp'];
  const rows=recs.map(r=>{
    const stu=appUsers().find(u=>u.id_number===r.id_number);
    return [
      `"${r.full_name||''}"`,
      r.id_number||'',
      `"${stu?.section||stu?.department||''}"`,
      r.status||'',
      (r.check_type||'').replace('_',' '),
      r.cosine_distance!=null?r.cosine_distance.toFixed(4):'',
      r.terminal_id||'',
      r.timestamp?new Date(r.timestamp).toLocaleString():'',
    ].join(',');
  });
  const csv=[header.join(','),...rows].join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  const date=new Date().toISOString().split('T')[0];
  const scope=secs.length?secs.join('-').replace(/\s/g,''):'All';
  a.download=`ECSI_Attendance_${scope}_${date}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function openGenerateReport(){
  const recs=_getReportRecs();
  const isFaculty=currentUser?.role==='faculty';
  const secs=isFaculty?getFacultyAdvisorySections(currentUser):[];
  const advisoryStudents=secs.length
    ? appUsers().filter(u=>u.role==='student'&&u.status==='active'&&secs.includes(u.section||''))
    : appUsers().filter(u=>u.role==='student'&&u.status==='active');
  const verified=recs.filter(r=>r.status==='verified').length;
  const proxy=recs.filter(r=>r.status==='proxy_anomaly').length;
  const noFace=recs.filter(r=>r.status==='no_face_template').length;
  const rfidOnly=recs.filter(r=>r.status==='rfid_only').length;
  const timeIn=recs.filter(r=>r.check_type==='time_in').length;
  const timeOut=recs.filter(r=>r.check_type==='time_out').length;
  const now=new Date();
  const dateStr=now.toLocaleDateString('en-PH',{year:'numeric',month:'long',day:'numeric'});
  const timeStr=now.toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'});
  const scope=secs.length?secs.join(', '):'All Sections';
  const adviser=isFaculty?currentUser.full_name:'System Administrator';

  // Build per-student summary
  const studentRows=advisoryStudents.map(stu=>{
    const stuRecs=recs.filter(r=>r.id_number===stu.id_number);
    const stuIn=stuRecs.filter(r=>r.check_type==='time_in');
    const stuOut=stuRecs.filter(r=>r.check_type==='time_out');
    const lastIn=stuIn[stuIn.length-1];
    const lastOut=stuOut[stuOut.length-1];
    const hasProxy=stuRecs.some(r=>r.status==='proxy_anomaly');
    const status=stuRecs.length===0?'Absent':hasProxy?'Proxy Alert':'Present';
    const statusColor=status==='Absent'?'#EF4444':status==='Proxy Alert'?'#F59E0B':'#41A638';
    return `<tr style="border-bottom:1px solid #E5E7EB">
      <td style="padding:8px 12px;font-weight:500">${stu.full_name}</td>
      <td style="padding:8px 12px;font-family:monospace;font-size:11px;color:#6B7280">${stu.id_number}</td>
      <td style="padding:8px 12px;font-size:12px;color:#6B7280">${stu.section||stu.department||'—'}</td>
      <td style="padding:8px 12px"><span style="font-weight:700;color:${statusColor}">${status}</span></td>
      <td style="padding:8px 12px;font-size:12px;color:#374151">${lastIn?new Date(lastIn.timestamp).toLocaleTimeString():'—'}</td>
      <td style="padding:8px 12px;font-size:12px;color:#374151">${lastOut?new Date(lastOut.timestamp).toLocaleTimeString():'—'}</td>
    </tr>`;
  }).join('');

  // Create or reuse modal
  let modal=document.getElementById('report-modal');
  if(!modal){modal=document.createElement('div');modal.id='report-modal';document.body.appendChild(modal);}
  modal.style.cssText='position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,.6);display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:24px';
  modal.innerHTML=`
    <div id="report-doc" style="background:#fff;width:100%;max-width:820px;border-radius:12px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.3);margin:auto">
      <!-- Header bar -->
      <div style="background:#1F2937;padding:16px 24px;display:flex;justify-content:space-between;align-items:center">
        <div style="color:#fff;font-weight:700;font-size:15px">📄 Attendance Report</div>
        <div style="display:flex;gap:8px">
          <button onclick="printReport()" style="background:#F2C111;color:#1F2937;border:none;border-radius:8px;padding:6px 14px;font-size:12px;font-weight:700;cursor:pointer">🖨 Print / Save PDF</button>
          <button onclick="exportAttendanceCSV()" style="background:#374151;color:#fff;border:none;border-radius:8px;padding:6px 14px;font-size:12px;cursor:pointer">↓ CSV</button>
          <button onclick="document.getElementById('report-modal').style.display='none'" style="background:#374151;color:#fff;border:none;border-radius:8px;padding:6px 14px;font-size:12px;cursor:pointer">✕ Close</button>
        </div>
      </div>
      <!-- Report document -->
      <div id="report-printable" style="padding:32px 36px">
        <!-- School header -->
        <div style="display:flex;align-items:center;gap:16px;border-bottom:2px solid #1F2937;padding-bottom:16px;margin-bottom:20px">
          <div style="width:52px;height:52px;background:#F2C111;border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:22px;color:#1F2937;flex-shrink:0">E</div>
          <div>
            <div style="font-weight:800;font-size:18px;color:#1F2937">ECSI Attendance System</div>
            <div style="font-size:12px;color:#6B7280">RFID + ArcFace Dual-Factor Verification · Student Attendance Report</div>
          </div>
          <div style="margin-left:auto;text-align:right">
            <div style="font-size:11px;color:#6B7280">Generated</div>
            <div style="font-size:12px;font-weight:600;color:#1F2937">${dateStr}</div>
            <div style="font-size:11px;color:#9CA3AF">${timeStr}</div>
          </div>
        </div>

        <!-- Meta row -->
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
          ${[
            ['Section / Scope', scope],
            ['Adviser', adviser],
            ['Report Date', dateStr],
          ].map(([l,v])=>`<div style="background:#F9FAFB;border-radius:8px;padding:10px 14px">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#9CA3AF;margin-bottom:3px">${l}</div>
            <div style="font-weight:700;font-size:13px;color:#1F2937">${v}</div>
          </div>`).join('')}
        </div>

        <!-- Summary stats -->
        <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:24px">
          ${[
            ['Verified',verified,'#41A638'],
            ['Proxy Alerts',proxy,'#EF4444'],
            ['No Face',noFace,'#F59E0B'],
            ['RFID Only',rfidOnly,'#6B7280'],
            ['Time IN',timeIn,'#3B82F6'],
            ['Time OUT',timeOut,'#8B5CF6'],
          ].map(([l,v,c])=>`<div style="border:1px solid #E5E7EB;border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:20px;font-weight:800;color:${c}">${v}</div>
            <div style="font-size:10px;color:#6B7280;margin-top:2px">${l}</div>
          </div>`).join('')}
        </div>

        <!-- Student table -->
        <div style="font-weight:700;font-size:13px;color:#1F2937;margin-bottom:8px;border-bottom:1px solid #E5E7EB;padding-bottom:6px">Student Attendance Summary</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="background:#F3F4F6;border-bottom:2px solid #E5E7EB">
              <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6B7280">Name</th>
              <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6B7280">ID Number</th>
              <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6B7280">Section</th>
              <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6B7280">Status</th>
              <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6B7280">Time IN</th>
              <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6B7280">Time OUT</th>
            </tr>
          </thead>
          <tbody>${studentRows||`<tr><td colspan="6" style="padding:20px;text-align:center;color:#9CA3AF">No students found for this section.</td></tr>`}</tbody>
        </table>

        <!-- All events log -->
        <div style="font-weight:700;font-size:13px;color:#1F2937;margin:20px 0 8px;border-bottom:1px solid #E5E7EB;padding-bottom:6px">Detailed Event Log</div>
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <thead>
            <tr style="background:#F3F4F6;border-bottom:2px solid #E5E7EB">
              ${['Student','Status','Type','Cosine Dist.','Terminal','Timestamp'].map(h=>`<th style="padding:6px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#6B7280">${h}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${recs.length?recs.map(r=>{
              const statusColors={'verified':'#41A638','proxy_anomaly':'#EF4444','no_face_template':'#F59E0B','rfid_only':'#6B7280'};
              const sc=statusColors[r.status]||'#6B7280';
              return `<tr style="border-bottom:1px solid #F3F4F6">
                <td style="padding:6px 10px;font-weight:500">${r.full_name||'—'}<br><span style="font-size:10px;color:#9CA3AF">${r.id_number||''}</span></td>
                <td style="padding:6px 10px"><span style="font-weight:700;color:${sc};font-size:11px">${(r.status||'').replace(/_/g,' ')}</span></td>
                <td style="padding:6px 10px;color:#374151;text-transform:capitalize">${(r.check_type||'').replace('_',' ')}</td>
                <td style="padding:6px 10px;font-family:monospace;color:${r.cosine_distance!=null&&r.cosine_distance<=0.4?'#41A638':'#EF4444'}">${r.cosine_distance!=null?r.cosine_distance.toFixed(4):'—'}</td>
                <td style="padding:6px 10px;color:#6B7280">${r.terminal_id||'—'}</td>
                <td style="padding:6px 10px;color:#6B7280;white-space:nowrap">${r.timestamp?new Date(r.timestamp).toLocaleString():'—'}</td>
              </tr>`;
            }).join(''):`<tr><td colspan="6" style="padding:20px;text-align:center;color:#9CA3AF">No events recorded.</td></tr>`}
          </tbody>
        </table>

        <!-- Footer -->
        <div style="margin-top:28px;padding-top:12px;border-top:1px solid #E5E7EB;display:flex;justify-content:space-between;align-items:center">
          <div style="font-size:10px;color:#9CA3AF">ECSI Attendance System · RFID + ArcFace Dual-Factor · Generated ${dateStr} ${timeStr}</div>
          <div style="font-size:10px;color:#9CA3AF">Prepared by: ${adviser}</div>
        </div>
      </div>
    </div>`;
  modal.onclick=e=>{if(e.target===modal)modal.style.display='none';};
}

function printReport(){
  const doc=document.getElementById('report-printable');
  if(!doc) return;
  const win=window.open('','_blank','width=900,height=700');
  win.document.write(`<!DOCTYPE html><html><head><title>ECSI Attendance Report</title>
    <style>body{font-family:system-ui,sans-serif;margin:0;padding:24px;color:#1F2937;}
    table{width:100%;border-collapse:collapse;}
    @media print{body{padding:0;}}</style></head>
    <body>${doc.innerHTML}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(()=>win.print(),400);
}


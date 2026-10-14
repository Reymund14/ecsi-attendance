/* ECSI Attendance System — notifications
   Extracted verbatim from index.html (original lines 3597–4272).
   Loaded as a classic global script via /js/notifications.js. */

// ═══════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════
function renderNotifications(el){
  // Mark all current user's system notifications as seen
  _markSystemNotificationsSeen();
  const cfg=notifCfg();
  el.innerHTML=`
    <div class="topbar">
      <span class="font-bold">Notification System</span>
      ${currentUser?.role!=='parent'?`<button class="btn btn-primary" style="font-size:12px" onclick="openComposeModal()">+ Send Alert</button>`:''}
    </div>
    ${demoMode?`<div class="demo-banner"><div class="demo-banner-dot"></div>Demo Mode — notifications are simulated, not actually sent</div>`:''}
    <div class="page-content" style="display:grid;grid-template-columns:${currentUser?.role==='parent'?'1fr':'1fr 340px'};gap:20px">

      <!-- Left: log + compose -->
      <div>
        <!-- Excuse requests panel (faculty only) -->
        ${currentUser?.role==='faculty'?`
        <div class="card" style="margin-bottom:20px" id="excuse-review-card">
          <div style="padding:14px 20px;border-bottom:1px solid #E5E7EB;display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-weight:700">📝 Excuse Requests</div>
              <div style="font-size:12px;color:#6B7280">From students in your advisory class</div>
            </div>
            <span style="font-size:11px;font-weight:700;padding:3px 10px;background:#FEF3C7;color:#92400E;border-radius:99px" id="excuse-pending-badge">${appExcuseRequests().filter(r=>r.status==='pending').length} pending</span>
          </div>
          <div id="excuse-review-list">${renderExcuseReviewList()}</div>
        </div>`:''}
        <!-- Notification log -->
        <div class="card" style="margin-bottom:20px">
          <div style="padding:16px 20px;border-bottom:1px solid #E5E7EB;display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-weight:700">Notification Log</div>
              <div style="font-size:12px;color:#6B7280">All sent SMS & email alerts</div>
            </div>
            <div style="display:flex;gap:6px">
              <span style="font-size:11px;font-weight:600;padding:3px 8px;background:#D1FAE5;color:#065F46;border-radius:9999px">📱 SMS</span>
              <span style="font-size:11px;font-weight:600;padding:3px 8px;background:#DBEAFE;color:#1E40AF;border-radius:9999px">✉️ Email</span>
            </div>
          </div>
          <div id="notif-log-list">
            ${renderNotifLog()}
          </div>
        </div>

        <!-- Compose -->
        <div class="card p-5" id="compose-section" style="display:none">
          <div style="font-weight:700;margin-bottom:4px">Compose Alert</div>
          <p style="font-size:12px;color:#6B7280;margin-bottom:16px">Send a manual SMS or email notification.</p>
          <div style="display:grid;gap:12px">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <div>
                <label>Channel</label>
                <select id="notif-channel">
                  <option value="sms">📱 SMS</option>
                  <option value="email">✉️ Email</option>
                  <option value="system">💬 In-System</option>
                  <option value="both">SMS + Email</option>
                  <option value="all">All Channels</option>
                </select>
              </div>
              <div>
                <label>Recipients</label>
                <select id="notif-recipients">
                  <option value="parents">All Parents</option>
                  <option value="admins">Administrators</option>
                  <option value="faculty">Faculty</option>
                  <option value="all">Everyone</option>
                  ${(()=>{
                    if(currentUser?.role!=='faculty') return '';
                    const facSection=Object.entries(appSectionsMap()).find(([,v])=>v.adviser===currentUser?.full_name);
                    const sName=facSection?facSection[0]:null;
                    const advStudents=appUsers().filter(u=>u.role==='student'&&u.status==='active'&&(!sName||u.section===sName));
                    const parents=[];
                    advStudents.forEach(s=>{
                      appUsers().filter(p=>p.role==='parent'&&p.children?.includes(s.id)).forEach(p=>{
                        parents.push({label:'Parent of '+s.full_name+' ('+p.full_name+')',value:'parent:'+p.id+':'+s.full_name});
                      });
                    });
                    if(!parents.length) return '';
                    return '<optgroup label="── Advisory Parents ──">'+parents.map(p=>`<option value="${p.value}">${p.label}</option>`).join('')+'</optgroup>';
                  })()}
                </select>
              </div>
            </div>
            <div><label>Subject</label><input type="text" id="notif-subject" placeholder="e.g., Daily Attendance Summary" maxlength="120"/></div>
            <div>
              <label>Message</label>
              <textarea id="notif-body" maxlength="1000" style="width:100%;border:1px solid #E5E7EB;border-radius:8px;padding:9px 12px;font-size:13px;resize:vertical;min-height:80px;outline:none;font-family:inherit" placeholder="Type your message here…"></textarea>
            </div>
          </div>
          <div id="compose-alert" style="margin-top:12px"></div>
          <div style="display:flex;gap:8px;margin-top:12px">
            <button class="btn btn-primary" style="flex:1" onclick="sendNotification()">Send Now</button>
            <button class="btn btn-secondary" onclick="closeComposeModal()">Cancel</button>
          </div>
        </div>
      </div>

      <!-- Right: settings (hidden for parent role) -->
      ${currentUser?.role==='parent'?'':` <div style="display:flex;flex-direction:column;gap:16px">`}

        <!-- Advisory Parents (faculty only) -->
        ${currentUser?.role==='faculty'?(()=>{
          const facSection=Object.entries(appSectionsMap()).find(([,v])=>v.adviser===currentUser?.full_name);
          const sName=facSection?facSection[0]:null;
          const advStudents=appUsers().filter(u=>u.role==='student'&&u.status==='active'&&(!sName||u.section===sName));
          const pairs=[];
          advStudents.forEach(s=>{
            const parents=appUsers().filter(p=>p.role==='parent'&&p.children?.includes(s.id));
            if(parents.length) pairs.push({student:s,parents});
            else pairs.push({student:s,parents:[]});
          });
          return `<div class="card p-4">
            <div style="font-weight:700;font-size:13px;margin-bottom:4px">👨‍👩‍👦 Advisory Parents</div>
            <div style="font-size:11px;color:#6B7280;margin-bottom:12px">${sName||'Your section'} · ${pairs.length} student${pairs.length!==1?'s':''}</div>
            <div style="display:flex;flex-direction:column;gap:8px">
              <button onclick="_notifSendAllAdvisoryParents()" class="btn btn-primary" style="font-size:11px;padding:6px 12px;width:100%">📨 Send to All Advisory Parents</button>
              <div style="border-top:1px solid #F3F4F6;margin-top:4px;padding-top:8px;display:flex;flex-direction:column;gap:6px">
                ${pairs.map(({student:s,parents:pp})=>`
                <div style="background:#F9FAFB;border-radius:8px;padding:8px 10px">
                  <div style="font-size:11px;font-weight:700;color:#374151;margin-bottom:4px">👦 ${s.full_name} <span style="color:#9CA3AF;font-weight:400">${s.id_number}</span></div>
                  ${pp.length===0?`<div style="font-size:10px;color:#9CA3AF">No linked parent account</div>`:
                    pp.map(p=>`<div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px">
                      <div>
                        <div style="font-size:11px;color:#374151">👤 ${p.full_name}</div>
                        <div style="font-size:10px;color:#9CA3AF">${p.id_number}</div>
                      </div>
                      <button onclick="_notifQuickParent('${p.id}','${s.full_name}','${p.full_name}')"
                        style="font-size:10px;padding:4px 10px;border:1px solid #F2C111;border-radius:6px;background:#FFFBEB;color:#92400E;cursor:pointer;font-weight:600;white-space:nowrap">
                        📨 Send
                      </button>
                    </div>`).join('')
                  }
                </div>`).join('')}
              </div>
            </div>
          </div>`;
        })():''}

        <!-- Channel status -->
        <div class="card p-5">
          <div style="font-weight:700;margin-bottom:14px">Channel Status</div>
          <div style="display:flex;flex-direction:column;gap:10px">
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#F9FAFB;border-radius:10px">
              <div>
                <div style="font-weight:600;font-size:13px">📱 SMS</div>
                <div style="font-size:11px;color:#6B7280">${cfg.sms_provider}</div>
              </div>
              <div onclick="toggleNotifChannel('sms')" id="sms-toggle" style="width:36px;height:20px;border-radius:10px;background:${cfg.sms_enabled?'#41A638':'#D1D5DB'};cursor:pointer;position:relative;transition:background .2s">
                <div style="position:absolute;top:2px;${cfg.sms_enabled?'right:2px':'left:2px'};width:16px;height:16px;background:#fff;border-radius:50%;transition:all .2s"></div>
              </div>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#F9FAFB;border-radius:10px">
              <div>
                <div style="font-weight:600;font-size:13px">✉️ Email</div>
                <div style="font-size:11px;color:#6B7280">${cfg.email_provider}</div>
              </div>
              <div onclick="toggleNotifChannel('email')" id="email-toggle" style="width:36px;height:20px;border-radius:10px;background:${cfg.email_enabled?'#41A638':'#D1D5DB'};cursor:pointer;position:relative;transition:background .2s">
                <div style="position:absolute;top:2px;${cfg.email_enabled?'right:2px':'left:2px'};width:16px;height:16px;background:#fff;border-radius:50%;transition:all .2s"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Recipients -->
        <div class="card p-5">
          <div style="font-weight:700;margin-bottom:14px">Recipients</div>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${[['parents','Parents / Guardians'],['admins','Administrators'],['faculty','Faculty']].map(([k,lbl])=>`
            <label style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;padding:8px 0">
              <span style="font-size:13px">${lbl}</span>
              <input type="checkbox" id="recv-${k}" ${cfg.recipients[k]?'checked':''} onchange="setNotifSetting('recipients','${k}',this.checked)" style="width:15px;height:15px;accent-color:#F2C111"/>
            </label>`).join('')}
          </div>
        </div>

        <!-- Auto-trigger rules -->
        <div class="card p-5">
          <div style="font-weight:700;margin-bottom:4px">Auto-Triggers</div>
          <p style="font-size:11px;color:#6B7280;margin-bottom:12px">Send automatically when these events occur</p>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${[
              ['proxy_alert',   '🚨 Proxy attempt detected'],
              ['daily_summary', '📊 Daily attendance summary'],
              ['absence_3days', '📅 3-day consecutive absence'],
              ['new_enrollment','🪪 New student enrolled'],
            ].map(([k,lbl])=>`
            <label style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;padding:6px 0;border-bottom:1px solid #F3F4F6">
              <span style="font-size:12px">${lbl}</span>
              <input type="checkbox" id="trig-${k}" ${cfg.triggers[k]?'checked':''} onchange="setNotifSetting('triggers','${k}',this.checked)" style="width:15px;height:15px;accent-color:#F2C111"/>
            </label>`).join('')}
          </div>
        </div>

        <!-- Stats -->
        <div class="card p-5">
          <div style="font-weight:700;margin-bottom:12px">Delivery Stats</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div style="text-align:center;padding:10px;background:#F0FDF4;border-radius:8px">
              <div data-notif-count="stored" style="font-size:22px;font-weight:800;color:#41A638">${demoMode?MOCK.notifLog.filter(n=>n.status==='delivered').length:backendNotifications.filter(n=>n.status==='stored'||n.status==='delivered').length}</div>
              <div style="font-size:10px;color:#6B7280;text-transform:uppercase;font-weight:700">Delivered</div>
            </div>
            <div style="text-align:center;padding:10px;background:#FFF1F2;border-radius:8px">
              <div data-notif-count="queued" style="font-size:22px;font-weight:800;color:#EF4444">${demoMode?MOCK.notifLog.filter(n=>n.status==='failed').length:backendNotifications.filter(n=>n.status==='queued').length}</div>
              <div style="font-size:10px;color:#6B7280;text-transform:uppercase;font-weight:700">Failed</div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  if(!demoMode) loadBackendNotifications();
}

async function loadBackendNotifications(){
  const [list,settings]=await Promise.all([apiFetch('/notifications/'),apiFetch('/notifications/settings')]);
  if(list?.ok){backendNotifications=await list.json();const log=document.getElementById('notif-log-list');if(log)log.innerHTML=renderNotifLog();if(currentPage==='notifications')_markSystemNotificationsSeen();else _updateNotifNavBadge();const counts=document.querySelectorAll('[data-notif-count]');if(counts[0])counts[0].textContent=backendNotifications.filter(n=>n.status==='stored'||n.status==='delivered').length;if(counts[1])counts[1].textContent=backendNotifications.filter(n=>n.status==='queued').length;}
  if(settings?.ok){const saved=await settings.json();const target=notifCfg();Object.assign(target,saved);target.recipients={...target.recipients,...(saved.recipients||{})};target.triggers={...target.triggers,...(saved.triggers||{})};Object.entries(saved.recipients||{}).forEach(([k,v])=>{const el=document.getElementById('recv-'+k);if(el)el.checked=v;});Object.entries(saved.triggers||{}).forEach(([k,v])=>{const el=document.getElementById('trig-'+k);if(el)el.checked=v;});['sms','email'].forEach(ch=>{const on=!!saved[ch+'_enabled'];const el=document.getElementById(ch+'-toggle');if(el){el.style.background=on?'#41A638':'#D1D5DB';el.firstElementChild.style[on?'right':'left']='2px';el.firstElementChild.style[on?'left':'right']='';}});}
}
function renderNotifLog(){
  // Parents only see their targeted system notifs + broadcasts; others see all
  let logs = demoMode?MOCK.notifLog:backendNotifications.map(n=>({...n,type:n.channel,recipient:n.recipient_label,sent_at:n.created_at,sender:n.sender_name,recipient_id:n.recipient_user_id}));
  if(currentUser?.role==='parent'){
    logs = logs.filter(n=>
      n.recipient_id===currentUser.id ||   // targeted to this parent
      (n.type==='system' && !n.recipient_id) || // system broadcast
      n.type!=='system'                    // SMS/Email (informational)
    );
  }
  if(!logs.length) return '<div style="padding:28px;text-align:center;color:#9CA3AF;font-size:13px">No notifications yet</div>';
  const typeStyle={
    sms:    {bg:'#D1FAE5',icon:'📱',label:'SMS'},
    email:  {bg:'#DBEAFE',icon:'✉️',label:'Email'},
    system: {bg:'#EDE9FE',icon:'💬',label:'In-System'},
  };
  return logs.map(n=>{
    const ts=typeStyle[n.type]||{bg:'#F3F4F6',icon:'📣',label:n.type};
    const isNew=n.type==='system'&&n.recipient_id===currentUser?.id&&!_seenNotifIds.has(n.id);
    return `
    <div style="display:flex;gap:12px;padding:14px 20px;border-bottom:1px solid #F3F4F6;align-items:flex-start;${isNew?'background:#F5F3FF;':''}">
      <div style="width:32px;height:32px;border-radius:8px;background:${ts.bg};display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">${ts.icon}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;gap:8px">
          <span style="font-weight:600;font-size:13px">${isNew?'🔵 ':''} ${n.subject}</span>
          <div style="display:flex;gap:6px;flex-shrink:0;align-items:center">
            <span style="font-size:10px;padding:2px 7px;border-radius:99px;background:${ts.bg};color:#374151;font-weight:600">${ts.label}</span>
            <span class="badge ${n.status==='delivered'||n.status==='stored'?'badge-green':n.status==='queued'?'badge-yellow':'badge-red'}">${n.status||'sent'}</span>
          </div>
        </div>
        <div style="font-size:11px;color:#6B7280;margin-bottom:3px">${currentUser?.role==='parent'?'From: '+( n.sender||'ECSI System'):'→ '+n.recipient}</div>
        <div style="font-size:12px;color:#4B5563">${n.body}</div>
        <div style="font-size:10px;color:#9CA3AF;margin-top:4px">${new Date(n.sent_at).toLocaleString()}</div>
      </div>
    </div>`;
  }).join('');
}

async function setNotifSetting(group,key,value){
  const cfg=notifCfg();
  cfg[group][key]=value;
  if(!demoMode){
    const r=await apiFetch('/notifications/settings',{method:'PUT',body:JSON.stringify({settings:notifSettings})});
    if(!r?.ok) alert('Could not save notification settings.');
  }
}
function toggleNotifChannel(ch){
  const cfg=notifCfg();
  cfg[ch+'_enabled']=!cfg[ch+'_enabled'];
  if(!demoMode) apiFetch('/notifications/settings',{method:'PUT',body:JSON.stringify({settings:notifSettings})});
  const on=cfg[ch+'_enabled'];
  const el=document.getElementById(ch+'-toggle');
  if(el){el.style.background=on?'#41A638':'#D1D5DB';el.firstElementChild.style[on?'right':'left']='2px';el.firstElementChild.style[on?'left':'right']='';}
}

// ── Excuse review (faculty) ──────────────────────────────────
// ── Dashboard excuse panel (faculty) ─────────────────────────

function renderDashExcuse(){
  const list=document.getElementById('dash-excuse-list');
  const badge=document.getElementById('dash-excuse-badge');
  if(!list) return;
  const advisorySections=getFacultyAdvisorySections(currentUser);
  const reqs=appExcuseRequests().filter(r=>advisorySections.includes(r.section));
  const pending=reqs.filter(r=>r.status==='pending').length;
  if(badge){badge.textContent=pending+' pending';badge.style.background=pending?'#FEF3C7':'#F3F4F6';badge.style.color=pending?'#92400E':'#6B7280';}

  if(!reqs.length){
    list.innerHTML=`<div style="padding:36px;text-align:center;color:#9CA3AF;font-size:13px">
      <div style="font-size:32px;margin-bottom:8px">📭</div>No excuse requests from your advisory class.</div>`;
    return;
  }

  const statusBadge=s=>({
    pending:`<span style="background:#FEF3C7;color:#92400E;font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px">⏳ Pending</span>`,
    approved:`<span style="background:#D1FAE5;color:#065F46;font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px">✓ Approved</span>`,
    rejected:`<span style="background:#FEE2E2;color:#991B1B;font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px">✕ Rejected</span>`,
  })[s]||s;

  list.innerHTML=reqs.map(r=>`
    <div style="padding:14px 20px;border-bottom:1px solid #F3F4F6;display:flex;gap:12px;align-items:flex-start">
      <!-- Avatar -->
      <div style="width:38px;height:38px;border-radius:50%;background:${r.status==='pending'?'#FEF3C7':r.status==='approved'?'#D1FAE5':'#FEE2E2'};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;flex-shrink:0;color:${r.status==='pending'?'#92400E':r.status==='approved'?'#065F46':'#991B1B'}">
        ${(r.student_name||'?')[0]}
      </div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:3px;flex-wrap:wrap">
          <span style="font-weight:700;font-size:13px">${r.student_name}</span>
          <span style="font-family:monospace;font-size:11px;color:#9CA3AF">${r.id_number}</span>
          ${statusBadge(r.status)}
          ${r.proof_name?`<span style="font-size:10px;background:#EFF6FF;color:#1D4ED8;padding:2px 7px;border-radius:99px;font-weight:600">📎 ${r.proof_name}</span>`:''}
        </div>
        <div style="font-size:12px;color:#374151;margin-bottom:3px">📅 <strong>${r.date}</strong> · ${r.reason}</div>
        <div style="font-size:11px;color:#9CA3AF">Filed: ${new Date(r.filed_at).toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
        ${r.adviser_note?`<div style="font-size:11px;color:#6B7280;background:#F9FAFB;border-radius:6px;padding:5px 9px;margin-top:5px">💬 <em>${r.adviser_note}</em></div>`:''}
        <!-- Proof preview -->
        ${r.proof_data&&r.proof_type?.startsWith('image/')?`
          <img src="${r.proof_data}" style="max-width:180px;max-height:90px;object-fit:contain;border-radius:7px;border:1px solid #E5E7EB;margin-top:7px;cursor:pointer;display:block" onclick="excViewProof('${r.id}')" title="Click to enlarge"/>`:''}
        ${r.proof_data&&r.proof_type==='application/pdf'?`
          <a href="${r.proof_data}" target="_blank" style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:#1D4ED8;font-weight:600;margin-top:6px;text-decoration:none">📄 View PDF Attachment</a>`:''}
      </div>
      ${r.status==='pending'?`
        <div style="display:flex;flex-direction:column;gap:5px;flex-shrink:0">
          <button onclick="openExcuseModal('${r.id}','approved')" style="background:#41A638;color:#fff;border:none;border-radius:7px;padding:6px 12px;font-size:11px;cursor:pointer;font-weight:600;white-space:nowrap">✓ Approve</button>
          <button onclick="openExcuseModal('${r.id}','rejected')" style="background:#EF4444;color:#fff;border:none;border-radius:7px;padding:6px 12px;font-size:11px;cursor:pointer;font-weight:600;white-space:nowrap">✕ Reject</button>
          <button onclick="openExcuseModal('${r.id}','view')" style="background:#F3F4F6;color:#374151;border:none;border-radius:7px;padding:6px 12px;font-size:11px;cursor:pointer;font-weight:600;white-space:nowrap">👁 Details</button>
        </div>`:`
        <div style="font-size:11px;color:#9CA3AF;white-space:nowrap;padding-top:2px">${r.status==='approved'?'✓ Reviewed':'✕ Reviewed'}</div>`}
    </div>`).join('');
}

// ── Excuse review modal (approve / reject with custom note) ──
function openExcuseModal(reqId, action){
  const req=appExcuseRequests().find(r=>r.id===reqId);
  if(!req) return;
  const modal=document.getElementById('excuse-review-modal');
  const title=document.getElementById('exc-modal-title');
  const body=document.getElementById('exc-modal-body');
  if(!modal||!body) return;

  const isApprove=action==='approved';
  const isView=action==='view';
  const statusColor=req.status==='approved'?'#065F46':req.status==='rejected'?'#991B1B':'#92400E';
  const statusBg=req.status==='approved'?'#D1FAE5':req.status==='rejected'?'#FEE2E2':'#FEF3C7';
  const statusLabel=req.status==='approved'?'✓ Approved':req.status==='rejected'?'✕ Rejected':'⏳ Pending';

  title.innerHTML=isView
    ?`<span>📋 Excuse Request</span>`
    :(isApprove
      ?`<span style="color:#059669">✓ Approve Excuse Request</span>`
      :`<span style="color:#DC2626">✕ Reject Excuse Request</span>`);

  body.innerHTML=`
    <!-- Student info card -->
    <div style="background:linear-gradient(135deg,#F0F9FF,#EFF6FF);border:1px solid #BFDBFE;border-radius:12px;padding:16px;margin-bottom:16px;display:flex;gap:14px;align-items:flex-start">
      <div style="width:46px;height:46px;border-radius:50%;background:#DBEAFE;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:#1E40AF;flex-shrink:0">${(req.student_name||'?')[0]}</div>
      <div style="flex:1">
        <div style="font-weight:700;font-size:15px;color:#1E3A8A">${req.student_name}</div>
        <div style="font-size:12px;color:#3B82F6;margin-top:1px">${req.id_number} · ${req.section}</div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap">
          <span style="font-size:12px;font-weight:600;background:${statusBg};color:${statusColor};padding:2px 10px;border-radius:99px">${statusLabel}</span>
          <span style="font-size:11px;color:#6B7280">Filed: ${new Date(req.filed_at).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'})}</span>
        </div>
      </div>
    </div>

    <!-- Absence details -->
    <div style="background:#F9FAFB;border-radius:10px;padding:13px 16px;margin-bottom:16px">
      <div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Absence Details</div>
      <div style="display:grid;grid-template-columns:auto 1fr;gap:6px 12px;align-items:baseline">
        <span style="font-size:11px;color:#6B7280;font-weight:600">Date</span>
        <span style="font-size:13px;font-weight:700;color:#111827">${req.date}</span>
        <span style="font-size:11px;color:#6B7280;font-weight:600">Reason</span>
        <span style="font-size:13px;color:#374151">${req.reason}</span>
      </div>
    </div>

    <!-- Proof document -->
    <div style="margin-bottom:16px">
      <div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Supporting Document / Excuse Letter</div>
      ${req.proof_data&&req.proof_type?.startsWith('image/')?`
        <div style="border:1px solid #E5E7EB;border-radius:10px;overflow:hidden">
          <img src="${req.proof_data}" style="width:100%;max-height:260px;object-fit:contain;display:block;background:#F9FAFB;cursor:zoom-in" onclick="excViewProof('${req.id}')" title="Click to view full size"/>
          <div style="padding:8px 12px;background:#F9FAFB;border-top:1px solid #E5E7EB;display:flex;align-items:center;justify-content:space-between">
            <span style="font-size:11px;color:#374151;font-weight:600">📎 ${req.proof_name}</span>
            <div style="display:flex;gap:10px">
              <button onclick="excViewProof('${req.id}')" style="font-size:11px;background:#EFF6FF;color:#1D4ED8;border:none;border-radius:6px;padding:3px 10px;cursor:pointer;font-weight:600">🔍 Enlarge</button>
              <a href="${req.proof_data}" download="${req.proof_name}" style="font-size:11px;background:#F0FDF4;color:#16a34a;border-radius:6px;padding:3px 10px;font-weight:600;text-decoration:none">⬇ Download</a>
            </div>
          </div>
        </div>`
      :req.proof_data&&req.proof_type==='application/pdf'?`
        <div style="background:#EFF6FF;border:1px solid #BAE6FD;border-radius:10px;padding:14px 16px;display:flex;align-items:center;gap:14px">
          <div style="width:44px;height:44px;background:#DBEAFE;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0">📄</div>
          <div style="flex:1">
            <div style="font-weight:700;font-size:13px;color:#1E40AF">${req.proof_name}</div>
            <div style="font-size:11px;color:#60A5FA;margin-top:2px">PDF Document · Click to view</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <a href="${req.proof_data}" target="_blank" style="font-size:11px;background:#1D4ED8;color:#fff;border-radius:7px;padding:5px 12px;font-weight:600;text-decoration:none;text-align:center">View PDF</a>
            <a href="${req.proof_data}" download="${req.proof_name}" style="font-size:11px;background:#EFF6FF;color:#1D4ED8;border-radius:7px;padding:5px 12px;font-weight:600;text-decoration:none;text-align:center">Download</a>
          </div>
        </div>`
      :`<div style="background:#FFF7ED;border:2px dashed #FED7AA;border-radius:10px;padding:16px;text-align:center;color:#92400E">
          <div style="font-size:24px;margin-bottom:4px">📭</div>
          <div style="font-size:12px;font-weight:600">No supporting document attached</div>
          <div style="font-size:11px;color:#D97706;margin-top:2px">Student did not upload a proof document</div>
        </div>`}
    </div>

    <!-- Previous adviser note if exists -->
    ${req.adviser_note&&isView?`
      <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:11px 14px;margin-bottom:14px">
        <div style="font-size:10px;font-weight:700;color:#16a34a;text-transform:uppercase;margin-bottom:4px">Adviser Note</div>
        <div style="font-size:13px;color:#374151">${req.adviser_note}</div>
      </div>`:''}

    <!-- Action area -->
    ${!isView?`
      <div style="background:${isApprove?'#F0FDF4':'#FEF2F2'};border:1px solid ${isApprove?'#BBF7D0':'#FECACA'};border-radius:10px;padding:14px;margin-bottom:16px">
        <label style="font-size:12px;font-weight:700;color:${isApprove?'#15803D':'#DC2626'};display:block;margin-bottom:8px">
          ${isApprove?'✓ Approval Note':'✕ Rejection Reason'} <span style="font-weight:400;font-size:11px">${isApprove?'(optional)':'— required'}</span>
        </label>
        <textarea id="exc-adviser-note" rows="3" maxlength="500"
          placeholder="${isApprove?'e.g. Approved. Please submit original medical certificate upon return.':'e.g. Request not approved — please schedule a meeting with me or submit a formal letter from your parent/guardian.'}"
          style="width:100%;padding:10px 12px;border:1px solid ${isApprove?'#BBF7D0':'#FECACA'};border-radius:8px;font-size:13px;resize:vertical;box-sizing:border-box;font-family:inherit;outline:none;background:#fff">${req.adviser_note||''}</textarea>
        <div id="exc-note-error" style="color:#DC2626;font-size:11px;margin-top:4px;display:none">A reason is required when rejecting a request.</div>
      </div>
      <div style="display:flex;gap:10px">
        <button class="btn btn-secondary" onclick="closeExcuseModal()" style="flex:1">Cancel</button>
        <button onclick="confirmExcuseReview('${req.id}','${action}')"
          style="flex:2;padding:10px;border:none;border-radius:10px;cursor:pointer;font-weight:700;font-size:14px;background:${isApprove?'#16a34a':'#DC2626'};color:#fff;transition:opacity .2s"
          onmouseover="this.style.opacity='.87'" onmouseout="this.style.opacity='1'">
          ${isApprove?'✓ Confirm Approval':'✕ Confirm Rejection'}
        </button>
      </div>`:`
      <button class="btn btn-secondary" onclick="closeExcuseModal()" style="width:100%">Close</button>`}`;

  modal.style.display='flex';
  // Pre-focus the note textarea
  setTimeout(()=>document.getElementById('exc-adviser-note')?.focus(),100);
}

function closeExcuseModal(){
  const m=document.getElementById('excuse-review-modal');
  if(m) m.style.display='none';
}

async function confirmExcuseReview(reqId, action){
  const req=appExcuseRequests().find(r=>r.id===reqId);
  if(!req) return;
  const note=(document.getElementById('exc-adviser-note')?.value||'').trim();
  if(action==='rejected'&&!note){
    const noteEl=document.getElementById('exc-adviser-note');
    const errEl=document.getElementById('exc-note-error');
    if(noteEl) noteEl.style.borderColor='#EF4444';
    if(errEl) errEl.style.display='block';
    return;
  }
  const adviserNote=note||(action==='approved'?'Approved by adviser.':'Not approved by adviser.');
  if(demoMode){
    req.status=action;req.adviser_note=adviserNote;req.reviewed_at=new Date().toISOString();
  }else{
    const response=await apiFetch(`/excuses/${encodeURIComponent(reqId)}`,{method:'PATCH',body:JSON.stringify({status:action,adviser_note:adviserNote})});
    const result=response?await response.json():{};
    if(!response?.ok){setExcuseAlert('error',result.detail||'Could not review this excuse request.');return;}
    const updated=normalizeExcuseRequest(result);
    backendExcuses=backendExcuses.map(item=>item.id===reqId?updated:item);
    Object.assign(req,updated);
  }
  closeExcuseModal();
  // Refresh wherever visible
  renderDashExcuse();
  const reviewList=document.getElementById('excuse-review-list');
  if(reviewList) reviewList.innerHTML=renderExcuseReviewList();
  const badge=document.getElementById('excuse-pending-badge');
  if(badge) badge.textContent=appExcuseRequests().filter(r=>r.status==='pending').length+' pending';
  _updateNotifNavBadge();
  // Toast
  const toast=document.createElement('div');
  const isApprove=action==='approved';
  toast.style.cssText=`position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999;
    background:#1F2937;color:#fff;border-radius:12px;padding:12px 20px;font-size:13px;font-weight:600;
    display:flex;align-items:center;gap:10px;box-shadow:0 8px 24px rgba(0,0,0,.4);animation:slideUp .3s ease-out`;
  toast.innerHTML=`<span style="font-size:18px">${isApprove?'✅':'❌'}</span> Excuse request ${isApprove?'approved':'rejected'} — ${req.student_name}`;
  document.body.appendChild(toast);setTimeout(()=>toast.remove(),3500);
}

// Tracks which system notifications the current user has seen
const _seenNotifIds = new Set();

function _getMySystemNotifs(){
  return appNotifications().filter(n=>{
    if(n.type!=='system') return false;
    if(n.recipient_id) return n.recipient_id===currentUser?.id;
    return !n.recipient_role||n.recipient_role==='all'||n.recipient_role===currentUser?.role;
  });
}

function _markSystemNotificationsSeen(){
  _getMySystemNotifs().forEach(n=>_seenNotifIds.add(n.id));
  _updateNotifNavBadge();
}

function _updateNotifNavBadge(){
  const nav=document.getElementById('nav-notifications');
  if(!nav) return;
  const total=_getMySystemNotifs().filter(n=>!_seenNotifIds.has(n.id)).length;
  let badge=nav.querySelector('.nav-notif-badge');
  if(total&&!badge){
    badge=document.createElement('span');badge.className='nav-notif-badge';
    badge.style.cssText='position:absolute;top:6px;right:10px;background:#EF4444;color:#fff;border-radius:99px;font-size:9px;font-weight:700;padding:1px 6px;min-width:16px;text-align:center';
    nav.appendChild(badge);
  }
  if(badge){badge.textContent=total;badge.style.display=total?'':'none';}
}

function renderExcuseReviewList(){
  const advisorySections=getFacultyAdvisorySections(currentUser);
  const reqs=appExcuseRequests().filter(r=>advisorySections.includes(r.section));
  if(!reqs.length) return `<div style="padding:28px;text-align:center;color:#9CA3AF;font-size:13px">No excuse requests from your advisory class.</div>`;
  const statusBadge=s=>({
    pending:`<span style="background:#FEF3C7;color:#92400E;font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px">⏳ Pending</span>`,
    approved:`<span style="background:#D1FAE5;color:#065F46;font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px">✓ Approved</span>`,
    rejected:`<span style="background:#FEE2E2;color:#991B1B;font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px">✕ Rejected</span>`,
  })[s]||s;
  return `<div style="display:flex;flex-direction:column">
    ${reqs.map(r=>`
      <div style="padding:14px 20px;border-bottom:1px solid #F3F4F6">
        <div style="display:flex;align-items:flex-start;gap:10px">
          <div style="flex:1">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;flex-wrap:wrap">
              <span style="font-weight:600;font-size:13px">${r.student_name}</span>
              <span style="font-family:monospace;font-size:11px;color:#9CA3AF">${r.id_number}</span>
              ${statusBadge(r.status)}
              ${r.proof_name
                ?`<span style="font-size:10px;background:#EFF6FF;color:#1D4ED8;padding:2px 8px;border-radius:99px;font-weight:600">📎 With Proof</span>`
                :`<span style="font-size:10px;background:#F3F4F6;color:#9CA3AF;padding:2px 8px;border-radius:99px">No attachment</span>`}
            </div>
            <div style="font-size:12px;color:#374151;margin-bottom:4px">📅 ${r.date} · ${r.reason}</div>
            <!-- Proof document -->
            ${r.proof_data&&r.proof_type?.startsWith('image/')
              ?`<div style="margin-bottom:6px">
                  <img src="${r.proof_data}" style="max-width:200px;max-height:110px;object-fit:contain;border-radius:7px;border:1px solid #E5E7EB;cursor:pointer;display:block" onclick="excViewProof('${r.id}')" title="Click to enlarge"/>
                  <div style="font-size:10px;color:#6B7280;margin-top:3px">📸 ${r.proof_name} · <a href="${r.proof_data}" download="${r.proof_name}" style="color:#1D4ED8">Download</a></div>
                </div>`
              : r.proof_data&&r.proof_type==='application/pdf'
              ?`<div style="margin-bottom:6px;display:flex;align-items:center;gap:8px;background:#F0F9FF;border:1px solid #BAE6FD;border-radius:7px;padding:7px 10px">
                  <span style="font-size:20px">📄</span>
                  <div>
                    <div style="font-weight:600;font-size:11px;color:#0369A1">${r.proof_name}</div>
                    <div style="display:flex;gap:8px;margin-top:2px">
                      <a href="${r.proof_data}" target="_blank" style="font-size:11px;color:#1D4ED8;font-weight:600">View PDF</a>
                      <a href="${r.proof_data}" download="${r.proof_name}" style="font-size:11px;color:#6B7280">Download</a>
                    </div>
                  </div>
                </div>`
              :''}
            ${r.adviser_note?`<div style="font-size:11px;color:#6B7280;background:#F9FAFB;border-radius:6px;padding:4px 8px">💬 ${r.adviser_note}</div>`:''}
          </div>
          ${r.status==='pending'?`
            <div style="display:flex;flex-direction:column;gap:5px;flex-shrink:0">
              <button onclick="reviewExcuse('${r.id}','approved')" style="background:#41A638;color:#fff;border:none;border-radius:6px;padding:5px 10px;font-size:11px;cursor:pointer;font-weight:600">✓ Approve</button>
              <button onclick="reviewExcuse('${r.id}','rejected')" style="background:#EF4444;color:#fff;border:none;border-radius:6px;padding:5px 10px;font-size:11px;cursor:pointer;font-weight:600">✕ Reject</button>
            </div>`:''}
        </div>
      </div>`).join('')}
  </div>`;
}

function reviewExcuse(id, action){
  // Route through the note modal for proper review
  openExcuseModal(id, action);
}

function openComposeModal(){
  const s=document.getElementById('compose-section');
  if(s){s.style.display='block';s.scrollIntoView({behavior:'smooth',block:'nearest'});}
}
function closeComposeModal(){
  const s=document.getElementById('compose-section');
  if(s) s.style.display='none';
}

function _notifQuickParent(parentId, studentName, parentName){
  // Pre-fill compose form and show it targeting one specific parent
  const chSel=document.getElementById('notif-channel');
  if(chSel) chSel.value='system'; // default to in-system for direct parent messages
  const sel=document.getElementById('notif-recipients');
  if(sel){
    // Find or select the matching option
    const optVal='parent:'+parentId+':'+studentName;
    const opt=[...sel.options].find(o=>o.value===optVal);
    if(opt) sel.value=opt.value;
    else sel.value='parents'; // fallback
  }
  const subEl=document.getElementById('notif-subject');
  const bodyEl=document.getElementById('notif-body');
  if(subEl&&!subEl.value) subEl.value='Attendance Update — '+studentName;
  if(bodyEl&&!bodyEl.value) bodyEl.placeholder='Dear '+parentName+', this message is regarding '+studentName+' attendance...';
  openComposeModal();
  // Scroll compose into view
  setTimeout(()=>document.getElementById('compose-section')?.scrollIntoView({behavior:'smooth',block:'center'}),100);
}

function _notifSendAllAdvisoryParents(){
  const sel=document.getElementById('notif-recipients');
  if(sel) sel.value='parents';
  const subEl=document.getElementById('notif-subject');
  if(subEl&&!subEl.value) subEl.value='Advisory Class Attendance Update';
  openComposeModal();
  setTimeout(()=>document.getElementById('compose-section')?.scrollIntoView({behavior:'smooth',block:'center'}),100);
}

async function sendNotification(){
  const channel=document.getElementById('notif-channel')?.value;
  const recipients=document.getElementById('notif-recipients')?.value;
  const subject=document.getElementById('notif-subject')?.value?.trim();
  const body=document.getElementById('notif-body')?.value?.trim();
  const alertEl=document.getElementById('compose-alert');
  const ok=vValidate([
    [document.getElementById('notif-subject'), V.text(120,true,'Subject')(subject)],
    [document.getElementById('notif-body'), V.text(1000,true,'Message')(body)]
  ]);
  if(!ok){
    if(alertEl) alertEl.innerHTML=`<div class="alert alert-error" style="margin:0">⚠ Please correct the highlighted fields.</div>`;
    return;
  }
  const btn=document.querySelector('#compose-section .btn-primary');
  if(btn){btn.disabled=true;btn.innerHTML='<span class="spinner"></span> Sending…';}
  if(!demoMode){
    const isParentTarget=recipients?.startsWith('parent:');
    const recipientId=isParentTarget?recipients.split(':')[1]:null;
    const recipientLabel=isParentTarget?recipients.split(':')[2]+' (Parent)':{parents:'All Parents',admins:'Administrators',faculty:'Faculty',all:'Everyone'}[recipients]||recipients;
      const roleMap={admins:'super_admin',faculty:'faculty',parents:'parent',all:'all'};
    const channels={sms:['sms'],email:['email'],system:['system'],both:['sms','email'],all:['sms','email','system']}[channel]||[channel];
    let failure='';
    for(const ch of channels){
      const r=await apiFetch('/notifications/',{method:'POST',body:JSON.stringify({channel:ch,recipient_label:recipientLabel,recipient_user_id:ch==='system'?recipientId:null,recipient_role:roleMap[recipients]||null,subject,body})});
      if(!r?.ok){try{failure=(await r.json()).detail||'Could not save notification.';}catch{failure='Could not save notification.';}break;}
    }
    if(failure){if(alertEl)alertEl.innerHTML=`<div class="alert alert-error" style="margin:0">${failure}</div>`;if(btn){btn.disabled=false;btn.textContent='Send Now';}return;}
    const list=await apiFetch('/notifications/');if(list?.ok)backendNotifications=await list.json();
    const chLabel={sms:'SMS',email:'Email',system:'In-System',both:'SMS + Email',all:'All Channels'}[channel]||channel.toUpperCase();
    if(alertEl)alertEl.innerHTML=`<div class="alert alert-success" style="margin:0">Saved via <strong>${chLabel}</strong> to <strong>${recipientLabel}</strong>. SMS/email records are queued until a provider is configured.</div>`;
    const log=document.getElementById('notif-log-list');if(log)log.innerHTML=renderNotifLog();
    document.getElementById('notif-subject').value='';document.getElementById('notif-body').value='';
    if(btn){btn.disabled=false;btn.textContent='Send Now';}
    return;
  }
  setTimeout(()=>{
    const isParentTarget=recipients?.startsWith('parent:');
    const recipientId=isParentTarget?recipients.split(':')[1]:null;
    const recipientLabel=isParentTarget?recipients.split(':')[2]+' (Parent)':{parents:'All Parents',admins:'Administrators',faculty:'Faculty',all:'Everyone'}[recipients]||recipients;
    const channelMap={sms:['sms'],email:['email'],system:['system'],both:['sms','email'],all:['sms','email','system']};
    const channels=channelMap[channel]||[channel];
    channels.forEach(ch=>{
      const entry={
        id:'n-'+Date.now()+'-'+Math.random().toString(36).slice(2),
        type:ch,
        recipient:recipientLabel,
        recipient_id:ch==='system'?recipientId:null, // only tag system notifs
        sender:currentUser?.full_name||'System',
        subject,body,
        status:'delivered',
        sent_at:new Date().toISOString()
      };
      MOCK.notifLog.unshift(entry);
      // Update unseen badge for parents instantly
      if(ch==='system') _updateNotifNavBadge();
    });
    const chLabel={sms:'SMS',email:'Email',system:'In-System',both:'SMS + Email',all:'All Channels'}[channel]||channel.toUpperCase();
    if(alertEl) alertEl.innerHTML=`<div class="alert alert-success" style="margin:0">✅ Sent via <strong>${chLabel}</strong> to <strong>${recipientLabel}</strong>.</div>`;
    document.getElementById('notif-log-list').innerHTML=renderNotifLog();
    document.getElementById('notif-subject').value='';
    document.getElementById('notif-body').value='';
    if(btn){btn.disabled=false;btn.textContent='Send Now';}
  },1200);
}


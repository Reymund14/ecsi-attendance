/* ECSI Attendance System — auth
   Extracted verbatim from index.html (original lines 406–479).
   Loaded as a classic global script via /js/auth.js. */

// ═══════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════
function fillDemo(id,pw){
  document.getElementById('li-id').value=id;
  document.getElementById('li-pw').value=pw;
}
function togglePw(){
  const i=document.getElementById('li-pw'),e=document.getElementById('pw-eye');
  if(i.type==='password'){i.type='text';e.textContent='🙈';}else{i.type='password';e.textContent='👁';}
}

async function doLogin(){
  const id=document.getElementById('li-id').value.trim();
  const pw=document.getElementById('li-pw').value;
  const errEl=document.getElementById('li-err');
  const btn=document.getElementById('li-btn');
  if(!id||!pw){
    errEl.textContent='Please enter your ID Number and password.';
    errEl.classList.remove('hidden');
    return;
  }
  errEl.classList.add('hidden');
  btn.disabled=true; btn.innerHTML='<span class="spinner"></span> Signing in…';

  // Try live backend first
  let loggedIn=false;
  try{
    const r=await Promise.race([
      fetch(API+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id_number:id,password:pw})}),
      new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),3000))
    ]);
    const d=await r.json();
    if(r.ok){
      currentUser={id:d.user_id,full_name:d.full_name,role:d.role,token:d.access_token};
      try{const profile=await fetch(API+'/users/me',{headers:{'Authorization':'Bearer '+d.access_token}});if(profile.ok)currentUser={...currentUser,...await profile.json(),token:d.access_token};}catch{}
      demoMode=false; loggedIn=true;
    } else {
      // Backend reachable but credentials wrong — show real error
      errEl.textContent=d.detail||'Invalid credentials.';
      errEl.classList.remove('hidden');
      btn.disabled=false; btn.textContent='Sign In';
      return;
    }
  }catch{
    // Backend unreachable — fall back to demo mode
    const demoUser=DEMO_USERS[id];
    if(demoUser && DEMO_PW[id]===pw){
      currentUser={...demoUser};
      demoMode=true; loggedIn=true;
    } else {
      errEl.textContent='Backend offline. Use a demo account (ADMIN001 / Admin@1234, FAC001 / Faculty@1234, STU2024001 / Student@1234, PAR001 / Parent@1234).';
      errEl.classList.remove('hidden');
      btn.disabled=false; btn.textContent='Sign In';
      return;
    }
  }

  if(loggedIn){
    saveAuth({...currentUser,demoMode});
    showApp();
  }
  btn.disabled=false; btn.textContent='Sign In';
}

document.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&!document.getElementById('login-screen').classList.contains('hidden')) doLogin();
});

function doLogout(){
  clearAuthStore(); currentUser=null; demoMode=false;
  if(wsConn){wsConn.close();wsConn=null;}
  feedItems=[];
  document.getElementById('app').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('li-id').value='';
  document.getElementById('li-pw').value='';
}


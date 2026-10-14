/* ECSI Attendance System — data
   Extracted verbatim from index.html (original lines 262–348).
   Loaded as a classic global script via /js/data.js. */

// ═══════════════════════════════════════════════════════════
// MOCK DATA — used when backend is unreachable (Demo Mode)
// ═══════════════════════════════════════════════════════════
const DEMO_USERS = {
  'ADMIN001':   {id:'u-001',id_number:'ADMIN001',  full_name:'Admin User',    role:'super_admin', token:'demo-token-admin'},
  'FAC001':     {id:'u-002',id_number:'FAC001',    full_name:'Maria Santos',  role:'faculty',     token:'demo-token-fac'},
  'STU2024001': {id:'u-003',id_number:'STU2024001',full_name:'Juan dela Cruz',role:'student',     token:'demo-token-stu'},
  'PAR001':     {id:'u-008',id_number:'PAR001',    full_name:'Roberto dela Cruz',role:'parent',     token:'demo-token-par',children:['u-003']},
  'PAR002':     {id:'u-009',id_number:'PAR002',    full_name:'Patricia Reyes',   role:'parent',     token:'demo-token-par2',children:['u-004']},
};
const DEMO_PW = {'ADMIN001':'Admin@1234','FAC001':'Faculty@1234','STU2024001':'Student@1234','PAR001':'Parent@1234','PAR002':'Parent@1234'};

const MOCK = {
  analytics:{today_verified:42,today_proxy_anomaly:3,today_manual_override:1,today_total:46,total_users:128,total_proxy_attempts_all_time:17},
  weeklyAttendance:[
    {day:'Mon',verified:38,proxy:1},{day:'Tue',verified:41,proxy:2},{day:'Wed',verified:35,proxy:0},
    {day:'Thu',verified:44,proxy:3},{day:'Fri',verified:42,proxy:1},{day:'Sat',verified:12,proxy:0},{day:'Sun',verified:0,proxy:0},
  ],
  notifSettings:{
    sms_enabled:true, email_enabled:true,
    sms_provider:'Semaphore', email_provider:'Gmail SMTP',
    recipients:{parents:true,admins:true,faculty:false},
    triggers:{proxy_alert:true,daily_summary:true,absence_3days:true,new_enrollment:false},
  },
  notifLog:[
    {id:'n-001',type:'sms',  recipient:'Parent of Juan dela Cruz',subject:'Proxy Alert',body:'A proxy attempt was detected using Juan dela Cruz\'s RFID card at 08:14 AM.',status:'delivered',sent_at:new Date(Date.now()-3600000).toISOString()},
    {id:'n-002',type:'email',recipient:'admin@ecsi.edu.ph',       subject:'Daily Attendance Summary — June 21, 2026',body:'Today: 42 verified, 3 proxy anomalies, 1 manual override.',status:'delivered',sent_at:new Date(Date.now()-7200000).toISOString()},
    {id:'n-003',type:'sms',  recipient:'Parent of Ana Reyes',     subject:'Proxy Alert',body:'Proxy attempt detected for Ana Reyes at TERMINAL-01 at 07:52 AM.',status:'delivered',sent_at:new Date(Date.now()-10800000).toISOString()},
    {id:'n-004',type:'email',recipient:'faculty@ecsi.edu.ph',     subject:'3-Day Absence Alert',body:'Carlos Bautista (STU2024003) has been absent for 3 consecutive days.',status:'failed',  sent_at:new Date(Date.now()-86400000).toISOString()},
    {id:'n-005',type:'sms',  recipient:'Parent of Lea Garcia',    subject:'Attendance Verified',body:'Lea Garcia successfully checked in at 07:45 AM on June 20, 2026.',status:'delivered',sent_at:new Date(Date.now()-172800000).toISOString()},
  ],
  // excuseRequests: filed by students, reviewed by adviser
  excuseRequests:[
    {id:'ex-001',student_id:'u-003',student_name:'Juan dela Cruz',id_number:'STU2024001',section:'Grade 10-A',date:'2026-06-20',reason:'Medical appointment — dental surgery',status:'approved',adviser_note:'Approved. Please submit medical certificate.',filed_at:new Date(Date.now()-86400000).toISOString(),proof_data:null,proof_name:null,proof_type:null},
    {id:'ex-002',student_id:'u-004',student_name:'Ana Reyes',id_number:'STU2024002',section:'Grade 10-A',date:'2026-06-21',reason:'Family Emergency — family member hospitalized',status:'pending',adviser_note:'',filed_at:new Date(Date.now()-7200000).toISOString(),proof_data:null,proof_name:null,proof_type:null},
    {id:'ex-003',student_id:'u-003',student_name:'Juan dela Cruz',id_number:'STU2024001',section:'Grade 10-A',date:'2026-06-22',reason:'Medical / Illness — fever and flu',status:'pending',adviser_note:'',filed_at:new Date(Date.now()-1800000).toISOString(),proof_data:null,proof_name:null,proof_type:null},
  ],
  // rfidCards: uid (uppercase) → user_id  — used for duplicate detection
  rfidCards:{
    'A1B2C3D4':'u-001',
    'E5F6A7B8':'u-002',
    'C9D0E1F2':'u-003',
    'G3H4I5J6':'u-004',
    'K7L8M9N0':'u-006',
    'P1Q2R3S4':'u-007',
  },
  // sections: section name → {adviser, department}
  sections:{
    'Grade 9-A': {adviser:'Lorna Dela Rosa',   department:'Junior High'},
    'Grade 9-B': {adviser:'Ramon Villanueva',  department:'Junior High'},
    'Grade 10-A':{adviser:'Maria Santos',      department:'Junior High'},
    'Grade 10-B':{adviser:'Jose Reyes',        department:'Junior High'},
    'Grade 11-A':{adviser:'Christine Aquino',  department:'Senior High'},
    'Grade 11-B':{adviser:'Angelo Mendoza',    department:'Senior High'},
    'Grade 11-C':{adviser:'Patricia Navarro',  department:'Senior High'},
    'Grade 12-A':{adviser:'Roberto Cruz',      department:'Senior High'},
    'Grade 12-B':{adviser:'Clarissa Tan',      department:'Senior High'},
  },
  // faceHashes: simulated hash → user_id — used for face duplicate detection
  faceHashes:{
    'face-hash-u001':'u-001',
    'face-hash-u002':'u-002',
    'face-hash-u003':'u-003',
    'face-hash-u006':'u-006',
    'face-hash-u007':'u-007',
  },
  users:[
    {id:'u-001',id_number:'ADMIN001',  full_name:'Admin User',      role:'super_admin',department:'IT',    section:'',   has_rfid:true, has_face:true, rfid_uid:'A1B2C3D4',status:'active'},
    {id:'u-002',id_number:'FAC001',    full_name:'Maria Santos',    role:'faculty',    department:'Science',section:'',  has_rfid:true, has_face:true, rfid_uid:'E5F6A7B8',status:'active'},
    {id:'u-003',id_number:'STU2024001',full_name:'Juan dela Cruz',  role:'student',    department:'',section:'Grade 10-A',has_rfid:true, has_face:true, rfid_uid:'C9D0E1F2',status:'active'},
    {id:'u-004',id_number:'STU2024002',full_name:'Ana Reyes',       role:'student',    department:'',section:'Grade 10-A',has_rfid:true, has_face:false,rfid_uid:'G3H4I5J6',status:'active'},
    {id:'u-005',id_number:'STU2024003',full_name:'Carlos Bautista', role:'student',    department:'',section:'Grade 9-B', has_rfid:false,has_face:false,rfid_uid:null,      status:'active'},
    {id:'u-006',id_number:'FAC002',    full_name:'Jose Reyes',      role:'faculty',    department:'Math', section:'',    has_rfid:true, has_face:true, rfid_uid:'K7L8M9N0',status:'active'},
    {id:'u-007',id_number:'STU2024004',full_name:'Lea Garcia',      role:'student',    department:'',section:'Grade 11-C',has_rfid:true,has_face:true, rfid_uid:'P1Q2R3S4',status:'inactive'},
    {id:'u-008',id_number:'PAR001',    full_name:'Roberto dela Cruz',role:'parent',     department:'',section:'',has_rfid:false,has_face:false,rfid_uid:null,status:'active',children:['u-003']},
    {id:'u-009',id_number:'PAR002',    full_name:'Patricia Reyes',   role:'parent',     department:'',section:'',has_rfid:false,has_face:false,rfid_uid:null,status:'active',children:['u-004']},
  ],
  attendance:[
    {id:'a-001',full_name:'Juan dela Cruz',  id_number:'STU2024001',status:'verified',      check_type:'time_in', cosine_distance:0.2134,terminal_id:'TERMINAL-01',timestamp:new Date(Date.now()-3600000).toISOString()},
    {id:'a-002',full_name:'Ana Reyes',       id_number:'STU2024002',status:'proxy_anomaly', check_type:'time_in', cosine_distance:0.6821,terminal_id:'TERMINAL-01',timestamp:new Date(Date.now()-7200000).toISOString()},
    {id:'a-003',full_name:'Carlos Bautista', id_number:'STU2024003',status:'pending_review',check_type:'time_in', cosine_distance:null,  terminal_id:'TERMINAL-02',timestamp:new Date(Date.now()-10800000).toISOString()},
    {id:'a-004',full_name:'Maria Santos',    id_number:'FAC001',    status:'verified',      check_type:'time_in', cosine_distance:0.1562,terminal_id:'TERMINAL-01',timestamp:new Date(Date.now()-14400000).toISOString()},
    {id:'a-005',full_name:'Lea Garcia',      id_number:'STU2024004',status:'manual_override',check_type:'time_in',cosine_distance:null,  terminal_id:'TERMINAL-02',timestamp:new Date(Date.now()-18000000).toISOString()},
    {id:'a-006',full_name:'Juan dela Cruz',  id_number:'STU2024001',status:'verified',      check_type:'time_out',cosine_distance:0.1988,terminal_id:'TERMINAL-01',timestamp:new Date(Date.now()-1800000).toISOString()},
  ],
};


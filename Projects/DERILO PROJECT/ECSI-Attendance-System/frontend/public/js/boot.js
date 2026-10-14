/* ECSI Attendance System — boot
   Extracted verbatim from index.html (original lines 5707–5714).
   Loaded as a classic global script via /js/boot.js. */

// ═══════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════
(function(){
  const saved=loadAuth();
  if(saved){currentUser=saved;demoMode=saved.demoMode||false;showApp();}
})();


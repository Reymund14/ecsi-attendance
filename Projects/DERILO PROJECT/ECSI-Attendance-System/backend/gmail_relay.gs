/**
 * ECSI attendance email relay — a Google Apps Script web app.
 *
 * Sends attendance notices through the Gmail account that owns this script,
 * over HTTPS, so it works on Render's free tier (which blocks SMTP).
 *
 * Setup:
 *   1. https://script.google.com -> New project.
 *   2. Replace Code.gs with this file.
 *   3. Project Settings -> Script properties -> add:
 *        SHARED_SECRET = <long random string>
 *   4. Deploy -> New deployment -> type "Web app".
 *        Execute as: Me
 *        Who has access: Anyone
 *   5. Copy the /exec URL into MAIL_WEBHOOK_URL and the same secret into
 *      MAIL_WEBHOOK_SECRET on Render, then redeploy the backend.
 *
 * When the script changes, re-deploy (Manage deployments -> edit -> New version).
 *
 * Quota: Gmail allows ~100 script emails/day for a consumer account and
 * ~1500/day for Google Workspace. Above that, GmailApp throws and the backend
 * request logs the failure (attendance itself is unaffected).
 */
function doPost(e) {
  var secret = PropertiesService.getScriptProperties().getProperty('SHARED_SECRET');
  var data = JSON.parse(e.postData.contents);
  if (!secret || data.secret !== secret) {
    return ContentService.createTextOutput('unauthorized');
  }
  GmailApp.sendEmail(data.to, data.subject, data.body);
  return ContentService.createTextOutput('ok');
}

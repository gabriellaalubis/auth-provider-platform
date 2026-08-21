import { Injectable } from '@nestjs/common';
import type { AuthResponse } from '@app/contracts';

@Injectable()
export class AppService {
  renderHome(
    auth: AuthResponse | null,
    mfaStatus?: { enabled: boolean; recoveryCodesRemaining: number },
  ): string {
    const content = auth
      ? `<p class="eyebrow">Central session</p>
    <h1>Hello, ${this.escape(auth.user.name)}</h1>
    <p class="lead">You are signed in to the central identity provider.</p>
    <dl><div><dt>Email</dt><dd>${this.escape(auth.user.email)}</dd></div><div><dt>Status</dt><dd><span class="badge">Active</span></dd></div><div><dt>Created</dt><dd>${this.format(auth.session.createdAt)}</dd></div><div><dt>Expires</dt><dd>${this.format(auth.session.expiresAt)}</dd></div></dl>
    <div class="security-row"><div><strong>Multi-factor authentication</strong><span>${mfaStatus?.enabled ? `Enabled · ${mfaStatus.recoveryCodesRemaining} recovery codes remaining` : 'Add an authenticator code after your password'}</span></div><a href="/auth/mfa/setup">${mfaStatus?.enabled ? 'View MFA status' : 'Set up MFA'}</a></div>
    <button id="global-logout" type="button">Sign out everywhere</button>
    <p id="status" class="status" role="status"></p>
    <a class="metrics-link" href="/metrics">View system metrics</a>`
      : `<p class="eyebrow">Identity provider</p>
    <h1>Central Sign-On</h1>
    <p class="lead">Your central session is signed out. Sign in here or start from App A or App B.</p>
    <a class="button" href="/auth/login">Sign in</a>
    <a class="metrics-link" href="/metrics">View system metrics</a>`;
    const script = auth
      ? `<script>
const button=document.getElementById('global-logout');
const status=document.getElementById('status');
button.addEventListener('click',async()=>{
  button.disabled=true;
  status.textContent='Signing out all applications…';
  try{
    const response=await fetch('/auth/logout',{method:'POST'});
    if(!response.ok)throw new Error('Global sign-out failed');
    window.location.assign('/');
  }catch(error){status.textContent=error instanceof Error?error.message:'Global sign-out failed';button.disabled=false;}
});
</script>`
      : '';
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SSO Portal</title>
  <style>:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#172033;background:#f4f7fb}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at top,#dbeafe 0,#f4f7fb 44%)}main{width:min(100%,520px);background:#fff;border:1px solid #dce3ee;border-radius:20px;padding:34px;box-shadow:0 24px 60px rgba(30,64,175,.12)}.brand{display:flex;align-items:center;gap:12px;margin-bottom:30px}.mark{width:44px;height:44px;display:grid;place-items:center;border-radius:12px;background:#2563eb;color:#fff;font-weight:800}.brand strong{display:block}.brand span,.lead,.status{color:#667085}.eyebrow{margin:0 0 7px;color:#2563eb;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}h1{margin:0;font-size:28px}.lead{line-height:1.55;margin:10px 0 26px}dl{margin:0 0 26px;border-top:1px solid #e5e7eb}dl div{display:flex;justify-content:space-between;gap:20px;padding:13px 0;border-bottom:1px solid #e5e7eb}dt{color:#667085}dd{margin:0;text-align:right}.badge{display:inline-block;padding:3px 9px;border-radius:999px;background:#dcfce7;color:#166534;font-size:13px;font-weight:700}.button,button{display:inline-block;border:0;border-radius:10px;padding:13px 17px;background:#2563eb;color:#fff;font:inherit;font-weight:750;text-decoration:none;cursor:pointer}button{background:#b42318}button:disabled{opacity:.65;cursor:wait}.status{min-height:20px;margin:14px 0 0;font-size:14px}.metrics-link{display:inline-block;margin:14px 0 0 14px;color:#2563eb;font-weight:700;text-decoration:none}.security-row{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:0 0 22px;padding:14px;border-radius:12px;background:#eff6ff}.security-row strong,.security-row span{display:block}.security-row span{margin-top:3px;color:#667085;font-size:12px}.security-row a{color:#2563eb;font-weight:750;text-decoration:none;white-space:nowrap}</style>
</head>
<body><main><div class="brand"><div class="mark">SSO</div><div><strong>Central Sign-On</strong><span>Identity and session portal</span></div></div>${content}</main>${script}</body>
</html>`;
  }

  private escape(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  private format(value: Date): string {
    return new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'medium',
      timeZone: 'Asia/Jakarta',
    }).format(new Date(value));
  }
}

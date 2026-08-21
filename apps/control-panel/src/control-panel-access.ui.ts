type AccessPage = 'signed-out' | 'denied';

export function renderControlPanelAccessPage(
  page: AccessPage,
  authUrl: string,
): string {
  const denied = page === 'denied';
  const title = denied ? 'Access denied' : 'Administrator sign-in required';
  const message = denied
    ? 'Your account does not have permission to access the Control Panel.'
    : 'Sign in with an administrator account to continue.';
  const safeAuthUrl = escapeAttribute(authUrl.replace(/\/$/, ''));
  const actions = denied
    ? `<a class="button secondary" href="${safeAuthUrl}">Back to SSO Portal</a>
       <button class="button primary" id="switch-account" type="button">Sign out and use another account</button>`
    : `<a class="button primary" href="${safeAuthUrl}/auth/login">Sign in</a>`;
  const script = denied
    ? `<iframe class="logout-target" name="logout-target" title="" hidden></iframe>
<script>
document.getElementById('switch-account').addEventListener('click', () => {
  const form = document.createElement('form');
  form.method = 'post';
  form.action = '${safeAuthUrl}/auth/logout';
  form.target = 'logout-target';
  document.body.appendChild(form);
  form.submit();
  setTimeout(() => {
    window.location.href = '${safeAuthUrl}/auth/login';
  }, 500);
});
</script>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} | SSO Control Panel</title>
  <style>
    :root{--navy:#16233a;--slate:#5a6779;--line:#dde3ec;--bg:#f4f6fa;--white:#fff;--accent:#2b5fd9;--accent-dark:#1e47a8;--red:#b42318;--shadow:0 16px 42px rgba(22,35,58,.12)}
    *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:var(--bg);color:var(--navy);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.card{width:min(460px,100%);padding:34px;border:1px solid var(--line);border-radius:14px;background:var(--white);box-shadow:var(--shadow)}.brand{display:flex;align-items:center;gap:12px;margin-bottom:30px}.logo{display:grid;place-items:center;width:44px;height:44px;border-radius:11px;background:var(--navy);color:#fff;font-weight:800}.brand strong{display:block;font-size:17px}.brand span{color:var(--slate)}.eyebrow{margin-bottom:8px;color:${denied ? 'var(--red)' : 'var(--accent)'};font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}h1{margin:0 0 10px;font-size:28px;line-height:1.2}p{margin:0;color:var(--slate);font-size:16px}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:28px}.button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;border:1px solid transparent;border-radius:8px;padding:10px 16px;font:inherit;font-weight:700;text-decoration:none;cursor:pointer}.primary{color:#fff;background:var(--accent)}.primary:hover{background:var(--accent-dark)}.secondary{border-color:#cbd5e1;color:var(--navy);background:#fff}.secondary:hover{background:#f8fafc}
  </style>
</head>
<body>
  <main class="card">
    <div class="brand"><div class="logo">SSO</div><div><strong>University SSO</strong><span>Control Panel</span></div></div>
    <div class="eyebrow">${denied ? 'Authorization required' : 'Protected administration'}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <div class="actions">${actions}</div>
  </main>
  ${script}
</body>
</html>`;
}

function escapeAttribute(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const replacements: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return replacements[character];
  });
}

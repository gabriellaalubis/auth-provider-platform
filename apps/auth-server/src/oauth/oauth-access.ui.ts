export function renderOAuthAccessDenied(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Access denied | Central Sign-On</title>
  <style>
    :root{--navy:#10213d;--slate:#586783;--line:#d9e1ee;--bg:#f3f6fb;--blue:#2d66e8;--red:#b42318;--shadow:0 18px 45px rgba(16,33,61,.12)}
    *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:var(--bg);color:var(--navy);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.card{width:min(460px,100%);padding:34px;border:1px solid var(--line);border-radius:14px;background:#fff;box-shadow:var(--shadow)}.brand{display:flex;align-items:center;gap:12px;margin-bottom:30px}.logo{display:grid;place-items:center;width:44px;height:44px;border-radius:11px;color:#fff;background:var(--blue);font-weight:800}.brand strong{display:block;font-size:17px}.brand span,p{color:var(--slate)}.eyebrow{margin-bottom:8px;color:var(--red);font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}h1{margin:0 0 10px;font-size:28px;line-height:1.2}p{margin:0;font-size:16px}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:28px}.button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;border:1px solid #cbd5e1;border-radius:8px;padding:10px 16px;color:var(--navy);background:#fff;font:inherit;font-weight:700;text-decoration:none;cursor:pointer}.primary{border-color:var(--blue);color:#fff;background:var(--blue)}
  </style>
</head>
<body>
  <main class="card">
    <div class="brand"><div class="logo">SSO</div><div><strong>Central Sign-On</strong><span>Application authorization</span></div></div>
    <div class="eyebrow">Authorization required</div>
    <h1>Access denied</h1>
    <p>Your account does not have permission to access this application.</p>
    <div class="actions"><button class="button primary" type="button" onclick="history.back()">Back to application</button><a class="button" href="/">SSO Portal</a></div>
  </main>
</body>
</html>`;
}

const APP_NAME = process.env.APP_NAME || 'Claude Code Server';

const CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #1a1a2e;
  color: #e0e0e0;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
.container { width: 100%; max-width: 420px; padding: 20px; }
.card {
  background: #16213e;
  border-radius: 12px;
  padding: 40px 32px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  text-align: center;
}
h1 { font-size: 1.5rem; margin-bottom: 8px; color: #fff; }
p { color: #a0a0b8; margin-bottom: 24px; font-size: 0.95rem; }
input[type="text"] {
  width: 100%;
  padding: 14px 16px;
  font-size: 1.8rem;
  text-align: center;
  letter-spacing: 0.5em;
  border: 2px solid #2a2a4a;
  border-radius: 8px;
  background: #0f0f23;
  color: #fff;
  outline: none;
  transition: border-color 0.2s;
}
input[type="text"]:focus { border-color: #6c63ff; }
button {
  width: 100%;
  padding: 14px;
  margin-top: 16px;
  font-size: 1rem;
  font-weight: 600;
  border: none;
  border-radius: 8px;
  background: #6c63ff;
  color: #fff;
  cursor: pointer;
  transition: background 0.2s;
}
button:hover { background: #5a52d5; }
.error {
  background: #3d1f2b;
  color: #ff6b6b;
  padding: 10px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 0.9rem;
}
.qr-container { margin: 20px 0; }
.qr-container img { max-width: 240px; border-radius: 8px; }
.manual-entry { margin: 16px 0; text-align: left; color: #a0a0b8; }
.manual-entry summary { cursor: pointer; color: #6c63ff; font-size: 0.9rem; }
.secret-display {
  display: block;
  margin-top: 8px;
  padding: 10px;
  background: #0f0f23;
  border-radius: 4px;
  font-family: monospace;
  font-size: 1.1rem;
  letter-spacing: 0.15em;
  word-break: break-all;
  user-select: all;
  color: #e0e0e0;
}
.spinner {
  width: 40px; height: 40px;
  border: 4px solid #2a2a4a;
  border-top-color: #6c63ff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 20px auto;
}
@keyframes spin { to { transform: rotate(360deg); } }
`;

function renderSetupPage(qrCodeDataUrl, secret, error) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Setup 2FA - ${APP_NAME}</title>
  <style>${CSS}</style>
</head>
<body>
  <div class="container">
    <div class="card">
      <h1>Set Up Two-Factor Authentication</h1>
      <p>Scan this QR code with your authenticator app</p>
      ${error ? `<div class="error">${error}</div>` : ''}
      <div class="qr-container">
        <img src="${qrCodeDataUrl}" alt="TOTP QR Code" />
      </div>
      <details class="manual-entry">
        <summary>Can't scan? Enter manually</summary>
        <code class="secret-display">${secret}</code>
      </details>
      <form method="POST" action="/auth/setup">
        <label for="token" style="display:block;margin-bottom:8px;color:#a0a0b8;font-size:0.9rem;">Enter the 6-digit code to verify:</label>
        <input type="text" id="token" name="token"
               pattern="[0-9]{6}" maxlength="6" inputmode="numeric"
               autocomplete="one-time-code" autofocus required
               placeholder="000000" />
        <button type="submit">Verify &amp; Enable 2FA</button>
      </form>
    </div>
  </div>
</body>
</html>`;
}

function renderLoginPage(error) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login - ${APP_NAME}</title>
  <style>${CSS}</style>
</head>
<body>
  <div class="container">
    <div class="card">
      <h1>${APP_NAME}</h1>
      <p>Enter your authenticator code to continue</p>
      ${error ? `<div class="error">${error}</div>` : ''}
      <form method="POST" action="/auth/login">
        <input type="text" name="token"
               pattern="[0-9]{6}" maxlength="6" inputmode="numeric"
               autocomplete="one-time-code" autofocus required
               placeholder="000000" />
        <button type="submit">Sign In</button>
      </form>
    </div>
  </div>
</body>
</html>`;
}

function renderStartingPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Starting - ${APP_NAME}</title>
  <style>${CSS}</style>
  <meta http-equiv="refresh" content="3">
</head>
<body>
  <div class="container">
    <div class="card">
      <h1>${APP_NAME}</h1>
      <div class="spinner"></div>
      <p>Code-server is starting up, please wait...</p>
    </div>
  </div>
</body>
</html>`;
}

module.exports = { renderSetupPage, renderLoginPage, renderStartingPage };

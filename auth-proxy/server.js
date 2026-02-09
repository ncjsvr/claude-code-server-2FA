const express = require('express');
const session = require('express-session');
const httpProxy = require('http-proxy');
const http = require('http');
const crypto = require('crypto');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const cookie = require('cookie-parser');
const { renderSetupPage, renderLoginPage, renderStartingPage } = require('./views');

// ============================================================================
// Configuration
// ============================================================================

const PORT = parseInt(process.env.AUTH_PROXY_PORT || '8080', 10);
const CODE_SERVER_PORT = parseInt(process.env.CODE_SERVER_PORT || '8081', 10);
const CODE_SERVER_HOST = process.env.CODE_SERVER_HOST || '127.0.0.1';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_MAX_AGE = parseInt(process.env.SESSION_MAX_AGE || String(30 * 24 * 60 * 60 * 1000), 10);
const SECRET_FILE_PATH = process.env.TOTP_SECRET_PATH ||
  path.join(process.env.HOME || '/home/clauder', '.config', 'claude-2fa', 'secret.json');
const APP_NAME = process.env.APP_NAME || 'Claude Code Server';

// TOTP window: accept codes from 1 step before/after (±30s)
authenticator.options = { window: 1 };

// ============================================================================
// TOTP Secret Management
// ============================================================================

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

function loadSecret() {
  try {
    if (fs.existsSync(SECRET_FILE_PATH)) {
      return JSON.parse(fs.readFileSync(SECRET_FILE_PATH, 'utf-8'));
    }
  } catch (err) {
    console.error('Failed to load TOTP secret:', err.message);
  }
  return null;
}

function saveSecret(data) {
  ensureDir(SECRET_FILE_PATH);
  fs.writeFileSync(SECRET_FILE_PATH, JSON.stringify(data, null, 2), { mode: 0o600 });
}

function isEnrolled() {
  const data = loadSecret();
  return data && data.enrolled === true;
}

function generateNewSecret() {
  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri('clauder', APP_NAME, secret);
  return { secret, otpauthUrl };
}

function verifyTOTP(token, secret) {
  try {
    return authenticator.check(token, secret);
  } catch {
    return false;
  }
}

// ============================================================================
// Rate Limiting
// ============================================================================

const rateLimiter = { count: 0, lastReset: Date.now() };
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 60 * 1000;

function checkRateLimit() {
  const now = Date.now();
  if (now - rateLimiter.lastReset > LOCKOUT_DURATION) {
    rateLimiter.count = 0;
    rateLimiter.lastReset = now;
  }
  if (rateLimiter.count >= MAX_ATTEMPTS) {
    return false;
  }
  rateLimiter.count++;
  return true;
}

function resetRateLimit() {
  rateLimiter.count = 0;
  rateLimiter.lastReset = Date.now();
}

// ============================================================================
// Express App
// ============================================================================

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(cookie());

const sessionMiddleware = session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  name: 'claude_2fa_session',
  cookie: {
    maxAge: SESSION_MAX_AGE,
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
  },
});

app.use(sessionMiddleware);

// ============================================================================
// Health Check
// ============================================================================

app.get('/healthz', (_req, res) => res.status(200).send('OK'));

// ============================================================================
// Auth Routes
// ============================================================================

// --- Setup page (first run) ---
app.get('/auth/setup', async (req, res) => {
  if (isEnrolled()) {
    return res.redirect('/auth/login');
  }

  let data = loadSecret();
  if (!data || !data.secret) {
    const { secret, otpauthUrl } = generateNewSecret();
    data = {
      secret,
      otpauthUrl,
      enrolled: false,
      issuer: APP_NAME,
      accountName: 'clauder',
    };
    saveSecret(data);
  }

  try {
    const qrDataUrl = await QRCode.toDataURL(data.otpauthUrl);
    res.send(renderSetupPage(qrDataUrl, data.secret, null));
  } catch (err) {
    res.status(500).send('Failed to generate QR code');
  }
});

// --- Setup verification ---
app.post('/auth/setup', async (req, res) => {
  if (isEnrolled()) {
    return res.redirect('/auth/login');
  }

  const data = loadSecret();
  if (!data || !data.secret) {
    return res.redirect('/auth/setup');
  }

  const token = (req.body.token || '').trim();

  if (!verifyTOTP(token, data.secret)) {
    try {
      const qrDataUrl = await QRCode.toDataURL(data.otpauthUrl);
      return res.send(renderSetupPage(qrDataUrl, data.secret, 'Invalid code. Please try again.'));
    } catch {
      return res.status(500).send('Failed to generate QR code');
    }
  }

  data.enrolled = true;
  data.enrolledAt = new Date().toISOString();
  saveSecret(data);

  req.session.authenticated = true;
  console.log('2FA enrollment complete');
  res.redirect('/');
});

// --- Login page ---
app.get('/auth/login', (req, res) => {
  if (!isEnrolled()) {
    return res.redirect('/auth/setup');
  }
  if (req.session && req.session.authenticated) {
    return res.redirect('/');
  }
  res.send(renderLoginPage(null));
});

// --- Login verification ---
app.post('/auth/login', (req, res) => {
  if (!isEnrolled()) {
    return res.redirect('/auth/setup');
  }

  if (!checkRateLimit()) {
    return res.send(renderLoginPage('Too many attempts. Please wait 60 seconds.'));
  }

  const data = loadSecret();
  const token = (req.body.token || '').trim();

  if (!data || !verifyTOTP(token, data.secret)) {
    return res.send(renderLoginPage('Invalid code. Please try again.'));
  }

  resetRateLimit();
  req.session.authenticated = true;
  const returnTo = req.session.returnTo || '/';
  delete req.session.returnTo;
  console.log('2FA login successful');
  res.redirect(returnTo);
});

// --- Logout ---
app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/auth/login');
  });
});

// ============================================================================
// Authentication Middleware (for everything else)
// ============================================================================

app.use((req, res, next) => {
  if (!isEnrolled()) {
    return res.redirect('/auth/setup');
  }
  if (req.session && req.session.authenticated) {
    return next();
  }
  req.session.returnTo = req.originalUrl;
  res.redirect('/auth/login');
});

// ============================================================================
// HTTP Proxy
// ============================================================================

const proxy = httpProxy.createProxyServer({
  target: `http://${CODE_SERVER_HOST}:${CODE_SERVER_PORT}`,
  ws: true,
  changeOrigin: true,
});

proxy.on('error', (err, req, res) => {
  if (err.code === 'ECONNREFUSED') {
    if (res && typeof res.writeHead === 'function') {
      res.writeHead(503, { 'Content-Type': 'text/html' });
      res.end(renderStartingPage());
    }
  } else {
    console.error('Proxy error:', err.message);
    if (res && typeof res.writeHead === 'function') {
      res.writeHead(502);
      res.end('Bad Gateway');
    }
  }
});

app.use((req, res) => {
  proxy.web(req, res);
});

// ============================================================================
// Server + WebSocket Upgrade
// ============================================================================

const server = http.createServer(app);

server.on('upgrade', (req, socket, head) => {
  // Parse session cookie for WebSocket authentication
  const cookies = {};
  if (req.headers.cookie) {
    req.headers.cookie.split(';').forEach((c) => {
      const parts = c.trim().split('=');
      if (parts.length >= 2) {
        cookies[parts[0]] = decodeURIComponent(parts.slice(1).join('='));
      }
    });
  }

  const signedCookie = cookies['claude_2fa_session'];
  if (!signedCookie) {
    socket.destroy();
    return;
  }

  // Validate signed cookie: express-session signs as s:<value>.<signature>
  // We use a fake req/res to run the session middleware
  const fakeRes = {
    writeHead() {},
    setHeader() {},
    end() {},
    on() { return this; },
    getHeader() {},
    removeHeader() {},
  };

  sessionMiddleware(req, fakeRes, () => {
    if (req.session && req.session.authenticated) {
      proxy.ws(req, socket, head);
    } else {
      socket.destroy();
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`2FA Auth Proxy listening on 0.0.0.0:${PORT}`);
  console.log(`Proxying to code-server at ${CODE_SERVER_HOST}:${CODE_SERVER_PORT}`);
});

// ============================================================================
// Graceful Shutdown
// ============================================================================

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down...');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down...');
  server.close(() => process.exit(0));
});

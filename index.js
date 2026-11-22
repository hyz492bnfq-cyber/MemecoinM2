'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const { Bot } = require('grammy');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ACCESS_CODE = process.env.DASHBOARD_ACCESS_CODE || '';
const SESSION_SECRET = process.env.DASHBOARD_SESSION_SECRET || '';
const DASHBOARD_URL = (process.env.DASHBOARD_URL || '').replace(/\/+$/, '');
const COOKIE_NAME = 'meme_radar_session';
const TEN_YEARS_SECONDS = 60 * 60 * 24 * 365 * 10;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

if (!ACCESS_CODE || ACCESS_CODE.length < 8) {
  throw new Error('DASHBOARD_ACCESS_CODE is required and must contain at least 8 characters.');
}
if (!SESSION_SECRET || Buffer.byteLength(SESSION_SECRET, 'utf8') < 32) {
  throw new Error('DASHBOARD_SESSION_SECRET is required and must contain at least 32 bytes.');
}
if (IS_PRODUCTION && (!DASHBOARD_URL.startsWith('https://'))) {
  throw new Error('In production, DASHBOARD_URL must use HTTPS.');
}

// FadeHost/reverse-proxy deployments commonly terminate HTTPS before Node.js.
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));

const codeFingerprint = () =>
  crypto.createHash('sha256').update(ACCESS_CODE, 'utf8').digest('hex');

const safeEqual = (a, b) => {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

const sign = (payload) => {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${signature}`;
};

const verifySession = (token) => {
  if (!token || typeof token !== 'string' || token.length > 2048) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [body, signature] = parts;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  if (!safeEqual(signature, expected)) return false;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return payload.v === 1 &&
      typeof payload.issuedAt === 'number' &&
      typeof payload.nonce === 'string' &&
      safeEqual(payload.codeFingerprint, codeFingerprint());
  } catch {
    return false;
  }
};

const readCookie = (req, name) => {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    if (key === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return '';
};

const isHttpsRequest = (req) =>
  req.secure || req.get('x-forwarded-proto') === 'https';

const setSessionCookie = (res, token, req) => {
  const secure = IS_PRODUCTION || isHttpsRequest(req);
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${TEN_YEARS_SECONDS}`,
    `Expires=${new Date(Date.now() + TEN_YEARS_SECONDS * 1000).toUTCString()}`,
    'HttpOnly',
    'SameSite=Strict'
  ];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
};

const clearSessionCookie = (res, req) => {
  const secure = IS_PRODUCTION || isHttpsRequest(req);
  const parts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'HttpOnly',
    'SameSite=Strict'
  ];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
};

const requireAuth = (req, res, next) => {
  const token = readCookie(req, COOKIE_NAME);
  if (!verifySession(token)) {
    clearSessionCookie(res, req);
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ ok: false, error: 'AUTH_REQUIRED' });
    }
    return res.redirect('/login');
  }
  req.authenticated = true;
  next();
};

// Simple in-memory login throttling. It intentionally does not affect valid sessions.
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

const loginThrottle = (req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  let entry = attempts.get(ip);
  if (!entry || now - entry.startedAt > WINDOW_MS) {
    entry = { startedAt: now, count: 0 };
    attempts.set(ip, entry);
  }
  if (entry.count >= MAX_ATTEMPTS) {
    const retryAfter = Math.max(1, Math.ceil((WINDOW_MS - (now - entry.startedAt)) / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({
      ok: false,
      error: 'TOO_MANY_ATTEMPTS',
      message: 'Trop de tentatives. Réessaie dans quelques minutes.'
    });
  }
  next();
};

app.get('/health', (_req, res) => res.json({ ok: true, service: 'meme-radar' }));

app.get('/', (req, res) => {
  const token = readCookie(req, COOKIE_NAME);
  return res.redirect(verifySession(token) ? '/dashboard' : '/login');
});

app.get('/login', (req, res) => {
  if (verifySession(readCookie(req, COOKIE_NAME))) return res.redirect('/dashboard');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/api/login', loginThrottle, (req, res) => {
  const submitted = typeof req.body.code === 'string' ? req.body.code : '';
  if (!safeEqual(submitted, ACCESS_CODE)) {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const entry = attempts.get(ip);
    if (entry) entry.count += 1;
    return res.status(401).json({ ok: false, error: 'INVALID_CODE', message: 'Code incorrect.' });
  }

  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  attempts.delete(ip);

  const token = sign({
    v: 1,
    issuedAt: Date.now(),
    nonce: crypto.randomBytes(16).toString('hex'),
    codeFingerprint: codeFingerprint()
  });
  setSessionCookie(res, token, req);
  return res.json({ ok: true, redirect: '/dashboard' });
});

app.post('/api/logout', (req, res) => {
  clearSessionCookie(res, req);
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (_req, res) => {
  res.json({ ok: true, authenticated: true });
});

app.get('/dashboard', requireAuth, (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.use('/assets', express.static(path.join(__dirname, 'public'), {
  index: false,
  etag: true,
  maxAge: IS_PRODUCTION ? '1h' : 0
}));

app.use((_req, res) => res.status(404).send('Page introuvable.'));

// Telegram bot: /start sends the private dashboard URL.
if (process.env.BOT_TOKEN) {
  if (!DASHBOARD_URL) {
    throw new Error('DASHBOARD_URL is required when BOT_TOKEN is configured.');
  }
  const bot = new Bot(process.env.BOT_TOKEN);
  const sendDashboard = (ctx) => ctx.reply(
    'Bienvenue sur Meme Radar. Voici ton accès au tableau de bord privé :',
    { reply_markup: { inline_keyboard: [[{ text: 'Ouvrir le Dashboard', url: DASHBOARD_URL }]] } }
  );
  bot.command('start', sendDashboard);
  bot.command('dashboard', sendDashboard);
  bot.command('help', (ctx) => ctx.reply('Commandes disponibles : /start et /dashboard'));
  bot.catch((err) => console.error('Telegram bot error:', err.error));
  bot.start().then(() => console.log('Telegram bot started (long polling).'))
    .catch((err) => console.error('Unable to start Telegram bot:', err));
}

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Meme Radar listening on port ${PORT}`);
});

const shutdown = () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

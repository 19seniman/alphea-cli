#!/usr/bin/env node
/**
 * alphea.js — CLI untuk ALPHEA (alphea.ai · ALPHEA Hub · ALPHEA Connect)
 *
 * Zero dependency. Node >= 18 (global fetch).
 *
 * Auth  : GoTrue (Supabase Auth) di https://auth.alphea.ai
 *         POST /token?grant_type=password {email,password}
 * API   : gateway https://edge.alphea.ai
 *
 * Kredensial & token disimpan di .env (mode 600):
 *   ALPHEA_EMAIL=
 *   ALPHEA_PASSWORD=
 *   ALPHEA_ACCESS_TOKEN=
 *   ALPHEA_REFRESH_TOKEN=
 *   ALPHEA_AUTH_BASE=https://auth.alphea.ai
 *   ALPHEA_API_BASE=https://edge.alphea.ai
 *
 * Command:
 *   setup   isi .env tanpa editor (kredensial diuji dulu)
 *   edit    buka .env di editor
 *   login   login email + password
 *   logout  hapus token dari .env
 *   env     lihat .env (disamarkan)
 *   me      profil akun
 *   probe   cek endpoint edge mana yang hidup (pakai tokenmu)
 *   get/post  panggil endpoint apa pun
 *   about   info script & author
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { spawnSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Identitas & tampilan
// ---------------------------------------------------------------------------

const BRAND = {
  name: 'ALPHEA CLI',
  app: 'alphea.ai',
  version: '1.0.0',
  author: '19Seniman',
  tip: 'Traktir \u2615',
  networks: 'BSC \u00b7 ETH \u00b7 Hype',
  evm: '0xf01fb9a6855f175d3f3e28e00fa617009c38ef59',
};

const C = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
  g: (s) => `\x1b[32m${s}\x1b[0m`,
  r: (s) => `\x1b[31m${s}\x1b[0m`,
  y: (s) => `\x1b[33m${s}\x1b[0m`,
  c: (s) => `\x1b[36m${s}\x1b[0m`,
};

const ENV_FILE = process.env.ALPHEA_ENV_FILE ?? path.join(process.cwd(), '.env');
const DEFAULT_AUTH_BASE = 'https://auth.alphea.ai';
const DEFAULT_API_BASE = 'https://edge.alphea.ai';

const TERM_W = () => Math.max(38, Math.min(process.stdout.columns || 52, 60));
const visible = (s) => String(s).replace(/\x1b\[[0-9;]*m/g, '');
const padEndV = (s, w) => s + ' '.repeat(Math.max(0, w - visible(s).length));
const centerV = (s, w) => {
  const gap = Math.max(0, w - visible(s).length);
  const left = Math.floor(gap / 2);
  return ' '.repeat(left) + s + ' '.repeat(gap - left);
};

function banner() {
  const w = TERM_W();
  const inner = w - 2;
  console.log('');
  console.log(C.c('\u256d' + '\u2500'.repeat(inner) + '\u256e'));
  console.log(C.c('\u2502') + centerV(C.b(BRAND.name) + C.dim('  \u00b7  ' + BRAND.app), inner) + C.c('\u2502'));
  console.log(C.c('\u2502') + centerV(C.dim('login email + OTP \u00b7 points \u00b7 rounds'), inner) + C.c('\u2502'));
  console.log(C.c('\u2570' + '\u2500'.repeat(inner) + '\u256f'));
  console.log(C.dim(`  v${BRAND.version}  \u00b7  ${API_BASE}`));
}

function authorBox() {
  const w = TERM_W();
  const inner = w - 2;
  const line = (s) => C.c('\u2502') + ' ' + padEndV(s, inner - 1) + C.c('\u2502');
  console.log(C.c('\u256d' + '\u2500'.repeat(inner) + '\u256e'));
  console.log(line(C.dim('author')));
  console.log(line(C.b(BRAND.author)));
  console.log(line(C.y(BRAND.tip)));
  console.log(line(C.dim(BRAND.networks)));
  console.log(line(C.g(BRAND.evm)));
  console.log(C.c('\u2570' + '\u2500'.repeat(inner) + '\u256f'));
}

function section(title) {
  const w = TERM_W();
  const label = ` ${title} `;
  const side = Math.max(2, Math.floor((w - visible(label).length) / 2));
  console.log('');
  console.log(C.c('\u2500'.repeat(side)) + C.b(label) + C.c('\u2500'.repeat(Math.max(2, w - side - visible(label).length))));
}

function kv(key, value, width = 15) {
  console.log(`  ${C.dim(padEndV(key, width))}${value}`);
}

const dot = (ok) => (ok ? C.g('\u25cf') : C.dim('\u25cb'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const die = (m, code = 1) => {
  console.error(C.r(`\u2716 ${m}`));
  process.exit(code);
};
const log = (m) => console.log(`${C.dim(new Date().toLocaleTimeString())} ${m}`);

// ---------------------------------------------------------------------------
// .env
// ---------------------------------------------------------------------------

const ENV_TEMPLATE = `# alphea.js — isi email akun ALPHEA, lalu simpan.
# Login memakai kode OTP yang dikirim ke email (tanpa password).
ALPHEA_EMAIL=
# diisi otomatis
ALPHEA_ACCESS_TOKEN=
ALPHEA_REFRESH_TOKEN=
ALPHEA_CHALLENGE_ID=
ALPHEA_DEVICE_ID=
ALPHEA_SESSION_ID=
# opsional
ALPHEA_API_BASE=https://edge.alphea.ai
`;

function readEnvFile(file = ENV_FILE) {
  const out = { __lines: [] };
  if (!fs.existsSync(file)) return out;
  const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) {
      out.__lines.push({ type: 'raw', text: line });
      continue;
    }
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
    out.__lines.push({ type: 'kv', key: m[1] });
  }
  return out;
}

function writeEnvFile(patch, file = ENV_FILE) {
  const env = readEnvFile(file);
  const seen = new Set();
  const lines = [];
  const render = (k, v) => {
    const quote = /[\s#'"`$]/.test(v) || v === '';
    return `${k}=${quote ? `"${v.replace(/"/g, '\\"')}"` : v}`;
  };
  for (const item of env.__lines) {
    if (item.type === 'raw') {
      lines.push({ raw: item.text });
      continue;
    }
    const k = item.key;
    if (Object.prototype.hasOwnProperty.call(patch, k)) {
      seen.add(k);
      const v = patch[k];
      if (v === null || v === undefined || v === '') continue;
      lines.push({ raw: render(k, String(v)) });
    } else if (env[k] !== undefined && env[k] !== '') {
      lines.push({ raw: render(k, env[k]) });
    }
  }
  const missing = Object.keys(patch).filter((k) => !seen.has(k) && patch[k]);
  if (missing.length && lines.length && String(lines[lines.length - 1].raw).trim() !== '') lines.push({ raw: '' });
  for (const k of missing) lines.push({ raw: render(k, String(patch[k])) });
  const body = lines
    .map((l) => l.raw)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .replace(/\s+$/, '');
  fs.writeFileSync(file, body + '\n', { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {}
}

function ensureEnvFile({ quiet = false } = {}) {
  const exists = fs.existsSync(ENV_FILE);
  let body = '';
  if (exists) {
    try {
      body = fs.readFileSync(ENV_FILE, 'utf8');
    } catch {}
    if (body.trim() !== '') return false;
  }
  fs.mkdirSync(path.dirname(ENV_FILE), { recursive: true });
  fs.writeFileSync(ENV_FILE, ENV_TEMPLATE, { mode: 0o600 });
  try {
    fs.chmodSync(ENV_FILE, 0o600);
  } catch {}
  if (!quiet)
    console.log(
      C.dim(`i ${path.basename(ENV_FILE)} ${exists ? 'diisi template (file kosong)' : 'dibuat dengan template'} — edit: nano ${path.basename(ENV_FILE)}`),
    );
  return true;
}

let ENV = readEnvFile();
const envGet = (k, fb = null) => {
  const v = ENV[k] ?? process.env[k];
  return v !== undefined && v !== '' ? v : fb;
};

let AUTH_BASE = envGet('ALPHEA_AUTH_BASE', DEFAULT_AUTH_BASE);
let API_BASE = envGet('ALPHEA_API_BASE', DEFAULT_API_BASE);

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

const rand = (a, b) => a + Math.random() * (b - a);
const withJitter = (ms) => Math.round(Math.max(300, ms + rand(-0.25, 0.25) * ms));
const mask = (v, keep = 5) => {
  if (!v) return '\u2014';
  const s = String(v);
  return s.length <= keep * 2 ? '*'.repeat(s.length) : `${s.slice(0, keep)}\u2026${s.slice(-4)}`;
};

const GUARD = {
  minGapMs: Number(envGet('ALPHEA_MIN_GAP_MS', '2500')),
  maxRetries: Number(envGet('ALPHEA_MAX_RETRIES', '3')),
  backoffMs: Number(envGet('ALPHEA_BACKOFF_MS', '5000')),
  timeoutMs: Number(envGet('ALPHEA_TIMEOUT_MS', '20000')),
};

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) flags[k] = true;
      else {
        flags[k] = next;
        i++;
      }
    } else positional.push(a);
  }
  return { cmd: positional[0], args: positional.slice(1), flags };
}

async function ask(prompt, { mask: masked = false } = {}) {
  if (!stdin.isTTY) {
    const chunks = [];
    for await (const c of stdin) chunks.push(c);
    return Buffer.concat(chunks).toString('utf8').split('\n')[0].trim();
  }
  if (!masked) {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    try {
      return (await rl.question(prompt)).trim();
    } finally {
      rl.close();
    }
  }
  stdout.write(prompt);
  return await new Promise((resolve) => {
    let buf = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (ch) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          stdout.write('\n');
          resolve(buf.trim());
          return;
        }
        if (c === '') process.exit(130);
        if (c === '') {
          buf = buf.slice(0, -1);
          continue;
        }
        buf += c;
        stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

class ApiError extends Error {
  constructor({ code, message, http, path: p, body }) {
    super(`${code ?? 'ERROR'}${http ? ` (HTTP ${http})` : ''}${message ? `: ${message}` : ''}`);
    this.code = code;
    this.http = http;
    this.path = p;
    this.body = body;
  }
}

const session = {
  accessToken: envGet('ALPHEA_ACCESS_TOKEN'),
  refreshToken: envGet('ALPHEA_REFRESH_TOKEN'),
};
const isDebug = () => process.env.ALPHEA_DEBUG === '1';

function maskDeep(v, d = 0) {
  if (v === null || v === undefined) return v;
  if (typeof v === 'string') return v.length > 180 ? `${v.slice(0, 180)}\u2026` : v;
  if (typeof v !== 'object' || d > 4) return v;
  if (Array.isArray(v)) return v.slice(0, 4).map((x) => maskDeep(x, d + 1));
  const o = {};
  for (const [k, val] of Object.entries(v)) {
    o[k] = /token|password|secret|key/i.test(k) && typeof val === 'string' ? mask(val, 6) : maskDeep(val, d + 1);
  }
  return o;
}

let lastWriteAt = 0;
async function pace(method) {
  if (method === 'GET') return;
  const gap = withJitter(GUARD.minGapMs);
  if (Date.now() - lastWriteAt < gap) await sleep(gap - (Date.now() - lastWriteAt));
  lastWriteAt = Date.now();
}

async function send(method, url, { body, auth = true, timeoutMs = GUARD.timeoutMs } = {}) {
  await pace(method);
  for (let attempt = 0; ; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && session.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;
    let res;
    try {
      res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal: ac.signal });
    } catch (e) {
      clearTimeout(timer);
      if (attempt < GUARD.maxRetries) {
        const w = withJitter(GUARD.backoffMs * 2 ** attempt);
        log(C.y(`  network error \u2014 retry ${attempt + 1}/${GUARD.maxRetries} dalam ${Math.round(w / 1000)}s`));
        await sleep(w);
        continue;
      }
      throw new ApiError({ code: 'NETWORK', message: String(e?.message ?? e) });
    }
    clearTimeout(timer);

    if (res.status === 429 || res.status >= 500) {
      const ra = Number(res.headers.get('retry-after'));
      if (attempt < GUARD.maxRetries) {
        const w = withJitter(Number.isFinite(ra) && ra > 0 ? ra * 1000 : GUARD.backoffMs * 2 ** attempt);
        log(C.y(`  HTTP ${res.status} \u2014 cooldown ${Math.round(w / 1000)}s`));
        await sleep(w);
        continue;
      }
    }

    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {}
    if (isDebug()) {
      console.log(C.dim(`  [debug] ${method} ${url} \u2192 ${res.status}`));
      console.log(C.dim(`  [debug] ${JSON.stringify(maskDeep(json ?? text)).slice(0, 500)}`));
    }
    return { status: res.status, ok: res.ok, json, text };
  }
}

// ---------------------------------------------------------------------------
// Auth (GoTrue)
// ---------------------------------------------------------------------------

const SVC = {
  auth: 'alphea.connect.v1.AuthService',
  profile: 'alphea.connect.v1.ProfileService',
  reward: 'alphea.connect.v1.RewardService',
  wallet: 'alphea.connect.v1.WalletService',
  referral: 'alphea.connect.v1.ReferralService',
  quest: 'alphea.connect.v1.QuestService',
  activity: 'alphea.connect.v1.ActivityService',
  bootstrap: 'alphea.connect.v1.BootstrapService',
};

/** Panggil RPC gateway: POST {edge}/{service}/{method} */
async function rpc(service, method, body = {}, { auth = true } = {}) {
  const r = await send('POST', `${API_BASE}/${service}/${method}`, { body, auth });
  if (!r.ok) {
    throw new ApiError({
      code: r.json?.code ?? `HTTP_${r.status}`,
      message: r.json?.message ?? (r.text || '').slice(0, 120),
      http: r.status,
      path: `${service.split('.').pop()}/${method}`,
      body: r.json,
    });
  }
  return r.json ?? {};
}

/** Minta kode OTP. delivery: EMAIL_DELIVERY_OTP */
async function requestCode(email) {
  const r = await rpc(SVC.auth, 'RequestEmailChallenge', { email, delivery: 'EMAIL_DELIVERY_OTP' }, { auth: false });
  if (!r.challengeId) throw new ApiError({ code: 'NO_CHALLENGE', message: 'respons tanpa challengeId' });
  return r;
}

/** Tukar kode OTP jadi sesi. */
async function verifyCode(email, code, challengeId) {
  return rpc(SVC.auth, 'VerifyEmailChallenge', { email, code, challenge_id: challengeId }, { auth: false });
}

function extractSession(payload) {
  const root = payload ?? {};
  const seen = new Set();
  const walk = (o, d = 0) => {
    if (!o || typeof o !== 'object' || seen.has(o) || d > 3) return null;
    seen.add(o);
    const at = o.accessToken ?? o.access_token ?? o.sessionToken ?? o.token;
    if (typeof at === 'string' && at.length > 10) {
      return {
        accessToken: at,
        refreshToken: o.refreshToken ?? o.refresh_token ?? root.refreshToken ?? root.refresh_token ?? null,
        user: o.user ?? root.user ?? null,
      };
    }
    for (const v of Object.values(o)) {
      if (v && typeof v === 'object') {
        const hit = walk(v, d + 1);
        if (hit) return hit;
      }
    }
    return null;
  };
  return walk(root);
}

function adoptAuth(payload) {
  const t = extractSession(payload);
  if (!t) throw new ApiError({ code: 'NO_TOKEN', message: `respons tanpa accessToken (field: ${Object.keys(payload ?? {}).join(', ') || 'kosong'})` });
  writeEnvFile({ ALPHEA_ACCESS_TOKEN: t.accessToken, ALPHEA_REFRESH_TOKEN: t.refreshToken ?? '' });
  ENV = readEnvFile();
  session.accessToken = t.accessToken;
  session.refreshToken = t.refreshToken ?? session.refreshToken;
  return t.user ?? null;
}

async function refreshSession() {
  if (!session.refreshToken) return false;
  for (const body of [{ refresh_token: session.refreshToken }, { refreshToken: session.refreshToken }]) {
    try {
      const r = await rpc(SVC.auth, 'RefreshSession', body, { auth: false });
      const t = extractSession(r);
      if (t) {
        adoptAuth(r);
        return true;
      }
    } catch {
      /* coba bentuk berikutnya */
    }
  }
  return false;
}

async function currentSession({ retry = true } = {}) {
  try {
    return await rpc(SVC.auth, 'CurrentSession', {});
  } catch (e) {
    if ((e.http === 401 || e.code === 'unauthenticated') && retry && (await refreshSession())) {
      return currentSession({ retry: false });
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

function printUser(u) {
  if (!u) return console.log(C.y('(profil kosong)'));
  const obj = u.user ?? u;
  section('akun');
  const label = {
    email: 'email',
    userId: 'id',
    id: 'id',
    authUserId: 'authUserId',
    username: 'username',
    displayName: 'nama',
    createdAt: 'dibuat',
    createdTime: 'dibuat',
    lastSignInAt: 'login terakhir',
    lastLoginAt: 'login terakhir',
    emailVerified: 'email verified',
    emailConfirmed: 'email verified',
  };
  const scalars = Object.entries(obj).filter(([, v]) => v === null || typeof v !== 'object');
  // email duluan, sisanya urutan asli
  scalars.sort((a, b) => (a[0] === 'email' ? -1 : b[0] === 'email' ? 1 : 0));
  let shown = 0;
  for (const [k, v] of scalars) {
    let val = v;
    if (typeof v === 'string' && /At$|Time$|_at$/.test(k) && !Number.isNaN(Date.parse(v))) val = new Date(v).toLocaleString();
    if (/verified|confirmed/i.test(k)) val = v ? C.g('ya') : C.y('belum');
    if (v === '' || v === null) val = C.dim('(kosong)');
    kv(label[k] ?? k, String(val).slice(0, 60));
    shown++;
  }
  if (!shown) {
    console.log(C.dim(`  field: ${Object.keys(obj).join(', ') || '(kosong)'}`));
    console.log(C.dim(`  ${JSON.stringify(obj).slice(0, 300)}`));
  }
}

async function cmdLogin(flags) {
  if (flags.debug === true) process.env.ALPHEA_DEBUG = '1';
  const email = typeof flags.email === 'string' ? flags.email : envGet('ALPHEA_EMAIL');
  if (!email) die('pakai --email <email> atau isi ALPHEA_EMAIL di .env');

  let code = typeof flags.otp === 'string' ? flags.otp : null;
  let challengeId = envGet('ALPHEA_CHALLENGE_ID');

  if (!code || flags.resend === true || !challengeId) {
    console.log(C.dim(`\u2192 RequestEmailChallenge  (${email})`));
    try {
      const r = await requestCode(email);
      challengeId = r.challengeId;
      writeEnvFile({ ALPHEA_EMAIL: email, ALPHEA_CHALLENGE_ID: challengeId });
      ENV = readEnvFile();
      console.log(C.g('\u2714 kode dikirim ke email'));
      if (r.serverTime) console.log(C.dim(`  serverTime ${r.serverTime}`));
    } catch (e) {
      if (e.code === 'resource_exhausted' || e.http === 429) die('terlalu sering minta kode \u2014 tunggu beberapa menit');
      throw e;
    }
  }

  if (!code) {
    if (!stdin.isTTY) die('kode kosong \u2014 jalankan: node alphea.js login --otp 123456');
    code = (await ask('Kode OTP (dari email): ')).trim();
    if (!code) die('dibatalkan');
  }

  console.log(C.dim('\u2192 VerifyEmailChallenge'));
  let data;
  try {
    data = await verifyCode(email, code, challengeId);
  } catch (e) {
    if (e.code === 'invalid_argument') die('kode salah atau kedaluwarsa \u2014 minta kode baru: node alphea.js login --resend');
    throw e;
  }

  const user = adoptAuth(data);
  writeEnvFile({ ALPHEA_CHALLENGE_ID: '' });
  ENV = readEnvFile();
  console.log(C.g(`\u2714 login OK \u2014 token ditulis ke ${ENV_FILE}`));
  if (user) printUser(user);
  else {
    const cur = await currentSession().catch(() => null);
    if (cur) printUser(cur.user ?? cur);
  }
}

async function cmdOtp(flags) {
  const email = typeof flags.email === 'string' ? flags.email : envGet('ALPHEA_EMAIL');
  if (!email) die('pakai --email <email> atau isi ALPHEA_EMAIL di .env');
  console.log(C.dim(`\u2192 RequestEmailChallenge  (${email})`));
  const r = await requestCode(email);
  writeEnvFile({ ALPHEA_EMAIL: email, ALPHEA_CHALLENGE_ID: r.challengeId });
  ENV = readEnvFile();
  console.log(C.g('\u2714 kode OTP dikirim ke email'));
  console.log(C.dim(`  challengeId ${mask(r.challengeId, 8)}`));
  console.log(C.dim('  lanjut: node alphea.js login --otp <kode>'));
}

async function cmdSetup(flags) {
  ensureEnvFile({ quiet: true });
  if (envGet('ALPHEA_EMAIL') && flags.force !== true) {
    console.log(C.y('email sudah ada di .env'));
    return console.log(C.dim('  timpa: node alphea.js setup --force   |   edit: node alphea.js edit'));
  }
  let email = typeof flags.email === 'string' ? flags.email : null;
  if (!email && stdin.isTTY) email = await ask('Email: ');
  if (!email) die('pakai: node alphea.js setup --email you@mail.com');

  console.log(C.dim(`\u2192 RequestEmailChallenge  (${email})`));
  let r;
  try {
    r = await requestCode(email);
  } catch (e) {
    console.log(C.y(`  ${e.message}`));
    if (flags.force !== true) die('tidak disimpan \u2014 email belum bisa dipakai login');
  }
  writeEnvFile({ ALPHEA_EMAIL: email });
  ENV = readEnvFile();
  console.log(C.g(`\u2714 ${ENV_FILE} tersimpan (chmod 600)`));

  if (r) {
    writeEnvFile({ ALPHEA_CHALLENGE_ID: r.challengeId });
    ENV = readEnvFile();
    console.log(C.g('\u2714 kode dikirim ke email'));
    let code = typeof flags.otp === 'string' ? flags.otp : null;
    if (!code && stdin.isTTY) code = (await ask('Kode OTP (Enter untuk lewati): ')).trim();
    if (code) {
      const data = await verifyCode(email, code, r.challengeId).catch((e) => {
        console.log(C.y(`  ${e.message}`));
        return null;
      });
      if (data) {
        adoptAuth(data);
        console.log(C.g('\u2714 login berhasil \u2014 siap: node alphea.js me'));
      }
    }
  }
}

function cmdEdit() {
  ensureEnvFile();
  if (!stdin.isTTY) return console.log(`  nano ${ENV_FILE}`);
  const ed = process.env.ALPHEA_EDITOR || process.env.EDITOR || (process.platform === 'win32' ? 'notepad' : 'nano');
  const cands = ed === 'nano' || ed === 'notepad' ? (process.platform === 'win32' ? ['notepad'] : ['nano', 'vim', 'vi']) : [ed];
  for (const e of cands) {
    const r = spawnSync(e, [ENV_FILE], { stdio: 'inherit' });
    if (r.error && r.error.code === 'ENOENT') {
      console.log(C.y(`editor "${e}" tidak ada \u2014 tanpa editor: node alphea.js setup`));
      continue;
    }
    ENV = readEnvFile();
    AUTH_BASE = envGet('ALPHEA_AUTH_BASE', DEFAULT_AUTH_BASE);
    API_BASE = envGet('ALPHEA_API_BASE', DEFAULT_API_BASE);
    session.accessToken = envGet('ALPHEA_ACCESS_TOKEN');
    session.refreshToken = envGet('ALPHEA_REFRESH_TOKEN');
    return console.log(C.dim(`i ${ENV_FILE} dimuat ulang`));
  }
  die('tidak ada editor');
}

function cmdEnv() {
  console.log(C.b(`\u2014 ${ENV_FILE} \u2014`));
  if (!fs.existsSync(ENV_FILE)) return console.log(C.y('  (belum ada) \u2014 jalankan: node alphea.js'));
  if (!envGet('ALPHEA_EMAIL') && !envGet('ALPHEA_ACCESS_TOKEN')) {
    console.log(C.y(`  (belum ada email terisi \u2014 ${fs.statSync(ENV_FILE).size} byte)`));
    return console.log(C.dim('  isi: node alphea.js setup   atau   node alphea.js edit'));
  }
  for (const k of ['ALPHEA_EMAIL', 'ALPHEA_ACCESS_TOKEN', 'ALPHEA_REFRESH_TOKEN', 'ALPHEA_CHALLENGE_ID', 'ALPHEA_DEVICE_ID', 'ALPHEA_SESSION_ID', 'ALPHEA_API_BASE']) {
    if (ENV[k]) console.log(`  ${k.padEnd(22)} ${/TOKEN|CHALLENGE/.test(k) ? mask(ENV[k], 6) : ENV[k]}`);
  }
  try {
    console.log(C.dim(`  mode ${(fs.statSync(ENV_FILE).mode & 0o777).toString(8)}  size ${fs.statSync(ENV_FILE).size}B`));
  } catch {}
}

async function cmdLogout() {
  if (session.accessToken) await rpc(SVC.auth, 'Logout', {}).catch(() => {});
  writeEnvFile({ ALPHEA_ACCESS_TOKEN: '', ALPHEA_REFRESH_TOKEN: '', ALPHEA_CHALLENGE_ID: '' });
  ENV = readEnvFile();
  session.accessToken = null;
  session.refreshToken = null;
  console.log(C.g('\u2714 token dihapus dari .env (email tetap)'));
}

// --- Foreground Contribution Session ---------------------------------------

function getDeviceId() {
  let id = envGet('ALPHEA_DEVICE_ID');
  if (id) return id;
  id = crypto.randomUUID();
  writeEnvFile({ ALPHEA_DEVICE_ID: id });
  ENV = readEnvFile();
  return id;
}

const SESSION_KEY = () => envGet('ALPHEA_SESSION_ID');

function setSessionId(id) {
  writeEnvFile({ ALPHEA_SESSION_ID: id ?? '' });
  ENV = readEnvFile();
}

/** Coba beberapa bentuk body; 401 tidak diulang karena bukan soal bentuk. */
async function rpcCandidates(service, method, bodies) {
  const errs = [];
  for (const body of bodies) {
    try {
      const r = await rpc(service, method, body);
      return { ok: true, data: r, body };
    } catch (e) {
      errs.push(`${Object.keys(body).join('+') || '(kosong)'} → ${e.code}`);
      if (e.http === 401 || e.code === 'unauthenticated') break;
    }
  }
  throw new ApiError({ code: 'RPC_FAILED', message: errs.join(' | ') });
}

async function startSession() {
  const deviceId = getDeviceId();
  const r = await rpcCandidates(SVC.activity, 'StartForegroundSession', [
    { deviceId },
    { deviceId, platform: 'android' },
    {},
  ]);
  const sid = r.data?.sessionId ?? r.data?.session?.sessionId ?? r.data?.session?.id ?? r.data?.id;
  if (sid) setSessionId(sid);
  section('session');
  console.log(`  ${C.g('\u2714')} StartForegroundSession ${C.dim(`(body: ${Object.keys(r.body).join(', ') || 'kosong'})`)}`);
  if (sid) kv('sessionId', C.b(sid));
  else console.log(C.dim(`  respons: ${JSON.stringify(r.data).slice(0, 200)}`));
  return sid;
}

async function stopSession(flags) {
  const sid = (typeof flags.session === 'string' ? flags.session : null) ?? SESSION_KEY();
  const r = await rpcCandidates(SVC.activity, 'EndForegroundSession', sid ? [{ sessionId: sid }, { session_id: sid }, {}] : [{}]);
  setSessionId('');
  section('session');
  console.log(`  ${C.g('\u2714')} EndForegroundSession`);
  console.log(C.dim(`  respons: ${JSON.stringify(r.data).slice(0, 200)}`));
}

async function heartbeatOnce(sid) {
  const body = sid ? { sessionId: sid } : {};
  return rpc(SVC.activity, 'SubmitHeartbeat', body);
}

async function cmdSession(flags, args) {
  if (!session.accessToken) die('belum login \u2014 jalankan: node alphea.js login');
  const sub = args[0] ?? 'status';

  if (sub === 'start') {
    const sid = await startSession();
    if (flags.watch === true && sid) return watchSession(sid, flags);
    return;
  }
  if (sub === 'stop') return stopSession(flags);
  if (sub === 'ping') {
    const sid = (typeof flags.session === 'string' ? flags.session : null) ?? SESSION_KEY();
    const r = await heartbeatOnce(sid);
    console.log(C.g('\u2714') + ' SubmitHeartbeat');
    console.log(JSON.stringify(r).slice(0, 300));
    return;
  }
  if (sub === 'watch') {
    const sid = SESSION_KEY();
    if (!sid) die('tidak ada session \u2014 jalankan dulu: node alphea.js session start');
    return watchSession(sid, flags);
  }

  // status
  const cur = await currentSession().catch(() => null);
  section('session');
  const sid = SESSION_KEY();
  kv('session aktif', sid ? C.g(sid) : C.dim('tidak ada di .env'));
  if (cur) {
    const st = cur.sessionStatus ?? cur.session ?? cur.user?.sessionStatus;
    if (st) kv('status server', typeof st === 'object' ? JSON.stringify(st).slice(0, 120) : st);
  }
}

/** Kirim heartbeat berkala; Ctrl+C mengakhiri sesi dengan rapi. */
async function watchSession(sid, flags) {
  const everySec = Math.max(15, Number(flags.interval ?? 60));
  console.log(C.b('session watch') + C.dim(` \u2014 heartbeat tiap ${everySec}s, Ctrl+C untuk berhenti`));
  let stop = false;
  process.on('SIGINT', async () => {
    stop = true;
    console.log('');
    log('menghentikan session\u2026');
    await stopSession({}).catch(() => {});
    process.exit(0);
  });
  let n = 0;
  while (!stop) {
    try {
      const r = await heartbeatOnce(sid);
      n++;
      const valid = r.validSeconds ?? r.valid_seconds ?? r.session?.validSeconds;
      log(`heartbeat #${n}${valid !== undefined ? ` \u00b7 valid ${valid}s` : ''}`);
    } catch (e) {
      log(C.y(`heartbeat gagal: ${e.message}`));
      if (e.http === 401) die('token ditolak \u2014 jalankan: node alphea.js login', 3);
    }
    await sleep(everySec * 1000 + Math.round(Math.random() * 3000));
  }
}

// --- Quests & daily check-in ------------------------------------------------

const QUEST_STATE = {
  QUEST_STATE_LOCKED: 'terkunci',
  QUEST_STATE_IN_PROGRESS: 'berjalan',
  QUEST_STATE_CLAIMABLE: 'bisa diklaim',
  QUEST_STATE_CLAIMED: 'sudah',
};

const PERIOD_LABEL = {
  QUEST_PERIOD_DAILY: 'harian',
  QUEST_PERIOD_WEEKLY: 'mingguan',
  QUEST_PERIOD_LIFETIME: 'lifetime',
};

const METRIC_LABEL = {
  QUEST_METRIC_VALID_FOREGROUND_SECONDS: 'waktu kontribusi',
  QUEST_METRIC_AUTHENTICATED_LOGIN_COUNT: 'jumlah login',
  QUEST_METRIC_ACTIVE_INVITEE_COUNT: 'referral aktif',
  QUEST_METRIC_VALID_INVITEE_COUNT: 'referral qualified',
};

const qNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** reward.micros → poin (1 poin = 1.000.000 micros) */
function fmtMicros(v) {
  const n = Number(v?.micros ?? v ?? 0) / 1e6;
  if (!Number.isFinite(n)) return '?';
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function qName(q, map) {
  const fromMap = map?.[q.questId]?.names?.en;
  return fromMap ?? q.questId;
}

function fmtSeconds(sec) {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  if (h > 0) return `${h}j ${m}m`;
  if (m > 0) return `${m}m ${rest}s`;
  return `${rest}s`;
}

function fmtProgress(q) {
  const cur = qNum(q.measuredValue);
  const target = qNum(q.targetValue);
  if (!target) return `${cur}`;
  if (q.metric === 'QUEST_METRIC_VALID_FOREGROUND_SECONDS') return `${fmtSeconds(cur)} / ${fmtSeconds(target)}`;
  return `${cur}/${target}`;
}

function progressBar(q, width = 14) {
  const cur = qNum(q.measuredValue);
  const target = qNum(q.targetValue) || 1;
  const pct = Math.max(0, Math.min(1, cur / target));
  const f = Math.round(pct * width);
  return `${C.c('\u2588'.repeat(f) + '\u2591'.repeat(width - f))} ${(pct * 100).toFixed(0)}%`;
}

function questList(payload) {
  const arr = payload?.quests ?? payload?.items ?? payload?.data ?? [];
  return Array.isArray(arr) ? arr : [];
}

function sortQuests(list) {
  const rank = (q) => (q.state === 'QUEST_STATE_CLAIMABLE' ? 0 : q.state === 'QUEST_STATE_IN_PROGRESS' ? 1 : q.state === 'QUEST_STATE_LOCKED' ? 2 : 3);
  return [...list].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    const da = a.period === 'QUEST_PERIOD_DAILY' ? 0 : 1;
    const db = b.period === 'QUEST_PERIOD_DAILY' ? 0 : 1;
    return da - db;
  });
}

function showQuests(list, map) {
  const claimable = list.filter((q) => q.state === 'QUEST_STATE_CLAIMABLE');
  section(`quests (${list.length}${claimable.length ? ` \u00b7 ${claimable.length} bisa diklaim` : ''})`);
  if (!list.length) return console.log(C.y('  belum ada quest dari server'));

  for (const q of sortQuests(list)) {
    const mark =
      q.state === 'QUEST_STATE_CLAIMABLE' ? C.g('\u25cf') : q.state === 'QUEST_STATE_CLAIMED' ? C.dim('\u2714') : C.dim('\u25cb');
    const period = PERIOD_LABEL[q.period] ?? (q.period ?? '').replace('QUEST_PERIOD_', '').toLowerCase();
    const state = QUEST_STATE[q.state] ?? (q.state ?? '?').replace('QUEST_STATE_', '').toLowerCase();
    console.log(`  ${mark} ${C.b(qName(q, map).slice(0, 34))} ${C.dim(`\u00b7 ${period}`)}`);
    const bits = [state, fmtProgress(q), `${fmtMicros(q.reward)} pts`];
    if (q.metric === 'QUEST_METRIC_VALID_FOREGROUND_SECONDS' && q.state === 'QUEST_STATE_IN_PROGRESS') bits.push(progressBar(q));
    console.log(C.dim(`      ${bits.join('  \u00b7 ')}`));
  }
  console.log(C.dim('\n  \u25cf bisa diklaim   \u2714 sudah   \u25cb belum'));
}

async function fetchQuests() {
  const r = await rpc(SVC.quest, 'ListQuests', {});
  return { raw: r, list: questList(r), map: r.questDisplayNames ?? {} };
}

async function cmdQuests(flags) {
  if (!session.accessToken) die('belum login \u2014 jalankan: node alphea.js login');
  const { raw, list, map } = await fetchQuests();
  if (flags.json) return console.log(JSON.stringify(raw, null, 2));
  showQuests(list, map);
}

async function claimQuest(id) {
  return rpcCandidates(SVC.quest, 'ClaimQuest', [{ questId: id }, { quest_id: id }]);
}

/** Klaim semua quest yang state-nya CLAIMABLE (termasuk Daily Check-In). */
async function cmdCheckin(flags) {
  if (!session.accessToken) die('belum login \u2014 jalankan: node alphea.js login');
  const { list, map } = await fetchQuests();
  const claimable = list.filter((q) => q.state === 'QUEST_STATE_CLAIMABLE');

  if (flags.json) return console.log(JSON.stringify({ claimable }, null, 2));

  section(`check-in (${claimable.length} bisa diklaim)`);
  if (!claimable.length) {
    const daily = list.filter((q) => q.period === 'QUEST_PERIOD_DAILY' && q.state === 'QUEST_STATE_IN_PROGRESS');
    if (daily.length) {
      console.log(C.dim('  belum ada yang bisa diklaim. Yang masih berjalan:'));
      for (const q of daily.slice(0, 6)) console.log(C.dim(`    ${qName(q, map)} \u2014 ${fmtProgress(q)}`));
    } else {
      console.log(C.dim('  semua quest harian sudah diklaim'));
    }
    return;
  }

  for (const q of claimable) {
    const id = q.questId;
    try {
      const r = await claimQuest(id);
      const got = r.data?.reward ?? r.data?.points ?? q.reward;
      console.log(`  ${C.g('\u2714')} ${qName(q, map)} ${C.dim(`+${fmtMicros(got)} pts`)}`);
    } catch (e) {
      console.log(`  ${C.y('\u2716')} ${qName(q, map)} ${C.dim(e.message)}`);
    }
  }
}

async function cmdPoints(flags) {
  if (!session.accessToken) die('belum login \u2014 jalankan: node alphea.js login');
  const out = {};
  for (const [label, svc, method] of [
    ['summary', SVC.reward, 'GetPointSummary'],
    ['balance', SVC.wallet, 'GetPointBalance'],
    ['claimable', SVC.reward, 'GetClaimableRewards'],
  ]) {
    try {
      out[label] = await rpc(svc, method, {});
    } catch (e) {
      out[label] = { error: e.code, message: e.message };
    }
  }
  if (flags.json) return console.log(JSON.stringify(out, null, 2));
  section('points');
  for (const [k, v] of Object.entries(out)) {
    if (v?.error) kv(k, C.r(v.error));
    else kv(k, JSON.stringify(v).slice(0, 120));
  }
}

async function cmdProfile(flags) {
  if (!session.accessToken) die('belum login \u2014 jalankan: node alphea.js login');
  const p = await rpc(SVC.profile, 'GetProfile', {});
  if (flags.json) return console.log(JSON.stringify(p, null, 2));
  section('profil');
  const prof = p.profile ?? p;
  for (const [k, v] of Object.entries(prof)) {
    if (v === null || typeof v === 'object') continue;
    kv(k, String(v).slice(0, 60));
  }
}

async function cmdHistory(flags) {
  if (!session.accessToken) die('belum login \u2014 jalankan: node alphea.js login');
  const h = await rpc(SVC.wallet, 'GetPointHistory', {});
  console.log(JSON.stringify(h, null, 2));
}

async function cmdRounds(flags) {
  if (!session.accessToken) die('belum login \u2014 jalankan: node alphea.js login');
  const r = await rpc(SVC.reward, 'ListRewardRounds', {});
  if (flags.json) return console.log(JSON.stringify(r, null, 2));
  const rounds = r.rounds ?? r.items ?? [];
  section(`reward rounds (${rounds.length})`);
  for (const x of rounds.slice(0, 10)) {
    kv(x.id ?? x.roundId ?? '?', `${x.status ?? ''} ${x.startsAt ?? ''}`.trim().slice(0, 60));
  }
  if (!rounds.length) console.log(JSON.stringify(r).slice(0, 400));
}

const PROBES = [
  '/healthz',
  '/v1/me',
  '/v1/profile',
  '/v1/account',
  '/v1/points',
  '/v1/balance',
  '/v1/contribution',
  '/v1/rounds',
  '/v1/seasons',
  '/v1/activities',
  '/v1/quests',
  '/v1/missions',
  '/v1/claims',
  '/v1/claim',
  '/v1/redeem',
  '/v1/referral',
  '/v1/referrals',
  '/v1/devices',
  '/v1/sessions',
  '/v1/connect/session',
  '/v1/wallet',
  '/v1/announcements',
];

async function cmdProbe(flags) {
  if (!session.accessToken) die('belum login \u2014 jalankan: node alphea.js login');
  section('probe endpoint edge');
  const rows = [];
  for (const p of PROBES) {
    const r = await send('GET', `${API_BASE}${p}`).catch((e) => ({ status: 0, text: e.message }));
    const mark = r.status === 200 ? C.g('\u25cf') : r.status === 401 || r.status === 403 ? C.y('\u25d0') : r.status === 404 ? C.dim('\u25cb') : C.y('\u25d1');
    const note = r.status === 200 ? C.g('200') : r.status === 401 ? C.y('401 perlu auth') : r.status === 404 ? C.dim('404') : String(r.status);
    rows.push(`  ${mark} ${p.padEnd(24)} ${note}`);
    if (r.status === 200) rows.push(C.dim(`      ${(r.text ?? '').slice(0, 160)}`));
  }
  console.log(rows.join('\n'));
  console.log(C.dim('\n  \u25cf hidup   \u25d0 butuh auth lain   \u25cb tidak ada'));
}

async function cmdGet(flags, args) {
  if (!session.accessToken) die('belum login \u2014 jalankan: node alphea.js login');
  const p = flags.path ?? args[0];
  if (!p) die('pakai: node alphea.js get /v1/...');
  const r = await send('GET', p.startsWith('http') ? p : `${API_BASE}${p.startsWith('/') ? p : '/' + p}`);
  console.log(JSON.stringify(r.json ?? r.text, null, 2));
}

async function cmdPost(flags, args) {
  if (!session.accessToken) die('belum login \u2014 jalankan: node alphea.js login');
  const p = args[0];
  if (!p) die("pakai: node alphea.js post /v1/... '{\"k\":1}'");
  let body;
  try {
    body = args[1] ? JSON.parse(args[1]) : {};
  } catch {
    die('body harus JSON');
  }
  const r = await send('POST', `${API_BASE}${p.startsWith('/') ? p : '/' + p}`, { body });
  console.log(JSON.stringify(r.json ?? r.text, null, 2));
}

function help() {
  banner();
  console.log(`
${C.b('PENGGUNAAN')}
  node alphea.js <perintah> [opsi]

${C.b('PERINTAH')}
  ${C.c('setup')}     isi .env tanpa editor (kredensial diuji dulu)
  ${C.c('edit')}      buka .env di editor
  ${C.c('login')}     login email + kode OTP (--otp untuk non-interaktif, --resend minta kode baru)
  ${C.c('otp')}       kirim kode OTP saja (tanpa langsung login)
  ${C.c('me')}        sesi & profil dari AuthService/CurrentSession
  ${C.c('points')}    poin: summary, balance, claimable
  ${C.c('profile')}   profil dari ProfileService
  ${C.c('history')}   riwayat poin
  ${C.c('rounds')}    daftar reward round
  ${C.c('session')}   foreground session: start | stop | ping | watch | status
  ${C.c('quests')}    daftar quest + progres
  ${C.c('checkin')}   klaim quest harian yang bisa diklaim
  ${C.c('probe')}     cek endpoint edge mana yang hidup dengan tokenmu
  ${C.c('env')}       lihat .env (disamarkan)
  ${C.c('logout')}    hapus token dari .env
  ${C.c('about')}     info script & author
  ${C.c('get')} / ${C.c('post')}   panggil endpoint edge apa pun

${C.b('OPSI')}
  --json    keluaran JSON mentah
  --debug   tampilkan request/response
  --force   timpa .env saat setup

${C.dim('gateway : ' + API_BASE)}
${C.dim('api  : ' + API_BASE)}`);
  authorBox();
  console.log('');
}

function about() {
  banner();
  authorBox();
  console.log('');
  console.log(`  ${C.dim('script')}     alphea.js v${BRAND.version}`);
  console.log(`  ${C.dim('target')}     ${BRAND.app} (Hub / Connect)`);
  console.log(`  ${C.dim('auth')}       GoTrue @ ${AUTH_BASE}`);
  console.log(`  ${C.dim('node')}       ${process.version}`);
  console.log('');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { cmd, args, flags } = parseArgs(process.argv.slice(2));
  if (ensureEnvFile()) ENV = readEnvFile();
  if (flags.env) process.env.ALPHEA_ENV_FILE = String(flags.env);

  if (!cmd || cmd === 'help' || flags.help) return help();
  if (cmd === 'about') return about();
  if (cmd === 'version' || flags.version === true) return console.log(`alphea.js v${BRAND.version}`);

  switch (cmd) {
    case 'setup':
      return cmdSetup(flags);
    case 'edit':
      return cmdEdit();
    case 'env':
      return cmdEnv();
    case 'logout':
      return cmdLogout();
    case 'login':
      return cmdLogin(flags);
    case 'otp':
    case 'send-code':
      return cmdOtp(flags);
    case 'me':
      return cmdMe(flags);
    case 'points':
      return cmdPoints(flags);
    case 'profile':
      return cmdProfile(flags);
    case 'history':
      return cmdHistory(flags);
    case 'rounds':
      return cmdRounds(flags);
    case 'session':
      return cmdSession(flags, args);
    case 'quests':
      return cmdQuests(flags);
    case 'checkin':
      return cmdCheckin(flags);
    case 'probe':
      return cmdProbe(flags);
    case 'get':
      return cmdGet(flags, args);
    case 'post':
      return cmdPost(flags, args);
    default:
      return die(`command tidak dikenal: ${cmd}`);
  }
}

main().catch((e) => {
  if (e instanceof ApiError) {
    console.error(C.r(`\u2716 ${e.message}`));
    if (e.body && isDebug()) console.error(C.dim(JSON.stringify(maskDeep(e.body), null, 2)));
  } else console.error(C.r(`\u2716 ${e?.stack ?? e}`));
  process.exit(1);
});

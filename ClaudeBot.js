/**
 * testbot.js
 *
 * Repeatable site tester (for domains you own)
 * All 27 improvements integrated.
 *
 * Usage:
 *   npm i puppeteer-extra puppeteer-extra-plugin-stealth puppeteer chalk csv-writer
 *   node testbot.js <target_url> <referrer_url> [options] --confirm-owned
 *
 * Flags:
 *   --sessions=<n>          Number of sessions to run (default: 1)
 *   --proxy=<host:port>     Single proxy (user:pass@host:port supported)
 *   --proxy-file=<file>     File with one proxy per line
 *   --config=<file.json>    Load all settings from JSON config
 *   --min-dwell=<ms>        Min page dwell time in ms (default: 8000)
 *   --max-dwell=<ms>        Max page dwell time in ms (default: 45000)
 *   --max-pages=<n>         Max internal pages to visit per session (default: 5)
 *   --bounce-rate=<0-1>     Probability session bounces after landing (default: 0.25)
 *   --return-rate=<0-1>     Probability session simulates return visitor (default: 0.15)
 *   --ad-click-rate=<0-1>   Probability of clicking an ad element (default: 0.06)
 *   --headless=<bool>       Run headless (default: true)
 *   --dry-run               Print config and exit without launching browser
 *   --log-file=<file>       CSV log path (default: sessions_log.csv)
 *   --cookie-dir=<dir>      Directory to persist cookies for return visits
 *   --referrer-file=<file>  File with one referrer URL per line to rotate
 *   --timezone=<tz>         IANA timezone string (randomized if omitted)
 *   --locale=<lc>           Locale string e.g. en-US (randomized if omitted)
 *   --confirm-owned         Required flag confirming you own the target domain
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

// ─── Color helpers (no dependency needed) ────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function logInfo(msg) {
  console.log(`${C.cyan}[INFO]${C.reset} ${msg}`);
}
function logOk(msg) {
  console.log(`${C.green}[OK]${C.reset} ${msg}`);
}
function logWarn(msg) {
  console.log(`${C.yellow}[WARN]${C.reset} ${msg}`);
}
function logErr(msg) {
  console.error(`${C.red}[ERR]${C.reset} ${msg}`);
}
function logSession(n, total, msg) {
  console.log(
    `${C.magenta}[${n}/${total}]${C.reset} ${C.bright}${msg}${C.reset}`
  );
}
function logDetail(msg) {
  console.log(`${C.gray}  ↳ ${msg}${C.reset}`);
}

// ─── Utility helpers ─────────────────────────────────────────────────────────
function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randFloat(min, max) {
  return Math.random() * (max - min) + min;
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function chance(prob) {
  return Math.random() < prob;
}

// ─── Argument parsing ────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { _positional: [] };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) {
        args[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        args[a.slice(2)] = true;
      }
    } else {
      args._positional.push(a);
    }
  }
  return args;
}

// ─── Config builder ──────────────────────────────────────────────────────────
function buildConfig(args) {
  let fileConfig = {};
  if (args['config']) {
    const cfgPath = path.resolve(args['config']);
    if (!fs.existsSync(cfgPath)) {
      logErr(`Config file not found: ${cfgPath}`);
      process.exit(1);
    }
    fileConfig = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
  }

  const get = (flag, jsonKey, fallback) => {
    if (args[flag] !== undefined) return args[flag];
    if (fileConfig[jsonKey || flag] !== undefined)
      return fileConfig[jsonKey || flag];
    return fallback;
  };

  const targetUrl = args._positional[0] || fileConfig.targetUrl || null;
  const referrerUrl = args._positional[1] || fileConfig.referrerUrl || null;

  const config = {
    targetUrl,
    referrerUrl,
    sessions: parseInt(get('sessions', 'sessions', 1), 10),
    proxy: get('proxy', 'proxy', null),
    proxyFile: get('proxy-file', 'proxyFile', null),
    minDwell: parseInt(get('min-dwell', 'minDwell', 8000), 10),
    maxDwell: parseInt(get('max-dwell', 'maxDwell', 45000), 10),
    maxPages: parseInt(get('max-pages', 'maxPages', 5), 10),
    bounceRate: parseFloat(get('bounce-rate', 'bounceRate', 0.25)),
    returnRate: parseFloat(get('return-rate', 'returnRate', 0.15)),
    adClickRate: parseFloat(get('ad-click-rate', 'adClickRate', 0.06)),
    headless: get('headless', 'headless', 'true') !== 'false',
    dryRun: get('dry-run', 'dryRun', false) === true || get('dry-run', 'dryRun', false) === 'true',
    logFile: get('log-file', 'logFile', 'sessions_log.csv'),
    cookieDir: get('cookie-dir', 'cookieDir', null),
    referrerFile: get('referrer-file', 'referrerFile', null),
    timezone: get('timezone', 'timezone', null),
    locale: get('locale', 'locale', null),
    confirmOwned: get('confirm-owned', 'confirmOwned', false),
  };

  return config;
}

// ─── Proxy loader ────────────────────────────────────────────────────────────
function loadProxies(config) {
  const proxies = [];
  if (config.proxyFile) {
    const pf = path.resolve(config.proxyFile);
    if (fs.existsSync(pf)) {
      const lines = fs
        .readFileSync(pf, 'utf-8')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      proxies.push(...lines);
    } else {
      logWarn(`Proxy file not found: ${pf}`);
    }
  }
  if (config.proxy) {
    proxies.push(config.proxy);
  }
  return proxies;
}

function parseProxy(proxyStr) {
  // Formats: host:port | user:pass@host:port | http://user:pass@host:port
  let cleaned = proxyStr.replace(/^https?:\/\//, '');
  let username = null;
  let password = null;
  let host, port;

  if (cleaned.includes('@')) {
    const atIdx = cleaned.indexOf('@');
    const creds = cleaned.slice(0, atIdx);
    const server = cleaned.slice(atIdx + 1);
    const credParts = creds.split(':');
    username = credParts[0];
    password = credParts.slice(1).join(':');
    const serverParts = server.split(':');
    host = serverParts[0];
    port = serverParts[1] || '8080';
  } else {
    const parts = cleaned.split(':');
    host = parts[0];
    port = parts[1] || '8080';
  }

  return { host, port, username, password, server: `${host}:${port}` };
}

// ─── Referrer loader ─────────────────────────────────────────────────────────
function loadReferrers(config) {
  const refs = [];
  if (config.referrerFile) {
    const rf = path.resolve(config.referrerFile);
    if (fs.existsSync(rf)) {
      const lines = fs
        .readFileSync(rf, 'utf-8')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      refs.push(...lines);
    }
  }
  if (config.referrerUrl) {
    refs.push(config.referrerUrl);
  }
  if (refs.length === 0) {
    refs.push(
      'https://www.google.com/',
      'https://www.bing.com/',
      'https://search.yahoo.com/',
      'https://duckduckgo.com/',
      'https://t.co/',
      'https://www.facebook.com/',
      'https://www.reddit.com/'
    );
  }
  return refs;
}

// ─── Cookie persistence (return visitor simulation) ──────────────────────────
function getCookiePath(cookieDir, profileId) {
  if (!cookieDir) return null;
  const dir = path.resolve(cookieDir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `profile_${profileId}.json`);
}

function loadCookies(cookiePath) {
  if (!cookiePath || !fs.existsSync(cookiePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(cookiePath, 'utf-8'));
  } catch {
    return null;
  }
}

function saveCookies(cookiePath, cookies) {
  if (!cookiePath) return;
  fs.writeFileSync(cookiePath, JSON.stringify(cookies, null, 2));
}

// ─── Fingerprint randomization pools ─────────────────────────────────────────
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
  'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
];

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 2560, height: 1440 },
  { width: 1600, height: 900 },
  { width: 1680, height: 1050 },
  { width: 1280, height: 800 },
  { width: 1920, height: 1200 },
];

const SCREEN_RESOLUTIONS = [
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 1366, height: 768 },
  { width: 3840, height: 2160 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
];

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Toronto',
  'Europe/London',
  'Europe/Berlin',
];

const LOCALES = [
  'en-US',
  'en-GB',
  'en-CA',
  'en-AU',
  'de-DE',
  'fr-FR',
  'es-ES',
];

const WEBGL_VENDORS = [
  'Google Inc. (NVIDIA)',
  'Google Inc. (AMD)',
  'Google Inc. (Intel)',
  'Google Inc.',
];

const WEBGL_RENDERERS = [
  'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
  'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',
  'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)',
  'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)',
  'ANGLE (AMD, AMD Radeon RX 580 Direct3D11 vs_5_0 ps_5_0, D3D11)',
  'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
];

const PLATFORM_MAP = {
  Windows: 'Win32',
  Macintosh: 'MacIntel',
  Linux: 'Linux x86_64',
  X11: 'Linux x86_64',
};

// ─── Bezier mouse movement ──────────────────────────────────────────────────
function bezierCurve(x0, y0, x1, y1, steps) {
  const points = [];
  const cx1 = x0 + (x1 - x0) * randFloat(0.1, 0.5);
  const cy1 = y0 + (y1 - y0) * randFloat(-0.3, 0.3);
  const cx2 = x0 + (x1 - x0) * randFloat(0.5, 0.9);
  const cy2 = y0 + (y1 - y0) * randFloat(0.7, 1.3);

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const x =
      u * u * u * x0 +
      3 * u * u * t * cx1 +
      3 * u * t * t * cx2 +
      t * t * t * x1;
    const y =
      u * u * u * y0 +
      3 * u * u * t * cy1 +
      3 * u * t * t * cy2 +
      t * t * t * y1;
    points.push({ x: Math.round(x), y: Math.round(y) });
  }
  return points;
}

async function humanMouseMove(page, fromX, fromY, toX, toY) {
  const steps = rand(18, 45);
  const points = bezierCurve(fromX, fromY, toX, toY, steps);
  for (const pt of points) {
    await page.mouse.move(pt.x, pt.y);
    await sleep(rand(2, 12));
  }
}

async function humanClick(page, x, y) {
  const currentPos = await page.evaluate(() => ({
    x: window._lastMouseX || 0,
    y: window._lastMouseY || 0,
  }));
  await humanMouseMove(
    page,
    currentPos.x || rand(100, 400),
    currentPos.y || rand(100, 300),
    x,
    y
  );
  await sleep(rand(30, 120));
  await page.mouse.down();
  await sleep(rand(40, 150));
  await page.mouse.up();
}

// ─── Human-like scrolling ────────────────────────────────────────────────────
async function humanScroll(page, durationMs) {
  const startTime = Date.now();
  const pageHeight = await page.evaluate(() => document.body.scrollHeight);
  const viewHeight = await page.evaluate(() => window.innerHeight);
  let currentScroll = 0;

  while (Date.now() - startTime < durationMs) {
    const pattern = Math.random();

    if (pattern < 0.6) {
      // Normal scroll down
      const delta = rand(80, 350);
      currentScroll = Math.min(currentScroll + delta, pageHeight - viewHeight);
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'smooth' }), currentScroll);
      await sleep(rand(300, 1800));
    } else if (pattern < 0.75) {
      // Scroll up a bit (re-reading)
      const delta = rand(40, 200);
      currentScroll = Math.max(0, currentScroll - delta);
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'smooth' }), currentScroll);
      await sleep(rand(500, 2500));
    } else if (pattern < 0.88) {
      // Pause and read
      await sleep(rand(1500, 5000));
    } else {
      // Fast scroll burst
      for (let i = 0; i < rand(2, 5); i++) {
        const delta = rand(200, 500);
        currentScroll = Math.min(currentScroll + delta, pageHeight - viewHeight);
        await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'smooth' }), currentScroll);
        await sleep(rand(80, 250));
      }
      await sleep(rand(800, 2000));
    }

    // Occasionally move mouse while scrolling
    if (chance(0.3)) {
      await page.mouse.move(rand(100, 900), rand(100, 600));
      await sleep(rand(50, 200));
    }

    if (currentScroll >= pageHeight - viewHeight - 50) {
      if (chance(0.4)) break; // sometimes leave early
      currentScroll = 0; // scroll back to top
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
      await sleep(rand(500, 2000));
    }
  }
}

// ─── Human-like typing ──────────────────────────────────────────────────────
async function humanType(page, selector, text) {
  await page.click(selector);
  await sleep(rand(200, 600));
  for (const char of text) {
    await page.keyboard.type(char, { delay: rand(50, 180) });
    if (chance(0.04)) {
      // typo and correct
      const typo = String.fromCharCode(char.charCodeAt(0) + rand(-2, 2));
      await page.keyboard.type(typo, { delay: rand(40, 100) });
      await sleep(rand(200, 500));
      await page.keyboard.press('Backspace');
      await sleep(rand(100, 300));
      await page.keyboard.type(char, { delay: rand(60, 150) });
    }
    if (chance(0.08)) {
      await sleep(rand(300, 900)); // thinking pause
    }
  }
}

// ─── Navigator/fingerprint injection ─────────────────────────────────────────
function buildFingerprint(ua) {
  const vp = pick(VIEWPORTS);
  const screen = pick(SCREEN_RESOLUTIONS);
  const vendor = pick(WEBGL_VENDORS);
  const renderer = pick(WEBGL_RENDERERS);

  let platform = 'Win32';
  for (const [key, val] of Object.entries(PLATFORM_MAP)) {
    if (ua.includes(key)) {
      platform = val;
      break;
    }
  }

  return {
    ua,
    viewport: vp,
    screen,
    platform,
    vendor,
    renderer,
    hardwareConcurrency: pick([4, 8, 12, 16]),
    deviceMemory: pick([4, 8, 16, 32]),
    maxTouchPoints: 0,
    colorDepth: pick([24, 30, 32]),
    pixelRatio: pick([1, 1.25, 1.5, 2]),
    languages: [pick(LOCALES), 'en'],
  };
}

async function injectFingerprint(page, fp) {
  await page.evaluateOnNewDocument((fingerprint) => {
    // Track mouse position
    document.addEventListener('mousemove', (e) => {
      window._lastMouseX = e.clientX;
      window._lastMouseY = e.clientY;
    });

    // Navigator overrides
    Object.defineProperty(navigator, 'platform', { get: () => fingerprint.platform });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => fingerprint.hardwareConcurrency });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => fingerprint.deviceMemory });
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => fingerprint.maxTouchPoints });
    Object.defineProperty(navigator, 'languages', { get: () => fingerprint.languages });

    // Screen overrides
    Object.defineProperty(screen, 'width', { get: () => fingerprint.screen.width });
    Object.defineProperty(screen, 'height', { get: () => fingerprint.screen.height });
    Object.defineProperty(screen, 'colorDepth', { get: () => fingerprint.colorDepth });
    Object.defineProperty(window, 'devicePixelRatio', { get: () => fingerprint.pixelRatio });

    // WebGL fingerprint
    const origGetParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (param) {
      if (param === 37445) return fingerprint.vendor;
      if (param === 37446) return fingerprint.renderer;
      return origGetParameter.call(this, param);
    };

    const origGetParameter2 = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function (param) {
      if (param === 37445) return fingerprint.vendor;
      if (param === 37446) return fingerprint.renderer;
      return origGetParameter2.call(this, param);
    };

    // Canvas fingerprint noise
    const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (type) {
      if (this.width > 16 && this.height > 16) {
        const ctx = this.getContext('2d');
        if (ctx) {
          const imageData = ctx.getImageData(0, 0, this.width, this.height);
          for (let i = 0; i < imageData.data.length; i += 4) {
            imageData.data[i] = imageData.data[i] ^ (fingerprint.hardwareConcurrency & 0x1);
          }
          ctx.putImageData(imageData, 0, 0);
        }
      }
      return origToDataURL.apply(this, arguments);
    };

    // WebRTC leak prevention
    if (window.RTCPeerConnection) {
      const origRTC = window.RTCPeerConnection;
      window.RTCPeerConnection = function (config, constraints) {
        if (config && config.iceServers) {
          config.iceServers = [];
        }
        return new origRTC(config, constraints);
      };
      window.RTCPeerConnection.prototype = origRTC.prototype;
    }

    // Permissions API override
    const origQuery = Permissions.prototype.query;
    Permissions.prototype.query = function (params) {
      if (params.name === 'notifications') {
        return Promise.resolve({ state: 'denied', onchange: null });
      }
      return origQuery.call(this, params);
    };

    // Chrome property
    if (!window.chrome) {
      window.chrome = { runtime: {}, load

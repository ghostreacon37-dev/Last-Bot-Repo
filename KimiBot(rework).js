/**
 * testbot.js
 *
 * Repeatable site tester (for domains you own) - Advanced Edition v2.1
 *
 * Behavior summary (defaults):
 * - random 2..7 tabs per run (use --fixed-instances to set exact)
 * - open referrer URL -> wait 1..2 min with micro-actions -> click a link to target (if present)
 * - on target homepage: partial/random scroll + wait 1..4.5 min
 * - click a random internal post (same hostname) -> partial/random scroll + wait 1..4.5 min
 * - on learnblogs.online: performs random post clicks proportional to wait time (more time = more clicks)
 * - repeats for --runs (or forever with --forever) with --interval between runs
 * - logs sessions to sessions_log.csv
 *
 * Usage:
 *   npm i puppeteer-extra puppeteer-extra-plugin-stealth puppeteer
 *   node testbot.js <target_url> <referrer_url> [options] --confirm-owned
 *
 * Example:
 *   node testbot.js https://learnblogs.online https://x.com/GhostReacondev/status/2024921591520641247?s=20
 *     --runs=5 --interval=30000 --confirm-owned
 *
 * IMPORTANT: Only run on domains you OWN or have explicit written permission to test.
 */

const puppeteer = require('puppeteer-extra');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
puppeteer.use(require('puppeteer-extra-plugin-stealth')());

/* ---------- Colorized Console ---------- */
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

function log(type, ...args) {
  const prefix = {
    success: `${colors.green}[✓]${colors.reset}`,
    warning: `${colors.yellow}[!]${colors.reset}`,
    error: `${colors.red}[✗]${colors.reset}`,
    info: `${colors.cyan}[i]${colors.reset}`,
    debug: `${colors.gray}[d]${colors.reset}`
  }[type] || '';
  console.log(prefix, ...args);
}

/* ---------- Configuration & Constants ---------- */

// Comprehensive UA Profiles with consistent properties
const UA_PROFILES = [
  {
    name: 'win-chrome',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    platform: 'Win32',
    vendor: 'Google Inc.',
    oscpu: 'Windows NT 10.0; Win64; x64',
    maxTouchPoints: 0,
    deviceMemory: 8,
    hardwareConcurrency: 8,
    screen: { width: 1920, height: 1080, colorDepth: 24 },
    viewport: { width: 1366, height: 768 },
    webgl: { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Direct3D11 vs_5_0 ps_5_0, D3D11)' }
  },
  {
    name: 'mac-safari',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
    platform: 'MacIntel',
    vendor: 'Apple Computer, Inc.',
    oscpu: undefined,
    maxTouchPoints: 0,
    deviceMemory: 8,
    hardwareConcurrency: 8,
    screen: { width: 1440, height: 900, colorDepth: 30 },
    viewport: { width: 1440, height: 900 },
    webgl: { vendor: 'Apple Inc.', renderer: 'Apple GPU' }
  },
  {
    name: 'linux-chrome',
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    platform: 'Linux x86_64',
    vendor: 'Google Inc.',
    oscpu: 'Linux x86_64',
    maxTouchPoints: 0,
    deviceMemory: 4,
    hardwareConcurrency: 4,
    screen: { width: 1920, height: 1080, colorDepth: 24 },
    viewport: { width: 1366, height: 768 },
    webgl: { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1050 Direct3D11 vs_5_0 ps_5_0, D3D11)' }
  },
  {
    name: 'iphone',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/121.0.0.0 Mobile/15E148 Safari/604.1',
    platform: 'iPhone',
    vendor: 'Apple Computer, Inc.',
    oscpu: undefined,
    maxTouchPoints: 5,
    deviceMemory: 4,
    hardwareConcurrency: 4,
    screen: { width: 390, height: 844, colorDepth: 32 },
    viewport: { width: 390, height: 844 },
    webgl: { vendor: 'Apple Inc.', renderer: 'Apple GPU' }
  },
  {
    name: 'pixel',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36',
    platform: 'Linux armv8l',
    vendor: 'Google Inc.',
    oscpu: undefined,
    maxTouchPoints: 5,
    deviceMemory: 8,
    hardwareConcurrency: 8,
    screen: { width: 412, height: 915, colorDepth: 24 },
    viewport: { width: 412, height: 915 },
    webgl: { vendor: 'Google Inc. (Qualcomm)', renderer: 'ANGLE (Qualcomm, Adreno (TM) 730, OpenGL ES 3.2)' }
  }
];

const GEO_TIMEZONES = {
  'US': 'America/New_York',
  'GB': 'Europe/London',
  'DE': 'Europe/Berlin',
  'FR': 'Europe/Paris',
  'JP': 'Asia/Tokyo',
  'AU': 'Australia/Sydney',
  'BR': 'America/Sao_Paulo',
  'CA': 'America/Toronto',
  'IN': 'Asia/Kolkata'
};

const REFERRER_WEIGHTS = {
  'google:': 0.40,
  'social:': 0.25,
  'direct:': 0.15,
  'ref:': 0.20
};

const AD_SELECTORS = [
  'iframe[id*="google_ads"]',
  'ins.adsbygoogle',
  'div[id*="ad-"]',
  'div[class*="ad-container"]',
  '[id*="doubleclick"]',
  '[class*="advertisement"]'
];

const BLOCKED_URL_PATTERNS = [
  /moat\.js/i,
  /iasds01/i,
  /doubleverify/i,
  /cdn-cgi\/challenge-platform/i,
  /pagead\/viewthroughconversion/i,
  /googlesyndication/i,
  /doubleclick/i,
  /amazon-adsystem/i
];

const AFFILIATE_PATTERNS = [
  /\?ref=/i,
  /&tag=/i,
  /utm_medium=paid/i,
  /\/sponsored\//i,
  /\/partner\//i,
  /affiliate/i
];

const WORD_LIST = ['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'man', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use'];

/* ---------- Helper Functions ---------- */

function rand(min, max) { 
  return Math.floor(Math.random() * (max - min + 1)) + min; 
}

function sleep(ms) { 
  return new Promise(r => setTimeout(r, ms)); 
}

// Box-Muller transform for Gaussian distribution
function gaussianRandom(mean, sigma, min, max) {
  let u = 0, v = 0;
  while(u === 0) u = Math.random();
  while(v === 0) v = Math.random();
  let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  num = num * sigma + mean;
  if (min !== undefined && num < min) num = min;
  if (max !== undefined && num > max) num = max;
  return Math.floor(num);
}

// Quadratic Bezier curve calculation
function getBezierPoint(t, p0, p1, p2) {
  const x = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x;
  const y = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y;
  return { x, y };
}

// Weighted random selection
function weightedRandom(items, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let random = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    random -= weights[i];
    if (random <= 0) return items[i];
  }
  return items[items.length - 1];
}

// Time-of-day probability based on hour (0-23)
function getTimeOfDayProbability(hour, timezone) {
  const now = new Date();
  const targetTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  const h = targetTime.getHours();
  
  if (h >= 0 && h < 6) return 0.05;
  if (h >= 6 && h < 9) return 0.3 + ((h - 6) * 0.23);
  if (h >= 9 && h < 14) return 1.0;
  if (h >= 14 && h < 21) return 0.8 - ((h - 14) * 0.04);
  return 0.5 - ((h - 21) * 0.15);
}

/* ---------- CLI Parsing with Config Support ---------- */

function parseArgs() {
  const argv = process.argv.slice(2);
  let config = {};
  
  const configArg = argv.find(a => a.startsWith('--config='));
  if (configArg) {
    const configPath = configArg.split('=')[1];
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      log('info', `Loaded config from ${configPath}`);
    } catch (e) {
      log('error', `Failed to load config: ${e.message}`);
      process.exit(1);
    }
  }

  const cfg = {
    target: config.target || null,
    referrer: config.referrer || null,
    runs: config.runs || 1,
    forever: config.forever || false,
    interval: config.interval || 10000,
    minRefWait: config.minRefWait || 60000,
    maxRefWait: config.maxRefWait || 120000,
    minTargetWait: config.minTargetWait || 60000,
    maxTargetWait: config.maxTargetWait || 270000,
    minTabs: config.minTabs || 2,
    maxTabs: config.maxTabs || 7,
    fixedInstances: config.fixedInstances || null,
    confirmOwned: config.confirmOwned || false,
    headless: config.headless || false,
    debug: config.debug || false,
    screenshot: config.screenshot || false,
    proxyList: config.proxyList || null,
    proxy: config.proxy || null,
    geo: config.geo || 'US',
    bounceRate: config.bounceRate || 0.45,
    referrerList: config.referrerList || null,
    schedule: config.schedule || false,
    returnRate: config.returnRate || 0.35,
    profilePool: config.profilePool || null,
    dryRun: config.dryRun || false,
    ...config
  };

  for (const a of argv) {
    if (!cfg.target && !a.startsWith('--')) cfg.target = a;
    else if (!cfg.referrer && !a.startsWith('--')) cfg.referrer = a;
    else if (a.startsWith('--runs=')) cfg.runs = Math.max(1, parseInt(a.split('=')[1])||1);
    else if (a === '--forever') cfg.forever = true;
    else if (a.startsWith('--interval=')) cfg.interval = Math.max(0, parseInt(a.split('=')[1])||cfg.interval);
    else if (a.startsWith('--min-ref-wait=')) cfg.minRefWait = Math.max(1000, parseInt(a.split('=')[1])||cfg.minRefWait);
    else if (a.startsWith('--max-ref-wait=')) cfg.maxRefWait = Math.max(cfg.minRefWait, parseInt(a.split('=')[1])||cfg.maxRefWait);
    else if (a.startsWith('--min-target-wait=')) cfg.minTargetWait = Math.max(1000, parseInt(a.split('=')[1])||cfg.minTargetWait);
    else if (a.startsWith('--max-target-wait=')) cfg.maxTargetWait = Math.max(cfg.minTargetWait, parseInt(a.split('=')[1])||cfg.maxTargetWait);
    else if (a.startsWith('--min-tabs=')) cfg.minTabs = Math.max(1, parseInt(a.split('=')[1])||cfg.minTabs);
    else if (a.startsWith('--max-tabs=')) cfg.maxTabs = Math.max(cfg.minTabs, parseInt(a.split('=')[1])||cfg.maxTabs);
    else if (a.startsWith('--fixed-instances=')) cfg.fixedInstances = Math.max(1, parseInt(a.split('=')[1])||1);
    else if (a === '--confirm-owned') cfg.confirmOwned = true;
    else if (a === '--headless') cfg.headless = true;
    else if (a === '--debug') cfg.debug = true;
    else if (a === '--screenshot') cfg.screenshot = true;
    else if (a.startsWith('--proxy-list=')) cfg.proxyList = a.split('=')[1];
    else if (a.startsWith('--proxy=')) cfg.proxy = a.split('=')[1];
    else if (a.startsWith('--geo=')) cfg.geo = a.split('=')[1];
    else if (a.startsWith('--bounce-rate=')) cfg.bounceRate = parseFloat(a.split('=')[1]);
    else if (a.startsWith('--referrer-list=')) cfg.referrerList = a.split('=')[1];
    else if (a === '--schedule') cfg.schedule = true;
    else if (a.startsWith('--return-rate=')) cfg.returnRate = parseFloat(a.split('=')[1]);
    else if (a.startsWith('--profile-pool=')) cfg.profilePool = a.split('=')[1];
    else if (a === '--dry-run') cfg.dryRun = true;
  }

  return cfg;
}

/* ---------- Proxy Management ---------- */

function loadProxies(cfg) {
  const proxies = [];
  if (cfg.proxy) {
    proxies.push(cfg.proxy);
  } else if (cfg.proxyList && fs.existsSync(cfg.proxyList)) {
    const lines = fs.readFileSync(cfg.proxyList, 'utf8').split('\n').filter(l => l.trim());
    proxies.push(...lines);
  }
  return proxies;
}

function parseProxy(proxyStr) {
  try {
    if (proxyStr.includes('://')) {
      const url = new URL(proxyStr);
      return {
        server: `${url.protocol}//${url.hostname}:${url.port}`,
        username: url.username,
        password: url.password
      };
    } else {
      const [host, port] = proxyStr.split(':');
      return { server: `http://${host}:${port}` };
    }
  } catch {
    return null;
  }
}

/* ---------- Referrer Management ---------- */

function loadReferrers(cfg) {
  if (!cfg.referrerList || !fs.existsSync(cfg.referrerList)) {
    return cfg.referrer ? [{ url: cfg.referrer, type: 'ref:', weight: 1 }] : [];
  }
  
  const lines = fs.readFileSync(cfg.referrerList, 'utf8').split('\n').filter(l => l.trim());
  const referrers = [];
  
  for (const line of lines) {
    let type = 'ref:';
    let url = line;
    
    if (line.startsWith('google:')) { type = 'google:'; url = line.substring(7); }
    else if (line.startsWith('social:')) { type = 'social:'; url = line.substring(7); }
    else if (line.startsWith('direct:')) { type = 'direct:'; url = ''; }
    else if (line.startsWith('ref:')) { type = 'ref:'; url = line.substring(4); }
    
    referrers.push({ url, type, weight: REFERRER_WEIGHTS[type] || 0.2 });
  }
  
  return referrers;
}

function selectReferrer(referrers) {
  if (!referrers.length) return '';
  const items = referrers.map(r => r.url);
  const weights = referrers.map(r => r.weight);
  return weightedRandom(items, weights);
}

/* ---------- Profile Pool Management ---------- */

function getProfilePoolDir(cfg) {
  return cfg.profilePool || path.join('/tmp', 'testbot_profiles');
}

function saveProfileToPool(profileDir, poolDir, profileId) {
  const targetDir = path.join(poolDir, profileId);
  try {
    if (!fs.existsSync(poolDir)) fs.mkdirSync(poolDir, { recursive: true });
    if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true });
    fs.cpSync(profileDir, targetDir, { recursive: true });
    return true;
  } catch (e) {
    return false;
  }
}

function getRandomProfileFromPool(poolDir) {
  try {
    if (!fs.existsSync(poolDir)) return null;
    const dirs = fs.readdirSync(poolDir).filter(d => {
      const fullPath = path.join(poolDir, d);
      return fs.statSync(fullPath).isDirectory();
    });
    if (!dirs.length) return null;
    return path.join(poolDir, dirs[Math.floor(Math.random() * dirs.length)]);
  } catch {
    return null;
  }
}

/* ---------- Browser Setup & Evasion ---------- */

async function setupPageEvasion(page, profile, cfg) {
  const timezone = GEO_TIMEZONES[cfg.geo] || 'America/New_York';
  
  await page.evaluateOnNewDocument((tz) => {
    Intl.DateTimeFormat = class extends Intl.DateTimeFormat {
      constructor(...args) {
        super(...args);
        this.resolvedOptions = () => ({ ...super.resolvedOptions(), timeZone: tz });
      }
    };
  }, timezone);

  await page.evaluateOnNewDocument(() => {
    const pc = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
    if (pc) {
      window.RTCPeerConnection = function(...args) {
        const conn = new pc(...args);
        const createDataChannel = conn.createDataChannel.bind(conn);
        conn.createDataChannel = (...dcArgs) => {
          const channel = createDataChannel(...dcArgs);
          Object.defineProperty(channel, 'local', { get: () => null });
          return channel;
        };
        return conn;
      };
    }
  });

  await page.evaluateOnNewDocument(() => {
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    const originalToBlob = HTMLCanvasElement.prototype.toBlob;
    
    const noise = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const imageData = ctx.createImageData(1, 1);
      imageData.data[0] = Math.floor(Math.random() * 10);
      imageData.data[1] = Math.floor(Math.random() * 10);
      imageData.data[2] = Math.floor(Math.random() * 10);
      imageData.data[3] = 255;
      ctx.putImageData(imageData, 0, 0);
    };
    
    HTMLCanvasElement.prototype.toDataURL = function(...args) {
      noise();
      return originalToDataURL.apply(this, args);
    };
    
    HTMLCanvasElement.prototype.toBlob = function(callback, ...args) {
      noise();
      return originalToBlob.apply(this, [callback, ...args]);
    };
  });

  await page.evaluateOnNewDocument((glVendor, glRenderer) => {
    const getParam = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(param) {
      if (param === 37445) return glVendor;
      if (param === 37446) return glRenderer;
      return getParam.call(this, param);
    };
  }, profile.webgl.vendor, profile.webgl.renderer);

  await page.evaluateOnNewDocument((prof) => {
    Object.defineProperty(navigator, 'platform', { get: () => prof.platform });
    Object.defineProperty(navigator, 'vendor', { get: () => prof.vendor });
    if (prof.oscpu) Object.defineProperty(navigator, 'oscpu', { get: () => prof.oscpu });
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => prof.maxTouchPoints });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => prof.deviceMemory });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => prof.hardwareConcurrency });
    Object.defineProperty(navigator, 'language', { get: () => 'en-US' });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  }, profile);

  await page.evaluateOnNewDocument(() => {
    const originalCheck = document.fonts.check;
    const fonts = ['Arial', 'Times New Roman', 'Helvetica', 'Georgia', 'Verdana', 'Courier New'];
    document.fonts.check = function(...args) {
      if (Math.random() < 0.3) return fonts[Math.floor(Math.random() * fonts.length)] === args[0];
      return originalCheck.apply(this, args);
    };
  });

  await page.evaluateOnNewDocument(() => {
    const originalGetChannelData = AudioBuffer.prototype.getChannelData;
    AudioBuffer.prototype.getChannelData = function(channel) {
      const data = originalGetChannelData.call(this, channel);
      for (let i = 0; i < data.length; i++) {
        if (i % 100 === 0) data[i] += (Math.random() - 0.5) * 0.0001;
      }
      return data;
    };
  });

  await page.evaluateOnNewDocument((prof) => {
    Object.defineProperty(window.screen, 'width', { get: () => prof.screen.width });
    Object.defineProperty(window.screen, 'height', { get: () => prof.screen.height });
    Object.defineProperty(window.screen, 'colorDepth', { get: () => prof.screen.colorDepth });
    Object.defineProperty(window.screen, 'availWidth', { get: () => prof.screen.width });
    Object.defineProperty(window.screen, 'availHeight', { get: () => prof.screen.height - 40 });
    Object.defineProperty(window, 'outerWidth', { get: () => prof.screen.width });
    Object.defineProperty(window, 'outerHeight', { get: () => prof.screen.height });
    Object.defineProperty(window, 'screenX', { get: () => 0 });
    Object.defineProperty(window, 'screenY', { get: () => 0 });
    Object.defineProperty(window, 'screenLeft', { get: () => 0 });
    Object.defineProperty(window, 'screenTop', { get: () => 0 });
  }, profile);

  // Request interception - blocking tracking/verification only
  await page.setRequestInterception(true);
  
  page.on('request', (req) => {
    const url = req.url();
    
    // Block tracking/verification scripts only
    for (const pattern of BLOCKED_URL_PATTERNS) {
      if (pattern.test(url)) {
        return req.abort();
      }
    }
    
    req.continue();
  });
}

/* ---------- Advanced Behavioral Actions ---------- */

async function bezierMouseMove(page, x1, y1, x2, y2, duration = 1000) {
  const steps = Math.max(10, Math.floor(duration / 16));
  const cp = {
    x: (x1 + x2) / 2 + rand(-50, 50),
    y: (y1 + y2) / 2 + rand(-50, 50)
  };
  
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const pos = getBezierPoint(ease, {x: x1, y: y1}, cp, {x: x2, y: x2});
    await page.mouse.move(pos.x, pos.y);
    await sleep(duration / steps);
  }
}

async function inertialScroll(page) {
  const viewport = await page.viewport();
  const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
  const maxScroll = Math.max(0, scrollHeight - viewport.height);
  
  let currentY = await page.evaluate(() => window.scrollY);
  const targetY = Math.min(currentY + rand(200, viewport.height), maxScroll);
  const direction = targetY > currentY ? 1 : -1;
  
  let velocity = rand(15, 30) * direction;
  const friction = 0.85;
  
  while (Math.abs(velocity) > 1 && currentY !== targetY) {
    currentY += velocity;
    velocity *= friction;
    
    if (Math.random() < 0.1) velocity *= -0.5;
    
    if (currentY < 0) { currentY = 0; break; }
    if (currentY > maxScroll) { currentY = maxScroll; break; }
    
    await page.evaluate(y => window.scrollTo(0, y), currentY);
    await sleep(rand(16, 50));
  }
  
  return currentY;
}

/**
 * REAL HUMAN CLICK SIMULATION
 * This function simulates genuine human clicking behavior with:
 * - Bezier curve approach path
 * - Random targeting within element (not dead center)
 * - Pre-click hover pause (reaction time)
 * - Micro-wiggles (hand precision adjustment)
 * - Realistic mouse down/hold/up timing (80-200ms)
 * - Post-click stabilization
 */
async function humanClick(page, target, cfg = {}) {
  let box;
  let elementHandle;
  
  // Handle different target types
  if (typeof target === 'string') {
    // CSS Selector
    elementHandle = await page.$(target);
    if (!elementHandle) {
      if (cfg.debug) log('debug', `Human click: Selector not found ${target}`);
      return false;
    }
  } else if (target && typeof target === 'object' && target.asElement) {
    // ElementHandle
    elementHandle = target;
  } else if (typeof target === 'object' && target.x !== undefined && target.y !== undefined) {
    // Coordinates object
    box = { 
      x: target.x, 
      y: target.y, 
      width: target.width || 0, 
      height: target.height || 0 
    };
  }
  
  // Get bounding box if we have an element
  if (elementHandle && !box) {
    box = await elementHandle.boundingBox();
    if (!box) {
      if (cfg.debug) log('debug', 'Human click: Element not visible');
      return false;
    }
  }
  
  if (!box) {
    log('error', 'Human click: No valid target');
    return false;
  }
  
  // Calculate random click position within element (5px padding from edges)
  const padding = 5;
  const targetX = box.x + rand(padding, Math.max(padding, box.width - padding));
  const targetY = box.y + rand(padding, Math.max(padding, box.height - padding));
  
  // Get current mouse position (tracked via window.mouseX/Y)
  const currentPos = await page.evaluate(() => ({
    x: window.mouseX || window.innerWidth / 2,
    y: window.mouseY || window.innerHeight / 2
  }));
  
  // Move to target with Bezier curve (slower, more precise for clicking)
  const moveDuration = rand(800, 1500);
  await bezierMouseMove(page, currentPos.x, currentPos.y, targetX, targetY, moveDuration);
  
  // Pre-click pause (human reaction time to target acquisition)
  await sleep(rand(100, 400));
  
  // Micro-wiggles (hand adjusting for precision)
  for (let i = 0; i < rand(2, 5); i++) {
    const wiggleX = targetX + rand(-3, 3);
    const wiggleY = targetY + rand(-3, 3);
    await page.mouse.move(wiggleX, wiggleY);
    await sleep(rand(20, 80));
  }
  
  // Final precise positioning
  await page.mouse.move(targetX, targetY);
  
  // Realistic click timing
  await page.mouse.down();
  await sleep(rand(80, 200)); // Human finger press duration
  await page.mouse.up();
  
  // Update tracked mouse position globally
  await page.evaluate((x, y) => {
    window.mouseX = x;
    window.mouseY = y;
  }, targetX, targetY);
  
  // Post-click pause (hand lingering before moving away)
  await sleep(rand(50, 300));
  
  if (cfg.debug) log('debug', `Human click executed at ${Math.round(targetX)},${Math.round(targetY)}`);
  return true;
}

/**
 * Click a random post/article on learnblogs.online with human-like behavior
 * Returns true if a click was performed
 */
async function clickLearnBlogsPost(page, cfg) {
  try {
    const url = await page.url().catch(() => '');
    if (!url.includes('learnblogs.online')) return false;
    
    // Multiple selectors to find post links
    const selectors = [
      'article h2 a', '.post-title a', '.entry-title a',
      '.post h2 a', '.post h3 a', 'h2.entry-title a',
      'article .entry-title a', '.blog-post h2 a',
      '.post-entry a', 'main article a[href*="/"]',
      'article a[rel="bookmark"]', '.entry-header a',
      'h1 a', 'h2 a', '.content h2 a'
    ];
    
    const postData = await page.evaluate((selList) => {
      // Collect all valid post links
      const candidates = [];
      for (const sel of selList) {
        const links = Array.from(document.querySelectorAll(sel));
        for (const link of links) {
          const href = link.href || '';
          const rect = link.getBoundingClientRect();
          
          // Validate: visible, internal link, not current page, not admin
          if (href.includes('learnblogs.online') && 
              !href.includes('#') && 
              !href.includes('wp-admin') &&
              !href.includes('wp-login') &&
              !href.includes('javascript:') &&
              !href.includes('xmlrpc') &&
              rect.width > 0 && 
              rect.height > 0 &&
              rect.top >= 50 && // Not at very top (avoid headers)
              rect.left >= 0 &&
              rect.bottom <= (window.innerHeight - 50) && // Not behind footer
              rect.right <= window.innerWidth &&
              href !== window.location.href) {
            
            candidates.push({
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
              text: link.textContent.trim().substring(0, 40),
              href: href
            });
          }
        }
      }
      
      if (candidates.length === 0) return null;
      // Pick random candidate
      return candidates[Math.floor(Math.random() * candidates.length)];
    }, selectors);
    
    if (!postData) return false;
    
    if (cfg.debug) log('debug', `LearnBlogs engagement click: "${postData.text}..."`);
    
    // Perform human-like click
    const clicked = await humanClick(page, postData, cfg);
    if (!clicked) return false;
    
    // Wait after click (simulating reading)
    await sleep(rand(3000, 8000));
    
    // Check if we navigated to the post
    const newUrl = await page.url().catch(() => url);
    if (newUrl !== url && newUrl.includes('learnblogs.online')) {
      // Successfully navigated to a post - scroll and engage
      await inertialScroll(page);
      await sleep(rand(2000, 5000));
      
      // 70% chance to go back to continue browsing more posts
      if (Math.random() < 0.7) {
        await page.goBack({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
        await sleep(rand(1000, 3000));
      }
    }
    
    return true;
  } catch (e) {
    if (cfg.debug) log('debug', `LearnBlogs click error: ${e.message}`);
    return false;
  }
}

async function simulateTextSelection(page) {
  try {
    const textInfo = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
      const texts = [];
      let node;
      while (node = walker.nextNode()) {
        if (node.textContent.trim().length > 20) {
          const rect = node.parentElement.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            texts.push({
              text: node.textContent,
              rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
            });
          }
        }
      }
      return texts.length ? texts[Math.floor(Math.random() * texts.length)] : null;
    });
    
    if (!textInfo) return;
    
    const startX = textInfo.rect.x + rand(5, 20);
    const startY = textInfo.rect.y + textInfo.rect.height / 2;
    const endX = startX + rand(50, Math.min(200, textInfo.rect.width - 10));
    const endY = startY + rand(-5, 5);
    
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await bezierMouseMove(page, startX, startY, endX, endY, rand(300, 800));
    await page.mouse.up();
    
    if (Math.random() < 0.3) {
      await page.keyboard.down('Control');
      await page.keyboard.down('c');
      await page.keyboard.up('c');
      await page.keyboard.up('Control');
    }
    
    await sleep(rand(500, 1500));
  } catch (e) {}
}

async function simulateFormInteraction(page, cfg) {
  try {
    const inputInfo = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input[type="search"], input[type="text"], textarea');
      for (const input of inputs) {
        const rect = input.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          return {
            x: rect.x + rect.width / 2,
            y: rect.y + rect.height / 2,
            width: rect.width,
            height: rect.height,
            tag: input.tagName
          };
        }
      }
      return null;
    });
    
    if (!inputInfo || Math.random() > 0.15) return;
    
    // Use human click to focus the input
    await humanClick(page, {
      x: inputInfo.x - inputInfo.width/2,
      y: inputInfo.y - inputInfo.height/2,
      width: inputInfo.width,
      height: inputInfo.height
    }, cfg);
    
    await sleep(rand(200, 500));
    
    const chars = rand(2, 6);
    for (let i = 0; i < chars; i++) {
      const word = WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)];
      await page.keyboard.type(word.substring(0, 1), { delay: rand(50, 150) });
      await sleep(rand(100, 300));
    }
    
    await sleep(rand(1000, 2000));
    await page.keyboard.press('Tab');
  } catch (e) {}
}

async function simulateReadingPause(page) {
  const pauses = rand(1, 3);
  for (let i = 0; i < pauses; i++) {
    await sleep(rand(8000, 25000));
  }
}

async function simulateTabFocusBlur(page) {
  const events = rand(1, 2);
  for (let i = 0; i < events; i++) {
    await sleep(rand(5000, 15000));
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('blur'));
    });
    await sleep(rand(5000, 15000));
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });
  }
}

async function checkAdViewability(page) {
  try {
    const adInViewport = await page.evaluate((selectors) => {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          const rect = el.getBoundingClientRect();
          const inViewport = rect.top >= 0 && rect.left >= 0 && 
                            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                            rect.right <= (window.innerWidth || document.documentElement.clientWidth);
          if (inViewport) return { x: rect.x + rect.width/2, y: rect.y + rect.height/2 };
        }
      }
      return null;
    }, AD_SELECTORS);
    
    if (adInViewport) {
      await page.mouse.move(adInViewport.x + rand(-50, 50), adInViewport.y + rand(-50, 50));
      await sleep(rand(2000, 6000));
      return true;
    }
  } catch {}
  return false;
}

async function waitWithActivity(page, durationMs, cfg, engagement) {
  const start = Date.now();
  const isLearnBlogs = await page.evaluate(() => window.location.hostname.includes('learnblogs.online'));
  
  // For learnblogs.online: calculate number of post clicks based on wait duration
  // More wait time = more clicks (roughly 1 click per 35-50 seconds)
  let lbClicksTarget = 0;
  let lbNextClickTime = start + 99999999; // Default: far future
  
  if (isLearnBlogs) {
    const seconds = durationMs / 1000;
    lbClicksTarget = Math.max(1, Math.floor(seconds / 45) + rand(-1, 2));
    lbNextClickTime = start + rand(15000, 30000); // First click after 15-30s
    if (cfg.debug) log('debug', `LearnBlogs engagement mode: ${lbClicksTarget} post clicks planned over ${Math.round(seconds)}s`);
  }
  
  while (Date.now() - start < durationMs) {
    // Check if we should perform a learnblogs post click
    if (isLearnBlogs && lbClicksTarget > 0 && Date.now() >= lbNextClickTime) {
      const success = await clickLearnBlogsPost(page, cfg);
      if (success) {
        engagement.learnBlogsClicks = (engagement.learnBlogsClicks || 0) + 1;
        lbClicksTarget--;
        if (cfg.debug) log('debug', `LearnBlogs click completed. Remaining: ${lbClicksTarget}`);
      } else if (cfg.debug) {
        log('debug', 'LearnBlogs click attempt failed (no eligible posts)');
      }
      
      // Schedule next click or disable if done
      if (lbClicksTarget > 0) {
        lbNextClickTime = Date.now() + rand(20000, 40000); // Next click in 20-40s
      } else {
        lbNextClickTime = Date.now() + 99999999;
      }
    }
    
    if (Math.random() < 0.3) {
      await simulateReadingPause(page);
    }
    
    if (Math.random() < 0.4) {
      const x = rand(50, (await page.viewport()).width - 50);
      const y = rand(50, (await page.viewport()).height - 50);
      await bezierMouseMove(page, 
        (await page.evaluate(() => window.mouseX || 0)), 
        (await page.evaluate(() => window.mouseY || 0)), 
        x, y, 
        rand(200, 800)
      );
      await page.evaluate((mx, my) => { window.mouseX = mx; window.mouseY = my; }, x, y);
      engagement.mouseBursts++;
    }
    
    if (Math.random() < 0.2) {
      await inertialScroll(page);
      engagement.scrollEvents++;
      await checkAdViewability(page);
    }
    
    if (Math.random() < 0.1) {
      await simulateTabFocusBlur(page);
    }
    
    if (Math.random() < 0.15) {
      await simulateTextSelection(page);
    }
    
    if (Math.random() < 0.05) {
      await simulateFormInteraction(page, cfg);
    }
    
    await sleep(rand(2000, 6000));
  }
}

/* ---------- Core Action Functions with Human Clicks ---------- */

async function clickLinkToTarget(page, targetHost, cfg) {
  // First try to find direct anchors
  const linkData = await page.evaluate((targetHost) => {
    const anchors = Array.from(document.querySelectorAll('a[href]')).filter(a => {
      return a.href && a.href.includes(targetHost) && a.offsetParent !== null;
    });
    if (!anchors.length) return null;
    const el = anchors[Math.floor(Math.random() * anchors.length)];
    const rect = el.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      href: el.href
    };
  }, targetHost);
  
  if (linkData) {
    const clicked = await humanClick(page, linkData, cfg);
    if (clicked) {
      if (cfg.debug) log('debug', 'Human clicked direct anchor to target');
      return true;
    }
  }
  
  // Fallback: anchors with text containing host or redirect shorteners
  const fbData = await page.evaluate((targetHost) => {
    const anchors = Array.from(document.querySelectorAll('a[href]')).slice(0, 80);
    for (const a of anchors) {
      const href = (a.href||'').toLowerCase();
      if (href.includes('t.co') || href.includes('bit.ly') || href.includes('tinyurl')) {
        const rect = a.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }
      if ((a.innerText||'').toLowerCase().includes(targetHost.toLowerCase())) {
        const rect = a.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }
    }
    return null;
  }, targetHost);
  
  if (fbData) {
    const clicked = await humanClick(page, fbData, cfg);
    if (clicked && cfg.debug) log('debug', 'Human clicked fallback anchor');
    return clicked;
  }
  
  return false;
}

async function clickSafeLink(page, targetHost, cfg) {
  const isSafeLink = (href) => {
    for (const pattern of AFFILIATE_PATTERNS) {
      if (pattern.test(href)) return false;
    }
    for (const pattern of BLOCKED_URL_PATTERNS) {
      if (pattern.test(href)) return false;
    }
    return true;
  };

  const linkData = await page.evaluate((targetHost, adSelectors, isSafeFunc) => {
    const isSafe = new Function('return ' + isSafeFunc)();
    
    const anchors = Array.from(document.querySelectorAll('a[href]')).filter(a => {
      for (const sel of adSelectors) {
        if (a.closest(sel)) return false;
      }
      if (!a.href.includes(targetHost)) return false;
      if (!isSafe(a.href)) return false;
      if (a.offsetParent === null) return false; // Not visible
      return true;
    });
    
    if (!anchors.length) return null;
    const el = anchors[Math.floor(Math.random() * anchors.length)];
    const rect = el.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      href: el.href
    };
  }, targetHost, AD_SELECTORS, isSafeLink.toString());
  
  if (!linkData) return false;
  
  // Use human click instead of instant click
  return await humanClick(page, linkData, cfg);
}

/**
 * Now with REAL HUMAN CLICK - finds internal link and actually clicks it like a human
 * instead of using page.goto()
 */
async function openRandomInternalPostAndWait(page, targetHost, minWait, maxWait, cfg) {
  const isSafeLink = (href) => {
    for (const pattern of AFFILIATE_PATTERNS) {
      if (pattern.test(href)) return false;
    }
    return true;
  };

  // Find a valid internal link with coordinates
  const linkData = await page.evaluate((targetHost, isSafeFunc) => {
    const isSafe = new Function('return ' + isSafeFunc)();
    const links = Array.from(document.querySelectorAll('a[href]'))
      .filter(a => {
        try {
          const url = new URL(a.href);
          return url.hostname.includes(targetHost) && 
                 url.pathname !== '/' && 
                 !url.hash && 
                 isSafe(a.href) &&
                 a.offsetParent !== null;
        } catch { return false; }
      });
    
    if (!links.length) return null;
    const link = links[Math.floor(Math.random() * links.length)];
    const rect = link.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      href: link.href
    };
  }, targetHost, isSafeLink.toString());
  
  if (!linkData) return { opened: false, finalUrl: await page.url().catch(()=>null) };
  
  try {
    // HUMAN CLICK the link instead of using goto
    const clicked = await humanClick(page, linkData, cfg);
    if (!clicked) return { opened: false, finalUrl: await page.url().catch(()=>null) };
    
    // Wait for navigation
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(()=>{});
    
    // Partial scroll and wait
    await inertialScroll(page);
    
    const wait = gaussianRandom(
      (minWait + maxWait) / 2,
      (maxWait - minWait) / 4,
      minWait,
      maxWait
    );
    
    if (cfg.debug) log('debug', `Waiting on post ~${Math.round(wait/1000)}s after human click`);
    
    const start = Date.now();
    while (Date.now() - start < wait) {
      await bezierMouseMove(page, 
        (await page.evaluate(() => window.mouseX || 0)),
        (await page.evaluate(() => window.mouseY || 0)),
        rand(100, 800), rand(100, 600),
        rand(200, 800)
      );
      await sleep(rand(2000, 8000));
    }
    
    return { opened: true, finalUrl: await page.url().catch(()=>linkData.href) };
  } catch (e) {
    return { opened: false, finalUrl: await page.url().catch(()=>null) };
  }
}

/* ---------- Enhanced Logging ---------- */

function appendCSV(row, cfg) {
  try {
    const csv = path.join(process.cwd(), 'sessions_log.csv');
    const headers = 'timestamp,run,tab,referrer_clicked,target_final,post_opened,post_final,duration_ms,proxy_used,referrer_used,pages_visited,bounce,return_visitor,learnblogs_clicks\n';
    
    if (!fs.existsSync(csv)) fs.writeFileSync(csv, headers);
    
    const safeRow = row.map(x => `"${String(x||'').replace(/"/g, '""')}"`).join(',');
    fs.appendFileSync(csv, safeRow + '\n');
  } catch (e) {
    if (cfg.debug) log('error', 'CSV write failed:', e.message);
  }
}

/* ---------- Main Execution ---------- */

(async () => {
  const cfg = parseArgs();
  
  if (!cfg.target) {
    console.error('Usage: node testbot.js <target_url> [referrer_url] [options] --confirm-owned');
    console.error('   or: node testbot.js <target_url> --referrer-list=<file> [options] --confirm-owned');
    process.exit(1);
  }
  
  if (!cfg.confirmOwned) {
    log('error', 'This script requires --confirm-owned. Only run on domains you own or have permission to test.');
    process.exit(1);
  }

  const proxies = loadProxies(cfg);
  const referrers = loadReferrers(cfg);
  const targetHost = new URL(cfg.target).hostname;
  const poolDir = getProfilePoolDir(cfg);
  
  if (cfg.returnRate > 0 && !fs.existsSync(poolDir)) {
    fs.mkdirSync(poolDir, { recursive: true });
  }

  log('info', `Starting advanced tester — target: ${cfg.target}`);
  log('info', `Runs: ${cfg.runs}${cfg.forever ? ' (forever)' : ''}, interval=${cfg.interval}ms`);
  if (cfg.fixedInstances) log('info', `Fixed instances: ${cfg.fixedInstances}`);
  else log('info', `Tabs per run: random ${cfg.minTabs}..${cfg.maxTabs}`);
  if (proxies.length) log('info', `Loaded ${proxies.length} proxies`);
  if (referrers.length) log('info', `Loaded ${referrers.length} referrers`);
  if (cfg.schedule) log('info', `Time-of-day scheduling enabled (${cfg.geo})`);
  
  if (cfg.dryRun) {
    log('warning', 'DRY RUN MODE - No browsers will be launched');
    console.log('\nPlanned configuration:');
    console.log(JSON.stringify({...cfg, confirmOwned: '[REDACTED]'}, null, 2));
    process.exit(0);
  }

  let run = 0;
  let stop = false;
  process.on('SIGINT', () => { log('warning', 'SIGINT received — stopping after current run'); stop = true; });
  process.on('SIGTERM', () => { log('warning', 'SIGTERM received — stopping after current run'); stop = true; });

  while (!stop && (cfg.forever || run < cfg.runs)) {
    run++;
    
    if (cfg.schedule) {
      const tz = GEO_TIMEZONES[cfg.geo] || 'America/New_York';
      const prob = getTimeOfDayProbability(0, tz);
      if (Math.random() > prob) {
        log('info', `Run ${run} skipped due to time-of-day throttling (${Math.round(prob*100)}% probability)`);
        await sleep(cfg.interval);
        continue;
      }
    }
    
    log('info', `\n=== Run ${run} ===`);
    
    const tabs = cfg.fixedInstances ? cfg.fixedInstances : rand(cfg.minTabs, cfg.maxTabs);
    const results = [];
    const returnVisitors = Array(tabs).fill(false).map(() => Math.random() < cfg.returnRate);
    
    for (let t = 0; t < tabs; t++) {
      const proxy = proxies.length ? proxies[rand(0, proxies.length - 1)] : null;
      const referrer = referrers.length ? selectReferrer(referrers) : cfg.referrer;
      const isReturn = returnVisitors[t];
      
      let profileDir;
      if (isReturn) {
        const existing = getRandomProfileFromPool(poolDir);
        if (existing) {
          profileDir = path.join('/tmp', `testbot_active_${Date.now()}_${t}`);
          fs.cpSync(existing, profileDir, { recursive: true });
          log('debug', `Reusing profile for tab ${t+1}`);
        } else {
          profileDir = path.join('/tmp', `testbot_profile_${Date.now()}_${t}`);
        }
      } else {
        profileDir = path.join('/tmp', `testbot_profile_${Date.now()}_${t}`);
      }
      
      const profile = UA_PROFILES[rand(0, UA_PROFILES.length - 1)];
      const bounceFromReferrer = Math.random() < 0.10;
      const bounceFromHomepage = !bounceFromReferrer && (Math.random() < cfg.bounceRate);
      const pagesToVisit = bounceFromHomepage ? 0 : weightedRandom([0, 1, 2, 3, 4], [0.45, 0.30, 0.15, 0.07, 0.03]);
      
      results.push({
        tab: t + 1,
        proxy,
        referrer,
        profile,
        profileDir,
        isReturn,
        bounceFromReferrer,
        bounceFromHomepage,
        pagesToVisit,
        results: {
          refClicked: false,
          finalUrl: null,
          postOpened: false,
          postUrl: null,
          duration: 0,
          pagesVisited: 0,
          proxyUsed: proxy || 'none',
          referrerUsed: referrer || 'direct',
          learnBlogsClicks: 0
        }
      });
    }
    
    const browsers = [];
    
    try {
      for (const flow of results) {
        const launchArgs = [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-features=WebRtcHideLocalIpsWithMdns',
          '--disable-webrtc-encryption'
        ];
        
        if (flow.proxy) {
          const parsed = parseProxy(flow.proxy);
          if (parsed) {
            launchArgs.push(`--proxy-server=${parsed.server}`);
          }
        }
        
        const browser = await puppeteer.launch({
          headless: !!cfg.headless,
          userDataDir: flow.profileDir,
          defaultViewport: null,
          args: launchArgs
        });
        
        browsers.push({ browser, flow });
        
        if (flow.proxy) {
          const parsed = parseProxy(flow.proxy);
          if (parsed && parsed.username) {
            const [page] = await browser.pages();
            await page.authenticate({
              username: parsed.username,
              password: parsed.password
            });
          }
        }
      }
      
      const executions = browsers.map(async ({ browser, flow }) => {
        const start = Date.now();
        const engagement = { scrollEvents: 0, mouseBursts: 0, startTime: Date.now(), learnBlogsClicks: 0 };
        
        try {
          const page = await browser.newPage();
          await setupPageEvasion(page, flow.profile, cfg);
          await page.setUserAgent(flow.profile.userAgent);
          await page.setViewport({ 
            width: flow.profile.viewport.width, 
            height: flow.profile.viewport.height 
          });
          await page.setExtraHTTPHeaders({ 
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': flow.referrer
          });
          
          // Initialize mouse tracking
          await page.evaluate(() => {
            window.mouseX = window.innerWidth / 2;
            window.mouseY = window.innerHeight / 2;
          });
          
          if (cfg.debug) {
            page.on('console', msg => log('debug', `[Tab ${flow.tab}]`, msg.text()));
            page.on('pageerror', e => log('debug', `[Tab ${flow.tab}] Error:`, e.message));
          }
          
          if (flow.referrer && !flow.bounceFromReferrer) {
            await page.goto(flow.referrer, { 
              waitUntil: 'domcontentloaded', 
              timeout: 60000 
            }).catch(() => {});
            
            const refWait = gaussianRandom(
              (cfg.minRefWait + cfg.maxRefWait) / 2,
              (cfg.maxRefWait - cfg.minRefWait) / 4,
              cfg.minRefWait,
              cfg.maxRefWait
            );
            await waitWithActivity(page, refWait, cfg, engagement);
            
            // HUMAN CLICK to target
            flow.results.refClicked = await clickLinkToTarget(page, targetHost, cfg);
            if (flow.results.refClicked) {
              await sleep(3000);
              try { 
                await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }); 
              } catch {}
            } else {
              await page.goto(cfg.target, { 
                waitUntil: 'domcontentloaded', 
                timeout: 60000,
                referer: flow.referrer 
              });
            }
          } else {
            if (flow.bounceFromReferrer) {
              flow.results.pagesVisited = 0;
              flow.results.finalUrl = flow.referrer;
              throw new Error('Bounced from referrer');
            }
            await page.goto(cfg.target, { 
              waitUntil: 'domcontentloaded', 
              timeout: 60000 
            });
          }
          
          // On target homepage
          await inertialScroll(page);
          engagement.scrollEvents++;
          
          const homeWait = gaussianRandom(150000, 45000, 30000, 480000);
          await waitWithActivity(page, homeWait, cfg, engagement);
          flow.results.finalUrl = await page.url();
          flow.results.pagesVisited = 1;
          
          await checkAdViewability(page);
          
          // Internal pages with HUMAN CLICKS
          if (!flow.bounceFromHomepage) {
            for (let p = 0; p < flow.pagesToVisit; p++) {
              const postResult = await openRandomInternalPostAndWait(page, targetHost, cfg.minTargetWait, cfg.maxTargetWait, cfg);
              if (postResult.opened) {
                flow.results.pagesVisited++;
                if (p === 0) {
                  flow.results.postOpened = true;
                  flow.results.postUrl = postResult.finalUrl;
                }
                await checkAdViewability(page);
              }
            }
          }
          
          // Minimum engagement enforcement
          const elapsed = Date.now() - engagement.startTime;
          if (engagement.scrollEvents < 2 || engagement.mouseBursts < 1 || elapsed < 30000) {
            const needed = Math.max(0, 30000 - elapsed);
            if (needed > 0) await waitWithActivity(page, needed, cfg, engagement);
            while (engagement.scrollEvents < 2) {
              await inertialScroll(page);
              engagement.scrollEvents++;
            }
            while (engagement.mouseBursts < 1) {
              await bezierMouseMove(page, 100, 100, 200, 200, 500);
              engagement.mouseBursts++;
            }
          }
          
          // Store learnblogs engagement
          flow.results.learnBlogsClicks = engagement.learnBlogsClicks || 0;
          
          if (cfg.screenshot) {
            try {
              const shotPath = path.join(process.cwd(), `shot_run${run}_tab${flow.tab}_${Date.now()}.png`);
              await page.screenshot({ path: shotPath, fullPage: false });
            } catch {}
          }
          
          flow.results.duration = Date.now() - start;
          await page.close();
          
          if (flow.isReturn) {
            const poolId = `profile_${Date.now()}_${flow.tab}`;
            saveProfileToPool(flow.profileDir, poolDir, poolId);
          }
          
        } catch (e) {
          flow.results.duration = Date.now() - start;
          if (cfg.debug) log('error', `Tab ${flow.tab} error:`, e.message);
        }
      });
      
      await Promise.allSettled(executions);
      
      for (const { flow } of browsers) {
        appendCSV([
          new Date().toISOString(),
          run,
          flow.tab,
          flow.results.refClicked ? 'yes' : 'no',
          flow.results.finalUrl,
          flow.results.postOpened ? 'yes' : 'no',
          flow.results.postUrl || '',
          flow.results.duration,
          flow.results.proxyUsed,
          flow.results.referrerUsed,
          flow.results.pagesVisited,
          flow.bounceFromHomepage ? 'yes' : 'no',
          flow.isReturn ? 'yes' : 'no',
          flow.results.learnBlogsClicks
        ], cfg);
        
        log('success', `Tab ${flow.tab}: pages=${flow.results.pagesVisited}, bounced=${flow.bounceFromHomepage}, return=${flow.isReturn}, proxy=${flow.results.proxyUsed ? 'yes' : 'no'}, lb_clicks=${flow.results.learnBlogsClicks}`);
      }
      
    } catch (e) {
      log('error', 'Run-level error:', e.message);
    } finally {
      for (const { browser, flow } of browsers) {
        try { 
          await browser.close(); 
        } catch {}
        
        if (!flow.isReturn || !fs.existsSync(path.join(poolDir, path.basename(flow.profileDir)))) {
          try { 
            if (fs.existsSync(flow.profileDir)) {
              fs.rmSync(flow.profileDir, { recursive: true, force: true });
            }
          } catch {}
        }
      }
    }
    
    if (cfg.forever) {
      if (stop) break;
      log('info', `Waiting ${cfg.interval}ms before next run...`);
      await sleep(cfg.interval);
    } else {
      if (run >= cfg.runs) break;
      log('info', `Waiting ${cfg.interval}ms before next run...`);
      await sleep(cfg.interval);
    }
  }
  
  log('success', 'All runs complete. See sessions_log.csv for details.');
  process.exit(0);
})();

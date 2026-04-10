/**
 * testbot.js - Advanced Human Behavior Edition
 * Simulates realistic reading patterns with variable engagement
 */

const puppeteer = require('puppeteer-extra');
const fs = require('fs');
const path = require('path');
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

// Weighted random for realistic time distribution (most short, some long)
function weightedTimeSelection() {
  const randVal = Math.random();
  // 60% chance: 1-3 min (quick reader)
  // 25% chance: 3-7 min (normal reader)  
  // 15% chance: 7-10 min (deep reader)
  if (randVal < 0.60) {
    return rand(60000, 180000); // 1-3 min
  } else if (randVal < 0.85) {
    return rand(180000, 420000); // 3-7 min
  } else {
    return rand(420000, 600000); // 7-10 min
  }
}

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

function getBezierPoint(t, p0, p1, p2) {
  const x = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x;
  const y = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y;
  return { x, y };
}

function weightedRandom(items, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let random = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    random -= weights[i];
    if (random <= 0) return items[i];
  }
  return items[items.length - 1];
}

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

/* ---------- CLI Parsing ---------- */
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
    // NEW: Variable target wait using weighted distribution
    useVariableTime: true, 
    minTargetWait: config.minTargetWait || 60000,
    maxTargetWait: config.maxTargetWait || 600000, // 10 min max
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
    returnRate: 0, // DISK FIX: Disabled
    closeReferrer: config.closeReferrer !== false, // NEW: Close X.com after landing (default true)
    clearCookies: config.clearCookies !== false, // NEW: Clear cookies (default true)
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
    else if (a === '--no-close-referrer') cfg.closeReferrer = false; // NEW
    else if (a === '--no-clear-cookies') cfg.clearCookies = false; // NEW
    else if (a === '--headless') cfg.headless = true;
    else if (a === '--debug') cfg.debug = true;
    else if (a === '--screenshot') cfg.screenshot = true;
    else if (a.startsWith('--proxy-list=')) cfg.proxyList = a.split('=')[1];
    else if (a.startsWith('--proxy=')) cfg.proxy = a.split('=')[1];
    else if (a.startsWith('--geo=')) cfg.geo = a.split('=')[1];
    else if (a.startsWith('--bounce-rate=')) cfg.bounceRate = parseFloat(a.split('=')[1]);
    else if (a.startsWith('--referrer-list=')) cfg.referrerList = a.split('=')[1];
    else if (a === '--schedule') cfg.schedule = true;
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

  await page.setRequestInterception(true);
  
  page.on('request', (req) => {
    const url = req.url();
    for (const pattern of BLOCKED_URL_PATTERNS) {
      if (pattern.test(url)) {
        return req.abort();
      }
    }
    req.continue();
  });
}

/* ---------- Behavioral Actions ---------- */
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

async function humanClick(page, target, cfg = {}) {
  let box;
  let elementHandle;
  
  if (typeof target === 'string') {
    elementHandle = await page.$(target);
    if (!elementHandle) {
      if (cfg.debug) log('debug', `Human click: Selector not found ${target}`);
      return false;
    }
  } else if (target && typeof target === 'object' && target.asElement) {
    elementHandle = target;
  } else if (typeof target === 'object' && target.x !== undefined && target.y !== undefined) {
    box = { 
      x: target.x, 
      y: target.y, 
      width: target.width || 0, 
      height: target.height || 0 
    };
  }
  
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
  
  const padding = 5;
  const targetX = box.x + rand(padding, Math.max(padding, box.width - padding));
  const targetY = box.y + rand(padding, Math.max(padding, box.height - padding));
  
  const currentPos = await page.evaluate(() => ({
    x: window.mouseX || window.innerWidth / 2,
    y: window.mouseY || window.innerHeight / 2
  }));
  
  const moveDuration = rand(800, 1500);
  await bezierMouseMove(page, currentPos.x, currentPos.y, targetX, targetY, moveDuration);
  
  await sleep(rand(100, 400));
  
  for (let i = 0; i < rand(2, 5); i++) {
    const wiggleX = targetX + rand(-3, 3);
    const wiggleY = targetY + rand(-3, 3);
    await page.mouse.move(wiggleX, wiggleY);
    await sleep(rand(20, 80));
  }
  
  await page.mouse.move(targetX, targetY);
  await page.mouse.down();
  await sleep(rand(80, 200));
  await page.mouse.up();
  
  await page.evaluate((x, y) => {
    window.mouseX = x;
    window.mouseY = y;
  }, targetX, targetY);
  
  await sleep(rand(50, 300));
  
  if (cfg.debug) log('debug', `Human click executed at ${Math.round(targetX)},${Math.round(targetY)}`);
  return true;
}

async function humanCuriousScroll(page, cfg, isReadingMode = false) {
  const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
  const viewportHeight = await page.evaluate(() => window.innerHeight);
  const maxScroll = Math.max(0, scrollHeight - viewportHeight);
  
  if (maxScroll <= 0) return;
  
  let currentY = await page.evaluate(() => window.scrollY);
  
  // In reading mode: smaller movements, more pauses
  const scrollRange = isReadingMode ? rand(200, 500) : rand(300, 800);
  const targetY = Math.min(currentY + scrollRange, maxScroll);
  
  let segments = isReadingMode ? rand(2, 4) : rand(3, 6);
  const step = (targetY - currentY) / segments;
  
  for (let i = 0; i < segments; i++) {
    currentY += step + rand(-30, 30);
    currentY = Math.max(0, Math.min(currentY, maxScroll));
    
    await page.evaluate(y => window.scrollTo(0, y), currentY);
    
    // Reading mode: longer pauses between scrolls
    const pauseTime = isReadingMode ? rand(2000, 5000) : rand(800, 2500);
    if (Math.random() < 0.7) {
      await sleep(pauseTime);
    }
    
    // Occasionally scroll back up (re-reading)
    if (Math.random() < (isReadingMode ? 0.5 : 0.3) && i < segments - 1) {
      const backUp = rand(30, 120);
      currentY = Math.max(0, currentY - backUp);
      await page.evaluate(y => window.scrollTo(0, y), currentY);
      await sleep(rand(1000, 3000)); // Re-reading time
      currentY += backUp;
      await page.evaluate(y => window.scrollTo(0, y), currentY);
    }
  }
  
  return currentY;
}

async function clickLearnBlogsPost(page, cfg) {
  try {
    const url = await page.url().catch(() => '');
    if (!url.includes('learnblogs.online')) return false;
    
    const isHomepage = url === 'https://learnblogs.online/' || 
                       url === 'https://learnblogs.online' ||
                       url.includes('/page/');
    
    let selectors;
    
    if (isHomepage) {
      selectors = [
        'article h2 a', '.post-title a', '.entry-title a',
        '.post h2 a', '.post h3 a', 'h2.entry-title a',
        'article .entry-title a', '.blog-post h2 a',
        '.post-entry a', 'main article a[href*="/"]',
        'article a[rel="bookmark"]', '.entry-header a',
        'h2 a', '.content h2 a'
      ];
    } else {
      selectors = [
        '.related-posts a', '.related-post a', '.related a',
        '.post-navigation a', '.nav-previous a', '.nav-next a',
        '.entry-tags a', '.tag-links a', '.cat-links a',
        '.tags a', '.post-tags a',
        '.entry-content a[href*="learnblogs.online"]',
        '.post-content a[href*="learnblogs.online"]'
      ];
    }
    
    const postData = await page.evaluate((selList) => {
      const candidates = [];
      for (const sel of selList) {
        const links = Array.from(document.querySelectorAll(sel));
        for (const link of links) {
          const href = link.href || '';
          const rect = link.getBoundingClientRect();
          
          if (rect.width === 0 || rect.height === 0) continue;
          if (rect.top < 50 || rect.left < 0) continue; // Skip header area
          if (rect.top > window.innerHeight - 50) continue;
          
          if (href.includes('learnblogs.online') && 
              !href.includes('#') && 
              !href.includes('wp-admin') &&
              !href.includes('wp-login') &&
              !href.includes('javascript:') &&
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
      const inViewport = candidates.filter(c => 
        c.y > 100 && c.y < window.innerHeight - 100
      );
      const pool = inViewport.length > 0 ? inViewport : candidates;
      return pool[Math.floor(Math.random() * pool.length)];
    }, selectors);
    
    if (!postData) return false;
    
    if (cfg.debug) log('debug', `Clicking post: "${postData.text}..."`);
    
    const clicked = await humanClick(page, postData, cfg);
    if (!clicked) return false;
    
    if (postData.href && postData.href !== url) {
      try {
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
      } catch (e) {}
    }
    
    await sleep(rand(2000, 5000));
    return true;
  } catch (e) {
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
        if (node.textContent.trim().length > 30) {
          const rect = node.parentElement.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0 && rect.top > 100 && rect.top < window.innerHeight - 100) {
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
    
    await sleep(rand(800, 2000)); // Reading selected text
    
    if (Math.random() < 0.2) {
      await page.keyboard.down('Control');
      await page.keyboard.down('c');
      await page.keyboard.up('c');
      await page.keyboard.up('Control');
      await sleep(rand(500, 1000));
    }
  } catch (e) {}
}

async function simulateReadingPause(page, duration = null) {
  const pauseTime = duration || rand(8000, 25000);
  await sleep(pauseTime);
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

// NEW: Enhanced engagement with Reading Mode support
async function engageWithLearnBlogs(page, cfg, durationMs) {
  const start = Date.now();
  const engagement = { 
    scrollEvents: 0, 
    mouseBursts: 0, 
    learnBlogsClicks: 0,
    readingMode: false,
    lastClickTime: start
  };
  
  // Decide if this session is "Reading Only" (no clicks, just scroll)
  // 40% chance of pure reading mode
  engagement.readingMode = Math.random() < 0.40;
  
  if (engagement.readingMode) {
    log('info', `[Tab] Entering READING MODE (no clicks, just scrolling)`);
  } else {
    log('info', `[Tab] Entering BROWSING MODE (clicks enabled)`);
  }
  
  // If not reading mode, plan first click time
  let nextClickTime = engagement.readingMode ? Date.now() + 99999999 : start + rand(15000, 40000);
  
  while (Date.now() - start < durationMs) {
    const elapsed = Date.now() - start;
    const remaining = durationMs - elapsed;
    
    // In browsing mode: occasional clicks
    if (!engagement.readingMode && Date.now() >= nextClickTime && remaining > 20000) {
      const clicked = await clickLearnBlogsPost(page, cfg);
      if (clicked) {
        engagement.learnBlogsClicks++;
        engagement.lastClickTime = Date.now();
        
        // After click, do curious scroll on new page
        await humanCuriousScroll(page, cfg, false);
        
        // Sometimes do deep click (click again on this page)
        if (Math.random() < 0.4 && (Date.now() - start) < (durationMs - 30000)) {
          await sleep(rand(3000, 8000));
          const deepClick = await clickLearnBlogsPost(page, cfg);
          if (deepClick) {
            engagement.learnBlogsClicks++;
            await humanCuriousScroll(page, cfg, false);
          }
        }
      }
      
      // Schedule next click or stop clicking if near end
      if (remaining > 30000) {
        nextClickTime = Date.now() + rand(20000, 45000);
      } else {
        nextClickTime = Date.now() + 99999999; // No more clicks, just read till end
      }
    }
    
    // Random scrolling (main activity in reading mode)
    if (Math.random() < 0.6) { // Higher chance in reading mode
      await humanCuriousScroll(page, cfg, engagement.readingMode);
      engagement.scrollEvents++;
      
      // Check ad viewability occasionally
      if (Math.random() < 0.3) {
        await checkAdViewability(page);
      }
    }
    
    // Text selection (reading behavior)
    if (Math.random() < 0.15) {
      await simulateTextSelection(page);
    }
    
    // Mouse wandering
    if (Math.random() < 0.4) {
      const x = rand(50, (await page.viewport()).width - 50);
      const y = rand(50, (await page.viewport()).height - 50);
      await bezierMouseMove(page, 
        (await page.evaluate(() => window.mouseX || 0)), 
        (await page.evaluate(() => window.mouseY || 0)), 
        x, y, 
        rand(500, 1500)
      );
      await page.evaluate((mx, my) => { window.mouseX = mx; window.mouseY = my; }, x, y);
      engagement.mouseBursts++;
    }
    
    // Tab switching (distraction)
    if (Math.random() < 0.08) {
      await simulateTabFocusBlur(page);
    }
    
    // Random reading pauses (staring at screen)
    if (Math.random() < 0.5) {
      const pauseDuration = engagement.readingMode ? 
        rand(3000, 8000) : // Longer pauses when reading
        rand(2000, 5000);
      await simulateReadingPause(page, pauseDuration);
    }
    
    // Wait before next action
    const waitTime = engagement.readingMode ? rand(3000, 7000) : rand(2000, 6000);
    await sleep(waitTime);
  }
  
  return engagement;
}

async function clickLinkToTarget(page, targetHost, cfg) {
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

// NEW: Clear all cookies and storage
async function clearAllBrowserData(page) {
  try {
    // Clear cookies
    const client = await page.target().createCDPSession();
    await client.send('Network.clearBrowserCookies');
    await client.send('Network.clearBrowserCache');
    
    // Clear local/session storage, indexedDB, etc
    await page.evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
        document.cookie.split(";").forEach(function(c) { 
          document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
        });
      } catch(e) {}
    });
    
    // Clear service workers and other storage
    await page.evaluate(async () => {
      if ('caches' in window) {
        try {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map(name => caches.delete(name)));
        } catch(e) {}
      }
    });
    
    return true;
  } catch (e) {
    return false;
  }
}

function appendCSV(row, cfg) {
  try {
    const csv = path.join(process.cwd(), 'sessions_log.csv');
    const headers = 'timestamp,run,tab,referrer_clicked,target_final,post_opened,reading_mode,clicks_count,duration_ms,proxy_used,referrer_used,cleared_data\n';
    
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
    process.exit(1);
  }
  
  if (!cfg.confirmOwned) {
    log('error', 'This script requires --confirm-owned. Only run on domains you own or have permission to test.');
    process.exit(1);
  }

  const proxies = loadProxies(cfg);
  const referrers = loadReferrers(cfg);
  const targetHost = new URL(cfg.target).hostname;
  
  log('info', `Starting HUMAN-BEHAVIOR tester — target: ${cfg.target}`);
  log('info', `Features: Variable read time (1-10min), Reading mode (40%), Close referrer: ${cfg.closeReferrer}, Clear cookies: ${cfg.clearCookies}`);
  
  if (cfg.dryRun) {
    log('warning', 'DRY RUN MODE - No browsers will be launched');
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
    
    for (let t = 0; t < tabs; t++) {
      const proxy = proxies.length ? proxies[rand(0, proxies.length - 1)] : null;
      const referrer = referrers.length ? selectReferrer(referrers) : cfg.referrer;
      
      // Generate variable dwell time (1-10 min weighted)
      const dwellTime = cfg.useVariableTime ? 
        weightedTimeSelection() : 
        gaussianRandom((cfg.minTargetWait + cfg.maxTargetWait)/2, 60000, cfg.minTargetWait, cfg.maxTargetWait);
      
      const profileDir = path.join('/tmp', `testbot_${Date.now()}_${rand(10000,99999)}_${t}`);
      const profile = UA_PROFILES[rand(0, UA_PROFILES.length - 1)];
      
      results.push({
        tab: t + 1,
        proxy,
        referrer,
        profile,
        profileDir,
        dwellTime, // Variable time per tab
        results: {
          refClicked: false,
          finalUrl: null,
          readingMode: false,
          learnBlogsClicks: 0,
          duration: 0,
          proxyUsed: proxy || 'none',
          referrerUsed: referrer || 'direct',
          cleared: false
        }
      });
    }
    
    // Show planned times
    results.forEach(r => {
      const mins = Math.round(r.dwellTime / 60000 * 10) / 10;
      log('info', `Tab ${r.tab}: Planned dwell time ${mins}min`);
    });
    
    const browsers = [];
    const pages = []; // Track pages to close referrer later
    
    try {
      for (const flow of results) {
        const launchArgs = [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-features=WebRtcHideLocalIpsWithMdns',
          '--disable-webrtc-encryption',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding'
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
        let referrerPage = null;
        let targetPage = null;
        
        try {
          // Open two pages: referrer and target
          const pages = await browser.pages();
          referrerPage = pages[0];
          
          await setupPageEvasion(referrerPage, flow.profile, cfg);
          await referrerPage.setUserAgent(flow.profile.userAgent);
          await referrerPage.setViewport({ 
            width: flow.profile.viewport.width, 
            height: flow.profile.viewport.height 
          });
          
          await referrerPage.evaluate(() => {
            window.mouseX = window.innerWidth / 2;
            window.mouseY = window.innerHeight / 2;
          });
          
          // Navigate to referrer (X.com)
          if (flow.referrer) {
            await referrerPage.goto(flow.referrer, { 
              waitUntil: 'domcontentloaded', 
              timeout: 60000 
            }).catch(() => {});
            
            // Wait on referrer briefly
            const refWait = gaussianRandom(
              (cfg.minRefWait + cfg.maxRefWait) / 2,
              (cfg.maxRefWait - cfg.minRefWait) / 4,
              cfg.minRefWait,
              cfg.maxRefWait
            );
            await sleep(refWait / 2); // Half time on referrer before click
            
            // Click to target
            flow.results.refClicked = await clickLinkToTarget(referrerPage, targetHost, cfg);
            
            if (flow.results.refClicked) {
              await sleep(3000);
              try { 
                await referrerPage.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }); 
              } catch {}
              
              // NEW: Get the target page (should be same page if same-tab navigation)
              targetPage = referrerPage;
              
              // NEW: Sometimes close referrer tab after landing (30% chance)
              if (cfg.closeReferrer && Math.random() < 0.30) {
                await sleep(rand(5000, 15000)); // Read a bit first
                try {
                  // Open new tab to keep session alive, close old
                  // Actually in Puppeteer we just continue on current page
                  // But we simulate "closing X.com" by navigating away fully
                  await targetPage.evaluate(() => {
                    // Clear referrer from history visually
                    if (window.history && window.history.replaceState) {
                      window.history.replaceState({}, document.title, window.location.href);
                    }
                  });
                  log('debug', `Tab ${flow.tab}: Simulated closing referrer`);
                } catch(e) {}
              }
            } else {
              // Direct navigation if click failed
              await referrerPage.goto(cfg.target, { 
                waitUntil: 'domcontentloaded', 
                timeout: 60000,
                referer: flow.referrer 
              });
              targetPage = referrerPage;
            }
          } else {
            // Direct to target
            await referrerPage.goto(cfg.target, { 
              waitUntil: 'domcontentloaded', 
              timeout: 60000 
            });
            targetPage = referrerPage;
          }
          
          // Now engage with LearnBlogs like a human
          if (targetHost.includes('learnblogs.online')) {
            // Initial scroll
            await humanCuriousScroll(targetPage, cfg, false);
            
            // Main engagement with variable time and reading mode
            const engagement = await engageWithLearnBlogs(targetPage, cfg, flow.dwellTime);
            
            flow.results.readingMode = engagement.readingMode;
            flow.results.learnBlogsClicks = engagement.learnBlogsClicks;
            flow.results.finalUrl = await targetPage.url();
          } else {
            // Generic behavior for other sites
            const waitTime = flow.dwellTime;
            const startWait = Date.now();
            while (Date.now() - startWait < waitTime) {
              await inertialScroll(targetPage);
              await sleep(rand(5000, 15000));
            }
            flow.results.finalUrl = await targetPage.url();
          }
          
          // NEW: Clear all cookies and data before closing
          if (cfg.clearCookies) {
            log('debug', `Tab ${flow.tab}: Clearing cookies and storage...`);
            const cleared = await clearAllBrowserData(targetPage);
            flow.results.cleared = cleared;
            if (cleared) {
              await sleep(1000); // Brief pause after clearing
            }
          }
          
          if (cfg.screenshot) {
            try {
              const shotPath = path.join(process.cwd(), `shot_run${run}_tab${flow.tab}_${Date.now()}.png`);
              await targetPage.screenshot({ path: shotPath, fullPage: false });
            } catch {}
          }
          
          flow.results.duration = Date.now() - start;
          await targetPage.close();
          
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
          flow.results.readingMode ? 'reading_mode' : 'browsing_mode',
          flow.results.learnBlogsClicks,
          flow.results.duration,
          flow.results.proxyUsed,
          flow.results.referrerUsed,
          flow.results.cleared ? 'yes' : 'no'
        ], cfg);
        
        const mins = Math.round(flow.results.duration / 60000 * 10) / 10;
        const mode = flow.results.readingMode ? 'READER' : 'BROWSER';
        log('success', `Tab ${flow.tab}: ${mode}, ${mins}min, ${flow.results.learnBlogsClicks} clicks, cleared:${flow.results.cleared}`);
      }
      
    } catch (e) {
      log('error', 'Run-level error:', e.message);
    } finally {
      // Close browsers and cleanup
      for (const { browser, flow } of browsers) {
        try { 
          await browser.close(); 
        } catch {}
        
        // Delete profile directory
        try {
          if (fs.existsSync(flow.profileDir)) {
            fs.rmSync(flow.profileDir, { recursive: true, force: true });
          }
        } catch {}
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

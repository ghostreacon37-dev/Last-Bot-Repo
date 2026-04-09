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

/* ---------- Profile Lock Cleanup (ADD THIS FUNCTION) ---------- */

function cleanProfileLocks(profileDir) {
  try {
    const lockFiles = [
      'SingletonLock', 
      'SingletonCookie', 
      'SingletonSocket', 
      'LOCK',
      '.lock',
      'chrome_shutdown_ms.txt'
    ];
    
    for (const file of lockFiles) {
      const filePath = path.join(profileDir, file);
      if (fs.existsSync(filePath)) {
        try {
          fs.rmSync(filePath, { recursive: true, force: true });
        } catch (e) {
          // Ignore individual file errors
        }
      }
    }
    
    // Also clean crashpad and GPUCache which can cause issues
    const dirsToClean = ['Crashpad', 'GPUCache', 'Session Storage', 'Local Storage'];
    for (const dir of dirsToClean) {
      const dirPath = path.join(profileDir, dir);
      if (fs.existsSync(dirPath)) {
        try {
          fs.rmSync(dirPath, { recursive: true, force: true });
        } catch (e) {
          // Ignore
        }
      }
    }
    
    // Remove any .org.chromium.Chromium.* files (socket files)
    if (fs.existsSync(profileDir)) {
      const files = fs.readdirSync(profileDir);
      for (const file of files) {
        if (file.startsWith('.org.chromium.') || file.startsWith('Temp-')) {
          try {
            fs.rmSync(path.join(profileDir, file), { recursive: true, force: true });
          } catch (e) {}
        }
      }
    }
  } catch (e) {
    // Ignore cleanup errors
  }
}

/* ---------- Profile Pool Management (UPDATED) ---------- */

function saveProfileToPool(profileDir, poolDir, profileId) {
  const targetDir = path.join(poolDir, profileId);
  try {
    if (!fs.existsSync(poolDir)) fs.mkdirSync(poolDir, { recursive: true });
    
    // Clean locks BEFORE copying to pool
    cleanProfileLocks(profileDir);
    
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

/* ---------- Main Execution (FIXED SECTIONS) ---------- */

(async () => {
  // ... keep all existing code until the while loop ...

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
      let profileSource = 'fresh';
      
      if (isReturn) {
        const existing = getRandomProfileFromPool(poolDir);
        if (existing) {
          // Use unique timestamp + random to avoid conflicts
          profileDir = path.join('/tmp', `testbot_active_${Date.now()}_${rand(1000,9999)}_${t}`);
          try {
            fs.cpSync(existing, profileDir, { recursive: true });
            // CRITICAL: Clean locks immediately after copying
            cleanProfileLocks(profileDir);
            profileSource = 'pool';
            log('debug', `Reusing profile for tab ${t+1} (locks cleaned)`);
          } catch (e) {
            log('warning', `Failed to copy from pool: ${e.message}, using fresh`);
            profileDir = path.join('/tmp', `testbot_profile_${Date.now()}_${rand(1000,9999)}_${t}`);
            profileSource = 'fresh';
          }
        } else {
          profileDir = path.join('/tmp', `testbot_profile_${Date.now()}_${rand(1000,9999)}_${t}`);
        }
      } else {
        profileDir = path.join('/tmp', `testbot_profile_${Date.now()}_${rand(1000,9999)}_${t}`);
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
        isReturn: profileSource === 'pool',
        profileSource,
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
          '--disable-webrtc-encryption',
          // Disable backgrounding to prevent lock issues
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
        
        // Double-check locks are cleaned before launch
        cleanProfileLocks(flow.profileDir);
        
        const browser = await puppeteer.launch({
          headless: !!cfg.headless,
          userDataDir: flow.profileDir,
          defaultViewport: null,
          args: launchArgs
        }).catch(async (err) => {
          if (err.message.includes('in use by another')) {
            // If still locked, use a fresh directory
            log('warning', `Tab ${flow.tab}: Profile locked, switching to fresh`);
            flow.profileDir = path.join('/tmp', `testbot_emergency_${Date.now()}_${rand(1000,9999)}`);
            flow.isReturn = false;
            return await puppeteer.launch({
              headless: !!cfg.headless,
              userDataDir: flow.profileDir,
              defaultViewport: null,
              args: launchArgs
            });
          }
          throw err;
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
      
      // ... keep rest of execution code same ...
      
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
          
          await inertialScroll(page);
          engagement.scrollEvents++;
          
          const homeWait = gaussianRandom(150000, 45000, 30000, 480000);
          await waitWithActivity(page, homeWait, cfg, engagement);
          flow.results.finalUrl = await page.url();
          flow.results.pagesVisited = 1;
          
          await checkAdViewability(page);
          
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
          
          flow.results.learnBlogsClicks = engagement.learnBlogsClicks || 0;
          
          if (cfg.screenshot) {
            try {
              const shotPath = path.join(process.cwd(), `shot_run${run}_tab${flow.tab}_${Date.now()}.png`);
              await page.screenshot({ path: shotPath, fullPage: false });
            } catch {}
          }
          
          flow.results.duration = Date.now() - start;
          await page.close();
          
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
      // Close browsers first, then handle profiles
      for (const { browser } of browsers) {
        try { 
          await browser.close(); 
        } catch {}
      }
      
      // Wait a bit for Chrome to fully release locks
      await sleep(500);
      
      for (const { flow } of browsers) {
        if (flow.isReturn) {
          const poolId = `profile_${Date.now()}_${flow.tab}_${rand(1000,9999)}`;
          saveProfileToPool(flow.profileDir, poolDir, poolId);
        }
        
        try { 
          if (fs.existsSync(flow.profileDir)) {
            cleanProfileLocks(flow.profileDir); // Clean before delete
            fs.rmSync(flow.profileDir, { recursive: true, force: true });
          }
        } catch {}
      }
    }
    
    if (cfg.forever) {
      if (stop) break;
      log('info', `Waiting ${cfg.interval}ms before next run...`);
      await sleep(cfg.interval);
      // Extra safety delay for Chrome termination
      await sleep(500);
    } else {
      if (run >= cfg.runs) break;
      log('info', `Waiting ${cfg.interval}ms before next run...`);
      await sleep(cfg.interval);
    }
  }
  
  log('success', 'All runs complete. See sessions_log.csv for details.');
  process.exit(0);
})();

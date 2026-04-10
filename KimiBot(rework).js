/**
 * testbot.js - Human Behavior Edition with Disk Safety
 * Authorized testing only - requires --confirm-owned flag
 */

const puppeteer = require('puppeteer-extra');
const fs = require('fs');
const path = require('path');
puppeteer.use(require('puppeteer-extra-plugin-stealth')());

const colors = {
  reset: '\x1b[0m', bright: '\x1b[1m', red: '\x1b[31m', green: '\x1b[32m',
  yellow: '\x1b[33m', blue: '\x1b[34m', cyan: '\x1b[36m', gray: '\x1b[90m'
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

const UA_PROFILES = [
  { name: 'win-chrome', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36', platform: 'Win32', vendor: 'Google Inc.', oscpu: 'Windows NT 10.0; Win64; x64', maxTouchPoints: 0, deviceMemory: 8, hardwareConcurrency: 8, screen: { width: 1920, height: 1080, colorDepth: 24 }, viewport: { width: 1366, height: 768 }, webgl: { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Direct3D11 vs_5_0 ps_5_0, D3D11)' } },
  { name: 'mac-safari', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15', platform: 'MacIntel', vendor: 'Apple Computer, Inc.', maxTouchPoints: 0, deviceMemory: 8, hardwareConcurrency: 8, screen: { width: 1440, height: 900, colorDepth: 30 }, viewport: { width: 1440, height: 900 }, webgl: { vendor: 'Apple Inc.', renderer: 'Apple GPU' } },
  { name: 'linux-chrome', userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36', platform: 'Linux x86_64', vendor: 'Google Inc.', oscpu: 'Linux x86_64', maxTouchPoints: 0, deviceMemory: 4, hardwareConcurrency: 4, screen: { width: 1920, height: 1080, colorDepth: 24 }, viewport: { width: 1366, height: 768 }, webgl: { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1050 Direct3D11 vs_5_0 ps_5_0, D3D11)' } },
  { name: 'iphone', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/121.0.0.0 Mobile/15E148 Safari/604.1', platform: 'iPhone', vendor: 'Apple Computer, Inc.', maxTouchPoints: 5, deviceMemory: 4, hardwareConcurrency: 4, screen: { width: 390, height: 844, colorDepth: 32 }, viewport: { width: 390, height: 844 }, webgl: { vendor: 'Apple Inc.', renderer: 'Apple GPU' } },
  { name: 'pixel', userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36', platform: 'Linux armv8l', vendor: 'Google Inc.', maxTouchPoints: 5, deviceMemory: 8, hardwareConcurrency: 8, screen: { width: 412, height: 915, colorDepth: 24 }, viewport: { width: 412, height: 915 }, webgl: { vendor: 'Google Inc. (Qualcomm)', renderer: 'ANGLE (Qualcomm, Adreno (TM) 730, OpenGL ES 3.2)' } }
];

const REFERRER_WEIGHTS = { 'google:': 0.40, 'social:': 0.25, 'direct:': 0.15, 'ref:': 0.20 };
const BLOCKED_URL_PATTERNS = [/moat\.js/i, /iasds01/i, /doubleverify/i, /cdn-cgi\/challenge-platform/i, /pagead\/viewthroughconversion/i, /googlesyndication/i, /doubleclick/i, /amazon-adsystem/i];

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function weightedTimeSelection() {
  const randVal = Math.random();
  if (randVal < 0.60) return rand(60000, 180000);
  else if (randVal < 0.85) return rand(180000, 420000);
  else return rand(420000, 600000);
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const cfg = {
    target: null, referrer: null, runs: 1, forever: false, interval: 10000,
    minRefWait: 60000, maxRefWait: 120000, useVariableTime: true,
    minTabs: 2, maxTabs: 7, fixedInstances: null, confirmOwned: false,
    headless: false, debug: false, screenshot: false,
    proxyList: null, proxy: null, geo: 'US', bounceRate: 0.45,
    referrerList: null, schedule: false, returnRate: 0,
    closeReferrer: true, clearCookies: true, dryRun: false
  };

  for (const a of argv) {
    if (!cfg.target && !a.startsWith('--')) cfg.target = a;
    else if (!cfg.referrer && !a.startsWith('--')) cfg.referrer = a;
    else if (a.startsWith('--runs=')) cfg.runs = Math.max(1, parseInt(a.split('=')[1])||1);
    else if (a === '--forever') cfg.forever = true;
    else if (a.startsWith('--interval=')) cfg.interval = Math.max(0, parseInt(a.split('=')[1])||cfg.interval);
    else if (a.startsWith('--min-ref-wait=')) cfg.minRefWait = Math.max(1000, parseInt(a.split('=')[1])||cfg.minRefWait);
    else if (a.startsWith('--max-ref-wait=')) cfg.maxRefWait = Math.max(cfg.minRefWait, parseInt(a.split('=')[1])||cfg.maxRefWait);
    else if (a === '--no-close-referrer') cfg.closeReferrer = false;
    else if (a === '--no-clear-cookies') cfg.clearCookies = false;
    else if (a === '--confirm-owned') cfg.confirmOwned = true;
    else if (a === '--headless') cfg.headless = true;
    else if (a === '--debug') cfg.debug = true;
    else if (a === '--screenshot') cfg.screenshot = true;
    else if (a.startsWith('--proxy=')) cfg.proxy = a.split('=')[1];
    else if (a.startsWith('--geo=')) cfg.geo = a.split('=')[1];
    else if (a.startsWith('--bounce-rate=')) cfg.bounceRate = parseFloat(a.split('=')[1]);
    else if (a === '--dry-run') cfg.dryRun = true;
  }
  return cfg;
}

async function clearAllBrowserData(page) {
  try {
    const client = await page.target().createCDPSession();
    await client.send('Network.clearBrowserCookies');
    await client.send('Network.clearBrowserCache');
    await page.evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
        document.cookie.split(";").forEach(function(c) { 
          document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
        });
      } catch(e) {}
    });
    return true;
  } catch (e) { return false; }
}

async function humanBehavior(page, cfg, durationMs) {
  const start = Date.now();
  const readingMode = Math.random() < 0.40;
  let clicks = 0;
  
  log('info', readingMode ? `[Tab] READING MODE (scroll only)` : `[Tab] BROWSING MODE (clicks enabled)`);
  
  while (Date.now() - start < durationMs) {
    const remaining = durationMs - (Date.now() - start);
    
    // Random scrolling
    if (Math.random() < 0.6) {
      const scrollAmount = rand(200, 800);
      await page.evaluate((y) => window.scrollBy(0, y), scrollAmount);
      await sleep(rand(800, readingMode ? 5000 : 2500));
      
      // Occasionally scroll back up
      if (Math.random() < 0.3) {
        await page.evaluate((y) => window.scrollBy(0, -y), rand(100, 300));
        await sleep(rand(500, 2000));
      }
    }
    
    // Clicks only in browsing mode
    if (!readingMode && Math.random() < 0.1 && remaining > 20000) {
      const links = await page.evaluate(() => {
        const candidates = [];
        document.querySelectorAll('a[href*="learnblogs.online"]').forEach(a => {
          const rect = a.getBoundingClientRect();
          if (rect.width > 0 && rect.top > 100 && rect.top < window.innerHeight - 50) {
            candidates.push({ x: rect.x + rect.width/2, y: rect.y + rect.height/2 });
          }
        });
        return candidates;
      });
      
      if (links.length > 0) {
        const link = links[Math.floor(Math.random() * links.length)];
        await page.mouse.move(link.x, link.y);
        await sleep(rand(100, 300));
        await page.mouse.click(link.x, link.y);
        clicks++;
        await sleep(rand(3000, 6000));
      }
    }
    
    // Mouse wandering
    if (Math.random() < 0.3) {
      await page.mouse.move(rand(100, 800), rand(100, 600));
    }
    
    // Reading pause
    await sleep(rand(2000, readingMode ? 8000 : 5000));
  }
  
  return { readingMode, clicks };
}

(async () => {
  const cfg = parseArgs();
  
  if (!cfg.target) {
    console.error('Usage: node testbot.js <target_url> <referrer_url> [options] --confirm-owned');
    process.exit(1);
  }
  
  if (!cfg.confirmOwned) {
    log('error', 'This script requires --confirm-owned. Only run on domains you own or have permission to test.');
    process.exit(1);
  }

  log('info', `Authorized testing on: ${cfg.target}`);
  log('info', `Features: Variable time (1-10min), Reading mode (40%), Close referrer: ${cfg.closeReferrer}, Clear cookies: ${cfg.clearCookies}`);
  
  if (cfg.dryRun) { log('warning', 'DRY RUN'); process.exit(0); }

  let run = 0;
  let stop = false;
  process.on('SIGINT', () => { stop = true; });

  while (!stop && (cfg.forever || run < cfg.runs)) {
    run++;
    log('info', `\n=== Run ${run} ===`);
    
    const tabs = cfg.fixedInstances || rand(cfg.minTabs, cfg.maxTabs);
    const browsers = [];
    
    try {
      for (let t = 0; t < tabs; t++) {
        const dwellTime = weightedTimeSelection();
        const profileDir = path.join('/tmp', `testbot_${Date.now()}_${rand(10000,99999)}_${t}`);
        
        log('info', `Tab ${t+1}: ${Math.round(dwellTime/60000*10)/10}min planned`);
        
        const browser = await puppeteer.launch({
          headless: !!cfg.headless,
          userDataDir: profileDir,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        browsers.push({ browser, profileDir, tab: t+1, dwellTime });
        
        const [page] = await browser.pages();
        await page.setViewport({ width: 1366, height: 768 });
        
        // Go to referrer first
        if (cfg.referrer) {
          await page.goto(cfg.referrer, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await sleep(rand(15000, 30000));
          
          // Click to target
          const clicked = await page.evaluate((target) => {
            const links = Array.from(document.querySelectorAll('a[href]'));
            for (const a of links) {
              if (a.href.includes(target)) { a.click(); return true; }
            }
            return false;
          }, new URL(cfg.target).hostname);
          
          if (!clicked) await page.goto(cfg.target, { waitUntil: 'domcontentloaded' });
          else await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(()=>{});
        } else {
          await page.goto(cfg.target, { waitUntil: 'domcontentloaded' });
        }
        
        // Simulate human behavior
        const result = await humanBehavior(page, cfg, dwellTime);
        
        // Clear cookies if enabled
        if (cfg.clearCookies) {
          await clearAllBrowserData(page);
          log('debug', `Tab ${t+1}: Cookies cleared`);
        }
        
        log('success', `Tab ${t+1}: ${result.readingMode ? 'READER' : 'BROWSER'}, ${result.clicks} clicks`);
        
        await page.close();
        await browser.close();
        
        // IMMEDIATE CLEANUP - delete profile
        try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {}
      }
    } catch (e) {
      log('error', 'Error:', e.message);
    }
    
    if (!stop) {
      log('info', `Waiting ${cfg.interval}ms...`);
      await sleep(cfg.interval);
    }
  }
  
  log('success', 'Complete');
  process.exit(0);
})();

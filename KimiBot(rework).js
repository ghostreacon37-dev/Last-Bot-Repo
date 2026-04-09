/**
 * testbot.js
 * Working version with real human clicks and progressive reading
 */

const puppeteer = require('puppeteer-extra');
const fs = require('fs');
const path = require('path');
puppeteer.use(require('puppeteer-extra-plugin-stealth')());

/* ---------- Console Colors ---------- */
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
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

/* ---------- Helpers ---------- */
function rand(min, max) { 
  return Math.floor(Math.random() * (max - min + 1)) + min; 
}

function sleep(ms) { 
  return new Promise(r => setTimeout(r, ms)); 
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

/* ---------- Config ---------- */
const UA_PROFILES = [
  {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    platform: 'Win32',
    vendor: 'Google Inc.',
    deviceMemory: 8,
    hardwareConcurrency: 8,
    screen: { width: 1920, height: 1080 },
    viewport: { width: 1366, height: 768 }
  },
  {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
    platform: 'MacIntel',
    vendor: 'Apple Computer, Inc.',
    deviceMemory: 8,
    hardwareConcurrency: 8,
    screen: { width: 1440, height: 900 },
    viewport: { width: 1440, height: 900 }
  },
  {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/121.0.0.0 Mobile/15E148 Safari/604.1',
    platform: 'iPhone',
    vendor: 'Apple Computer, Inc.',
    deviceMemory: 4,
    hardwareConcurrency: 4,
    screen: { width: 390, height: 844 },
    viewport: { width: 390, height: 844 }
  }
];

const BLOCKED_URL_PATTERNS = [
  /moat\.js/i,
  /doubleverify/i,
  /cdn-cgi\/challenge-platform/i
];

function parseArgs() {
  const argv = process.argv.slice(2);
  const cfg = {
    target: null,
    referrer: null,
    runs: 1,
    forever: false,
    interval: 10000,
    minRefWait: 60000,
    maxRefWait: 120000,
    minTargetWait: 60000,
    maxTargetWait: 270000,
    confirmOwned: false,
    headless: false,
    debug: false,
    proxy: null,
    readingSpeed: 'normal', // slow, normal, fast
    engagement: 'medium' // low, medium, high
  };

  for (const a of argv) {
    if (!cfg.target && !a.startsWith('--')) cfg.target = a;
    else if (!cfg.referrer && !a.startsWith('--')) cfg.referrer = a;
    else if (a.startsWith('--runs=')) cfg.runs = parseInt(a.split('=')[1])||1;
    else if (a === '--forever') cfg.forever = true;
    else if (a.startsWith('--interval=')) cfg.interval = parseInt(a.split('=')[1])||10000;
    else if (a.startsWith('--min-ref-wait=')) cfg.minRefWait = parseInt(a.split('=')[1])||60000;
    else if (a.startsWith('--max-ref-wait=')) cfg.maxRefWait = parseInt(a.split('=')[1])||120000;
    else if (a === '--confirm-owned') cfg.confirmOwned = true;
    else if (a === '--headless') cfg.headless = true;
    else if (a === '--debug') cfg.debug = true;
    else if (a.startsWith('--proxy=')) cfg.proxy = a.split('=')[1];
    else if (a.startsWith('--reading-speed=')) cfg.readingSpeed = a.split('=')[1];
    else if (a.startsWith('--engagement=')) cfg.engagement = a.split('=')[1];
  }

  return cfg;
}

/* ---------- Browser Setup ---------- */
async function setupEvasion(page, profile) {
  await page.evaluateOnNewDocument((prof) => {
    Object.defineProperty(navigator, 'platform', { get: () => prof.platform });
    Object.defineProperty(navigator, 'vendor', { get: () => prof.vendor });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => prof.deviceMemory });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => prof.hardwareConcurrency });
  }, profile);

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    for (const pattern of BLOCKED_URL_PATTERNS) {
      if (pattern.test(url)) return req.abort();
    }
    req.continue();
  });
}

/* ---------- Human Click Simulation ---------- */
async function bezierMove(page, x1, y1, x2, y2, duration = 800) {
  const steps = Math.max(8, Math.floor(duration / 16));
  const cp = { x: (x1 + x2) / 2 + rand(-30, 30), y: (y1 + y2) / 2 + rand(-30, 30) };
  
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const pos = getBezierPoint(ease, {x: x1, y: y1}, cp, {x: x2, y: y2});
    await page.mouse.move(pos.x, pos.y);
    await sleep(duration / steps);
  }
}

async function humanClick(page, elementOrCoords, cfg = {}) {
  let box;
  
  if (typeof elementOrCoords === 'string') {
    const el = await page.$(elementOrCoords);
    if (!el) return false;
    box = await el.boundingBox();
  } else if (elementOrCoords.x !== undefined) {
    // Coordinates object - need to account for scroll
    const scrollY = await page.evaluate(() => window.scrollY);
    box = {
      x: elementOrCoords.x - 30,
      y: elementOrCoords.y - scrollY - 10,
      width: 60,
      height: 20
    };
  } else {
    box = await elementOrCoords.boundingBox();
  }
  
  if (!box) return false;
  
  // Random position within element (not center)
  const targetX = box.x + rand(3, Math.max(3, box.width - 3));
  const targetY = box.y + rand(3, Math.max(3, box.height - 3));
  
  // Get current mouse pos
  const current = await page.evaluate(() => ({ x: window.mouseX || 100, y: window.mouseY || 100 }));
  
  // Move with curve
  await bezierMove(page, current.x, current.y, targetX, targetY, rand(500, 1200));
  
  // Hesitation (human reaction time)
  await sleep(rand(80, 300));
  
  // Micro-adjustments
  for (let i = 0; i < rand(0, 3); i++) {
    await page.mouse.move(targetX + rand(-2, 2), targetY + rand(-2, 2));
    await sleep(rand(20, 80));
  }
  
  // Click with realistic timing
  await page.mouse.down();
  await sleep(rand(60, 180)); // Press duration
  await page.mouse.up();
  
  // Update global mouse pos
  await page.evaluate((x, y) => { window.mouseX = x; window.mouseY = y; }, targetX, targetY);
  
  // Post-click linger
  await sleep(rand(100, 250));
  
  return true;
}

/* ---------- Progressive Reading Logic ---------- */
async function simulateReadingSession(page, cfg) {
  const startTime = Date.now();
  const stats = { clicks: 0, scrolls: 0, timeSpent: 0 };
  
  // Get page content info
  const pageInfo = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href]'))
      .filter(a => {
        const href = a.href || '';
        return href.includes(window.location.hostname) && 
               !href.includes('#') && 
               a.offsetParent !== null &&
               a.innerText.trim().length > 0;
      })
      .map(a => {
        const rect = a.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2 + window.scrollY,
          text: a.innerText.trim().substring(0, 30),
          href: a.href
        };
      });
    
    return {
      totalHeight: document.body.scrollHeight,
      links: links.slice(0, 10),
      hasContent: document.body.innerText.length > 500
    };
  });
  
  if (!pageInfo.hasContent) {
    await sleep(5000);
    return stats;
  }
  
  // Calculate reading time based on speed
  const speeds = { slow: 4000, normal: 2500, fast: 1200 }; // ms per scroll/section
  const readTime = gaussianRandom(
    cfg.minTargetWait, 
    (cfg.maxTargetWait - cfg.minTargetWait) / 4,
    cfg.minTargetWait,
    cfg.maxTargetWait
  );
  
  log('info', `Reading session: ${Math.round(readTime/1000)}s planned`);
  
  // Initialize mouse
  await page.evaluate(() => { window.mouseX = 200; window.mouseY = 300; });
  
  let lastClickTime = startTime;
  let currentScroll = 0;
  
  while (Date.now() - startTime < readTime) {
    const elapsed = Date.now() - startTime;
    const progress = elapsed / readTime; // 0 to 1
    
    // Progressive engagement: longer we stay, more likely to click
    // Base chance 1%, max 25% by end of session
    let clickChance = 0.01 + (progress * 0.24);
    
    // Adjust by engagement level
    if (cfg.engagement === 'high') clickChance *= 2;
    else if (cfg.engagement === 'low') clickChance *= 0.3;
    
    // Time since last click penalty (don't click too frequently)
    const timeSinceLastClick = Date.now() - lastClickTime;
    if (timeSinceLastClick < 10000) clickChance = 0; // Min 10s between clicks
    
    // Try to click if chance hits and we have links
    if (Math.random() < clickChance && pageInfo.links.length > 0) {
      // Find visible links
      const viewportHeight = (await page.viewport()).height;
      const visibleLinks = pageInfo.links.filter(l => 
        l.y > currentScroll && 
        l.y < currentScroll + viewportHeight - 100
      );
      
      if (visibleLinks.length > 0) {
        const link = visibleLinks[rand(0, visibleLinks.length - 1)];
        
        log('debug', `Clicking: ${link.text}...`);
        
        // Move to link and click like human
        await bezierMove(page,
          await page.evaluate(() => window.mouseX),
          await page.evaluate(() => window.mouseY),
          link.x + rand(-20, 20),
          link.y - currentScroll + rand(-5, 10),
          rand(400, 900)
        );
        
        const clicked = await humanClick(page, { x: link.x, y: link.y }, cfg);
        
        if (clicked) {
          stats.clicks++;
          lastClickTime = Date.now();
          
          // Wait after click (reading the new content or interaction)
          await sleep(rand(3000, 8000));
          
          // 40% chance to go back if we navigated
          try {
            const currentUrl = await page.url();
            if (!currentUrl.includes(new URL(cfg.target).hostname)) {
              await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
              await sleep(2000);
              // Restore scroll position
              await page.evaluate(y => window.scrollTo(0, y), currentScroll);
            }
          } catch {}
        }
      }
    }
    
    // Natural scroll reading behavior
    const scrollAmount = rand(150, 400);
    const targetScroll = Math.min(currentScroll + scrollAmount, pageInfo.totalHeight - 800);
    
    if (targetScroll > currentScroll) {
      // Scroll like human: move mouse to side, then scroll
      await bezierMove(page,
        await page.evaluate(() => window.mouseX),
        await page.evaluate(() => window.mouseY),
        rand(100, 300),
        rand(200, 500),
        300
      );
      
      await page.evaluate(y => {
        window.scrollTo({ top: y, behavior: 'smooth' });
      }, targetScroll);
      
      currentScroll = targetScroll;
      stats.scrolls++;
      
      // Reading pause (looking at content)
      const pauseTime = speeds[cfg.readingSpeed] || 2500;
      await sleep(pauseTime + rand(-500, 1000));
      
      // Random mouse movement while "reading"
      if (Math.random() < 0.3) {
        await page.mouse.move(
          rand(100, (await page.viewport()).width - 100),
          rand(200, (await page.viewport()).height - 200)
        );
        await page.evaluate((x, y) => { window.mouseX = x; window.mouseY = y; }, 
          await page.evaluate(() => window.mouseX), 
          await page.evaluate(() => window.mouseY)
        );
      }
    } else {
      // At bottom, just wait
      await sleep(2000);
    }
    
    // Break if we've been here too long
    if (Date.now() - startTime > cfg.maxTargetWait) break;
  }
  
  stats.timeSpent = Date.now() - startTime;
  return stats;
}

/* ---------- Main Actions ---------- */
async function clickLinkToTarget(page, targetHost, cfg) {
  const link = await page.evaluate((host) => {
    const anchors = Array.from(document.querySelectorAll('a[href]')).filter(a => {
      return a.href && a.href.includes(host) && a.offsetParent !== null;
    });
    if (!anchors.length) return null;
    const el = anchors[0];
    const rect = el.getBoundingClientRect();
    return {
      x: rect.left + rect.width/2,
      y: rect.top + rect.height/2 + window.scrollY,
      text: el.innerText
    };
  }, targetHost);
  
  if (link) {
    log('debug', `Clicking to target: ${link.text}`);
    return await humanClick(page, { x: link.x, y: link.y }, cfg);
  }
  return false;
}

/* ---------- Main Loop ---------- */
(async () => {
  const cfg = parseArgs();
  
  if (!cfg.target || !cfg.confirmOwned) {
    log('error', 'Usage: node testbot.js <target> [referrer] --confirm-owned');
    process.exit(1);
  }

  log('info', `Starting reader bot — target: ${cfg.target}`);
  log('info', `Speed: ${cfg.readingSpeed}, Engagement: ${cfg.engagement}`);

  let run = 0;
  let stop = false;
  process.on('SIGINT', () => { stop = true; });

  while (!stop && (cfg.forever || run < cfg.runs)) {
    run++;
    log('info', `\n=== Run ${run} ===`);
    
    const tabs = rand(2, 4);
    const browsers = [];
    
    for (let t = 0; t < tabs; t++) {
      const profile = UA_PROFILES[rand(0, UA_PROFILES.length - 1)];
      const profileDir = path.join('/tmp', `bot_${Date.now()}_${t}`);
      
      try {
        const launchArgs = ['--no-sandbox', '--disable-setuid-sandbox'];
        if (cfg.proxy) launchArgs.push(`--proxy-server=${cfg.proxy}`);
        
        const browser = await puppeteer.launch({
          headless: !!cfg.headless,
          userDataDir: profileDir,
          defaultViewport: null,
          args: launchArgs
        });
        
        browsers.push({ browser, profile, profileDir, tab: t+1 });
      } catch (e) {
        log('error', `Failed to launch tab ${t+1}:`, e.message);
      }
    }
    
    // Run sessions
    await Promise.all(browsers.map(async ({ browser, profile, profileDir, tab }) => {
      try {
        const page = await browser.newPage();
        await setupEvasion(page, profile);
        await page.setUserAgent(profile.userAgent);
        await page.setViewport({ width: profile.viewport.width, height: profile.viewport.height });
        
        // Init mouse tracking
        await page.evaluate(() => { window.mouseX = 100; window.mouseY = 100; });
        
        // Navigate
        if (cfg.referrer) {
          await page.goto(cfg.referrer, { waitUntil: 'domcontentloaded', timeout: 60000 });
          await sleep(rand(2000, 5000));
          
          const clicked = await clickLinkToTarget(page, new URL(cfg.target).hostname, cfg);
          if (!clicked) {
            await page.goto(cfg.target, { waitUntil: 'domcontentloaded', referer: cfg.referrer });
          } else {
            await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
          }
        } else {
          await page.goto(cfg.target, { waitUntil: 'domcontentloaded' });
        }
        
        // Read and click progressively
        const stats = await simulateReadingSession(page, cfg);
        
        log('success', `Tab ${tab}: ${stats.clicks} clicks, ${stats.scrolls} scrolls, ${Math.round(stats.timeSpent/1000)}s`);
        
      } catch (e) {
        if (cfg.debug) log('error', `Tab ${tab} error:`, e.message);
      }
    }));
    
    // Cleanup - FIXED (no .catch on rmSync)
    for (const { browser, profileDir } of browsers) {
      try {
        await browser.close();
      } catch {}
      
      try {
        if (fs.existsSync(profileDir)) {
          fs.rmSync(profileDir, { recursive: true, force: true });
        }
      } catch (e) {
        if (cfg.debug) log('debug', `Cleanup error: ${e.message}`);
      }
    }
    
    if (!stop && (cfg.forever || run < cfg.runs)) {
      await sleep(cfg.interval);
    }
  }
  
  log('success', 'Done.');
  process.exit(0);
})();

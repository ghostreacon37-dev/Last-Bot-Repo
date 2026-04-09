/**
 * testbot.js
 *
 * Repeatable site tester (for domains you own) - Advanced Edition v3.0
 * Realistic article reading with progressive engagement
 */

const puppeteer = require('puppeteer-extra');
const fs = require('fs');
const path = require('path');
puppeteer.use(require('puppeteer-extra-plugin-stealth')());

/* ---------- Colorized Console ---------- */
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
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

/* ---------- Configuration ---------- */
const UA_PROFILES = [
  {
    name: 'win-chrome',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    platform: 'Win32',
    vendor: 'Google Inc.',
    deviceMemory: 8,
    hardwareConcurrency: 8,
    screen: { width: 1920, height: 1080 },
    viewport: { width: 1366, height: 768 },
    webgl: { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Direct3D11 vs_5_0 ps_5_0, D3D11)' }
  },
  {
    name: 'mac-safari',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
    platform: 'MacIntel',
    vendor: 'Apple Computer, Inc.',
    deviceMemory: 8,
    hardwareConcurrency: 8,
    screen: { width: 1440, height: 900 },
    viewport: { width: 1440, height: 900 },
    webgl: { vendor: 'Apple Inc.', renderer: 'Apple GPU' }
  },
  {
    name: 'linux-chrome',
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    platform: 'Linux x86_64',
    vendor: 'Google Inc.',
    deviceMemory: 4,
    hardwareConcurrency: 4,
    screen: { width: 1920, height: 1080 },
    viewport: { width: 1366, height: 768 },
    webgl: { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1050 Direct3D11 vs_5_0 ps_5_0, D3D11)' }
  },
  {
    name: 'iphone',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/121.0.0.0 Mobile/15E148 Safari/604.1',
    platform: 'iPhone',
    vendor: 'Apple Computer, Inc.',
    deviceMemory: 4,
    hardwareConcurrency: 4,
    screen: { width: 390, height: 844 },
    viewport: { width: 390, height: 844 },
    webgl: { vendor: 'Apple Inc.', renderer: 'Apple GPU' }
  }
];

const BLOCKED_URL_PATTERNS = [
  /moat\.js/i,
  /doubleverify/i,
  /cdn-cgi\/challenge-platform/i,
  /pagead\/viewthroughconversion/i
];

const AFFILIATE_PATTERNS = [/\?ref=/i, /&tag=/i, /utm_medium=paid/i, /\/sponsored\//i];

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
  return Math.max(min || 0, Math.min(max || Infinity, num));
}

function getBezierPoint(t, p0, p1, p2) {
  const x = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x;
  const y = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y;
  return { x, y };
}

/* ---------- CLI Parsing ---------- */
function parseArgs() {
  const argv = process.argv.slice(2);
  let config = {};
  
  const configArg = argv.find(a => a.startsWith('--config='));
  if (configArg) {
    try {
      config = JSON.parse(fs.readFileSync(configArg.split('=')[1], 'utf8'));
    } catch (e) {
      log('error', 'Failed to load config');
      process.exit(1);
    }
  }

  const cfg = {
    target: config.target || null,
    referrer: config.referrer || null,
    runs: config.runs || 1,
    forever: config.forever || false,
    interval: config.interval || 10000,
    confirmOwned: config.confirmOwned || false,
    headless: config.headless || false,
    debug: config.debug || false,
    proxy: config.proxy || null,
    readingSpeed: config.readingSpeed || 'normal',
    engagementDepth: config.engagementDepth || 'medium',
    ...config
  };

  for (const a of argv) {
    if (!cfg.target && !a.startsWith('--')) cfg.target = a;
    else if (!cfg.referrer && !a.startsWith('--')) cfg.referrer = a;
    else if (a.startsWith('--runs=')) cfg.runs = parseInt(a.split('=')[1])||1;
    else if (a === '--forever') cfg.forever = true;
    else if (a.startsWith('--interval=')) cfg.interval = parseInt(a.split('=')[1])||10000;
    else if (a === '--confirm-owned') cfg.confirmOwned = true;
    else if (a === '--headless') cfg.headless = true;
    else if (a === '--debug') cfg.debug = true;
    else if (a.startsWith('--proxy=')) cfg.proxy = a.split('=')[1];
    else if (a.startsWith('--reading-speed=')) cfg.readingSpeed = a.split('=')[1];
    else if (a.startsWith('--engagement-depth=')) cfg.engagementDepth = a.split('=')[1];
  }

  return cfg;
}

/* ---------- Browser Setup ---------- */
async function setupPageEvasion(page, profile) {
  await page.evaluateOnNewDocument((prof) => {
    Object.defineProperty(navigator, 'platform', { get: () => prof.platform });
    Object.defineProperty(navigator, 'vendor', { get: () => prof.vendor });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => prof.deviceMemory });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => prof.hardwareConcurrency });
    Object.defineProperty(window.screen, 'width', { get: () => prof.screen.width });
    Object.defineProperty(window.screen, 'height', { get: () => prof.screen.height });
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

/* ---------- Advanced Reading Simulation ---------- */

async function analyzeContentStructure(page) {
  return await page.evaluate(() => {
    const paragraphs = document.querySelectorAll('p, article p, .content p, .post-content p, [class*="content"] p');
    const headings = document.querySelectorAll('h1, h2, h3, h4');
    const text = document.body.innerText || '';
    const wordCount = text.trim().split(/\s+/).length;
    
    // Get reading sections
    const sections = [];
    const textElements = Array.from(document.querySelectorAll('p, h1, h2, h3, h4, li')).filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.height > 0 && el.innerText.trim().length > 20;
    });
    
    const chunkSize = Math.max(3, Math.floor(textElements.length / 5));
    for (let i = 0; i < textElements.length; i += chunkSize) {
      const chunk = textElements.slice(i, i + chunkSize);
      const firstRect = chunk[0].getBoundingClientRect();
      sections.push({
        y: firstRect.top + window.scrollY,
        height: chunk.reduce((h, el) => h + el.getBoundingClientRect().height, 0),
        wordCount: chunk.reduce((sum, el) => sum + el.innerText.trim().split(/\s+/).length, 0)
      });
    }
    
    // Find contextual links
    const articleLinks = Array.from(document.querySelectorAll('article a, .content a, .post a, p a'))
      .filter(a => {
        const href = a.href || '';
        return href.includes(window.location.hostname) && 
               !href.includes('#') && 
               !href.includes('javascript:') &&
               a.offsetParent !== null &&
               a.innerText.trim().length > 3;
      })
      .map(a => {
        const rect = a.getBoundingClientRect();
        return {
          x: rect.x + rect.width/2,
          y: rect.y + rect.height/2 + window.scrollY,
          href: a.href,
          text: a.innerText.trim()
        };
      });
    
    return {
      wordCount: Math.min(wordCount, 3000), // Cap at 3000 words
      paragraphs: paragraphs.length,
      headings: headings.length,
      sections: sections.slice(0, 8),
      links: articleLinks.slice(0, 12)
    };
  });
}

function calculateReadingTime(wordCount, cfg) {
  const speeds = {
    slow: { wpm: 150, min: 45000, max: 300000 },
    normal: { wpm: 220, min: 30000, max: 240000 },
    fast: { wpm: 350, min: 20000, max: 180000 }
  };
  
  const speed = speeds[cfg.readingSpeed] || speeds.normal;
  const baseTime = (wordCount / speed.wpm) * 60000;
  const variance = baseTime * 0.3;
  
  return Math.floor(gaussianRandom(baseTime, variance, speed.min, speed.max));
}

async function bezierMouseMove(page, x1, y1, x2, y2, duration = 1000) {
  const steps = Math.max(10, Math.floor(duration / 16));
  const cp = { x: (x1 + x2) / 2 + rand(-50, 50), y: (y1 + y2) / 2 + rand(-50, 50) };
  
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const pos = getBezierPoint(ease, {x: x1, y: y1}, cp, {x: x2, y: y2});
    await page.mouse.move(pos.x, pos.y);
    await sleep(duration / steps);
  }
}

async function humanClick(page, target, cfg = {}) {
  let box;
  
  if (typeof target === 'string') {
    const el = await page.$(target);
    if (!el) return false;
    box = await el.boundingBox();
  } else if (target.x !== undefined) {
    const currentScroll = await page.evaluate(() => window.scrollY);
    box = { 
      x: target.x - 50, 
      y: target.y - currentScroll - 10, 
      width: 100, 
      height: 20 
    };
  } else {
    box = await target.boundingBox();
  }
  
  if (!box) return false;
  
  const targetX = box.x + rand(5, Math.max(5, box.width - 5));
  const targetY = box.y + rand(5, Math.max(5, box.height - 5));
  
  const currentPos = await page.evaluate(() => ({
    x: window.mouseX || window.innerWidth / 2,
    y: window.mouseY || window.innerHeight / 2
  }));
  
  await bezierMouseMove(page, currentPos.x, currentPos.y, targetX, targetY, rand(600, 1200));
  await sleep(rand(100, 400));
  
  for (let i = 0; i < rand(1, 3); i++) {
    await page.mouse.move(targetX + rand(-2, 2), targetY + rand(-2, 2));
    await sleep(rand(20, 60));
  }
  
  await page.mouse.move(targetX, targetY);
  await page.mouse.down();
  await sleep(rand(80, 180));
  await page.mouse.up();
  
  await page.evaluate((x, y) => { window.mouseX = x; window.mouseY = y; }, targetX, targetY);
  await sleep(rand(100, 300));
  
  return true;
}

async function simulateDeepReading(page, content, cfg, stats) {
  const readingTime = calculateReadingTime(content.wordCount, cfg);
  const startTime = Date.now();
  const sections = content.sections;
  const links = content.links.filter(l => {
    // Filter out affiliate links
    return !AFFILIATE_PATTERNS.some(p => p.test(l.href));
  });
  
  log('info', `Tab ${stats.tab}: Reading ${content.wordCount} words (~${Math.round(readingTime/1000)}s)`);
  
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(800);
  
  let currentSection = 0;
  let sectionClicks = 0;
  const maxSectionClicks = cfg.engagementDepth === 'deep' ? 3 : cfg.engagementDepth === 'shallow' ? 0 : 1;
  
  while (Date.now() - startTime < readingTime && currentSection < sections.length) {
    const section = sections[currentSection];
    const sectionReadTime = Math.min(
      (section.wordCount / 220) * 60000 * (1 + Math.random() * 0.4),
      readingTime - (Date.now() - startTime)
    );
    
    if (sectionReadTime <= 0) break;
    
    // Smooth scroll to section
    const viewport = await page.viewport();
    const scrollTarget = Math.max(0, section.y - rand(100, 300));
    
    await bezierMouseMove(page, 
      rand(100, 300), 
      await page.evaluate(() => window.mouseY) || 300,
      rand(100, 300), 
      rand(50, 150),
      rand(600, 1000)
    );
    
    await page.evaluate(y => window.scrollTo({ top: y, behavior: 'smooth' }), scrollTarget);
    await sleep(rand(1000, 1500));
    
    // Reading loop with progressive clicking
    const sectionStart = Date.now();
    while (Date.now() - sectionStart < sectionReadTime) {
      // Random reading movements
      await page.mouse.move(
        rand(100, viewport.width - 100),
        rand(200, viewport.height - 200)
      );
      
      const timeRatio = (Date.now() - startTime) / readingTime;
      
      // Progressive engagement: longer we read, more likely to click
      // Also more likely if we're in deep engagement mode
      let clickProb = 0.02; // Base 2% chance per cycle
      if (timeRatio > 0.3) clickProb += 0.05; // +5% after 30%
      if (timeRatio > 0.6) clickProb += 0.08; // +8% after 60%
      if (cfg.engagementDepth === 'deep') clickProb += 0.10; // +10% for deep mode
      
      if (Math.random() < clickProb && sectionClicks < maxSectionClicks && links.length > 0) {
        const currentScroll = await page.evaluate(() => window.scrollY);
        const visibleLinks = links.filter(l => 
          l.y > currentScroll && 
          l.y < currentScroll + viewport.height - 100
        );
        
        if (visibleLinks.length > 0) {
          const link = visibleLinks[rand(0, visibleLinks.length - 1)];
          
          // Check not already clicked
          if (!stats.clickedLinks.includes(link.href)) {
            log('debug', `Clicking: ${link.text.substring(0, 40)}...`);
            
            await bezierMouseMove(page,
              await page.evaluate(() => window.mouseX),
              await page.evaluate(() => window.mouseY),
              link.x + rand(-10, 10),
              link.y - currentScroll + rand(5, 20),
              rand(400, 800)
            );
            
            await humanClick(page, { x: link.x, y: link.y }, cfg);
            sectionClicks++;
            stats.totalClicks++;
            stats.clickedLinks.push(link.href);
            
            // Dwell on clicked content or return
            await sleep(rand(4000, 10000));
            
            // 50% chance to go back to continue reading
            if (Math.random() < 0.5 && sectionClicks < maxSectionClicks) {
              await page.goBack({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
              await sleep(2000);
              // Rescroll to where we were
              await page.evaluate(y => window.scrollTo(0, y), currentScroll);
            } else {
              // Stay on new page, analyze it too if deep mode
              if (cfg.engagementDepth === 'deep') {
                await sleep(3000);
              }
            }
          }
        }
      }
      
      // Random pause (reading speed)
      const pauseTime = cfg.readingSpeed === 'fast' ? rand(1500, 3000) : 
                       cfg.readingSpeed === 'slow' ? rand(4000, 8000) : 
                       rand(2500, 5000);
      await sleep(pauseTime);
    }
    
    currentSection++;
    stats.sectionsRead++;
  }
  
  log('success', `Tab ${stats.tab}: Read ${currentSection} sections, clicked ${sectionClicks} links`);
}

/* ---------- Core Actions ---------- */
async function clickLinkToTarget(page, targetHost, cfg) {
  const linkData = await page.evaluate((host) => {
    const anchors = Array.from(document.querySelectorAll('a[href]')).filter(a => {
      return a.href && a.href.includes(host) && a.offsetParent !== null;
    });
    if (!anchors.length) return null;
    const el = anchors[0];
    const rect = el.getBoundingClientRect();
    return { x: rect.x + rect.width/2, y: rect.y + rect.height/2 };
  }, targetHost);
  
  if (linkData) {
    return await humanClick(page, { x: linkData.x, y: linkData.y }, cfg);
  }
  return false;
}

/* ---------- Main Loop ---------- */
(async () => {
  const cfg = parseArgs();
  
  if (!cfg.target || !cfg.confirmOwned) {
    log('error', 'Usage: node testbot.js <target> [referrer] --confirm-owned [--forever] [--interval=ms]');
    process.exit(1);
  }

  log('info', `Starting intelligent reader — target: ${cfg.target}`);
  log('info', `Speed: ${cfg.readingSpeed}, Depth: ${cfg.engagementDepth}, Interval: ${cfg.interval}ms`);

  let run = 0;
  let stop = false;
  process.on('SIGINT', () => { 
    log('warning', 'Stopping gracefully...'); 
    stop = true; 
  });

  while (!stop && (cfg.forever || run < cfg.runs)) {
    run++;
    log('info', `\n=== Run ${run} ===`);
    
    const tabs = rand(2, 4);
    const flows = [];
    
    for (let t = 0; t < tabs; t++) {
      const profile = UA_PROFILES[rand(0, UA_PROFILES.length - 1)];
      const profileDir = path.join('/tmp', `reader_${Date.now()}_${t}_${rand(1000,9999)}`);
      
      flows.push({
        tab: t + 1,
        profile,
        profileDir,
        referrer: cfg.referrer,
        stats: { 
          pagesVisited: 0, 
          totalClicks: 0, 
          sectionsRead: 0,
          clickedLinks: [],
          startTime: Date.now()
        }
      });
    }
    
    const browsers = [];
    
    try {
      for (const flow of flows) {
        const launchArgs = ['--no-sandbox', '--disable-setuid-sandbox'];
        if (cfg.proxy) launchArgs.push(`--proxy-server=${cfg.proxy}`);
        
        const browser = await puppeteer.launch({
          headless: !!cfg.headless,
          userDataDir: flow.profileDir,
          defaultViewport: null,
          args: launchArgs
        });
        
        browsers.push({ browser, flow });
      }
      
      await Promise.all(browsers.map(async ({ browser, flow }) => {
        try {
          const page = await browser.newPage();
          await setupPageEvasion(page, flow.profile);
          await page.setUserAgent(flow.profile.userAgent);
          await page.setViewport({ 
            width: flow.profile.viewport.width, 
            height: flow.profile.viewport.height 
          });
          
          await page.evaluate(() => {
            window.mouseX = window.innerWidth / 2;
            window.mouseY = window.innerHeight / 2;
          });
          
          // Navigate
          if (flow.referrer) {
            await page.goto(flow.referrer, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await sleep(rand(2000, 5000));
            
            const clicked = await clickLinkToTarget(page, new URL(cfg.target).hostname, cfg);
            if (!clicked) {
              await page.goto(cfg.target, { waitUntil: 'domcontentloaded', referer: flow.referrer });
            } else {
              await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
            }
          } else {
            await page.goto(cfg.target, { waitUntil: 'domcontentloaded' });
          }
          
          // Read deeply
          const content = await analyzeContentStructure(page);
          if (content.wordCount > 50) {
            await simulateDeepReading(page, content, cfg, flow.stats);
            flow.stats.pagesVisited = 1;
          }
          
          flow.stats.timeSpent = Date.now() - flow.stats.startTime;
          
        } catch (e) {
          if (cfg.debug) log('error', `Tab ${flow.tab} error:`, e.message);
        }
      }));
      
      // Results
      let totalClicks = 0;
      let totalTime = 0;
      for (const { flow } of browsers) {
        totalClicks += flow.stats.totalClicks;
        totalTime += flow.stats.timeSpent;
        log('success', `Tab ${flow.tab}: ${flow.stats.sectionsRead} sections, ${flow.stats.totalClicks} clicks, ${Math.round(flow.stats.timeSpent/1000)}s`);
      }
      log('info', `Run ${run} total: ${totalClicks} clicks, avg ${Math.round(totalTime/browsers.length/1000)}s per tab`);
      
    } finally {
      // FIXED: Use try-catch instead of .catch() for rmSync
      for (const { browser, flow } of browsers) {
        try { 
          await browser.close(); 
        } catch (e) {
          if (cfg.debug) log('debug', `Error closing browser: ${e.message}`);
        }
        
        // Clean up profile directory - FIXED ERROR HERE
        try {
          if (fs.existsSync(flow.profileDir)) {
            fs.rmSync(flow.profileDir, { recursive: true, force: true });
          }
        } catch (e) {
          if (cfg.debug) log('debug', `Error removing profile: ${e.message}`);
        }
      }
    }
    
    if (!stop && (cfg.forever || run < cfg.runs)) {
      log('info', `Waiting ${cfg.interval}ms...`);
      await sleep(cfg.interval);
    }
  }
  
  log('success', 'All runs complete.');
  process.exit(0);
})();

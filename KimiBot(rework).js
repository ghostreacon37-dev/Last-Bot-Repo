/**
 * testbot.js
 *
 * Repeatable site tester (for domains you own) - Advanced Edition v3.0
 * Now with realistic reading simulation and progressive engagement
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
    minRefWait: config.minRefWait || 60000,
    maxRefWait: config.maxRefWait || 120000,
    confirmOwned: config.confirmOwned || false,
    headless: config.headless || false,
    debug: config.debug || false,
    proxyList: config.proxyList || null,
    proxy: config.proxy || null,
    geo: config.geo || 'US',
    bounceRate: config.bounceRate || 0.30,
    referrerList: config.referrerList || null,
    schedule: config.schedule || false,
    returnRate: config.returnRate || 0.35,
    profilePool: config.profilePool || null,
    readingSpeed: config.readingSpeed || 'normal', // slow, normal, fast
    engagementDepth: config.engagementDepth || 'medium', // shallow, medium, deep
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
    else if (a.startsWith('--proxy-list=')) cfg.proxyList = a.split('=')[1];
    else if (a.startsWith('--proxy=')) cfg.proxy = a.split('=')[1];
    else if (a.startsWith('--referrer-list=')) cfg.referrerList = a.split('=')[1];
    else if (a.startsWith('--reading-speed=')) cfg.readingSpeed = a.split('=')[1];
    else if (a.startsWith('--engagement-depth=')) cfg.engagementDepth = a.split('=')[1];
  }

  return cfg;
}

/* ---------- Proxy & Referrer Management ---------- */
function loadProxies(cfg) {
  const proxies = [];
  if (cfg.proxy) proxies.push(cfg.proxy);
  else if (cfg.proxyList && fs.existsSync(cfg.proxyList)) {
    const lines = fs.readFileSync(cfg.proxyList, 'utf8').split('\n').filter(l => l.trim());
    proxies.push(...lines);
  }
  return proxies;
}

function loadReferrers(cfg) {
  if (!cfg.referrerList || !fs.existsSync(cfg.referrerList)) {
    return cfg.referrer ? [{ url: cfg.referrer, weight: 1 }] : [];
  }
  const lines = fs.readFileSync(cfg.referrerList, 'utf8').split('\n').filter(l => l.trim());
  const weights = { 'google:': 0.40, 'social:': 0.25, 'direct:': 0.15, 'ref:': 0.20 };
  return lines.map(line => {
    let type = 'ref:', url = line;
    if (line.startsWith('google:')) { type = 'google:'; url = line.substring(7); }
    else if (line.startsWith('social:')) { type = 'social:'; url = line.substring(7); }
    else if (line.startsWith('direct:')) { type = 'direct:'; url = ''; }
    return { url, weight: weights[type] || 0.2 };
  });
}

function selectReferrer(referrers) {
  if (!referrers.length) return '';
  const total = referrers.reduce((a, b) => a + b.weight, 0);
  let random = Math.random() * total;
  for (const r of referrers) {
    random -= r.weight;
    if (random <= 0) return r.url;
  }
  return referrers[referrers.length - 1].url;
}

/* ---------- Profile Management ---------- */
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
  } catch { return false; }
}

function getRandomProfileFromPool(poolDir) {
  try {
    if (!fs.existsSync(poolDir)) return null;
    const dirs = fs.readdirSync(poolDir).filter(d => fs.statSync(path.join(poolDir, d)).isDirectory());
    return dirs.length ? path.join(poolDir, dirs[Math.floor(Math.random() * dirs.length)]) : null;
  } catch { return null; }
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

/**
 * Analyze content structure to determine reading time and clickable elements
 */
async function analyzeContentStructure(page) {
  return await page.evaluate(() => {
    const paragraphs = document.querySelectorAll('p, article p, .content p, .post-content p');
    const headings = document.querySelectorAll('h1, h2, h3, h4');
    const text = document.body.innerText || '';
    const wordCount = text.trim().split(/\s+/).length;
    
    // Calculate reading sections (visible chunks)
    const sections = [];
    let currentY = 0;
    const viewportHeight = window.innerHeight;
    
    // Get positions of text blocks
    const textElements = Array.from(document.querySelectorAll('p, h1, h2, h3, h4, li')).filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.height > 0 && el.innerText.trim().length > 20;
    });
    
    // Group into reading sections (~3-5 paragraphs per section)
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
    
    // Find contextual links (links within article content)
    const articleLinks = Array.from(document.querySelectorAll('article a, .content a, .post a'))
      .filter(a => {
        const href = a.href || '';
        return href.includes(window.location.hostname) && 
               !href.includes('#') && 
               a.offsetParent !== null;
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
      wordCount,
      paragraphs: paragraphs.length,
      headings: headings.length,
      sections: sections.slice(0, 8), // Max 8 sections
      links: articleLinks.slice(0, 15) // Max 15 links
    };
  });
}

/**
 * Calculate reading time based on speed setting
 */
function calculateReadingTime(wordCount, cfg) {
  const speeds = {
    slow: { wpm: 150, min: 60000, max: 300000 },
    normal: { wpm: 220, min: 45000, max: 240000 },
    fast: { wpm: 350, min: 30000, max: 180000 }
  };
  
  const speed = speeds[cfg.readingSpeed] || speeds.normal;
  const baseTime = (wordCount / speed.wpm) * 60000; // ms
  
  // Add variance (±30%)
  const variance = baseTime * 0.3;
  const readingTime = gaussianRandom(baseTime, variance, speed.min, speed.max);
  
  return Math.floor(readingTime);
}

/**
 * Bezier mouse movement with human-like curves
 */
async function bezierMouseMove(page, x1, y1, x2, y2, duration = 1000) {
  const steps = Math.max(10, Math.floor(duration / 16));
  const cp = {
    x: (x1 + x2) / 2 + rand(-50, 50),
    y: (y1 + y2) / 2 + rand(-50, 50)
  };
  
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const pos = getBezierPoint(ease, {x: x1, y: y1}, cp, {x: x2, y: y2});
    await page.mouse.move(pos.x, pos.y);
    await sleep(duration / steps);
  }
}

/**
 * REAL HUMAN CLICK with approach and hesitation
 */
async function humanClick(page, target, cfg = {}) {
  let box;
  
  if (typeof target === 'string') {
    const el = await page.$(target);
    if (!el) return false;
    box = await el.boundingBox();
  } else if (target.x !== undefined) {
    box = { x: target.x - 50, y: target.y - 10, width: 100, height: 20 };
  } else {
    box = await target.boundingBox();
  }
  
  if (!box) return false;
  
  const padding = 3;
  const targetX = box.x + rand(padding, Math.max(padding, box.width - padding));
  const targetY = box.y + rand(padding, Math.max(padding, box.height - padding));
  
  // Get current mouse pos
  const currentPos = await page.evaluate(() => ({
    x: window.mouseX || window.innerWidth / 2,
    y: window.mouseY || window.innerHeight / 2
  }));
  
  // Approach with curve
  await bezierMouseMove(page, currentPos.x, currentPos.y, targetX, targetY, rand(600, 1200));
  
  // Pause before click (decision time)
  await sleep(rand(100, 400));
  
  // Micro-adjustments (hand precision)
  for (let i = 0; i < rand(1, 3); i++) {
    await page.mouse.move(targetX + rand(-2, 2), targetY + rand(-2, 2));
    await sleep(rand(20, 60));
  }
  
  // Click with realistic timing
  await page.mouse.move(targetX, targetY);
  await page.mouse.down();
  await sleep(rand(80, 180));
  await page.mouse.up();
  
  // Update global mouse pos
  await page.evaluate((x, y) => { window.mouseX = x; window.mouseY = y; }, targetX, targetY);
  
  // Post-click linger
  await sleep(rand(100, 300));
  
  return true;
}

/**
 * Progressive reading behavior - scrolls section by section with increasing engagement
 */
async function simulateDeepReading(page, content, cfg, engagement) {
  const readingTime = calculateReadingTime(content.wordCount, cfg);
  const startTime = Date.now();
  const sections = content.sections;
  const links = content.links;
  
  log('info', `Starting deep read: ${content.wordCount} words, ~${Math.round(readingTime/1000)}s estimated`);
  
  // Scroll to top first
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(500);
  
  let currentSection = 0;
  let linksClicked = 0;
  const maxLinks = cfg.engagementDepth === 'deep' ? 5 : cfg.engagementDepth === 'shallow' ? 1 : 3;
  
  while (Date.now() - startTime < readingTime && currentSection < sections.length) {
    const section = sections[currentSection];
    const sectionReadTime = (section.wordCount / (cfg.readingSpeed === 'fast' ? 350 : cfg.readingSpeed === 'slow' ? 150 : 220)) * 60000;
    
    // Scroll to section smoothly
    const currentY = await page.evaluate(() => window.scrollY);
    await bezierMouseMove(page, 
      rand(100, 300), rand(100, 300),
      rand(100, 300), section.y + rand(-50, 50),
      rand(800, 1500)
    );
    
    await page.evaluate(y => window.scrollTo({ top: y, behavior: 'smooth' }), section.y);
    await sleep(rand(800, 1200));
    
    // "Read" the section - random mouse movements over text area
    const readStart = Date.now();
    const readDuration = Math.min(sectionReadTime, (readingTime - (Date.now() - startTime)) / sections.length);
    
    while (Date.now() - readStart < readDuration) {
      // Occasional text selection
      if (Math.random() < 0.1) {
        await simulateTextSelection(page);
      }
      
      // Random micro-movements while reading
      await page.mouse.move(
        rand(100, (await page.viewport()).width - 100),
        rand(section.y + 100, section.y + 400)
      );
      await sleep(rand(2000, 5000));
      
      // Progressive clicking: longer we stay, more likely to click
      // Probability increases with time spent
      const timeRatio = (Date.now() - startTime) / readingTime;
      const clickProbability = 0.05 + (timeRatio * 0.25); // 5% to 30%
      
      if (Math.random() < clickProbability && linksClicked < maxLinks && links.length > 0) {
        // Find links near current reading position
        const viewport = await page.viewport();
        const currentScroll = await page.evaluate(() => window.scrollY);
        const nearbyLinks = links.filter(l => 
          l.y > currentScroll && 
          l.y < currentScroll + viewport.height &&
          Math.abs(l.y - section.y) < 500
        );
        
        if (nearbyLinks.length > 0) {
          const link = nearbyLinks[rand(0, nearbyLinks.length - 1)];
          log('debug', `Progressive click ${linksClicked + 1}: ${link.text.substring(0, 30)}...`);
          
          // Move to link and click
          await bezierMouseMove(page,
            (await page.evaluate(() => window.mouseX)),
            (await page.evaluate(() => window.mouseY)),
            link.x + rand(-10, 10),
            link.y - currentScroll + rand(5, 15),
            rand(400, 800)
          );
          
          await humanClick(page, { x: link.x, y: link.y }, cfg);
          linksClicked++;
          engagement.clicks++;
          
          // Wait for navigation and come back, or just pause if same page
          await sleep(rand(3000, 8000));
          
          // If we navigated away, go back to continue reading
          const currentUrl = await page.url();
          if (!currentUrl.includes(new URL(cfg.target).hostname)) {
            await page.goBack({ waitUntil: 'domcontentloaded' });
            await sleep(2000);
          }
        }
      }
    }
    
    currentSection++;
    engagement.scrollEvents++;
  }
  
  // Final engagement: if we read a lot, click more
  if (linksClicked < maxLinks && (Date.now() - startTime) > readingTime * 0.7) {
    const remainingLinks = links.filter(l => {
      const seen = engagement.clickedLinks || [];
      return !seen.includes(l.href);
    });
    
    if (remainingLinks.length > 0) {
      const finalLink = remainingLinks[rand(0, remainingLinks.length - 1)];
      await humanClick(page, { x: finalLink.x, y: finalLink.y }, cfg);
      engagement.clicks++;
      engagement.clickedLinks = [...(engagement.clickedLinks || []), finalLink.href];
    }
  }
  
  log('success', `Completed reading: ${currentSection} sections, ${linksClicked} clicks, ${Math.round((Date.now()-startTime)/1000)}s spent`);
}

async function simulateTextSelection(page) {
  try {
    const pos = await page.evaluate(() => {
      const paras = document.querySelectorAll('p');
      const p = paras[Math.floor(Math.random() * paras.length)];
      if (!p) return null;
      const rect = p.getBoundingClientRect();
      return { x: rect.x + 20, y: rect.y + rect.height/2 };
    });
    
    if (!pos) return;
    
    await page.mouse.move(pos.x, pos.y);
    await page.mouse.down();
    await bezierMouseMove(page, pos.x, pos.y, pos.x + rand(50, 150), pos.y + rand(-5, 5), rand(300, 600));
    await page.mouse.up();
    await sleep(300);
  } catch {}
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
    return { x: rect.x + rect.width/2, y: rect.y + rect.height/2, href: el.href };
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
    log('error', 'Usage: node testbot.js <target> [referrer] --confirm-owned [--reading-speed=slow|normal|fast] [--engagement-depth=shallow|medium|deep]');
    process.exit(1);
  }

  const proxies = loadProxies(cfg);
  const referrers = loadReferrers(cfg);
  const targetHost = new URL(cfg.target).hostname;
  const poolDir = getProfilePoolDir(cfg);
  
  if (cfg.returnRate > 0 && !fs.existsSync(poolDir)) {
    fs.mkdirSync(poolDir, { recursive: true });
  }

  log('info', `Starting intelligent reader — target: ${cfg.target}`);
  log('info', `Reading speed: ${cfg.readingSpeed}, Engagement: ${cfg.engagementDepth}`);

  let run = 0;
  let stop = false;
  process.on('SIGINT', () => { stop = true; });

  while (!stop && (cfg.forever || run < cfg.runs)) {
    run++;
    log('info', `\n=== Run ${run} ===`);
    
    const tabs = rand(2, 4); // Fewer tabs for deeper reading
    const results = [];
    
    for (let t = 0; t < tabs; t++) {
      const proxy = proxies.length ? proxies[rand(0, proxies.length - 1)] : null;
      const referrer = selectReferrer(referrers) || cfg.referrer;
      const isReturn = Math.random() < cfg.returnRate;
      
      let profileDir = path.join('/tmp', `reader_${Date.now()}_${t}`);
      if (isReturn) {
        const existing = getRandomProfileFromPool(poolDir);
        if (existing) {
          fs.cpSync(existing, profileDir, { recursive: true });
        }
      }
      
      const profile = UA_PROFILES[rand(0, UA_PROFILES.length - 1)];
      
      results.push({
        tab: t + 1,
        proxy,
        referrer,
        profile,
        profileDir,
        isReturn,
        stats: { pagesVisited: 0, wordsRead: 0, clicks: 0, timeSpent: 0 }
      });
    }
    
    const browsers = [];
    
    try {
      for (const flow of results) {
        const launchArgs = ['--no-sandbox', '--disable-setuid-sandbox'];
        if (flow.proxy) {
          launchArgs.push(`--proxy-server=${flow.proxy}`);
        }
        
        const browser = await puppeteer.launch({
          headless: !!cfg.headless,
          userDataDir: flow.profileDir,
          defaultViewport: null,
          args: launchArgs
        });
        
        browsers.push({ browser, flow });
      }
      
      await Promise.all(browsers.map(async ({ browser, flow }) => {
        const start = Date.now();
        const engagement = { scrollEvents: 0, clicks: 0, clickedLinks: [] };
        
        try {
          const page = await browser.newPage();
          await setupPageEvasion(page, flow.profile);
          await page.setUserAgent(flow.profile.userAgent);
          await page.setViewport({ width: flow.profile.viewport.width, height: flow.profile.viewport.height });
          await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
          
          // Initialize mouse tracking
          await page.evaluate(() => {
            window.mouseX = window.innerWidth / 2;
            window.mouseY = window.innerHeight / 2;
          });
          
          // Navigate to referrer first
          if (flow.referrer) {
            await page.goto(flow.referrer, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await sleep(rand(3000, 8000));
            
            // Click to target
            const clicked = await clickLinkToTarget(page, targetHost, cfg);
            if (!clicked) {
              await page.goto(cfg.target, { waitUntil: 'domcontentloaded', referer: flow.referrer });
            } else {
              await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
            }
          } else {
            await page.goto(cfg.target, { waitUntil: 'domcontentloaded' });
          }
          
          // Bounce check
          if (Math.random() < cfg.bounceRate) {
            log('warning', `Tab ${flow.tab}: Bounced immediately`);
            flow.stats.pagesVisited = 1;
          } else {
            // Deep reading session
            let pagesVisited = 1;
            let totalClicks = 0;
            
            // Read current page deeply
            let content = await analyzeContentStructure(page);
            await simulateDeepReading(page, content, cfg, engagement);
            totalClicks += engagement.clicks;
            pagesVisited++;
            
            // Progressive depth: if we clicked on this page, visit those links and read them too
            if (cfg.engagementDepth === 'deep' && totalClicks > 0 && pagesVisited < 4) {
              // Visit 1-2 clicked links for deep engagement
              const internalLinks = content.links.filter(l => 
                l.href.includes(targetHost) && 
                !AFFILIATE_PATTERNS.some(p => p.test(l.href))
              );
              
              const linksToVisit = internalLinks.slice(0, rand(1, 2));
              for (const link of linksToVisit) {
                if (Math.random() > 0.3) { // 70% chance to actually visit
                  await page.goto(link.href, { waitUntil: 'domcontentloaded' });
                  const subContent = await analyzeContentStructure(page);
                  await simulateDeepReading(page, subContent, cfg, { ...engagement, clicks: 0 });
                  pagesVisited++;
                  await sleep(rand(2000, 5000));
                }
              }
            }
            
            flow.stats = {
              pagesVisited,
              wordsRead: content.wordCount * (pagesVisited > 1 ? 1.5 : 1),
              clicks: totalClicks + engagement.clicks,
              timeSpent: Date.now() - start
            };
          }
          
          if (flow.isReturn) {
            saveProfileToPool(flow.profileDir, poolDir, `profile_${Date.now()}_${flow.tab}`);
          }
          
        } catch (e) {
          if (cfg.debug) log('error', `Tab ${flow.tab} error:`, e.message);
        }
      }));
      
      // Log results
      for (const { flow } of browsers) {
        log('success', `Tab ${flow.tab}: ${flow.stats.pagesVisited} pages, ${flow.stats.clicks} clicks, ${Math.round(flow.stats.timeSpent/1000)}s`);
      }
      
    } finally {
      for (const { browser, flow } of browsers) {
        await browser.close().catch(() => {});
        if (!flow.isReturn) {
          fs.rmSync(flow.profileDir, { recursive: true, force: true }).catch(() => {});
        }
      }
    }
    
    if (!cfg.forever || run < cfg.runs) {
      await sleep(cfg.interval);
    }
  }
  
  log('success', 'Reading sessions complete.');
})();

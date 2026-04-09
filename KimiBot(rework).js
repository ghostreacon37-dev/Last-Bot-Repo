/**
 * testbot.js - Simple Human Clicker
 */

const puppeteer = require('puppeteer-extra');
const fs = require('fs');
const path = require('path');
puppeteer.use(require('puppeteer-extra-plugin-stealth')());

function log(...args) {
  console.log('[BOT]', ...args);
}

function rand(min, max) { 
  return Math.floor(Math.random() * (max - min + 1)) + min; 
}

function sleep(ms) { 
  return new Promise(r => setTimeout(r, ms)); 
}

// Bezier curve for human-like mouse movement
function getBezierPoint(t, p0, p1, p2) {
  const x = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x;
  const y = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y;
  return { x, y };
}

async function humanMouseMove(page, x1, y1, x2, y2, duration = 800) {
  const steps = Math.max(8, Math.floor(duration / 16));
  // Control point for curve (human hands don't move in straight lines)
  const cp = { 
    x: (x1 + x2) / 2 + rand(-40, 40), 
    y: (y1 + y2) / 2 + rand(-40, 40) 
  };
  
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Ease in-out
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const pos = getBezierPoint(ease, {x: x1, y: y1}, cp, {x: x2, y: x2});
    await page.mouse.move(pos.x, pos.y);
    await sleep(duration / steps);
  }
}

async function humanClick(page, targetX, targetY) {
  // Get current mouse position
  const mousePos = await page.evaluate(() => ({
    x: window.lastMouseX || 100,
    y: window.lastMouseY || 100
  }));
  
  // Move to target with curve (human approach)
  await humanMouseMove(page, mousePos.x, mousePos.y, targetX, targetY, rand(600, 1200));
  
  // Pause (reaction time)
  await sleep(rand(100, 300));
  
  // Tiny wiggle (hand adjusting)
  await page.mouse.move(targetX + rand(-2, 2), targetY + rand(-2, 2));
  await sleep(rand(50, 150));
  
  // Click down
  await page.mouse.down();
  await sleep(rand(80, 180)); // How long finger stays down
  await page.mouse.up();
  
  // Save position
  await page.evaluate((x, y) => {
    window.lastMouseX = x;
    window.lastMouseY = y;
  }, targetX, targetY);
  
  // Post-click pause
  await sleep(rand(200, 500));
}

// Parse arguments
function getConfig() {
  const args = process.argv.slice(2);
  const cfg = {
    target: null,
    referrer: null,
    forever: false,
    interval: 10000,
    runs: 1,
    headless: false,
    confirmOwned: false,
    waitTime: 5000 // Time to wait before clicking
  };
  
  for (const arg of args) {
    if (!cfg.target && !arg.startsWith('--')) cfg.target = arg;
    else if (!cfg.referrer && !arg.startsWith('--')) cfg.referrer = arg;
    else if (arg === '--forever') cfg.forever = true;
    else if (arg.startsWith('--interval=')) cfg.interval = parseInt(arg.split('=')[1]);
    else if (arg.startsWith('--runs=')) cfg.runs = parseInt(arg.split('=')[1]);
    else if (arg === '--headless') cfg.headless = true;
    else if (arg === '--confirm-owned') cfg.confirmOwned = true;
    else if (arg.startsWith('--wait=')) cfg.waitTime = parseInt(arg.split('=')[1]);
  }
  
  return cfg;
}

(async () => {
  const cfg = getConfig();
  
  if (!cfg.target || !cfg.referrer) {
    console.log('Usage: node testbot.js <target_url> <referrer_url> --confirm-owned [--forever] [--interval=ms]');
    process.exit(1);
  }
  
  if (!cfg.confirmOwned) {
    log('ERROR: Add --confirm-owned to confirm you own these sites');
    process.exit(1);
  }

  const targetHost = new URL(cfg.target).hostname;
  log(`Starting: Target=${cfg.target}, Referrer=${cfg.referrer}`);
  
  let run = 0;
  let stop = false;
  process.on('SIGINT', () => { stop = true; });

  while (!stop && (cfg.forever || run < cfg.runs)) {
    run++;
    log(`\n--- Run ${run} ---`);
    
    const profileDir = path.join('/tmp', `bot_session_${Date.now()}`);
    
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: cfg.headless,
        userDataDir: profileDir,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const page = await browser.newPage();
      await page.setViewport({ width: 1366, height: 768 });
      
      // Initialize mouse tracking
      await page.evaluate(() => {
        window.lastMouseX = 300;
        window.lastMouseY = 300;
      });
      
      // 1. Load referrer
      log('Loading referrer...');
      await page.goto(cfg.referrer, { waitUntil: 'networkidle2', timeout: 60000 });
      log('Referrer loaded, waiting...');
      await sleep(cfg.waitTime);
      
      // 2. Find and click link to target
      log('Looking for link to target...');
      
      // Try to find any link containing target domain
      const linkInfo = await page.evaluate((host) => {
        const links = Array.from(document.querySelectorAll('a[href]'));
        for (const link of links) {
          if (link.href.includes(host) && link.offsetParent !== null) {
            const rect = link.getBoundingClientRect();
            return {
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
              text: link.innerText.substring(0, 30)
            };
          }
        }
        return null;
      }, targetHost);
      
      if (linkInfo) {
        log(`Found link: "${linkInfo.text}", clicking like human...`);
        await humanClick(page, linkInfo.x, linkInfo.y);
        
        // Wait for navigation
        try {
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
          log('Navigated to target!');
        } catch {
          log('Navigation timeout, continuing...');
        }
      } else {
        log('No direct link found, navigating manually...');
        await page.goto(cfg.target, { referer: cfg.referrer, waitUntil: 'networkidle2' });
      }
      
      // 3. Stay on target and click around (like reading)
      log('Staying on page, clicking around...');
      const endTime = Date.now() + rand(30000, 60000); // 30-60 seconds
      
      while (Date.now() < endTime && !stop) {
        // Find random internal link
        const nextLink = await page.evaluate((host) => {
          const links = Array.from(document.querySelectorAll('a[href]'))
            .filter(a => a.href.includes(host) && !a.href.includes('#') && a.offsetParent !== null)
            .slice(0, 10);
          
          if (links.length === 0) return null;
          const link = links[Math.floor(Math.random() * links.length)];
          const rect = link.getBoundingClientRect();
          return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            text: link.innerText.substring(0, 20)
          };
        }, targetHost);
        
        if (nextLink && Math.random() > 0.3) { // 70% chance to click
          log(`Clicking: ${nextLink.text}...`);
          await humanClick(page, nextLink.x, nextLink.y);
          await sleep(rand(3000, 8000)); // Read time
        } else {
          // Just scroll and wait
          await page.evaluate(() => window.scrollBy(0, 300));
          await sleep(rand(2000, 4000));
        }
      }
      
      log('Session complete');
      
    } catch (err) {
      log('Error:', err.message);
    } finally {
      if (browser) {
        try { await browser.close(); } catch {}
      }
      // Clean up
      try {
        if (fs.existsSync(profileDir)) {
          fs.rmSync(profileDir, { recursive: true, force: true });
        }
      } catch {}
    }
    
    if (!stop && (cfg.forever || run < cfg.runs)) {
      log(`Waiting ${cfg.interval}ms...`);
      await sleep(cfg.interval);
    }
  }
  
  log('Finished');
  process.exit(0);
})();

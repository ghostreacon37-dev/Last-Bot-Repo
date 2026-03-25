/**
 * testbot.js (Updated for Human Clicks)
 */

const puppeteer = require('puppeteer-extra');
const fs = require('fs');
const path = require('path');
puppeteer.use(require('puppeteer-extra-plugin-stealth')());

/* ---------- helpers ---------- */
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const UA_LIST = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/121.0.0.0 Mobile/15E148 Safari/604.1'
];

const VIEWPORTS = [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

/* ---------- NEW: Human Click Function ---------- */
async function humanClick(page, element) {
  if (!element) return false;

  try {
    // 1. Ensure element is in view
    await element.scrollIntoViewIfNeeded();
    await sleep(rand(500, 1200));

    // 2. Get the bounding box (coordinates)
    const box = await element.boundingBox();
    if (!box) return false;

    // 3. Aim for a random spot inside the button/link (not exactly the center)
    const x = box.x + (box.width * (Math.random() * 0.6 + 0.2));
    const y = box.y + (box.height * (Math.random() * 0.6 + 0.2));

    // 4. Move mouse naturally to the spot
    await page.mouse.move(x, y, { steps: rand(15, 30) });
    await sleep(rand(100, 300));

    // 5. Physical click
    await page.mouse.down();
    await sleep(rand(50, 150)); // Hold for a split second
    await page.mouse.up();
    
    return true;
  } catch (e) {
    return false;
  }
}

/* ---------- CLI parsing ---------- */
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
    minTabs: 2,
    maxTabs: 7,
    fixedInstances: null,
    confirmOwned: false,
    headless: false,
    debug: false,
    screenshot: false
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
  }

  return cfg;
}

/* ---------- human-like micro-actions ---------- */
async function microMouse(page, moves = 6) {
  const vw = page.viewport() || { width: 800, height: 600 };
  for (let i = 0; i < moves; i++) {
    const x = rand(10, Math.max(10, (vw.width || 800) - 10));
    const y = rand(10, Math.max(10, (vw.height || 600) - 10));
    try { await page.mouse.move(x, y, { steps: rand(5, 15) }); } catch(_) {}
    await sleep(rand(100, 600));
  }
}

async function partialRandomScroll(page) {
  const viewport = page.viewport() || { height: 800 };
  const fullHeight = await page.evaluate(() => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)).catch(()=>0);

  const bursts = rand(2, 5);
  const maxTotal = Math.max( Math.min(fullHeight, viewport.height * rand(1, 2)), viewport.height );
  let scrolled = 0;
  for (let b = 0; b < bursts && scrolled < maxTotal; b++) {
    const step = rand(100, 400);
    await page.evaluate(y => window.scrollBy({ top: y, behavior: 'smooth' }), step).catch(()=>{});
    scrolled += step;
    await sleep(rand(1000, 3000));
  }
}

/* ---------- flow actions ---------- */
async function waitOnReferrer(page, minMs, maxMs, debug=false) {
  const wait = rand(minMs, maxMs);
  if (debug) console.log(`  debug: referrer wait ~${Math.round(wait/1000)}s`);
  const start = Date.now();
  while (Date.now() - start < wait) {
    await microMouse(page, rand(2, 5));
    await sleep(rand(3000, 8000));
  }
}

/* MODIFIED: Uses humanClick instead of el.click() */
async function clickLinkToTarget(page, targetHost, debug=false) {
  try {
    const links = await page.$$('a');
    let targetLink = null;

    for (const link of links) {
      const href = await page.evaluate(el => el.href, link);
      if (href && href.includes(targetHost)) {
        targetLink = link;
        break; 
      }
    }

    if (targetLink) {
      if (debug) console.log('  debug: found target link, performing human click');
      return await humanClick(page, targetLink);
    }
  } catch (e) {
    if (debug) console.error('  debug: click error', e.message);
  }
  return false;
}

/* MODIFIED: Uses humanClick for internal navigation */
async function openRandomInternalPostAndWait(page, targetHost, minWait, maxWait, debug=false) {
  try {
    const internalLinks = await page.$$('a');
    const validLinks = [];

    for (const link of internalLinks) {
      const isInternal = await page.evaluate((el, host) => {
        return el.href.includes(host) && el.href !== location.origin + '/' && !el.href.endsWith('#');
      }, link, targetHost);
      if (isInternal) validLinks.push(link);
    }

    if (!validLinks.length) return { opened: false };

    const randomLink = validLinks[rand(0, validLinks.length - 1)];
    const success = await humanClick(page, randomLink);

    if (success) {
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await partialRandomScroll(page);
      const wait = rand(minWait, maxWait);
      await sleep(wait);
      return { opened: true, finalUrl: await page.url() };
    }
  } catch (e) {
    if (debug) console.error('  debug: internal click error', e.message);
  }
  return { opened: false };
}

/* ---------- logging & main loop (remains largely same) ---------- */
function appendCSV(row) {
  try {
    const csv = path.join(process.cwd(), 'sessions_log.csv');
    if (!fs.existsSync(csv)) fs.writeFileSync(csv, 'timestamp,run,tab,referrer_clicked,target_final,post_opened,post_final,duration_ms\n');
    fs.appendFileSync(csv, row.map(x => `"${String(x||'')}"`).join(',') + '\n');
  } catch (_) {}
}

(async () => {
  const cfg = parseArgs();
  if (!cfg.target || !cfg.referrer || !cfg.confirmOwned) {
    console.error('Usage: node testbot.js <target_url> <referrer_url> --confirm-owned');
    process.exit(1);
  }

  const targetHost = new URL(cfg.target).hostname;
  let run = 0;
  let stop = false;

  while (!stop && (cfg.forever || run < cfg.runs)) {
    run++;
    const tabs = cfg.fixedInstances ? cfg.fixedInstances : rand(cfg.minTabs, cfg.maxTabs);
    const browser = await puppeteer.launch({
      headless: !!cfg.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const flows = [];
      for (let t = 0; t < tabs; t++) {
        flows.push((async (tabIndex) => {
          const page = await browser.newPage();
          await page.setUserAgent(UA_LIST[rand(0, UA_LIST.length-1)]);
          await page.setViewport(VIEWPORTS[rand(0, VIEWPORTS.length-1)]);

          const start = Date.now();
          await page.goto(cfg.referrer, { waitUntil: 'domcontentloaded' }).catch(()=>{});
          await waitOnReferrer(page, cfg.minRefWait, cfg.maxRefWait, cfg.debug);

          const refClicked = await clickLinkToTarget(page, targetHost, cfg.debug);
          if (!refClicked) await page.goto(cfg.target, { referer: cfg.referrer });

          await partialRandomScroll(page);
          await sleep(rand(cfg.minTargetWait, cfg.maxTargetWait));

          const postResult = await openRandomInternalPostAndWait(page, targetHost, cfg.minTargetWait, cfg.maxTargetWait, cfg.debug);
          
          appendCSV([new Date().toISOString(), run, `tab${tabIndex}`, refClicked ? 'yes' : 'no', await page.url(), postResult.opened ? 'yes' : 'no', postResult.finalUrl, Date.now()-start]);
          await page.close();
        })(t+1));
        await sleep(rand(1000, 3000));
      }
      await Promise.allSettled(flows);
    } catch (e) {
      console.error(e);
    } finally {
      await browser.close();
    }
    await sleep(cfg.interval);
  }
})();

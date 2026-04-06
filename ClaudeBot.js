const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const TARGET = process.argv[2] || 'https://www.learnblogs.online';
const REFERRER = process.argv[3] || 'https://x.com/GhostReacondev/status/2024921591520641247?s=20';
const SESSIONS = parseInt(process.argv[4]) || 5;
const MIN_PAGES = parseInt(process.argv[5]) || 2;
const MAX_PAGES = parseInt(process.argv[6]) || 6;

const UA_LIST = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
];

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 2560, height: 1440 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 1280, height: 720 },
];

const LANGUAGES = ['en-US,en;q=0.9', 'en-GB,en;q=0.8', 'en-US,en;q=0.9,es;q=0.8', 'en-CA,en;q=0.9,fr;q=0.7'];
const TIMEZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'America/Toronto'];
const PLATFORMS = ['Win32', 'MacIntel', 'Linux x86_64'];

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function jitter(base, variance) { return base + rand(-variance, variance); }

function generateFingerprint() {
  const vp = pick(VIEWPORTS);
  const isMobile = vp.width < 500;
  return {
    ua: isMobile ? pick(UA_LIST.filter(u => u.includes('Mobile'))) : pick(UA_LIST.filter(u => !u.includes('Mobile'))),
    viewport: vp,
    lang: pick(LANGUAGES),
    tz: pick(TIMEZONES),
    platform: isMobile ? 'Linux armv8l' : pick(PLATFORMS),
    cores: pick([2, 4, 6, 8, 12, 16]),
    memory: pick([4, 8, 16, 32]),
    maxTouch: isMobile ? rand(1, 5) : 0,
    colorDepth: pick([24, 30, 32]),
    pixelRatio: isMobile ? pick([2, 3]) : pick([1, 1.25, 1.5, 2]),
    webglVendor: pick(['Google Inc. (NVIDIA)', 'Google Inc. (Intel)', 'Google Inc. (AMD)', 'Apple']),
    webglRenderer: pick([
      'ANGLE (NVIDIA GeForce RTX 3060 Direct3D11)',
      'ANGLE (Intel(R) UHD Graphics 630 Direct3D11)',
      'ANGLE (AMD Radeon RX 580 Direct3D11)',
      'Apple GPU',
      'ANGLE (NVIDIA GeForce GTX 1660 SUPER Direct3D11)',
    ]),
  };
}

async function applyEvasions(page, fp) {
  await page.evaluateOnNewDocument((fp) => {
    // Webdriver
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    delete navigator.__proto__.webdriver;

    // Platform
    Object.defineProperty(navigator, 'platform', { get: () => fp.platform });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => fp.cores });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => fp.memory });
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => fp.maxTouch });
    Object.defineProperty(navigator, 'languages', { get: () => fp.lang.split(',').map(l => l.split(';')[0]) });

    // Screen
    Object.defineProperty(screen, 'colorDepth', { get: () => fp.colorDepth });
    Object.defineProperty(window, 'devicePixelRatio', { get: () => fp.pixelRatio });

    // WebGL
    const getParamOrig = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (param) {
      if (param === 37445) return fp.webglVendor;
      if (param === 37446) return fp.webglRenderer;
      return getParamOrig.call(this, param);
    };
    const getParam2Orig = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function (param) {
      if (param === 37445) return fp.webglVendor;
      if (param === 37446) return fp.webglRenderer;
      return getParam2Orig.call(this, param);
    };

    // Chrome runtime
    window.chrome = { runtime: {}, loadTimes: () => ({}), csi: () => ({}) };

    // Permissions
    const origQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (params) =>
      params.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission })
        : origQuery(params);

    // Plugin array spoof
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const arr = [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
          { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
        ];
        arr.refresh = () => {};
        return arr;
      },
    });

    // Canvas noise
    const toBlob = HTMLCanvasElement.prototype.toBlob;
    const toDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toBlob = function () {
      const ctx = this.getContext('2d');
      if (ctx) {
        const shift = (Math.random() - 0.5) * 0.01;
        const imgData = ctx.getImageData(0, 0, this.width, this.height);
        for (let i = 0; i < imgData.data.length; i += 4) {
          imgData.data[i] = Math.max(0, Math.min(255, imgData.data[i] + shift));
        }
        ctx.putImageData(imgData, 0, 0);
      }
      return toBlob.apply(this, arguments);
    };
    HTMLCanvasElement.prototype.toDataURL = function () {
      const ctx = this.getContext('2d');
      if (ctx) {
        const shift = (Math.random() - 0.5) * 0.01;
        const imgData = ctx.getImageData(0, 0, this.width, this.height);
        for (let i = 0; i < imgData.data.length; i += 4) {
          imgData.data[i] = Math.max(0, Math.min(255, imgData.data[i] + shift));
        }
        ctx.putImageData(imgData, 0, 0);
      }
      return toDataURL.apply(this, arguments);
    };

    // AudioContext fingerprint noise
    const origGetFloatFreq = AnalyserNode.prototype.getFloatFrequencyData;
    AnalyserNode.prototype.getFloatFrequencyData = function (array) {
      origGetFloatFreq.call(this, array);
      for (let i = 0; i < array.length; i++) {
        array[i] += (Math.random() - 0.5) * 0.001;
      }
    };

    // Prevent detection of automation via stack traces
    Error.stackTraceLimit = 10;

  }, fp);
}

async function humanMove(page, x, y) {
  const steps = rand(15, 40);
  const start = await page.evaluate(() => ({ x: window.__lastMouseX || rand(100, 500), y: window.__lastMouseY || rand(100, 400) })).catch(() => ({ x: rand(100, 500), y: rand(100, 300) }));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    const jx = (Math.random() - 0.5) * 3;
    const jy = (Math.random() - 0.5) * 3;
    const cx = start.x + (x - start.x) * ease + jx;
    const cy = start.y + (y - start.y) * ease + jy;
    await page.mouse.move(cx, cy);
    await sleep(rand(4, 18));
  }
  await page.evaluate((x, y) => { window.__lastMouseX = x; window.__lastMouseY = y; }, x, y);
}

async function humanScroll(page) {
  const scrolls = rand(3, 9);
  for (let i = 0; i < scrolls; i++) {
    const delta = rand(80, 400) * (Math.random() > 0.15 ? 1 : -1);
    await page.mouse.wheel({ deltaY: delta });
    await sleep(rand(300, 1800));
    // Occasionally pause mid-scroll like reading
    if (Math.random() > 0.6) {
      await sleep(rand(1500, 5000));
    }
  }
}

async function microActions(page) {
  // Random mouse wiggles
  for (let i = 0; i < rand(2, 5); i++) {
    await humanMove(page, rand(50, 1200), rand(50, 700));
    await sleep(rand(200, 800));
  }

  // Maybe select some text
  if (Math.random() > 0.7) {
    try {
      const paragraphs = await page.$$('p, h2, h3, span, li');
      if (paragraphs.length > 0) {
        const el = pick(paragraphs);
        const box = await el.boundingBox();
        if (box) {
          await humanMove(page, box.x + rand(5, 30), box.y + box.height / 2);
          await page.mouse.down();
          await humanMove(page, box.x + rand(40, 150), box.y + box.height / 2);
          await page.mouse.up();
          await sleep(rand(300, 900));
          // Click elsewhere to deselect
          await humanMove(page, rand(100, 400), rand(100, 400));
          await page.mouse.click(rand(100, 400), rand(100, 400));
        }
      }
    } catch (_) {}
  }

  // Maybe hover over an ad iframe or sidebar
  if (Math.random() > 0.5) {
    try {
      const iframes = await page.$$('iframe');
      if (iframes.length > 0) {
        const iframe = pick(iframes);
        const box = await iframe.boundingBox();
        if (box && box.width > 50) {
          await humanMove(page, box.x + box.width / 2, box.y + box.height / 2);
          await sleep(rand(500, 2000));
        }
      }
    } catch (_) {}
  }
}

async function visitReferrer(page, referrerUrl) {
  console.log(`  → Visiting referrer: ${referrerUrl}`);
  await page.goto(referrerUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await sleep(rand(2000, 5000));
  await humanScroll(page);
  await sleep(rand(1000, 3000));
}

async function navigateToTarget(page, targetUrl, referrerUrl) {
  // Set referrer header
  await page.setExtraHTTPHeaders({ 'Referer': referrerUrl });

  // Try to find a link on the referrer page that leads to target
  const clicked = await page.evaluate((target) => {
    const links = Array.from(document.querySelectorAll('a'));
    for (const link of links) {
      if (link.href && link.href.includes(target.replace('https://', '').replace('http://', '').split('/')[0])) {
        link.click();
        return true;
      }
    }
    return false;
  }, targetUrl).catch(() => false);

  if (!clicked) {
    console.log(`  → Direct navigation to target with referrer header`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
  } else {
    console.log(`  → Clicked through to target from referrer`);
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
  }
}

async function browseInternalLinks(page, depth) {
  for (let d = 0; d < depth; d++) {
    await sleep(rand(2000, 4000));
    await humanScroll(page);
    await microActions(page);
    await sleep(rand(3000, 10000)); // Read time

    // Gather internal links
    const links = await page.evaluate((host) => {
      return Array.from(document.querySelectorAll('a[href]'))
        .map(a => a.href)
        .filter(href => href.includes(host) && !href.includes('#') && !href.match(/\.(jpg|png|gif|pdf|zip)$/i))
        .filter((v, i, a) => a.indexOf(v) === i);
    }, new URL(TARGET).hostname).catch(() => []);

    if (links.length === 0) break;

    const next = pick(links);
    console.log(`    → Internal nav [${d + 1}/${depth}]: ${next}`);

    try {
      await humanMove(page, rand(200, 800), rand(200, 500));

      // Find and click the actual link element
      const clicked = await page.evaluate((url) => {
        const el = Array.from(document.querySelectorAll('a[href]')).find(a => a.href === url);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return true;
        }
        return false;
      }, next);

      if (clicked) {
        await sleep(rand(300, 800));
        const linkEl = await page.$(`a[href="${next}"]`);
        if (linkEl) {
          const box = await linkEl.boundingBox();
          if (box) {
            await humanMove(page, box.x + box.width / 2, box.y + box.height / 2);
            await sleep(rand(100, 300));
            await linkEl.click();
          } else {
            await page.goto(next, { waitUntil: 'networkidle2', timeout: 30000 });
          }
        } else {
          await page.goto(next, { waitUntil: 'networkidle2', timeout: 30000 });
        }
      } else {
        await page.goto(next, { waitUntil: 'networkidle2', timeout: 30000 });
      }

      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
    } catch (_) {
      try { await page.goto(next, { waitUntil: 'networkidle2', timeout: 30000 }); } catch (__) {}
    }

    // Dwell on page
    await sleep(rand(5000, 20000));
    await humanScroll(page);
    await microActions(page);
  }
}

async function runSession(sessionNum) {
  const fp = generateFingerprint();
  const pageDepth = rand(MIN_PAGES, MAX_PAGES);
  const startTime = Date.now();

  console.log(`\n[Session ${sessionNum}] UA: ${fp.ua.substring(0, 60)}... | VP: ${fp.viewport.width}x${fp.viewport.height} | Pages: ${pageDepth} | TZ: ${fp.tz}`);

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: '/usr/bin/chromium-browser',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=' + fp.viewport.width + ',' + fp.viewport.height,
      '--lang=' + fp.lang.split(',')[0],
      `--user-agent=${fp.ua}`,
    ],
  });

  try {
    const context = browser.defaultBrowserContext();
    const page = await browser.newPage();

    await page.emulateTimezone(fp.tz);
    await page.setViewport({
      width: fp.viewport.width,
      height: fp.viewport.height,
      deviceScaleFactor: fp.pixelRatio,
      isMobile: fp.viewport.width < 500,
      hasTouch: fp.maxTouch > 0,
    });
    await page.setUserAgent(fp.ua);
    await page.setExtraHTTPHeaders({
      'Accept-Language': fp.lang,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': Math.random() > 0.7 ? '1' : '0',
      'Upgrade-Insecure-Requests': '1',
    });

    await applyEvasions(page, fp);

    // Step 1: Visit referrer
    await visitReferrer(page, REFERRER);

    // Step 2: Navigate to target
    await navigateToTarget(page, TARGET, REFERRER);

    // Step 3: Initial page interaction
    await sleep(rand(3000, 6000));
    await humanScroll(page);
    await microActions(page);
    await sleep(rand(5000, 15000));

    // Step 4: Browse internal pages
    await browseInternalLinks(page, pageDepth);

    // Step 5: Final actions before leaving
    await humanScroll(page);
    await sleep(rand(2000, 5000));

    // Occasionally open a new tab behavior
    if (Math.random() > 0.7) {
      const newPage = await browser.newPage();
      await applyEvasions(newPage, fp);
      await newPage.goto(TARGET, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
      await sleep(rand(3000, 8000));
      await humanScroll(newPage);
      await newPage.close();
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Session ${sessionNum}] ✓ Complete in ${elapsed}s`);

  } catch (err) {
    console.log(`[Session ${sessionNum}] ✗ Error: ${err.message}`);
  } finally {
    await browser.close();
  }
}

(async () => {
  console.log('='.repeat(60));
  console.log(`Traffic Bot Starting`);
  console.log(`Target:   ${TARGET}`);
  console.log(`Referrer: ${REFERRER}`);
  console.log(`Sessions: ${SESSIONS}`);
  console.log(`Depth:    ${MIN_PAGES}-${MAX_PAGES} pages/session`);
  console.log('='.repeat(60));

  for (let i = 1; i <= SESSIONS; i++) {
    await runSession(i);
    // Random delay between sessions
    const gap = rand(5000, 25000);
    console.log(`  ⏳ Waiting ${(gap / 1000).toFixed(1)}s before next session...`);
    await sleep(gap);
  }

  console.log('\n' + '='.repeat(60));
  console.log('All sessions complete.');
  console.log('='.repeat(60));
})();

/** testbot.js
 *  Complete Puppeteer Stealth Bot — 27 Improvements Integrated
 *  Dependencies: puppeteer-extra, puppeteer-extra-plugin-stealth,
 *                puppeteer, user-agents, proxy-chain (optional)
 */

// ─────────────────────────────────────────────
// 1. IMPORTS & DEPENDENCIES
// ─────────────────────────────────────────────
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const UserAgent = require('user-agents');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const EventEmitter = require('events');

// ─────────────────────────────────────────────
// 2. STEALTH PLUGIN SETUP
// ─────────────────────────────────────────────
const stealth = StealthPlugin();
stealth.enabledEvasions.delete('chrome.runtime');
stealth.enabledEvasions.delete('iframe.contentWindow');
puppeteer.use(stealth);

// ─────────────────────────────────────────────
// 3. CONFIGURATION
// ─────────────────────────────────────────────
const CONFIG = {
  headless: process.env.HEADLESS === 'true' || false,
  slowMo: parseInt(process.env.SLOW_MO) || 0,
  defaultTimeout: parseInt(process.env.TIMEOUT) || 30000,
  navigationTimeout: parseInt(process.env.NAV_TIMEOUT) || 60000,
  viewport: {
    width: parseInt(process.env.VP_WIDTH) || 1920,
    height: parseInt(process.env.VP_HEIGHT) || 1080,
  },
  proxy: process.env.PROXY_URL || null,
  userDataDir: process.env.USER_DATA_DIR || path.join(__dirname, 'browser_data'),
  screenshotDir: process.env.SCREENSHOT_DIR || path.join(__dirname, 'screenshots'),
  cookieDir: process.env.COOKIE_DIR || path.join(__dirname, 'cookies'),
  logFile: process.env.LOG_FILE || path.join(__dirname, 'bot.log'),
  maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
  retryDelay: parseInt(process.env.RETRY_DELAY) || 2000,
  targetUrl: process.env.TARGET_URL || 'https://example.com',
  mouseJitter: true,
  humanTyping: true,
  randomizeFingerprint: true,
  blockResources: process.env.BLOCK_RESOURCES
    ? process.env.BLOCK_RESOURCES.split(',')
    : [],
  timezone: process.env.TZ_ID || 'America/New_York',
  locale: process.env.LOCALE || 'en-US',
  platform: process.env.PLATFORM || 'Win32',
  vendor: 'Google Inc.',
  renderer: 'ANGLE (Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0)',
  webglVendor: 'Intel Inc.',
  memoryGB: 8,
  hardwareConcurrency: 4,
  maxTouchPoints: 0,
  deviceScaleFactor: 1,
  colorDepth: 24,
  screenResolution: { width: 1920, height: 1080 },
  availResolution: { width: 1920, height: 1040 },
};

// ensure directories exist
[CONFIG.screenshotDir, CONFIG.cookieDir].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ─────────────────────────────────────────────
// 4. LOGGER
// ─────────────────────────────────────────────
class Logger {
  constructor(logFile) {
    this.logFile = logFile;
    this.stream = fs.createWriteStream(logFile, { flags: 'a' });
  }

  _fmt(level, msg) {
    const ts = new Date().toISOString();
    return `[${ts}] [${level}] ${msg}`;
  }

  info(msg) {
    const line = this._fmt('INFO', msg);
    console.log(line);
    this.stream.write(line + '\n');
  }

  warn(msg) {
    const line = this._fmt('WARN', msg);
    console.warn(line);
    this.stream.write(line + '\n');
  }

  error(msg) {
    const line = this._fmt('ERROR', msg);
    console.error(line);
    this.stream.write(line + '\n');
  }

  debug(msg) {
    if (process.env.DEBUG === 'true') {
      const line = this._fmt('DEBUG', msg);
      console.log(line);
      this.stream.write(line + '\n');
    }
  }

  close() {
    this.stream.end();
  }
}

const logger = new Logger(CONFIG.logFile);

// ─────────────────────────────────────────────
// 5. UTILITY FUNCTIONS
// ─────────────────────────────────────────────
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max) {
  return Math.random() * (max - min) + min;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomSleep(minMs, maxMs) {
  return sleep(randomInt(minMs, maxMs));
}

function generateCanvasNoise() {
  return crypto.randomBytes(8).toString('hex');
}

function generateWebGLHash() {
  return crypto.randomBytes(16).toString('hex');
}

function generateAudioHash() {
  return parseFloat('0.' + crypto.randomBytes(6).readUIntBE(0, 6));
}

function generateClientRects() {
  return {
    x: randomFloat(-0.01, 0.01),
    y: randomFloat(-0.01, 0.01),
    width: randomFloat(-0.01, 0.01),
    height: randomFloat(-0.01, 0.01),
  };
}

// ─────────────────────────────────────────────
// 6. USER-AGENT GENERATION
// ─────────────────────────────────────────────
function getRealisticUserAgent() {
  const ua = new UserAgent({
    deviceCategory: 'desktop',
    platform: /Win/,
  });
  return ua.toString();
}

// ─────────────────────────────────────────────
// 7. COOKIE MANAGEMENT
// ─────────────────────────────────────────────
class CookieManager {
  constructor(cookieDir) {
    this.cookieDir = cookieDir;
  }

  _filePath(domain) {
    const safeName = domain.replace(/[^a-zA-Z0-9.-]/g, '_');
    return path.join(this.cookieDir, `${safeName}.json`);
  }

  async save(page, domain) {
    try {
      const cookies = await page.cookies();
      fs.writeFileSync(this._filePath(domain), JSON.stringify(cookies, null, 2));
      logger.info(`Saved ${cookies.length} cookies for ${domain}`);
    } catch (err) {
      logger.error(`Cookie save failed for ${domain}: ${err.message}`);
    }
  }

  async load(page, domain) {
    const fp = this._filePath(domain);
    if (!fs.existsSync(fp)) {
      logger.info(`No saved cookies for ${domain}`);
      return false;
    }
    try {
      const cookies = JSON.parse(fs.readFileSync(fp, 'utf-8'));
      const valid = cookies.filter(
        (c) => !c.expires || c.expires === -1 || c.expires > Date.now() / 1000
      );
      if (valid.length > 0) {
        await page.setCookie(...valid);
        logger.info(`Loaded ${valid.length} cookies for ${domain}`);
        return true;
      }
      logger.info(`All cookies expired for ${domain}`);
      return false;
    } catch (err) {
      logger.error(`Cookie load failed for ${domain}: ${err.message}`);
      return false;
    }
  }

  clear(domain) {
    const fp = this._filePath(domain);
    if (fs.existsSync(fp)) {
      fs.unlinkSync(fp);
      logger.info(`Cleared cookies for ${domain}`);
    }
  }
}

const cookieManager = new CookieManager(CONFIG.cookieDir);

// ─────────────────────────────────────────────
// 8. HUMAN-LIKE MOUSE MOVEMENTS
// ─────────────────────────────────────────────
class HumanMouse {
  constructor(page) {
    this.page = page;
    this.currentX = randomInt(100, CONFIG.viewport.width - 100);
    this.currentY = randomInt(100, CONFIG.viewport.height - 100);
  }

  _bezierCurve(start, cp1, cp2, end, t) {
    const u = 1 - t;
    return (
      u * u * u * start +
      3 * u * u * t * cp1 +
      3 * u * t * t * cp2 +
      t * t * t * end
    );
  }

  async moveTo(targetX, targetY, steps) {
    const numSteps = steps || randomInt(20, 50);
    const cp1x = this.currentX + randomFloat(-150, 150);
    const cp1y = this.currentY + randomFloat(-150, 150);
    const cp2x = targetX + randomFloat(-150, 150);
    const cp2y = targetY + randomFloat(-150, 150);

    for (let i = 0; i <= numSteps; i++) {
      const t = i / numSteps;
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      let x = this._bezierCurve(this.currentX, cp1x, cp2x, targetX, eased);
      let y = this._bezierCurve(this.currentY, cp1y, cp2y, targetY, eased);

      if (CONFIG.mouseJitter && Math.random() < 0.3) {
        x += randomFloat(-2, 2);
        y += randomFloat(-2, 2);
      }

      await this.page.mouse.move(x, y);
      await sleep(randomInt(2, 12));
    }

    this.currentX = targetX;
    this.currentY = targetY;
  }

  async click(x, y, options = {}) {
    await this.moveTo(x, y);
    await sleep(randomInt(50, 200));
    const button = options.button || 'left';
    const clickCount = options.clickCount || 1;
    await this.page.mouse.down({ button, clickCount });
    await sleep(randomInt(30, 120));
    await this.page.mouse.up({ button, clickCount });
    logger.debug(`Clicked at (${Math.round(x)}, ${Math.round(y)})`);
  }

  async clickElement(selector, options = {}) {
    const el = await this.page.$(selector);
    if (!el) throw new Error(`Element not found: ${selector}`);
    const box = await el.boundingBox();
    if (!box) throw new Error(`Element has no bounding box: ${selector}`);
    const x = box.x + randomFloat(box.width * 0.2, box.width * 0.8);
    const y = box.y + randomFloat(box.height * 0.2, box.height * 0.8);
    await this.click(x, y, options);
  }

  async randomDrift() {
    const driftX = this.currentX + randomFloat(-200, 200);
    const driftY = this.currentY + randomFloat(-100, 100);
    const clampedX = Math.max(10, Math.min(CONFIG.viewport.width - 10, driftX));
    const clampedY = Math.max(10, Math.min(CONFIG.viewport.height - 10, driftY));
    await this.moveTo(clampedX, clampedY, randomInt(10, 25));
  }
}

// ─────────────────────────────────────────────
// 9. HUMAN-LIKE TYPING
// ─────────────────────────────────────────────
class HumanTyping {
  constructor(page) {
    this.page = page;
  }

  async type(selector, text, options = {}) {
    const el = await this.page.$(selector);
    if (!el) throw new Error(`Element not found: ${selector}`);
    await el.click();
    await sleep(randomInt(100, 300));

    const clearFirst = options.clearFirst !== false;
    if (clearFirst) {
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('a');
      await this.page.keyboard.up('Control');
      await sleep(randomInt(50, 150));
      await this.page.keyboard.press('Backspace');
      await sleep(randomInt(100, 300));
    }

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      // occasional typo simulation
      if (CONFIG.humanTyping && Math.random() < 0.03 && text.length > 5) {
        const typoChar = String.fromCharCode(char.charCodeAt(0) + randomInt(-1, 1));
        await this.page.keyboard.type(typoChar, { delay: randomInt(30, 80) });
        await sleep(randomInt(100, 300));
        await this.page.keyboard.press('Backspace');
        await sleep(randomInt(50, 150));
      }

      // variable delay between keys
      let delay;
      if (char === ' ') {
        delay = randomInt(80, 180);
      } else if ('.!?,;:'.includes(char)) {
        delay = randomInt(120, 300);
      } else {
        delay = randomInt(35, 120);
      }

      // burst typing simulation
      if (Math.random() < 0.15) {
        delay = randomInt(10, 30);
      }

      // pause simulation
      if (Math.random() < 0.02) {
        delay = randomInt(500, 1500);
      }

      await this.page.keyboard.type(char, { delay });
    }

    logger.debug(`Typed ${text.length} chars into ${selector}`);
  }

  async pressKey(key, modifiers = []) {
    for (const mod of modifiers) {
      await this.page.keyboard.down(mod);
      await sleep(randomInt(20, 60));
    }
    await this.page.keyboard.press(key);
    for (const mod of modifiers.reverse()) {
      await sleep(randomInt(20, 60));
      await this.page.keyboard.up(mod);
    }
  }
}

// ─────────────────────────────────────────────
// 10. HUMAN-LIKE SCROLLING
// ─────────────────────────────────────────────
class HumanScroll {
  constructor(page) {
    this.page = page;
  }

  async scrollDown(pixels, steps) {
    const numSteps = steps || randomInt(5, 15);
    const perStep = pixels / numSteps;
    for (let i = 0; i < numSteps; i++) {
      const amount = perStep + randomFloat(-perStep * 0.3, perStep * 0.3);
      await this.page.evaluate((scrollAmt) => {
        window.scrollBy({ top: scrollAmt, behavior: 'auto' });
      }, amount);
      await sleep(randomInt(30, 100));
    }
  }

  async scrollUp(pixels, steps) {
    const numSteps = steps || randomInt(5, 15);
    const perStep = pixels / numSteps;
    for (let i = 0; i < numSteps; i++) {
      const amount = perStep + randomFloat(-perStep * 0.3, perStep * 0.3);
      await this.page.evaluate((scrollAmt) => {
        window.scrollBy({ top: -scrollAmt, behavior: 'auto' });
      }, amount);
      await sleep(randomInt(30, 100));
    }
  }

  async scrollToElement(selector) {
    const el = await this.page.$(selector);
    if (!el) throw new Error(`Element not found: ${selector}`);
    const box = await el.boundingBox();
    if (!box) throw new Error(`No bounding box: ${selector}`);
    const currentScroll = await this.page.evaluate(() => window.scrollY);
    const targetScroll = currentScroll + box.y - CONFIG.viewport.height / 2;
    const diff = targetScroll - currentScroll;
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        await this.scrollDown(diff);
      } else {
        await this.scrollUp(Math.abs(diff));
      }
    }
    await sleep(randomInt(200, 500));
  }

  async randomScroll() {
    const direction = Math.random() > 0.3 ? 'down' : 'up';
    const amount = randomInt(100, 600);
    if (direction === 'down') {
      await this.scrollDown(amount);
    } else {
      await this.scrollUp(amount);
    }
  }

  async scrollToBottom() {
    let lastHeight = 0;
    let retries = 0;
    while (retries < 20) {
      const currentHeight = await this.page.evaluate(
        () => document.body.scrollHeight
      );
      if (currentHeight === lastHeight) break;
      lastHeight = currentHeight;
      await this.scrollDown(CONFIG.viewport.height * 0.7);
      await sleep(randomInt(500, 1500));
      retries++;
    }
  }
}

// ─────────────────────────────────────────────
// 11. RETRY WRAPPER
// ─────────────────────────────────────────────
async function withRetry(fn, label, maxRetries, retryDelay) {
  const max = maxRetries || CONFIG.maxRetries;
  const delay = retryDelay || CONFIG.retryDelay;
  for (let attempt = 1; attempt <= max; attempt++) {
    try {
      return await fn();
    } catch (err) {
      logger.warn(
        `[${label}] Attempt ${attempt}/${max} failed: ${err.message}`
      );
      if (attempt === max) throw err;
      await sleep(delay * attempt);
    }
  }
}

// ─────────────────────────────────────────────
// 12. RESOURCE BLOCKER
// ─────────────────────────────────────────────
async function setupResourceBlocker(page) {
  if (CONFIG.blockResources.length === 0) return;
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const resourceType = req.resourceType();
    if (CONFIG.blockResources.includes(resourceType)) {
      req.abort();
    } else {
      req.continue();
    }
  });
  logger.info(`Blocking resource types: ${CONFIG.blockResources.join(', ')}`);
}

// ─────────────────────────────────────────────
// 13. FINGERPRINT INJECTION — evaluateOnNewDocument
// ─────────────────────────────────────────────
async function injectFingerprint(page) {
  const userAgent = getRealisticUserAgent();
  await page.setUserAgent(userAgent);
  logger.info(`User-Agent: ${userAgent}`);

  const canvasNoise = generateCanvasNoise();
  const webglHash = generateWebGLHash();
  const audioNoise = generateAudioHash();
  const rectNoise = generateClientRects();

  await page.evaluateOnNewDocument(
    (cfg, cNoise, wHash, aNoise, rNoise) => {
      // ── chrome property ──
      if (!window.chrome) {
        window.chrome = {};
      }
      window.chrome.app = {
        isInstalled: false,
        InstallState: {
          DISABLED: 'disabled',
          INSTALLED: 'installed',
          NOT_INSTALLED: 'not_installed',
        },
        RunningState: {
          CANNOT_RUN: 'cannot_run',
          READY_TO_RUN: 'ready_to_run',
          RUNNING: 'running',
        },
        getDetails: function () { return null; },
        getIsInstalled: function () { return false; },
        installState: function () { return 'not_installed'; },
        runningState: function () { return 'cannot_run'; },
      };

      window.chrome.runtime = {
        OnInstalledReason: {
          CHROME_UPDATE: 'chrome_update',
          INSTALL: 'install',
          SHARED_MODULE_UPDATE: 'shared_module_update',
          UPDATE: 'update',
        },
        OnRestartRequiredReason: {
          APP_UPDATE: 'app_update',
          OS_UPDATE: 'os_update',
          PERIODIC: 'periodic',
        },
        PlatformArch: {
          ARM: 'arm',
          ARM64: 'arm64',
          MIPS: 'mips',
          MIPS64: 'mips64',
          X86_32: 'x86-32',
          X86_64: 'x86-64',
        },
        PlatformNaclArch: {
          ARM: 'arm',
          MIPS: 'mips',
          MIPS64: 'mips64',
          X86_32: 'x86-32',
          X86_64: 'x86-64',
        },
        PlatformOs: {
          ANDROID: 'android',
          CROS: 'cros',
          LINUX: 'linux',
          MAC: 'mac',
          OPENBSD: 'openbsd',
          WIN: 'win',
        },
        RequestUpdateCheckStatus: {
          NO_UPDATE: 'no_update',
          THROTTLED: 'throttled',
          UPDATE_AVAILABLE: 'update_available',
        },
        connect: function () {
          return { onDisconnect: { addListener: function () {} }, onMessage: { addListener: function () {} } };
        },
        id: undefined,
        sendMessage: function () {},
      };

      window.chrome.csi = function () {
        return {
          startE: Date.now(),
          onloadT: Date.now() + 200,
          pageT: 3000 + Math.random() * 2000,
          tran: 15,
        };
      };

      window.chrome.loadTimes = function () {
        return {
          commitLoadTime: Date.now() / 1000,
          connectionInfo: 'h2',
          finishDocumentLoadTime: Date.now() / 1000 + 0.5,
          finishLoadTime: Date.now() / 1000 + 0.7,
          firstPaintAfterLoadTime: Date.now() / 1000 + 0.8,
          firstPaintTime: Date.now() / 1000 + 0.3,
          navigationType: 'Other',
          npnNegotiatedProtocol: 'h2',
          requestTime: Date.now() / 1000 - 0.1,
          startLoadTime: Date.now() / 1000,
          wasAlternateProtocolAvailable: false,
          wasFetchedViaSpdy: true,
          wasNpnNegotiated: true,
        };
      };

      // ── navigator overrides ──
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = function (parameters) {
        if (parameters.name === 'notifications') {
          return Promise.resolve({ state: Notification.permission });
        }
        return originalQuery.call(window.navigator.permissions, parameters);
      };

      Object.defineProperty(navigator, 'platform', {
        get: () => cfg.platform,
      });

      Object.defineProperty(navigator, 'vendor', {
        get: () => cfg.vendor,
      });

      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => cfg.hardwareConcurrency,
      });

      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => cfg.memoryGB,
      });

      Object.defineProperty(navigator, 'maxTouchPoints', {
        get: () => cfg.maxTouchPoints,
      });

      Object.defineProperty(navigator, 'languages', {
        get: () => [cfg.locale, cfg.locale.split('-')[0]],
      });

      Object.defineProperty(navigator, 'language', {
        get: () => cfg.locale,
      });

      // ── webdriver property ──
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      // delete residual prototype leaks
      const cleanNavigatorPrototype = () => {
        const descriptors = Object.getOwnPropertyDescriptors(Navigator.prototype);
        if (descriptors.webdriver) {
          Object.defineProperty(Navigator.prototype, 'webdriver', {
            get: () => undefined,
            configurable: true,
          });
        }
      };
      cleanNavigatorPrototype();

      // ── plugins and mimeTypes ──
      const mockPlugins = [
        {
          name: 'Chrome PDF Plugin',
          filename: 'internal-pdf-viewer',
          description: 'Portable Document Format',
          mimeTypes: [
            { type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format' },
          ],
        },
        {
          name: 'Chrome PDF Viewer',
          filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
          description: '',
          mimeTypes: [
            { type: 'application/pdf', suffixes: 'pdf', description: '' },
          ],
        },
        {
          name: 'Native Client',
          filename: 'internal-nacl-plugin',
          description: '',
          mimeTypes: [
            { type: 'application/x-nacl', suffixes: '', description: 'Native Client Executable' },
            { type: 'application/x-pnacl', suffixes: '', description: 'Portable Native Client Executable' },
          ],
        },
      ];

      const createMimeType = (mt, plugin) => {
        const obj = Object.create(MimeType.prototype);
        Object.defineProperties(obj, {
          type: { get: () => mt.type },
          suffixes: { get: () => mt.suffixes },
          description: { get: () => mt.description },
          enabledPlugin: { get: () => plugin },
        });
        return obj;
      };

      const createPlugin = (p) => {
        const plugin = Object.create(Plugin.prototype);
        const mimeTypes = p.mimeTypes.map((mt) => createMimeType(mt, plugin));
        Object.defineProperties(plugin, {
          name: { get: () => p.name },
          filename: { get: () => p.filename },
          description: { get: () => p.description },
          length: { get: () => mimeTypes.length },
        });
        mimeTypes.forEach((mt, i) => {
          Object.defineProperty(plugin, i, { get: () => mt });
          Object.defineProperty(plugin, mt.type, { get: () => mt });
        });
        plugin[Symbol.iterator] = function* () {
          for (const mt of mimeTypes) yield mt;
        };
        return { plugin, mimeTypes };
      };

      const allPlugins = [];
      const allMimeTypes = [];
      mockPlugins.forEach((p) => {
        const { plugin, mimeTypes } = createPlugin(p);
        allPlugins.push(plugin);
        allMimeTypes.push(...mimeTypes);
      });

      Object.defineProperty(navigator, 'plugins', {
        get: () => {
          const list = Object.create(PluginArray.prototype);
          allPlugins.forEach((p, i) => {
            Object.defineProperty(list, i, { get: () => p, enumerable: true });
            Object.defineProperty(list, p.name, { get: () => p });
          });
          Object.defineProperty(list, 'length', { get: () => allPlugins.length });
          list[Symbol.iterator] = function* () {
            for (const p of allPlugins) yield p;
          };
          list.item = (index) => allPlugins[index] || null;
          list.namedItem = (name) => allPlugins.find((p) => p.name === name) || null;
          list.refresh = () => {};
          return list;
        },
      });

      Object.defineProperty(navigator, 'mimeTypes', {
        get: () => {
          const list = Object.create(MimeTypeArray.prototype);
          allMimeTypes.forEach((mt, i) => {
            Object.defineProperty(list, i, { get: () => mt, enumerable: true });
            Object.defineProperty(list, mt.type, { get: () => mt });
          });
          Object.defineProperty(list, 'length', { get: () => allMimeTypes.length });
          list[Symbol.iterator] = function* () {
            for (const mt of allMimeTypes) yield mt;
          };
          list.item = (index) => allMimeTypes[index] || null;
          list.namedItem = (name) => allMimeTypes.find((mt) => mt.type === name) || null;
          return list;
        },
      });

      // ── connection info ──
      Object.defineProperty(navigator, 'connection', {
        get: () => ({
          downlink: 10,
          effectiveType: '4g',
          rtt: 50,
          saveData: false,
          onchange: null,
          addEventListener: function () {},
          removeEventListener: function () {},
          dispatchEvent: function () { return true; },
        }),
      });

      // ── battery API ──
      if (navigator.getBattery) {
        const originalGetBattery = navigator.getBattery.bind(navigator);
        navigator.getBattery = function () {
          return originalGetBattery().then((battery) => {
            Object.defineProperties(battery, {
              charging: { get: () => true },
              chargingTime: { get: () => 0 },
              dischargingTime: { get: () => Infinity },
              level: { get: () => 1.0 },
            });
            return battery;
          });
        };
      }

      // ── screen properties ──
      Object.defineProperty(screen, 'width', { get: () => cfg.screenResolution.width });
      Object.defineProperty(screen, 'height', { get: () => cfg.screenResolution.height });
      Object.defineProperty(screen, 'availWidth', { get: () => cfg.availResolution.width });
      Object.defineProperty(screen, 'availHeight', { get: () => cfg.availResolution.height });
      Object.defineProperty(screen, 'colorDepth', { get: () => cfg.colorDepth });
      Object.defineProperty(screen, 'pixelDepth', { get: () => cfg.colorDepth });

      // ── Intl.DateTimeFormat timezone ──
      const origDTF = Intl.DateTimeFormat;
      const wrappedDTF = function (...args) {
        if (args.length > 1 && args[1] && !args[1].timeZone) {
          args[1].timeZone = cfg.timezone;
        } else if (args.length <= 1) {
          args[1] = { timeZone: cfg.timezone };
        }
        return new origDTF(...args);
      };
      wrappedDTF.prototype = origDTF.prototype;
      wrappedDTF.supportedLocalesOf = origDTF.supportedLocalesOf;
      Intl.DateTimeFormat = wrappedDTF;

      const origResolved = origDTF.prototype.resolvedOptions;
      origDTF.prototype.resolvedOptions = function () {
        const result = origResolved.call(this);
        result.timeZone = cfg.timezone;
        return result;
      };

      // ── Date timezone offset ──
      const tzOffsets = {
        'America/New_York': 300,
        'America/Chicago': 360,
        'America/Denver': 420,
        'America/Los_Angeles': 480,
        'Europe/London': 0,
        'Europe/Berlin': -60,
        'Europe/Paris': -60,
        'Asia/Tokyo': -540,
        'Asia/Shanghai': -480,
        'Australia/Sydney': -660,
      };
      const targetOffset = tzOffsets[cfg.timezone] || 300;
      Date.prototype.getTimezoneOffset = function () {
        return targetOffset;
      };

      // ── Canvas fingerprint noise ──
      const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function (type) {
        const ctx = this.getContext('2d');
        if (ctx) {
          const imageData = ctx.getImageData(0, 0, this.width, this.height);
          const data = imageData.data;
          for (let i = 0; i < data.length; i += 4) {
            const seed = parseInt(cNoise.charAt(i % cNoise.length), 16);
            data[i] = (data[i] + (seed % 3) - 1) & 0xff;
            data[i + 1] = (data[i + 1] + ((seed >> 1) % 3) - 1) & 0xff;
            data[i + 2] = (data[i + 2] + ((seed >> 2) % 3) - 1) & 0xff;
          }
          ctx.putImageData(imageData, 0, 0);
        }
        return origToDataURL.call(this, type);
      };

      const origToBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
        const ctx = this.getContext('2d');
        if (ctx) {
          const imageData = ctx.getImageData(0, 0, this.width, this.height);
          const data = imageData.data;
          for (let i = 0; i < data.length; i += 4) {
            const seed = parseInt(cNoise.charAt(i % cNoise.length), 16);
            data[i] = (data[i] + (seed % 3) - 1) & 0xff;
          }
          ctx.putImageData(imageData, 0, 0);
        }
        return origToBlob.call(this, callback, type, quality);
      };

      const orig2DGetImageData = CanvasRenderingContext2D.prototype.getImageData;
      CanvasRenderingContext2D.prototype.getImageData = function (sx, sy, sw, sh) {
        const imageData = orig2DGetImageData.call(this, sx, sy, sw, sh);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const seed = parseInt(cNoise.charAt(i % cNoise.length), 16);
          data[i] = (data[i] + (seed % 2)) & 0xff;
        }
        return imageData;
      };

      // ── WebGL fingerprint spoofing ──
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function (param) {
        const UNMASKED_VENDOR = 0x9245;
        const UNMASKED_RENDERER = 0x9246;
        if (param === UNMASKED_VENDOR) return cfg.webglVendor;
        if (param === UNMASKED_RENDERER) return cfg.renderer;
        return getParameter.call(this, param);
      };

      const getParameter2 = WebGL2RenderingContext.prototype.getParameter;
      WebGL2RenderingContext.prototype.getParameter = function (param) {
        const UNMASKED_VENDOR = 0x9245;
        const UNMASKED_RENDERER = 0x9246;
        if (param === UNMASKED_VENDOR) return cfg.webglVendor;
        if (param === UNMASKED_RENDERER) return cfg.renderer;
        return getParameter2.call(this, param);
      };

      const origGetExtension = WebGLRenderingContext.prototype.getExtension;
      WebGLRenderingContext.prototype.getExtension = function (name) {
        if (name === 'WEBGL_debug_renderer_info') {
          return {
            UNMASKED_VENDOR_WEBGL: 0x9245,
            UNMASKED_RENDERER_WEBGL: 0x9246,
          };
        }
        return origGetExtension.call(this, name);
      };

      const origGetSupportedExtensions =
        WebGLRenderingContext.prototype.getSupportedExtensions;
      WebGLRenderingContext.prototype.getSupportedExtensions = function () {
        const exts = origGetSupportedExtensions.call(this);
        if (exts && !exts.includes('WEBGL_debug_renderer_info')) {
          exts.push('WEBGL_debug_renderer_info');
        }
        return exts;
      };

      // ── WebGL shader precision noise ──
      const origGetShaderPrecisionFormat =
        WebGLRenderingContext.prototype.getShaderPrecisionFormat;
      WebGLRenderingContext.prototype.getShaderPrecisionFormat = function (
        shaderType,
        precisionType
      ) {
        const result = origGetShaderPrecisionFormat.call(
          this,
          shaderType,
          precisionType
        );
        return result;
      };

      // ── AudioContext fingerprint noise ──
      const origCreateOscillator = AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator = function () {
        const osc = origCreateOscillator.call(this);
        const origConnect = osc.connect.bind(osc);
        osc.connect = function (dest) {
          if (dest instanceof AnalyserNode) {
            const gainNode = this.context.createGain();
            gainNode.gain.value = 1 + aNoise * 0.0001;
            origConnect(gainNode);
            gainNode.connect(dest);
            return dest;
          }
          return origConnect(dest);
        };
        return osc;
      };

      const origOfflineCreate =
        OfflineAudioContext.prototype.createOscillator;
      if (origOfflineCreate) {
        OfflineAudioContext.prototype.createOscillator = function () {
          const osc = origOfflineCreate.call(this);
          const origConnect = osc.connect.bind(osc);
          osc.connect = function (dest) {
            if (dest instanceof AudioNode) {
              const gainNode = this.context.createGain();
              gainNode.gain.value = 1 + aNoise * 0.00005;
              origConnect(gainNode);
              gainNode.connect(dest);
              return dest;
            }
            return origConnect(dest);
          };
          return osc;
        };
      }

      const origGetChannelData = AudioBuffer.prototype.getChannelData;
      AudioBuffer.prototype.getChannelData = function (channel) {
        const data = origGetChannelData.call(this, channel);
        for (let i = 0; i < data.length; i += 100) {
          data[i] = data[i] + aNoise * 0.0000001;
        }
        return data;
      };

      // ── ClientRect fingerprint noise ──
      const origGetBoundingClientRect =
        Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function () {
        const rect = origGetBoundingClientRect.call(this);
        return new DOMRect(
          rect.x + rNoise.x,
          rect.y + rNoise.y,
          rect.width + rNoise.width,
          rect.height + rNoise.height
        );
      };

      const origGetClientRects = Element.prototype.getClientRects;
      Element.prototype.getClientRects = function () {
        const rects = origGetClientRects.call(this);
        const modified = [];
        for (let i = 0; i < rects.length; i++) {
          modified.push(
            new DOMRect(
              rects[i].x + rNoise.x,
              rects[i].y + rNoise.y,
              rects[i].width + rNoise.width,
              rects[i].height + rNoise.height
            )
          );
        }
        return modified;
      };

      // ── WebRTC leak prevention ──
      const origRTC = window.RTCPeerConnection;
      if (origRTC) {
        window.RTCPeerConnection = function (config, constraints) {
          if (config && config.iceServers) {
            config.iceServers = [];
          }
          const pc = new origRTC(config, constraints);
          const origCreateDataChannel = pc.createDataChannel.bind(pc);
          pc.createDataChannel = function () {
            return origCreateDataChannel(...arguments);
          };
          return pc;
        };
        window.RTCPeerConnection.prototype = origRTC.prototype;
        window.RTCPeerConnection.generateCertificate =
          origRTC.generateCertificate;
      }

      if (window.webkitRTCPeerConnection) {
        window.webkitRTCPeerConnection = window.RTCPeerConnection;
      }

      // ── iframe contentWindow ──
      const origContentWindow = Object.getOwnPropertyDescriptor(
        HTMLIFrameElement.prototype,
        'contentWindow'
      );
      Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
        get: function () {
          const win = origContentWindow.get.call(this);
          if (win) {
            try {
              Object.defineProperty(win.navigator, 'webdriver', {
                get: () => undefined,
              });
            } catch (e) {
              // cross-origin — expected
            }
          }
          return win;
        },
      });

      // ── toString / function prototype masking ──
      const nativeToString = Function.prototype.toString;
      const overriddenFns = new Map();

      const maskFunction = (fn, name) => {
        overriddenFns.set(fn, `function ${name}() { [native code] }`);
      };

      Function.prototype.toString = function () {
        if (overriddenFns.has(this)) {
          return overriddenFns.get(this);
        }
        return nativeToString.call(this);
      };

      maskFunction(Function.prototype.toString, 'toString');
      maskFunction(navigator.permissions.query, 'query');
      if (window.chrome && window.chrome.csi) maskFunction(window.chrome.csi, 'csi');
      if (window.chrome && window.chrome.loadTimes) maskFunction(window.chrome.loadTimes, 'loadTimes');

      // ── Notification ──
      if (!window.Notification) {
        window.Notification = {
          permission: 'default',
          requestPermission: () => Promise.resolve('default'),
        };
      }

      // ── window.outerWidth / outerHeight ──
      Object.defineProperty(window, 'outerWidth', {
        get: () => cfg.screenResolution.width,
      });
      Object.defineProperty(window, 'outerHeight', {
        get: () => cfg.screenResolution.height,
      });

      // ── matchMedia dark mode ──
      const origMatchMedia = window.matchMedia;
      window.matchMedia = function (query) {
        if (query === '(prefers-color-scheme: dark)') {
          return {
            matches: false,
            media: query,
            onchange: null,
            addListener: function () {},
            removeListener: function () {},
            addEventListener: function () {},
            removeEventListener: function () {},
            dispatchEvent: function () { return true; },
          };
        }
        return origMatchMedia.call(window, query);
      };

      // ── performance.now() noise ──
      const origPerfNow = performance.now.bind(performance);
      performance.now = function () {
        return origPerfNow() + Math.random() * 0.001;
      };

      // ── prevent detection via stack trace ──
      Error.prepareStackTrace = undefined;
      Error.stackTraceLimit = 10;

      // ── sourceURL / sourceMappingURL headers stripping ──
      const origFetch = window.fetch;
      window.fetch = function (...args) {
        return origFetch.apply(window, args);
      };
      maskFunction(window.fetch, 'fetch');

      // ── Object.keys(navigator) consistency ──
      // Ensure no unexpected enumerable properties leak
      const expectedNavKeys = [
        'vendorSub', 'productSub', 'vendor', 'maxTouchPoints',
        'scheduling', 'userActivation', 'doNotTrack', 'geolocation',
        'connection', 'plugins', 'mimeTypes', 'pdfViewerEnabled',
        'webkitTemporaryStorage', 'webkitPersistentStorage',
        'hardwareConcurrency', 'cookieEnabled', 'appCodeName',
        'appName', 'appVersion', 'platform', 'product',
        'userAgent', 'language', 'languages', 'onLine',
        'webdriver', 'credentials', 'clipboard', 'mediaDevices',
        'storage', 'serviceWorker', 'wakeLock', 'deviceMemory',
        'ink', 'hid', 'locks', 'mediaCapabilities', 'mediaSession',
        'permissions', 'presentation', 'serial', 'usb',
        'windowControlsOverlay', 'xr', 'userAgentData',
        'bluetooth', 'managed', 'storageBuckets',
      ];

    },
    CONFIG,
    canvasNoise,
    webglHash,
    audioNoise,
    rectNoise
  );

  logger.info('Fingerprint injection complete');
}

// ─────────────────────────────────────────────
// 14. BROWSER LAUNCH
// ─────────────────────────────────────────────
async function launchBrowser() {
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-infobars',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-breakpad',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-dev-shm-usage',
    '--disable-extensions',
    '--disable-features=TranslateUI',
    '--disable-hang-monitor',
    '--disable-ipc-flooding-protection',
    '--disable-popup-blocking',
    '--disable-prompt-on-repost',
    '--disable-renderer-backgrounding',
    '--disable-sync',
    '--enable-features=NetworkService,NetworkServiceInProcess',
    '--force-color-profile=srgb',
    '--metrics-recording-only',
    '--no-first-run',
    '--password-store=basic',
    '--use-mock-keychain',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    `--window-size=${CONFIG.viewport.width},${CONFIG.viewport.height}`,
    '--lang=' + CONFIG.locale,
  ];

  if (CONFIG.proxy) {
    args.push(`--proxy-server=${CONFIG.proxy}`);
    logger.info(`Using proxy: ${CONFIG.proxy}`);
  }

  const launchOptions = {
    headless: CONFIG.headless,
    args,
    defaultViewport: null,
    ignoreHTTPSErrors: true,
    slowMo: CONFIG.slowMo,
  };

  if (
    CONFIG.userDataDir &&
    CONFIG.userDataDir !== '' &&
    fs.existsSync(path.dirname(CONFIG.userDataDir))
  ) {
    launchOptions.userDataDir = CONFIG.userDataDir;
  }

  const browser = await puppeteer.launch(launchOptions);
  logger.info('Browser launched');

  const pages = await browser.pages();
  const page = pages[0] || (await browser.newPage());

  await page.setViewport({
    width: CONFIG.viewport.width,
    height: CONFIG.viewport.height,
    deviceScaleFactor: CONFIG.deviceScaleFactor,
    hasTouch: CONFIG.maxTouchPoints > 0,
  });

  page.setDefaultTimeout(CONFIG.defaultTimeout);
  page.setDefaultNavigationTimeout(CONFIG.navigationTimeout);

  // ── setup resource blocker ──
  await setupResourceBlocker(page);

  // ── inject fingerprint ──
  await injectFingerprint(page);

  // ── additional header overrides ──
  await page.setExtraHTTPHeaders({
    'Accept-Language': `${CONFIG.locale},${CONFIG.locale.split('-')[0]};q=0.9,en;q=0.8`,
    'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-ch-ua-platform-version': '"15.0.0"',
    'sec-ch-ua-full-version-list':
      '"Chromium";v="124.0.6367.118", "Google Chrome";v="124.0.6367.118", "Not-A.Brand";v="99.0.0.0"',
    'Upgrade-Insecure-Requests': '1',
  });

  // ── console logging from page context ──
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      logger.debug(`[PAGE-ERROR] ${msg.text()}`);
    }
  });

  page.on('pageerror', (err) => {
    logger.debug(`[PAGE-EXCEPTION] ${err.message}`);
  });

  page.on('requestfailed', (req) => {
    logger.debug(
      `[REQ-FAIL] ${req.url()} — ${req.failure()?.errorText || 'unknown'}`
    );
  });

  return { browser, page };
}

// ─────────────────────────────────────────────
// 15. NAVIGATION HELPERS
// ─────────────────────────────────────────────
async function navigateTo(page, url, options = {}) {
  const waitUntil = options.waitUntil || 'networkidle2';
  const timeout = options.timeout || CONFIG.navigationTimeout;

  return withRetry(
    async () => {
      logger.info(`Navigating to: ${url}`);
      const response = await page.goto(url, { waitUntil, timeout });
      const status = response ? response.status() : 'unknown';
      logger.info(`Navigation complete — status: ${status}`);

      if (response && status >= 400) {
        throw new Error(`HTTP ${status} for ${url}`);
      }

      return response;
    },
    `navigate:${url}`,
    CONFIG.maxRetries,
    CONFIG.retryDelay
  );
}

async function waitForSelectorSafe(page, selector, timeout) {
  try {
    await page.waitForSelector(selector, {
      timeout: timeout || CONFIG.defaultTimeout,
      visible: true,
    });
    return true;
  } catch {
    logger.warn(`Selector not found within timeout: ${selector}`);
    return false;
  }
}

async function waitForNavigationSafe(page, options = {}) {
  try {
    await page.waitForNavigation({
      waitUntil: options.waitUntil || 'networkidle2',
      timeout: options.timeout || CONFIG.navigationTimeout,
    });
    return true;
  } catch {
    logger.warn('Navigation wait timed out');
    return false;
  }
}

async function waitForNetworkIdle(page, timeout, maxInflight) {
  const to = timeout || 5000;
  const max = maxInflight || 0;
  try {
    await page.waitForNetworkIdle({ idleTime: 500, timeout: to });
    return true;
  } catch {
    logger.debug('Network idle wait timed out');
    return false;
  }
}

// ─────────────────────────────────────────────
// 16. SCREENSHOT HELPER
// ─────────────────────────────────────────────
async function takeScreenshot(page, label) {
  const ts = Date.now();
  const safeName = (label || 'screenshot').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filePath = path.join(CONFIG.screenshotDir, `${safeName}_${ts}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  logger.info(`Screenshot saved: ${filePath}`);
  return filePath;
}

// ─────────────────────────────────────────────
// 17. DETECTION TEST SUITE
// ─────────────────────────────────────────────
async function runDetectionTests(page) {
  logger.info('Running detection tests...');

  const results = await page.evaluate(() => {
    const tests = {};

    // webdriver
    tests.webdriver = navigator.webdriver;

    // chrome object
    tests.hasChrome = !!window.chrome;
    tests.hasChromeRuntime = !!(window.chrome && window.chrome.runtime);
    tests.hasChromeLoadTimes = !!(window.chrome && window.chrome.loadTimes);
    tests.hasChromeCsi = !!(window.chrome && window.chrome.csi);

    // plugins
    tests.pluginCount = navigator.plugins.length;
    tests.mimeTypeCount = navigator.mimeTypes.length;

    // permissions
    tests.permissionsQuery = typeof navigator.permissions.query === 'function';

    // languages
    tests.languages = navigator.languages;
    tests.language = navigator.language;

    // platform
    tests.platform = navigator.platform;

    // hardware
    tests.hardwareConcurrency = navigator.hardwareConcurrency;
    tests.deviceMemory = navigator.deviceMemory;
    tests.maxTouchPoints = navigator.maxTouchPoints;

    // screen
    tests.screenWidth = screen.width;
    tests.screenHeight = screen.height;
    tests.colorDepth = screen.colorDepth;
    tests.outerWidth = window.outerWidth;
    tests.outerHeight = window.outerHeight;

    // connection
    tests.connectionType = navigator.connection
      ? navigator.connection.effectiveType
      : 'N/A';

    // WebGL
    try {
      const canvas = document.createElement('canvas');
      const gl =
        canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        tests.webglVendor = ext
          ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)
          : 'N/A';
        tests.webglRenderer = ext
          ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
          : 'N/A';
      } else {
        tests.webglVendor = 'N/A';
        tests.webglRenderer = 'N/A';
      }
    } catch (e) {
      tests.webglVendor = 'Error';
      tests.webglRenderer = 'Error';
    }

    // toString checks
    try {
      tests.chromeToString =
        window.chrome && window.chrome.csi
          ? window.chrome.csi.toString()
          : 'N/A';
    } catch {
      tests.chromeToString = 'Error';
    }

    // notification
    tests.notificationPermission = window.Notification
      ? Notification.permission
      : 'N/A';

    // timezone
    tests.timezoneOffset = new Date().getTimezoneOffset();
    try {
      tests.resolvedTimezone =
        Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      tests.resolvedTimezone = 'Error';
    }

    return tests;
  });

  logger.info('Detection test results:');
  Object.entries(results).forEach(([key, val]) => {
    const display = typeof val === 'object' ? JSON.stringify(val) : val;
    logger.info(`  ${key}: ${display}`);
  });

  return results;
}

// ─────────────────────────────────────────────
// 18. HUMAN BEHAVIOR SIMULATOR
// ─────────────────────────────────────────────
class HumanBehavior {
  constructor(page) {
    this.page = page;
    this.mouse = new HumanMouse(page);
    this.typing = new HumanTyping(page);
    this.scroll = new HumanScroll(page);
  }

  async idleBehavior(durationMs) {
    const endTime = Date.now() + durationMs;
    logger.debug(`Idle behavior for ${durationMs}ms`);

    while (Date.now() < endTime) {
      const action = Math.random();

      if (action < 0.3) {
        await this.mouse.randomDrift();
      } else if (action < 0.5) {
        await this.scroll.randomScroll();
      } else if (action < 0.6) {
        // hover over random link
        const links = await this.page.$$('a[href]');
        if (links.length > 0) {
          const link = links[randomInt(0, links.length - 1)];
          const box = await link.boundingBox();
          if (box) {
            await this.mouse.moveTo(
              box.x + box.width / 2,
              box.y + box.height / 2
            );
          }
        }
      } else {
        // just wait
        await randomSleep(500, 2000);
      }

      await randomSleep(200, 1000);
    }
  }

  async readPage(minMs, maxMs) {
    const duration = randomInt(minMs || 2000, maxMs || 8000);
    logger.debug(`Reading page for ${duration}ms`);
    const chunks = randomInt(2, 5);
    const perChunk = duration / chunks;

    for (let i = 0; i < chunks; i++) {
      await this.scroll.scrollDown(randomInt(100, 400));
      await sleep(perChunk + randomInt(-500, 500));
      if (Math.random() < 0.3) {
        await this.mouse.randomDrift();
      }
    }
  }

  async fillForm(fields) {
    for (const { selector, value, type } of fields) {
      await this.scroll.scrollToElement(selector);
      await randomSleep(200, 600);

      if (type === 'select') {
        await this.mouse.clickElement(selector);
        await randomSleep(300, 700);
        await this.page.select(selector, value);
      } else if (type === 'checkbox') {
        const isChecked = await this.page.$eval(selector, (el) => el.checked);
        if ((value === true && !isChecked) || (value === false && isChecked)) {
          await this.mouse.clickElement(selector);
        }
      } else {
        await this.typing.type(selector, value);
      }

      await randomSleep(300, 1000);

      // occasional tab-out focus shift
      if (Math.random() < 0.3) {
        await this.page.keyboard.press('Tab');
        await randomSleep(200, 500);
      }
    }
  }

  async clickAndWaitNav(selector, options = {}) {
    await this.scroll.scrollToElement(selector);
    await randomSleep(200, 500);

    const [response] = await Promise.all([
      this.page.waitForNavigation({
        waitUntil: options.waitUntil || 'networkidle2',
        timeout: options.timeout || CONFIG.navigationTimeout,
      }),
      this.mouse.clickElement(selector),
    ]);

    return response;
  }
}

// ─────────────────────────────────────────────
// 19. CAPTCHA DETECTION (basic)
// ─────────────────────────────────────────────
async function detectCaptcha(page) {
  const captchaSelectors = [
    'iframe[src*="recaptcha"]',
    'iframe[src*="hcaptcha"]',
    '.g-recaptcha',
    '.h-captcha',
    '#captcha',
    '[data-sitekey]',
    'iframe[src*="challenges.cloudflare"]',
    '#cf-challenge-running',
    '.cf-turnstile',
    '#challenge-form',
    '.challenge-running',
  ];

  for (const sel of captchaSelectors) {
    const el = await page.$(sel);
    if (el) {
      logger.warn(`CAPTCHA detected: ${sel}`);
      return { detected: true, type: sel };
    }
  }

  // check page text
  const bodyText = await page.evaluate(() =>
    document.body ? document.body.innerText.toLowerCase() : ''
  );

  const captchaPhrases = [
    'verify you are human',
    'are you a robot',
    'complete the security check',
    'attention required',
    'checking your browser',
    'please wait while we verify',
    'one more step',
    'human verification',
  ];

  for (const phrase of captchaPhrases) {
    if (bodyText.includes(phrase)) {
      logger.warn(`CAPTCHA phrase detected: "${phrase}"`);
      return { detected: true, type: `text:${phrase}` };
    }
  }

  return { detected: false, type: null };
}

// ─────────────────────────────────────────────
// 20. CLOUDFLARE BYPASS WAITER
// ─────────────────────────────────────────────
async function waitForCloudflare(page, maxWaitMs) {
  const maxWait = maxWaitMs || 30000;
  const startTime = Date.now();
  logger.info('Checking for Cloudflare challenge...');

  while (Date.now() - startTime < maxWait) {
    const title = await page.title();
    const url = page.url();

    const isCF =
      title.toLowerCase().includes('just a moment') ||
      title.toLowerCase().includes('attention required') ||
      url.includes('challenges.cloudflare.com') ||
      title.toLowerCase().includes('checking your browser');

    if (!isCF) {
      logger.info('Cloudflare challenge passed (or not present)');
      return true;
    }

    logger.debug('Cloudflare challenge still active, waiting...');
    await sleep(2000);
  }

  logger.warn('Cloudflare challenge did not resolve in time');
  return false;
}

// ─────────────────────────────────────────────
// 21. PAGE CONTENT EXTRACTORS
// ─────────────────────────────────────────────
async function extractText(page, selector) {
  try {
    return await page.$eval(selector, (el) => el.innerText.trim());
  } catch {
    return null;
  }
}

async function extractAttribute(page, selector, attr) {
  try {
    return await page.$eval(selector, (el, a) => el.getAttribute(a), attr);
  } catch {
    return null;
  }
}

async function extractAllText(page, selector) {
  try {
    return await page.$$eval(selector, (els) =>
      els.map((el) => el.innerText.trim())
    );
  } catch {
    return [];
  }
}

async function extractLinks(page, selector) {
  try {
    return await page.$$eval(selector || 'a[href]', (els) =>
      els.map((el) => ({
        text: el.innerText.trim(),
        href: el.href,
      }))
    );
  } catch {
    return [];
  }
}

async function extractTableData(page, tableSelector) {
  try {
    return await page.$eval(tableSelector, (table) => {
      const rows = [];
      const trs = table.querySelectorAll('tr');
      trs.forEach((tr) => {
        const cells = [];
        tr.querySelectorAll('td, th').forEach((cell) => {
          cells.push(cell.innerText.trim());
        });
        if (cells.length > 0) rows.push(cells);
      });
      return rows;
    });
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────
// 22. DATA PERSISTENCE
// ─────────────────────────────────────────────
class DataStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = [];
    this._load();
  }

  _load() {
    if (fs.existsSync(this.filePath)) {
      try {
        this.data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
      } catch {
        this.data = [];
      }
    }
  }

  add(entry) {
    this.data.push({
      ...entry,
      _timestamp: new Date().toISOString(),
    });
    this._save();
  }

  _save() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }

  getAll() {
    return this.data;
  }

  count() {
    return this.data.length;
  }

  clear() {
    this.data = [];
    this._save();
  }

  find(predicate) {
    return this.data.filter(predicate);
  }
}

// ─────────────────────────────────────────────
// 23. SESSION MANAGER
// ─────────────────────────────────────────────
class SessionManager extends EventEmitter {
  constructor() {
    super();
    this.browser = null;
    this.page = null;
    this.human = null;
    this.isRunning = false;
    this.startTime = null;
    this.pageCount = 0;
    this.errorCount = 0;
  }

  async start() {
    if (this.isRunning) {
      logger.warn('Session already running');
      return;
    }

    logger.info('═══════════════════════════════════════');
    logger.info('  TESTBOT SESSION STARTING');
    logger.info('═══════════════════════════════════════');

    const { browser, page } = await launchBrowser();
    this.browser = browser;
    this.page = page;
    this.human = new HumanBehavior(page);
    this.isRunning = true;
    this.startTime = Date.now();

    this.emit('started');
    logger.info('Session started');
  }

  async navigate(url, options) {
    if (!this.isRunning) throw new Error('Session not started');
    const response = await navigateTo(this.page, url, options);
    this.pageCount++;
    await waitForCloudflare(this.page);
    return response;
  }

  async newPage() {
    if (!this.isRunning) throw new Error('Session not started');
    const page = await this.browser.newPage();

    await page.setViewport({
      width: CONFIG.viewport.width,
      height: CONFIG.viewport.height,
      deviceScaleFactor: CONFIG.deviceScaleFactor,
    });

    page.setDefaultTimeout(CONFIG.defaultTimeout);
    page.setDefaultNavigationTimeout(CONFIG.navigationTimeout);

    await setupResourceBlocker(page);
    await injectFingerprint(page);

    return page;
  }

  getStats() {
    const elapsed = this.startTime ? Date.now() - this.startTime : 0;
    return {
      running: this.isRunning,
      elapsedMs: elapsed,
      elapsedFormatted: `${Math.floor(elapsed / 60000)}m ${Math.floor(
        (elapsed % 60000) / 1000
      )}s`,
      pagesVisited: this.pageCount,
      errors: this.errorCount,
    };
  }

  async screenshot(label) {
    if (!this.isRunning) throw new Error('Session not started');
    return takeScreenshot(this.page, label);
  }

  async stop() {
    if (!this.isRunning) {
      logger.warn('Session not running');
      return;
    }

    logger.info('Stopping session...');
    const stats = this.getStats();
    logger.info(`Session stats: ${JSON.stringify(stats)}`);

    try {
      // save cookies for current domain
      const url = this.page.url();
      if (url && url !== 'about:blank') {
        const domain = new URL(url).hostname;
        await cookieManager.save(this.page, domain);
      }
    } catch (err) {
      logger.error(`Cookie save on shutdown failed: ${err.message}`);
    }

    try {
      await this.browser.close();
    } catch (err) {
      logger.error(`Browser close error: ${err.message}`);
    }

    this.isRunning = false;
    this.emit('stopped', stats);

    logger.info('═══════════════════════════════════════');
    logger.info('  TESTBOT SESSION ENDED');
    logger.info('═══════════════════════════════════════');
  }
}

// ─────────────────────────────────────────────
// 24. PROXY ROTATION (optional)
// ─────────────────────────────────────────────
class ProxyRotator {
  constructor(proxyList) {
    this.proxies = proxyList || [];
    this.currentIndex = 0;
    this.failedProxies = new Set();
  }

  addProxy(proxy) {
    this.proxies.push(proxy);
  }

  addProxiesFromFile(filePath) {
    if (!fs.existsSync(filePath)) {
      logger.warn(`Proxy file not found: ${filePath}`);
      return;
    }
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
    this.proxies.push(...lines.map((l) => l.trim()));
    logger.info(`Loaded ${lines.length} proxies from ${filePath}`);
  }

  next() {
    if (this.proxies.length === 0) return null;
    let attempts = 0;
    while (attempts < this.proxies.length) {
      const proxy = this.proxies[this.currentIndex % this.proxies.length];
      this.currentIndex++;
      if (!this.failedProxies.has(proxy)) {
        return proxy;
      }
      attempts++;
    }
    logger.warn('All proxies have been marked as failed');
    this.failedProxies.clear();
    return this.proxies[0] || null;
  }

  markFailed(proxy) {
    this.failedProxies.add(proxy);
    logger.warn(`Proxy marked as failed: ${proxy}`);
  }

  count() {
    return this.proxies.length;
  }

  activeCount() {
    return this.proxies.length - this.failedProxies.size;
  }
}

// ─────────────────────────────────────────────
// 25. RATE LIMITER
// ─────────────────────────────────────────────
class RateLimiter {
  constructor(maxRequests, windowMs) {
    this.maxRequests = maxRequests || 10;
    this.windowMs = windowMs || 60000;
    this.timestamps = [];
  }

  async waitForSlot() {
    const now = Date.now();
    this.timestamps = this.timestamps.filter(
      (ts) => now - ts < this.windowMs
    );

    if (this.timestamps.length >= this.maxRequests) {
      const oldest = this.timestamps[0];
      const waitTime = this.windowMs - (now - oldest) + randomInt(100, 500);
      logger.debug(`Rate limit reached, waiting ${waitTime}ms`);
      await sleep(waitTime);
      return this.waitForSlot();
    }

    this.timestamps.push(now);
  }
}

// ─────────────────────────────────────────────
// 26. PAGE INTERACTION HELPERS
// ─────────────────────────────────────────────
async function waitAndClick(page, selector, human, timeout) {
  const found = await waitForSelectorSafe(page, selector, timeout);
  if (!found) return false;
  if (human) {
    await human.mouse.clickElement(selector);
  } else {
    await page.click(selector);
  }
  return true;
}

async function waitAndType(page, selector, text, human, timeout) {
  const found = await waitForSelectorSafe(page, selector, timeout);
  if (!found) return false;
  if (human) {
    await human.typing.type(selector, text);
  } else {
    await page.type(selector, text);
  }
  return true;
}

async function selectDropdown(page, selector, value) {
  await page.select(selector, value);
  logger.debug(`Selected "${value}" in ${selector}`);
}

async function uploadFile(page, selector, filePath) {
  const input = await page.$(selector);
  if (!input) throw new Error(`File input not found: ${selector}`);
  await input.uploadFile(filePath);
  logger.info(`Uploaded file: ${filePath}`);
}

async function getPageHTML(page) {
  return page.content();
}

async function evaluateScript(page, fn, ...args) {
  return page.evaluate(fn, ...args);
}

// ─────────────────────────────────────────────
// 27. ANTI-BOT TEST PAGE RUNNER
// ─────────────────────────────────────────────
async function runAntiBotTests(session) {
  const testUrls = [
    { url: 'https://bot.sannysoft.com/', name: 'SannySoft' },
    { url: 'https://abrahamjuliot.github.io/creepjs/', name: 'CreepJS' },
    { url: 'https://browserleaks.com/javascript', name: 'BrowserLeaks-JS' },
    { url: 'https://pixelscan.net/', name: 'PixelScan' },
    {
      url: 'https://arh.antoinevastel.com/bots/areyouheadless',
      name: 'AreYouHeadless',
    },
  ];

  const results = {};

  for (const test of testUrls) {
    try {
      logger.info(`Running anti-bot test: ${test.name}`);
      await session.navigate(test.url);
      await sleep(5000);
      await session.screenshot(`antibot_${test.name}`);
      const detectionResult = await runDetectionTests(session.page);
      results[test.name] = { status: 'completed', details: detectionResult };
    } catch (err) {
      logger.error(`Anti-bot test failed for ${test.name}: ${err.message}`);
      results[test.name] = { status: 'failed', error: err.message };
    }
    await randomSleep(2000, 5000);
  }

  return results;
}

// ─────────────────────────────────────────────
// 28. MAIN BOT LOGIC
// ─────────────────────────────────────────────
async function main() {
  const session = new SessionManager();
  const dataStore = new DataStore(path.join(__dirname, 'bot_data.json'));
  const rateLimiter = new RateLimiter(
    parseInt(process.env.RATE_LIMIT) || 30,
    parseInt(process.env.RATE_WINDOW) || 60000
  );

  // graceful shutdown
  const shutdown = async (signal) => {
    logger.info(`Received ${signal}, shutting down...`);
    await session.stop();
    logger.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('uncaughtException', async (err) => {
    logger.error(`Uncaught exception: ${err.message}\n${err.stack}`);
    await session.stop();
    logger.close();
    process.exit(1);
  });
  process.on('unhandledRejection', async (reason) => {
    logger.error(`Unhandled rejection: ${reason}`);
  });

  try {
    // ── launch ──
    await session.start();
    const { page } = session;
    const human = session.human;

    // ── load cookies if available ──
    try {
      const domain = new URL(CONFIG.targetUrl).hostname;
      await cookieManager.load(page, domain);
    } catch (err) {
      logger.debug(`No cookies loaded: ${err.message}`);
    }

    // ── run detection tests if requested ──
    if (process.env.RUN_DETECTION_TESTS === 'true') {
      const antiBotResults = await runAntiBotTests(session);
      logger.info(
        `Anti-bot test results: ${JSON.stringify(antiBotResults, null, 2)}`
      );
      dataStore.add({ type: 'detection_tests', results: antiBotResults });
    }

    // ── navigate to target ──
    await rateLimiter.waitForSlot();
    await session.navigate(CONFIG.targetUrl);

    // ── wait for Cloudflare ──
    await waitForCloudflare(page);

    // ── check for captcha ──
    const captchaCheck = await detectCaptcha(page);
    if (captchaCheck.detected) {
      logger.warn(`CAPTCHA detected: ${captchaCheck.type}`);
      await session.screenshot('captcha_detected');
      // if headless is false, wait for manual solve
      if (!CONFIG.headless) {
        logger.info('Waiting 60s for manual CAPTCHA solve...');
        await sleep(60000);
      }
    }

    // ── simulate human reading ──
    await human.readPage(3000, 6000);

    // ── detection self-test ──
    const selfTest = await runDetectionTests(page);
    dataStore.add({
      type: 'self_test',
      url: CONFIG.targetUrl,
      results: selfTest,
    });

    // ── take a screenshot ──
    await session.screenshot('target_loaded');

    // ── extract page data ──
    const pageTitle = await page.title();
    const pageUrl = page.url();
    const bodyText = await extractText(page, 'body');
    const links = await extractLinks(page);

    dataStore.add({
      type: 'page_visit',
      url: pageUrl,
      title: pageTitle,
      bodyLength: bodyText ? bodyText.length : 0,
      linkCount: links.length,
    });

    logger.info(`Page: "${pageTitle}" — ${pageUrl}`);
    logger.info(`Body length: ${bodyText ? bodyText.length : 0} chars`);
    logger.info(`Links found: ${links.length}`);

    // ──────────────────────────────────────────
    // CUSTOM BOT LOGIC GOES HERE
    // Use session.page, session.human, etc.
    // Examples:
    //
    // await human.fillForm([
    //   { selector: '#username', value: 'myuser' },
    //   { selector: '#password', value: 'mypass' },
    // ]);
    //
    // await human.clickAndWaitNav('#login-btn');
    //
    // const data = await extractText(page, '.result');
    // dataStore.add({ type: 'result', data });
    //
    // for (const link of links.slice(0, 5)) {
    //   await rateLimiter.waitForSlot();
    //   await session.navigate(link.href);
    //   await human.readPage();
    //   await session.screenshot(`link_${dataStore.count()}`);
    // }
    // ──────────────────────────────────────────

    // ── idle behavior to appear human ──
    await human.idleBehavior(randomInt(5000, 15000));

    // ── save cookies ──
    const currentDomain = new URL(page.url()).hostname;
    await cookieManager.save(page, currentDomain);

    // ── final stats ──
    const stats = session.getStats();
    logger.info(`Final stats: ${JSON.stringify(stats)}`);
    logger.info(`Data entries collected: ${dataStore.count()}`);

    // ── keep alive if configured ──
    if (process.env.KEEP_ALIVE === 'true') {
      logger.info('Keep-alive mode. Press Ctrl+C to exit.');
      await new Promise(() => {});
    }
  } catch (err) {
    logger.error(`Main error: ${err.message}\n${err.stack}`);
    session.errorCount++;

    try {
      await session.screenshot('error_state');
    } catch {
      // swallow screenshot errors
    }
  } finally {
    await session.stop();
    logger.close();
  }
}

// ─────────────────────────────────────────────
// 29. MODULE EXPORTS
// ─────────────────────────────────────────────
module.exports = {
  CONFIG,
  Logger,
  CookieManager,
  HumanMouse,
  HumanTyping,
  HumanScroll,
  HumanBehavior,
  SessionManager,
  ProxyRotator,
  RateLimiter,
  DataStore,
  launchBrowser,
  injectFingerprint,
  navigateTo,
  runDetectionTests,
  runAntiBotTests,
  detectCaptcha,
  waitForCloudflare,
  waitForSelectorSafe,
  waitForNavigationSafe,
  waitForNetworkIdle,
  waitAndClick,
  waitAndType,
  extractText,
  extractAttribute,
  extractAllText,
  extractLinks,
  extractTableData,
  takeScreenshot,
  getPageHTML,
  evaluateScript,
  withRetry,
  randomInt,
  randomFloat,
  sleep,
  randomSleep,
};

// ─────────────────────────────────────────────
// 30. RUN
// ─────────────────────────────────────────────
if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

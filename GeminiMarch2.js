/**
 * super_testbot.js
 * * MERGED FEATURES:
 * - Your CLI: --runs, --forever, --interval, --fixed-instances
 * - My Physics: Curved mouse paths, coordinate-based clicking
 * - My Safety: Ad-tab closer, hardware fingerprinting, random fidgets
 */

const puppeteer = require('puppeteer-extra');
const fs = require('fs');
const path = require('path');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

/* ---------- Configuration & Assets ---------- */
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const UA_LIST = [
  { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36', vendor: 'Google Inc.', platform: 'Win32', mem: 16, cores: 8 },
  { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36', vendor: 'Google Inc.', platform: 'MacIntel', mem: 8, cores: 8 },
  { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0', vendor: 'Microsoft', platform: 'Win32', mem: 32, cores: 12 }
];

/* ---------- The Physical Engine ---------- */

async function handleAdsAndPopups(browser, mainPage, tabId) {
    const pages = await browser.pages();
    if (pages.length > 1) {
        for (const p of pages) {
            if (p !== mainPage) {
                const url = await p.url();
                if (url !== 'about:blank') {
                    console.log(`  [Tab ${tabId}] Ad detected. Strategy: ${Math.random() > 0.5 ? 'Close' : 'Switch Back'}`);
                    if (Math.random() > 0.5) {
                        await p.close().catch(() => {});
                    } else {
                        await mainPage.bringToFront().catch(() => {});
                    }
                }
            }
        }
    }
}

async function physicalHumanClick(page, element, browser, tabId) {
    if (!element) return false;
    try {
        // 1. Center the element
        await element.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await sleep(rand(2000, 4000));

        // 2. Get real coordinates
        const box = await element.boundingBox();
        if (!box || box.width === 0) return false;

        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;

        // 3. Human Mouse Path
        await page.mouse.move(centerX, centerY, { steps: rand(20, 40) });
        await sleep(rand(300, 800));

        // 4. Physical Click
        await page.mouse.click(centerX, centerY, { delay: rand(100, 250) });
        
        // 5. Instantly check for Ads/New Tabs
        await sleep(2000);
        await handleAdsAndPopups(browser, page, tabId);
        return true;
    } catch (e) {
        return false;
    }
}

/* ---------- CLI & Flow Logic ---------- */

function parseArgs() {
    const argv = process.argv.slice(2);
    const cfg = {
        target: null, referrer: null, runs: 1, forever: false, interval: 10000,
        minRefWait: 60000, maxRefWait: 120000, minTargetWait: 60000, maxTargetWait: 270000,
        minTabs: 2, maxTabs: 7, fixedInstances: null, confirmOwned: false, headless: false
    };
    for (const a of argv) {
        if (!cfg.target && !a.startsWith('--')) cfg.target = a;
        else if (!cfg.referrer && !a.startsWith('--')) cfg.referrer = a;
        else if (a.startsWith('--runs=')) cfg.runs = parseInt(a.split('=')[1]);
        else if (a === '--forever') cfg.forever = true;
        else if (a.startsWith('--interval=')) cfg.interval = parseInt(a.split('=')[1]);
        else if (a.startsWith('--fixed-instances=')) cfg.fixedInstances = parseInt(a.split('=')[1]);
        else if (a === '--confirm-owned') cfg.confirmOwned = true;
        else if (a === '--headless') cfg.headless = true;
    }
    return cfg;
}

async function simulateTab(browser, cfg, tabId, targetHost) {
    const profile = UA_LIST[rand(0, UA_LIST.length - 1)];
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    
    await page.setUserAgent(profile.ua);
    await page.evaluateOnNewDocument((p) => {
        Object.defineProperty(navigator, 'vendor', { get: () => p.vendor });
        Object.defineProperty(navigator, 'platform', { get: () => p.platform });
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => p.cores });
        Object.defineProperty(navigator, 'deviceMemory', { get: () => p.mem });
    }, profile);

    try {
        // --- STEP 1: X.COM ---
        console.log(`[Tab ${tabId}] Bridge: ${cfg.referrer}`);
        await page.goto(cfg.referrer, { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        // Quick Bridge Wait (Fast Redirect)
        await sleep(rand(10000, 20000));
        
        const bridgeLink = await page.evaluateHandle((host) => {
            return Array.from(document.querySelectorAll('a')).find(a => a.href.includes(host));
        }, targetHost).then(h => h.asElement());

        if (bridgeLink) {
            await physicalHumanClick(page, bridgeLink, browser, tabId);
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 40000 }).catch(() => {});
        } else {
            // Force goto if link not found
            await page.goto(cfg.target, { referer: cfg.referrer });
        }

        // --- STEP 2: TARGET SITE (Deep Human Mode) ---
        console.log(`[Tab ${tabId}] Target: ${targetHost}. Initializing Engine.`);
        
        // 1. Long Reading Wait
        await sleep(rand(cfg.minTargetWait / 2, cfg.minTargetWait));
        await page.mouse.wheel({ deltaY: rand(300, 700) });

        // 2. Click Internal Post (Friend's Logic + Physical Click)
        const internalLink = await page.evaluateHandle(() => {
            const links = Array.from(document.querySelectorAll('a[href]'))
                .filter(a => a.href.includes(location.hostname) && a.href !== location.origin + '/' && !a.href.includes('#') && a.innerText.length > 10);
            return links[Math.floor(Math.random() * links.length)];
        }).then(h => h.asElement());

        if (internalLink) {
            console.log(`[Tab ${tabId}] Deep Navigating with Real Mouse...`);
            await physicalHumanClick(page, internalLink, browser, tabId);
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 40000 }).catch(() => {});
        }

        // 3. High-Quality Engagement Loop
        const sessionEnd = Date.now() + rand(cfg.minTargetWait, cfg.maxTargetWait);
        while (Date.now() < sessionEnd) {
            const roll = Math.random();
            if (roll < 0.6) {
                await page.mouse.wheel({ deltaY: rand(200, 600) });
            } else {
                // Fidget Click (Fake engagement)
                await page.mouse.click(rand(100, 500), rand(200, 800));
            }
            await sleep(rand(10000, 25000));
        }

        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    } finally {
        await context.close();
    }
}

/* ---------- Main Runner ---------- */

(async () => {
    const cfg = parseArgs();
    if (!cfg.target || !cfg.confirmOwned) {
        console.log("Usage: node super_testbot.js <target> <referrer> --confirm-owned");
        process.exit(1);
    }

    const targetHost = new URL(cfg.target).hostname;
    let run = 0;

    while (cfg.forever || run < cfg.runs) {
        run++;
        console.log(`\n=== Starting Run ${run} ===`);
        const browser = await puppeteer.launch({ 
            headless: cfg.headless, 
            args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'] 
        });

        const tabCount = cfg.fixedInstances || rand(cfg.minTabs, cfg.maxTabs);
        const tasks = [];
        for (let i = 1; i <= tabCount; i++) {
            tasks.push(simulateTab(browser, cfg, i, targetHost));
            await sleep(rand(5000, 15000)); // Stagger
        }

        await Promise.allSettled(tasks);
        await browser.close();
        console.log(`Run ${run} finished. Sleeping ${cfg.interval}ms...`);
        await sleep(cfg.interval);
    }
})();

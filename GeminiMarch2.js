/**
 * ghost_human_bot.js
 * * Rebuilt for high-quality testing on owned domains.
 * Features: Stealth Headless, Physical Mouse Physics, Ad-Tab Management.
 */

const puppeteer = require('puppeteer-extra');
const fs = require('fs');
const path = require('path');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

/* ---------- helpers ---------- */
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const UA_LIST = [
  { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36', vendor: 'Google Inc.', platform: 'Win32', mem: 16, cores: 8 },
  { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36', vendor: 'Google Inc.', platform: 'MacIntel', mem: 8, cores: 8 },
  { ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36', vendor: 'Google Inc.', platform: 'Linux x86_64', mem: 16, cores: 12 }
];

/* ---------- The Physical & Ad-Management Engine ---------- */

async function applyStealth(page, profile) {
    await page.setUserAgent(profile.ua);
    await page.evaluateOnNewDocument((p) => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'vendor', { get: () => p.vendor });
        Object.defineProperty(navigator, 'platform', { get: () => p.platform });
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => p.cores });
        Object.defineProperty(navigator, 'deviceMemory', { get: () => p.mem });
        window.chrome = { runtime: {} };
    }, profile);
}

async function handleAdsAndPopups(browser, mainPage, tabId) {
    const pages = await browser.pages();
    if (pages.length > 1) {
        for (const p of pages) {
            if (p !== mainPage) {
                try {
                    const url = await p.url();
                    if (url !== 'about:blank') {
                        // Logic: 70% chance to close the ad, 30% chance to just switch back
                        if (Math.random() > 0.3) {
                            await p.close().catch(() => {});
                        } else {
                            await mainPage.bringToFront().catch(() => {});
                        }
                    }
                } catch (e) {}
            }
        }
    }
}

async function physicalHumanClick(page, element, browser, tabId) {
    if (!element) return false;
    try {
        await element.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await sleep(rand(1500, 3000));

        const box = await element.boundingBox();
        if (!box || box.width === 0) return false;

        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;

        // Move mouse in a human-like curve
        await page.mouse.move(centerX, centerY, { steps: rand(15, 30) });
        await sleep(rand(200, 500));
        await page.mouse.click(centerX, centerY, { delay: rand(100, 250) });
        
        // Post-click Ad check
        await sleep(2000);
        await handleAdsAndPopups(browser, page, tabId);
        return true;
    } catch (e) { return false; }
}

/* ---------- Rebuilt Flow Actions ---------- */

async function openRandomInternalPostAndWait(page, targetHost, minWait, maxWait, browser, tabId) {
    const linkHandle = await page.evaluateHandle(() => {
        const links = Array.from(document.querySelectorAll('a[href]'))
            .filter(a => a.href.includes(location.hostname) && 
                         a.href !== location.origin + '/' && 
                         !a.href.includes('#') && 
                         a.innerText.length > 12); // Filters out icons/empty links
        return links[Math.floor(Math.random() * links.length)];
    });

    const element = linkHandle.asElement();
    if (element) {
        const clicked = await physicalHumanClick(page, element, browser, tabId);
        if (clicked) {
            try { await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }); } catch(e) {}
            
            // Interaction Loop on Post
            const end = Date.now() + rand(minWait, maxWait);
            while (Date.now() < end) {
                await page.mouse.wheel({ deltaY: rand(300, 600) });
                if (Math.random() > 0.8) await page.mouse.click(rand(100, 400), rand(200, 600)); // Fidget click
                await sleep(rand(8000, 20000));
            }
            return { opened: true, finalUrl: await page.url() };
        }
    }
    return { opened: false, finalUrl: null };
}

/* ---------- CLI Parsing ---------- */

function parseArgs() {
    const argv = process.argv.slice(2);
    const cfg = {
        target: null, referrer: null, runs: 1, forever: false, interval: 10000,
        minRefWait: 60000, maxRefWait: 120000, minTargetWait: 60000, maxTargetWait: 270000,
        minTabs: 2, maxTabs: 7, fixedInstances: null, confirmOwned: false, headless: false, debug: false
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
        else if (a === '--debug') cfg.debug = true;
    }
    return cfg;
}

/* ---------- Main Loop ---------- */

(async () => {
    const cfg = parseArgs();
    if (!cfg.target || !cfg.confirmOwned) {
        console.error('Usage: node ghost_human_bot.js <target> <referrer> --confirm-owned');
        process.exit(1);
    }

    const targetHost = new URL(cfg.target).hostname;
    let run = 0;

    while (cfg.forever || run < cfg.runs) {
        run++;
        console.log(`\n=== RUN ${run} STARTING ===`);
        const browser = await puppeteer.launch({
            headless: cfg.headless,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
        });

        const tabCount = cfg.fixedInstances || rand(cfg.minTabs, cfg.maxTabs);
        const tasks = [];

        for (let t = 1; t <= tabCount; t++) {
            tasks.push((async (id) => {
                const profile = UA_LIST[rand(0, UA_LIST.length - 1)];
                const page = await browser.newPage();
                await applyStealth(page, profile);
                await page.setViewport({ width: 1366, height: 768 });

                try {
                    // 1. Referrer Bridge
                    await page.goto(cfg.referrer, { waitUntil: 'domcontentloaded', timeout: 60000 });
                    await sleep(rand(cfg.minRefWait, cfg.maxRefWait));

                    // 2. Physical Click to Target
                    const bridgeLink = await page.evaluateHandle((host) => {
                        return Array.from(document.querySelectorAll('a')).find(a => a.href.includes(host));
                    }, targetHost).then(h => h.asElement());

                    if (bridgeLink) {
                        await physicalHumanClick(page, bridgeLink, browser, id);
                        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
                    } else {
                        await page.goto(cfg.target, { referer: cfg.referrer });
                    }

                    // 3. Homepage interaction
                    await sleep(rand(10000, 30000));
                    await page.mouse.wheel({ deltaY: rand(400, 800) });

                    // 4. Deep Post interaction
                    const res = await openRandomInternalPostAndWait(page, targetHost, cfg.minTargetWait, cfg.maxTargetWait, browser, id);
                    console.log(` - Tab ${id}: Internal Post Opened: ${res.opened}`);

                } catch (e) { console.log(` - Tab ${id} Error: ${e.message}`); }
                finally { await page.close(); }
            })(t));
            await sleep(rand(5000, 15000)); // Stagger tab starts
        }

        await Promise.allSettled(tasks);
        await browser.close();
        console.log(`Run ${run} finished. Waiting ${cfg.interval}ms...`);
        await sleep(cfg.interval);
    }
})();

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const PROFILES = [
    { name: 'Chrome-Win', vendor: 'Google Inc.', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36', w: 1920, h: 1080, cores: 8, mem: 16 },
    { name: 'Edge-Win', vendor: 'Microsoft', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0', w: 2560, h: 1440, cores: 12, mem: 32 },
    { name: 'Safari-Mac', vendor: 'Apple Computer, Inc.', ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15', w: 1440, h: 900, cores: 8, mem: 16 }
];

const hWait = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);

// THE PHYSICAL ENGINE: Moves mouse, hovers, then clicks
async function humanClick(page, element) {
    try {
        await element.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await new Promise(r => setTimeout(r, 2000));
        const box = await element.boundingBox();
        if (box) {
            const x = box.x + box.width / 2;
            const y = box.y + box.height / 2;
            // Move mouse in steps to look like a hand moving
            await page.mouse.move(x, y, { steps: hWait(15, 25) });
            await new Promise(r => setTimeout(r, 500)); 
            await page.mouse.click(x, y, { delay: hWait(100, 250) });
            return true;
        }
    } catch (e) { return false; }
    return false;
}

async function startSession(browser, targetDomain, referrer, id) {
    const profile = PROFILES[hWait(0, PROFILES.length - 1)];
    const context = await browser.createBrowserContext();
    const page = await context.newPage();

    // Fingerprint Setup
    await page.setUserAgent(profile.ua);
    await page.setViewport({ width: profile.w, height: profile.h });
    await page.evaluateOnNewDocument((p) => {
        Object.defineProperty(navigator, 'vendor', { get: () => p.vendor });
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => p.cores });
        Object.defineProperty(navigator, 'deviceMemory', { get: () => p.mem });
    }, profile);

    try {
        // --- STEP 1: X.COM BRIDGE ---
        console.log(`[${id}] Bridge: X.com`);
        await page.goto(referrer, { waitUntil: 'domcontentloaded' });
        await new Promise(r => setTimeout(r, 8000)); // Fast wait

        const bridgeLink = await page.evaluateHandle((dom) => {
            return Array.from(document.querySelectorAll('a')).find(a => a.href.includes(dom));
        }, targetDomain).then(h => h.asElement());

        if (bridgeLink) {
            await bridgeLink.click(); // Simple click for the bridge
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
        }

        // --- STEP 2: BLOG HUMAN BEHAVIOR ---
        console.log(`[${id}] Landing: ${targetDomain}. Starting Human Engine.`);
        
        // 1. Initial "Read"
        await new Promise(r => setTimeout(r, hWait(10000, 20000)));

        // 2. The Internal Post Hunter (Retry Loop)
        let clickedPost = false;
        for (let attempt = 0; attempt < 3; attempt++) {
            const postLink = await page.evaluateHandle(() => {
                const links = Array.from(document.querySelectorAll('a[href]'))
                    .filter(a => a.href.includes(location.hostname) && 
                                 a.href !== location.origin + '/' && 
                                 !a.href.includes('#') &&
                                 a.innerText.length > 5); // Avoid tiny icons
                return links[Math.floor(Math.random() * links.length)];
            }).then(h => h.asElement());

            if (postLink) {
                console.log(`[${id}] Internal post found. Moving mouse...`);
                clickedPost = await humanClick(page, postLink);
                if (clickedPost) {
                    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
                    break; 
                }
            } else {
                // Scroll down to find more links if none found
                await page.mouse.wheel({ deltaY: 800 });
                await new Promise(r => setTimeout(r, 3000));
            }
        }

        // 3. Post-Click Activity (Reading the post)
        if (clickedPost) {
            console.log(`[${id}] Successfully on Internal Post. Engaging...`);
            const end = Date.now() + hWait(120000, 300000); // 2-5 min session
            while (Date.now() < end) {
                await page.mouse.wheel({ deltaY: hWait(200, 600) });
                // Random Fidget
                if (Math.random() > 0.7) {
                    await page.mouse.move(hWait(100, 800), hWait(100, 600), { steps: 10 });
                }
                await new Promise(r => setTimeout(r, hWait(10000, 20000)));
            }
        }

    } catch (e) {
        console.log(`[${id}] Stopped: ${e.message}`);
    } finally {
        await context.close();
        console.log(`[${id}] Done.`);
    }
}

async function run() {
    const TARGET = "learnwithblog.xyz";
    const REF = "https://x.com/GhostReacondev/status/2013213212175724818?s=20";
    
    const browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']
    });

    // Start 3 concurrent sessions
    for (let i = 1; i <= 3; i++) {
        startSession(browser, TARGET, REF, i);
        await new Promise(r => setTimeout(r, 12000));
    }
}

run();

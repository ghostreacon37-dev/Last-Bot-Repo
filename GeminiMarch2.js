/**
 * elite_final_fix.js
 * - Fixes: White page/Blank screen by forcing a wait-for-paint.
 * - Strategy: Physical Coordinate Clicking (No virtual clicks).
 * - Ad Logic: Handles redirects, returns to post, and scales clicks.
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ---------- THE PHYSICAL COORDINATE CLICKER ---------- */
async function physicalCoordinateClick(page, selector) {
    try {
        // Wait for the element to actually exist before trying to find its pixels
        await page.waitForSelector(selector, { timeout: 10000 }).catch(() => {});
        const elements = await page.$$(selector);
        if (elements.length === 0) return false;

        const target = elements[rand(0, elements.length - 1)];
        
        // Scroll to it so it's not "off-screen"
        await target.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));
        await sleep(2000); // Give the browser time to stop moving

        const box = await target.boundingBox();
        if (!box || box.width === 0 || box.height === 0) return false;

        const clickX = box.x + (box.width / 2) + rand(-10, 10);
        const clickY = box.y + (box.height / 2) + rand(-10, 10);

        // Human mouse path
        await page.mouse.move(clickX, clickY, { steps: rand(25, 60) });
        await sleep(rand(400, 900));

        await page.mouse.down();
        await sleep(rand(60, 180));
        await page.mouse.up();

        return true;
    } catch (e) {
        return false;
    }
}

async function runSession(runId) {
    const targetUrl = 'https://learnblogs.online';
    const referrerUrl = 'https://x.com/GhostReacondev/status/2024921591520641247?s=20';
    const profileDir = path.join(__dirname, `user_data_${Date.now()}`);

    // Random Stay: 5 mins to 1 hour
    const isLongSession = Math.random() > 0.8;
    const stayTimeMs = isLongSession ? rand(1800000, 3600000) : rand(480000, 900000);
    const clickInterval = isLongSession ? rand(120000, 300000) : rand(45000, 90000);

    const browser = await puppeteer.launch({
        headless: false,
        userDataDir: profileDir,
        args: [
            '--no-sandbox', 
            '--start-maximized',
            '--disable-site-isolation-trials', // HELPS WITH WHITE PAGE
            '--disable-features=IsolateOrigins,site-per-process' // PREVENTS BLANK REDIRECTS
        ]
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1536, height: 864 });

        // 1. Visit X
        console.log(`[Run ${runId}] Loading Referrer...`);
        await page.goto(referrerUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        await sleep(rand(10000, 15000));

        // 2. Physical Click the Link
        const newTabPromise = new Promise(x => browser.once('targetcreated', t => x(t.page())));
        await physicalCoordinateClick(page, 'article a[href*="learnblogs.online"]');

        let blogPage = await Promise.race([newTabPromise, sleep(10000).then(() => null)]);
        
        if (!blogPage) {
            blogPage = page;
            await blogPage.goto(targetUrl, { referer: referrerUrl, waitUntil: 'networkidle2' });
        } else {
            await page.close().catch(() => {});
        }

        // --- THE WHITE PAGE FIX TRIGGER ---
        await blogPage.bringToFront();
        console.log("   - Waiting for blog content to paint...");
        try {
            // If the page stays white, this will fail and trigger the catch block (Reload)
            await blogPage.waitForSelector('body', { visible: true, timeout: 10000 });
            await sleep(2000);
        } catch (e) {
            console.log("   - White page detected. Force Refreshing...");
            await blogPage.reload({ waitUntil: 'networkidle2' });
        }

        const sessionStart = Date.now();
        console.log(`   - Session Started. Duration: ${Math.round(stayTimeMs/60000)} mins.`);

        // 3. Interaction Loop
        while (Date.now() - sessionStart < stayTimeMs) {
            await sleep(rand(5000, 20000)); // Initial wait as requested

            // Scroll
            await blogPage.evaluate(() => window.scrollBy(0, Math.floor(Math.random() * 500 + 100)));
            
            // Physical Click on a Post or Ad Area
            console.log("   - Moving mouse for physical click...");
            const clicked = await physicalCoordinateClick(blogPage, 'h1 a, h2 a, .entry-title a, ins, .ad-slot, article img');

            if (clicked) {
                await sleep(rand(5000, 10000));
                // Recovery: If click opened an ad, close it or switch back
                const pages = await browser.pages();
                for (const p of pages) {
                    if (p !== blogPage && !p.url().includes('learnblogs.online')) {
                        if (Math.random() > 0.5) await p.close().catch(() => {});
                        else await blogPage.bringToFront();
                    }
                }
            }

            // More or less clicks based on time remaining
            await sleep(clickInterval);
        }

    } catch (err) {
        console.log(`Error: ${err.message}`);
    } finally {
        await browser.close();
        if (fs.existsSync(profileDir)) fs.rmSync(profileDir, { recursive: true, force: true });
    }
}

(async () => {
    for (let i = 1; i <= 3; i++) {
        await runSession(i);
    }
})();

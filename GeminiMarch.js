/**
 * learnblogs_online_bot.js
 * - Target: learnblogs.online
 * - Referrer: x.com (Twitter)
 * - Handles: New tab redirects (target="_blank")
 * - Features: Physical mouse clicks + Cookie Wipe
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ---------- Physical Human Click ---------- */
async function humanClick(page, element) {
    try {
        const box = await element.boundingBox();
        if (box) {
            const x = box.x + box.width / 2 + rand(-2, 2);
            const y = box.y + box.height / 2 + rand(-2, 2);
            await page.mouse.move(x, y, { steps: rand(10, 25) });
            await sleep(rand(200, 500));
            await page.mouse.click(x, y);
            return true;
        }
    } catch (e) { return false; }
    return false;
}

async function runSession(runId) {
    const targetUrl = 'https://learnblogs.online';
    const targetHost = 'learnblogs.online';
    const referrerUrl = 'https://x.com/GhostReacondev/status/2024921591520641247?s=20';
    
    const profileDir = path.join(__dirname, `session_${Date.now()}`);
    const browser = await puppeteer.launch({
        headless: false, // Set to true to run in background
        userDataDir: profileDir,
        args: ['--no-sandbox', '--start-maximized']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1536, height: 864 });

        // 1. Visit X.com Referrer
        console.log(`[Run ${runId}] Loading X Referrer...`);
        await page.goto(referrerUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        await sleep(rand(5000, 10000));

        // 2. Setup Listener for the NEW TAB
        const newTabPromise = new Promise(resolve => browser.once('targetcreated', target => resolve(target.page())));

        // 3. Find the link to learnblogs.online on the X post
        const links = await page.$$('a');
        let clicked = false;
        for (const link of links) {
            const href = await page.evaluate(el => el.href, link);
            if (href && href.includes(targetHost)) {
                console.log("   - Found link. Clicking now...");
                clicked = await humanClick(page, link);
                break;
            }
        }

        if (!clicked) {
            console.log("   - Could not find link on X. Navigating directly with referrer.");
            await page.goto(targetUrl, { referer: referrerUrl, waitUntil: 'networkidle2' });
        }

        // 4. Wait for the new tab to open and switch to it
        let blogPage = await Promise.race([
            newTabPromise,
            sleep(8000).then(() => null) 
        ]);

        if (blogPage) {
            console.log("   - Switched to the new tab for learnblogs.online");
            await page.close(); // Close X tab to focus on blog
        } else {
            blogPage = page; // Use original tab if it redirected in-place
        }

        await blogPage.bringToFront();
        await blogPage.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});

        // 5. Behavior on learnblogs.online (Scroll & Read)
        console.log("   - Mimicking human reading on blog...");
        for (let i = 0; i < rand(3, 5); i++) {
            await blogPage.evaluate(() => window.scrollBy(0, Math.floor(Math.random() * 500 + 200)));
            await sleep(rand(4000, 8000));
        }

        // 6. Click an Internal Post to deep-link
        const internalLinks = await blogPage.$$('article a, .entry-title a, .read-more');
        if (internalLinks.length > 0) {
            const post = internalLinks[rand(0, internalLinks.length - 1)];
            console.log("   - Clicking an internal post...");
            await humanClick(blogPage, post);
            await sleep(rand(10000, 20000)); // Stay on post for 10-20s
        }

    } catch (err) {
        console.log(`   - Error: ${err.message}`);
    } finally {
        await browser.close();
        if (fs.existsSync(profileDir)) fs.rmSync(profileDir, { recursive: true, force: true });
        console.log(`[Run ${runId}] Complete. Cookies and Cache wiped.\n`);
    }
}

// Start
(async () => {
    const totalRuns = 5;
    for (let i = 1; i <= totalRuns; i++) {
        await runSession(i);
        await sleep(rand(10000, 20000)); // Interval between users
    }
})();

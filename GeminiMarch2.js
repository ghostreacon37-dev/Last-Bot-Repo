/**
 * elite_resilient_v2.js
 * - Fixes: White page/Blank screen on redirect
 * - Feature: Specific "Post" clicking (ignores sidebar/menu links)
 * - Behavior: Real Human Mouse Events
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ---------- THE HUMAN CLICK ENGINE ---------- */
async function performRealClick(page, element) {
    try {
        await element.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));
        await sleep(1000);
        const box = await element.boundingBox();
        if (!box) return false;

        const targetX = box.x + box.width / 2 + rand(-5, 5);
        const targetY = box.y + box.height / 2 + rand(-5, 5);
        
        await page.mouse.move(targetX, targetY, { steps: rand(20, 40) });
        await sleep(rand(400, 800));
        
        await page.mouse.down();
        await sleep(rand(100, 200));
        await page.mouse.up();
        return true;
    } catch (e) { return false; }
}

async function handleAdRedirects(browser, originalPage) {
    const pages = await browser.pages();
    for (const p of pages) {
        const url = p.url();
        if (p !== originalPage && !url.includes('learnblogs.online') && !url.includes('twitter.com') && !url.includes('x.com')) {
            console.log(`   - [Cleaning] Closing ad/popup: ${url.substring(0, 30)}`);
            await p.close().catch(() => {});
        }
    }
    await originalPage.bringToFront();
}

async function runSession(runId) {
    const targetUrl = 'https://learnblogs.online';
    const referrerUrl = 'https://x.com/GhostReacondev/status/2024921591520641247?s=20';
    const profileDir = path.join(__dirname, `session_user_${Date.now()}`);

    const browser = await puppeteer.launch({
        headless: false,
        userDataDir: profileDir,
        args: ['--no-sandbox', '--start-maximized', '--disable-features=IsolateOrigins,site-per-process']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1536, height: 864 });

        // 1. Load Referrer
        console.log(`[Run ${runId}] Loading X Referrer...`);
        await page.goto(referrerUrl, { waitUntil: 'networkidle2', timeout: 90000 });
        await sleep(rand(10000, 15000));

        // 2. Click with Tab Detection
        const newTabPromise = new Promise(x => browser.once('targetcreated', t => x(t.page())));
        const xLink = await page.$('article a[href*="learnblogs.online"]');
        
        if (xLink) {
            await performRealClick(page, xLink);
        } else {
            await page.goto(targetUrl, { referer: referrerUrl });
        }

        let blogPage = await Promise.race([newTabPromise, sleep(8000).then(() => null)]);
        if (!blogPage) blogPage = page; else await page.close();

        // --- THE WHITE PAGE FIX ---
        console.log("   - Ensuring page content is loaded...");
        await blogPage.bringToFront();
        try {
            // Wait for a common blog element (article or header) to ensure no white page
            await blogPage.waitForSelector('article, h1, .entry-content', { timeout: 15000 });
        } catch (e) {
            console.log("   - Page looks blank. Force refreshing...");
            await blogPage.reload({ waitUntil: 'networkidle2' });
        }

        // 3. Initial Human Wait (5-20s)
        await sleep(rand(5000, 20000));

        const sessionStart = Date.now();
        const stayDuration = rand(480000, 1200000); // 8-20 mins (Adjustable)

        // 4. Interaction Loop
        while (Date.now() - sessionStart < stayDuration) {
            
            // Scroll randomly
            await blogPage.evaluate(() => window.scrollBy(0, Math.floor(Math.random() * 400 + 100)));
            await sleep(rand(10000, 25000));

            // CLICK ON POSTS ONLY
            // We target h1, h2 links or "read more" buttons specifically
            if (Math.random() > 0.5) {
                console.log("   - Looking for a post to read...");
                const posts = await blogPage.$$('h1 a, h2 a, h3 a, .entry-title a, .read-more, a.post-link');
                
                if (posts.length > 0) {
                    const randomPost = posts[rand(0, posts.length - 1)];
                    const isClickable = await blogPage.evaluate(el => {
                        const style = window.getComputedStyle(el);
                        return style.display !== 'none' && style.visibility !== 'hidden';
                    }, randomPost);

                    if (isClickable) {
                        console.log("   - Physically clicking a post title...");
                        await performRealClick(blogPage, randomPost);
                        await sleep(rand(5000, 10000));
                        await handleAdRedirects(browser, blogPage);
                    }
                }
            }

            // Human fidgeting
            await blogPage.mouse.move(rand(100, 800), rand(100, 600), { steps: 15 });
        }

    } catch (err) {
        console.log(`Error: ${err.message}`);
    } finally {
        await browser.close();
        if (fs.existsSync(profileDir)) fs.rmSync(profileDir, { recursive: true, force: true });
    }
}

// Start
(async () => {
    for (let i = 1; i <= 5; i++) {
        await runSession(i);
        await sleep(rand(20000, 40000));
    }
})();

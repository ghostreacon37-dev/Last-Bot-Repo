/**
 * elite_active_recovery.js
 * - Fixes: "Idle" behavior after ad redirects.
 * - Logic: Close ad -> Return to blog -> Immediately click a post.
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
        await sleep(1500); // Wait for scroll to finish
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

/* ---------- POST FINDER ---------- */
async function findAndClickPost(page) {
    console.log("   - Searching for a real post to click...");
    // Specifically target article titles and common blog post selectors
    const posts = await page.$$('h1 a, h2 a, h3 a, .entry-title a, .post-title a, a[rel="bookmark"]');
    
    if (posts.length > 0) {
        const randomPost = posts[rand(0, posts.length - 1)];
        const success = await performRealClick(page, randomPost);
        if (success) console.log("   - Success: Moved to a new post.");
        return success;
    }
    console.log("   - No post links found in view.");
    return false;
}

/* ---------- AD RECOVERY + AUTO-CLICK ---------- */
async function handleAdRedirects(browser, originalPage) {
    const pages = await browser.pages();
    let wasRedirected = false;

    for (const p of pages) {
        const url = p.url();
        if (p !== originalPage && !url.includes('learnblogs.online') && !url.includes('about:blank')) {
            console.log(`   - [Ad Recovery] Closing: ${url.substring(0, 30)}...`);
            await p.close().catch(() => {});
            wasRedirected = true;
        }
    }

    if (wasRedirected) {
        await originalPage.bringToFront();
        await sleep(2000);
        // CRITICAL: After coming back from an ad, click a post immediately
        console.log("   - [Action] Back from ad. Finding new content...");
        await findAndClickPost(originalPage);
    }
}

async function runSession(runId) {
    const targetUrl = 'https://learnblogs.online';
    const referrerUrl = 'https://x.com/GhostReacondev/status/2024921591520641247?s=20';
    const profileDir = path.join(__dirname, `session_active_${Date.now()}`);

    const browser = await puppeteer.launch({
        headless: false,
        userDataDir: profileDir,
        args: ['--no-sandbox', '--start-maximized', '--disable-features=IsolateOrigins,site-per-process']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1536, height: 864 });

        // 1. Initial Link Click from X
        await page.goto(referrerUrl, { waitUntil: 'networkidle2' });
        await sleep(rand(8000, 12000));

        const newTabPromise = new Promise(x => browser.once('targetcreated', t => x(t.page())));
        const xLink = await page.$('article a[href*="learnblogs.online"]');
        
        if (xLink) await performRealClick(page, xLink);
        else await page.goto(targetUrl, { referer: referrerUrl });

        let blogPage = await Promise.race([newTabPromise, sleep(8000).then(() => null)]);
        if (!blogPage) blogPage = page; else await page.close();

        await blogPage.bringToFront();
        await sleep(rand(5000, 15000)); // First "Reading" wait

        const sessionStart = Date.now();
        const stayDuration = rand(600000, 1800000); // 10-30 mins default

        // 2. Continuous Engagement Loop
        while (Date.now() - sessionStart < stayDuration) {
            
            // Random Activity: Scrolling
            await blogPage.evaluate(() => window.scrollBy(0, Math.floor(Math.random() * 500 + 100)));
            await sleep(rand(10000, 20000));

            // Random Activity: Clicking a Post
            if (Math.random() > 0.4) {
                await findAndClickPost(blogPage);
                await sleep(5000);
                // Check if that click opened an ad
                await handleAdRedirects(browser, blogPage);
            }

            // Periodic Ad Check (in case one popped up silently)
            await handleAdRedirects(browser, blogPage);

            if (Date.now() - sessionStart > stayDuration) break;
        }

    } catch (err) {
        console.log(`Error: ${err.message}`);
    } finally {
        await browser.close();
        if (fs.existsSync(profileDir)) fs.rmSync(profileDir, { recursive: true, force: true });
    }
}

(async () => {
    for (let i = 1; i <= 5; i++) {
        await runSession(i);
        await sleep(rand(20000, 40000));
    }
})();

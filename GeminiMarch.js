/**
 * elite_resilient_bot.js
 * - Target: learnblogs.online
 * - Behavior: Real Human Clicks, Ad-Recovery, and Variable Stay Durations
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
        const box = await element.boundingBox();
        if (!box) return false;

        // Move mouse in a jittery, human-like curve to the element
        const targetX = box.x + box.width / 2 + rand(-5, 5);
        const targetY = box.y + box.height / 2 + rand(-5, 5);
        
        await page.mouse.move(targetX, targetY, { steps: rand(15, 25) });
        await sleep(rand(200, 500));
        
        // Physical Mouse Down/Up (Hardware Level)
        await page.mouse.down();
        await sleep(rand(50, 150));
        await page.mouse.up();
        
        return true;
    } catch (e) {
        return false;
    }
}

async function handleAdRedirects(browser, originalPage) {
    const pages = await browser.pages();
    for (const p of pages) {
        const url = p.url();
        // If the new tab isn't our blog or the referrer, it's likely an ad/redirect
        if (p !== originalPage && !url.includes('learnblogs.online') && !url.includes('twitter.com') && !url.includes('x.com')) {
            console.log(`   - [Ad Detected] Closing redirect: ${url.substring(0, 40)}...`);
            await p.close().catch(() => {});
            await originalPage.bringToFront();
        }
    }
}

async function runSession(runId) {
    const targetUrl = 'https://learnblogs.online';
    const referrerUrl = 'https://x.com/GhostReacondev/status/2024921591520641247?s=20';
    const profileDir = path.join(__dirname, `user_session_${Date.now()}`);

    // Set personality (Stay 8 mins up to 1 hour)
    const dice = Math.random();
    let stayDuration = rand(480000, 900000); // 8-15 mins
    if (dice > 0.8) stayDuration = rand(1800000, 3600000); // 30-60 mins
    if (dice < 0.1) stayDuration = rand(60000, 180000); // 1-3 mins (quick exit)

    const browser = await puppeteer.launch({
        headless: false,
        userDataDir: profileDir,
        args: ['--no-sandbox', '--start-maximized', '--disable-popup-blocking'] // We allow popups so we can "catch" and close them
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1536, height: 864 });

        // 1. Start at X (Referrer)
        await page.goto(referrerUrl, { waitUntil: 'networkidle2' });
        await sleep(rand(10000, 15000));

        // 2. Click the link to go to the blog
        const xLinks = await page.$$('a[href*="learnblogs.online"]');
        if (xLinks.length > 0) {
            await performRealClick(page, xLinks[0]);
        } else {
            await page.goto(targetUrl, { referer: referrerUrl });
        }

        // Wait for redirection to stabilize
        await sleep(rand(5000, 10000));
        await handleAdRedirects(browser, page);

        const startTime = Date.now();
        console.log(`[Run ${runId}] Target reached. Staying for ${Math.round(stayDuration/60000)} minutes.`);

        // 3. Main Engagement Loop
        while (Date.now() - startTime < stayDuration) {
            // Initial Wait (per your request: 5-20 seconds)
            await sleep(rand(5000, 20000));

            // Human Scrolling
            await page.evaluate(() => window.scrollBy(0, Math.floor(Math.random() * 500 + 100)));
            
            // Random Human Interaction: Click internal link or random spot
            if (Math.random() > 0.6) {
                const interactables = await page.$$('h1 a, h2 a, .entry-title a, article a, button');
                if (interactables.length > 0) {
                    const target = interactables[rand(0, interactables.length - 1)];
                    console.log("   - Performing a real human click on the page...");
                    await performRealClick(page, target);
                    
                    // Wait after click to see if it redirects
                    await sleep(rand(3000, 6000));
                    await handleAdRedirects(browser, page);
                }
            }

            // Occasional "Micro-Fidget"
            await page.mouse.move(rand(0, 1000), rand(0, 800), { steps: 10 });
            
            if (Date.now() - startTime > stayDuration) break;
        }

        console.log(`[Run ${runId}] Session finished.`);

    } catch (err) {
        console.log(`Error: ${err.message}`);
    } finally {
        await browser.close();
        if (fs.existsSync(profileDir)) fs.rmSync(profileDir, { recursive: true, force: true });
    }
}

// Start
(async () => {
    for (let i = 1; i <= 10; i++) {
        await runSession(i);
        await sleep(rand(20000, 60000)); // Gap between different users
    }
})();

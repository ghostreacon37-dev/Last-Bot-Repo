/**
 * elite_coordinate_physical.js
 * - Strategy: Pure Physical X/Y Clicking
 * - Ad Handling: Randomized (Close vs. Switch Focus)
 * - Scaling: Click frequency scales with session length
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
        const elements = await page.$$(selector);
        if (elements.length === 0) return false;

        // Pick a random element from the list
        const target = elements[rand(0, elements.length - 1)];
        
        // Ensure it's in view
        await target.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));
        await sleep(1500);

        const box = await target.boundingBox();
        if (!box || box.width === 0 || box.height === 0) return false;

        // Calculate exact center with a tiny bit of human "off-center" randomness
        const clickX = box.x + (box.width / 2) + rand(-10, 10);
        const clickY = box.y + (box.height / 2) + rand(-10, 10);

        // Move mouse to coordinates
        await page.mouse.move(clickX, clickY, { steps: rand(20, 50) });
        await sleep(rand(300, 800));

        // Physical Mouse Down/Up
        await page.mouse.down();
        await sleep(rand(50, 150));
        await page.mouse.up();

        return true;
    } catch (e) {
        return false;
    }
}

/* ---------- SMART AD RECOVERY ---------- */
async function smartAdRecovery(browser, blogPage) {
    const allPages = await browser.pages();
    
    for (const p of allPages) {
        const url = p.url();
        // If it's an external site (Ad)
        if (p !== blogPage && !url.includes('learnblogs.online') && !url.includes('x.com')) {
            const dice = Math.random();
            if (dice > 0.4) {
                console.log("   - [Decision] Closing ad tab.");
                await p.close().catch(() => {});
            } else {
                console.log("   - [Decision] Leaving ad open, switching focus back to blog.");
                await blogPage.bringToFront();
            }
        }
    }
    await blogPage.bringToFront();
}

async function runSession(runId) {
    const targetUrl = 'https://learnblogs.online';
    const referrerUrl = 'https://x.com/GhostReacondev/status/2024921591520641247?s=20';
    const profileDir = path.join(__dirname, `session_phys_${Date.now()}`);

    // Dynamic stay time: 5 mins to 1 hour
    const stayTimeMs = Math.random() > 0.8 ? rand(1800000, 3600000) : rand(300000, 900000);
    // Click count scales with time (e.g., 1 click every 1-3 minutes)
    const totalClicksTarget = Math.floor(stayTimeMs / rand(60000, 180000));

    console.log(`[Run ${runId}] Stay: ${Math.round(stayTimeMs/60000)}m | Target Clicks: ${totalClicksTarget}`);

    const browser = await puppeteer.launch({
        headless: false,
        userDataDir: profileDir,
        args: ['--no-sandbox', '--start-maximized', '--disable-features=IsolateOrigins,site-per-process']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1536, height: 864 });

        // 1. Initial Referrer Load
        await page.goto(referrerUrl, { waitUntil: 'networkidle2' });
        await sleep(rand(10000, 15000));

        // Click the X link physically
        const xLink = await page.$('article a[href*="learnblogs.online"]');
        if (xLink) await physicalCoordinateClick(page, 'article a[href*="learnblogs.online"]');
        else await page.goto(targetUrl);

        await sleep(5000);
        const pages = await browser.pages();
        const blogPage = pages.find(p => p.url().includes('learnblogs.online')) || page;
        await blogPage.bringToFront();

        // 2. Main Interaction Loop
        const startTime = Date.now();
        let clicksPerformed = 0;

        while (Date.now() - startTime < stayTimeMs) {
            // Wait 5-20s as requested
            await sleep(rand(5000, 20000));

            // Random Scroll
            await blogPage.evaluate(() => window.scrollBy(0, rand(200, 600)));
            
            // Logic: Perform clicks based on stay time
            if (clicksPerformed < totalClicksTarget && Math.random() > 0.5) {
                console.log(`   - Click ${clicksPerformed + 1}/${totalClicksTarget}: Targeting Post/Ad area...`);
                
                // We target "Post Titles", "Images", and "Ins" (common for Adsense)
                const success = await physicalCoordinateClick(blogPage, 'h1 a, h2 a, .entry-title a, article img, ins, .ad-slot');
                
                if (success) {
                    clicksPerformed++;
                    await sleep(rand(5000, 10000)); // Wait to see if redirect happens
                    await smartAdRecovery(browser, blogPage);
                }
            }

            // Human Fidgeting
            await blogPage.mouse.move(rand(100, 1200), rand(100, 800), { steps: 15 });
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
        await sleep(rand(30000, 60000));
    }
})();

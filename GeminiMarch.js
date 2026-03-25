/**
 * testbot_physical_elite.js
 * - Target: learnblogs.online
 * - Focus: 100% Coordinate-based physical clicks
 * - No internal URL scraping; it clicks what it "sees"
 */

const puppeteer = require('puppeteer-extra');
const fs = require('fs');
const path = require('path');
puppeteer.use(require('puppeteer-extra-plugin-stealth')());

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ---------- THE REAL PHYSICAL CLICKER ---------- */

/**
 * This function finds a link on the screen, scrolls it into view, 
 * calculates its REAL screen coordinates, and moves the mouse there to click.
 */
async function findAndPhysicalClick(page, selector) {
    try {
        // Find all visible elements matching the selector (titles, read-more, etc.)
        const elements = await page.$$(selector);
        if (elements.length === 0) return false;

        // Pick one at random
        const targetEl = elements[rand(0, elements.length - 1)];

        // 1. Scroll it into the middle of the screen so it's "visible" to the user
        await targetEl.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));
        await sleep(rand(1000, 2000));

        // 2. Get the exact bounding box (x, y, width, height)
        const box = await targetEl.boundingBox();
        if (!box || box.width === 0 || box.height === 0) return false;

        // 3. Calculate a random point inside that box (avoiding the exact edges)
        const clickX = box.x + (box.width / 2) + rand(-5, 5);
        const clickY = box.y + (box.height / 2) + rand(-5, 5);

        // 4. Move the mouse in a human-like path to those coordinates
        await page.mouse.move(clickX, clickY, { steps: rand(15, 25) });
        await sleep(rand(300, 700));

        // 5. Perform the hardware-level click
        await page.mouse.click(clickX, clickY, { delay: rand(50, 150) });
        
        console.log(`   - Physical Click successful at [${Math.round(clickX)}, ${Math.round(clickY)}]`);
        return true;
    } catch (e) {
        console.log("   - Physical Click failed.");
        return false;
    }
}

async function runEliteSession(runId) {
    const targetUrl = 'https://learnblogs.online';
    const referrerUrl = 'https://x.com/GhostReacondev/status/2024921591520641247?s=20';
    const profileDir = path.join(__dirname, `session_${Date.now()}`);

    // Randomize Personality (Stay time: 1 min up to 1 hour)
    const dice = Math.random();
    let stayTime = rand(300000, 900000); // Default 5-15 mins
    if (dice < 0.15) stayTime = rand(45000, 120000); // Bouncer
    if (dice > 0.85) stayTime = rand(1800000, 3600000); // Long Reader

    const browser = await puppeteer.launch({
        headless: false, // Keep false so you can watch the mouse move
        userDataDir: profileDir,
        args: ['--no-sandbox', '--start-maximized']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        // Step 1: X.com Referrer
        await page.goto(referrerUrl, { waitUntil: 'networkidle2' });
        await sleep(rand(10000, 15000));

        // Step 2: Physical click on the link within X.com
        // We listen for the new tab because X opens links in new windows
        const newTabPromise = new Promise(resolve => browser.once('targetcreated', target => resolve(target.page())));
        
        // On X, links usually have specific classes or are within the tweet text
        const xLinkFound = await findAndPhysicalClick(page, 'article a[href*="learnblogs.online"]');
        
        let blogPage;
        if (xLinkFound) {
            blogPage = await Promise.race([newTabPromise, sleep(7000).then(() => null)]);
        }

        if (!blogPage) {
            console.log("   - Direct click failed or no new tab. Forcing navigation...");
            blogPage = page;
            await blogPage.goto(targetUrl, { referer: referrerUrl, waitUntil: 'networkidle2' });
        } else {
            await page.close(); // Close X tab
        }

        await blogPage.bringToFront();
        const startTime = Date.now();

        // Step 3: Interaction Loop on learnblogs.online
        while (Date.now() - startTime < stayTime) {
            // Random Scroll
            const scrollAmt = rand(200, 600);
            await blogPage.evaluate((y) => window.scrollBy(0, y), scrollAmt);
            await sleep(rand(5000, 15000));

            // Human Fidget: Random mouse movements
            await blogPage.mouse.move(rand(100, 1000), rand(100, 800), { steps: 10 });

            // Random Internal Click (Looking for Titles or "Read More" buttons)
            // This is a REAL physical click based on coordinates
            if (Math.random() > 0.7) {
                console.log("   - Attempting a real physical click on a post title...");
                await findAndPhysicalClick(blogPage, 'h1 a, h2 a, .entry-title a, .read-more');
                await sleep(rand(10000, 20000)); // Stay on the new post
            }

            if (Date.now() - startTime > stayTime) break;
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
        await runEliteSession(i);
        await sleep(rand(15000, 30000));
    }
})();

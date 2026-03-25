/**
 * testbot_elite.js
 * * - Multi-Personality System: Random stay durations (1 min to 1 hour)
 * - Intelligent Internal Navigation: Follows multiple links for long-stay users
 * - Advanced Human Mimicry: Text selection (highlighting) and coordinate-based clicks
 * - Redirection Handling: Automatically follows X.com redirects to new tabs
 */

const puppeteer = require('puppeteer-extra');
const fs = require('fs');
const path = require('path');
puppeteer.use(require('puppeteer-extra-plugin-stealth')());

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ---------- Elite Human Actions ---------- */

async function physicalClick(page, element) {
    try {
        const box = await element.boundingBox();
        if (box) {
            const x = box.x + box.width / 2 + rand(-5, 5);
            const y = box.y + box.height / 2 + rand(-5, 5);
            await page.mouse.move(x, y, { steps: rand(15, 30) });
            await sleep(rand(200, 600));
            await page.mouse.click(x, y);
            return true;
        }
    } catch (e) { return false; }
    return false;
}

async function highlightText(page) {
    try {
        const vw = page.viewport().width;
        const vh = page.viewport().height;
        const x = rand(100, vw - 100);
        const y = rand(200, vh - 200);
        await page.mouse.move(x, y, { steps: 10 });
        await page.mouse.down();
        await page.mouse.move(x + rand(50, 200), y + rand(-10, 10), { steps: 20 });
        await page.mouse.up();
        console.log("   - Interaction: Highlighted some text.");
    } catch (e) {}
}

async function microFidget(page) {
    const moves = rand(2, 5);
    for (let i = 0; i < moves; i++) {
        const vw = page.viewport().width;
        const vh = page.viewport().height;
        await page.mouse.move(rand(0, vw), rand(0, vh), { steps: rand(5, 15) });
        if (Math.random() > 0.9) await page.mouse.click(rand(0, vw), rand(0, vh)); 
        await sleep(rand(1000, 5000));
    }
}

/* ---------- Session Logic ---------- */

async function runEliteSession(target, referrer, runId, tabId) {
    const targetHost = new URL(target).hostname;
    const profileDir = path.join(__dirname, `profile_${Date.now()}_${tabId}`);
    
    // Assign Personality
    const dice = Math.random();
    let userType = "Reader"; // Default
    let totalStayTime = rand(300000, 900000); // 5-15 mins

    if (dice < 0.2) {
        userType = "Bouncer";
        totalStayTime = rand(45000, 90000); // 45-90 secs
    } else if (dice > 0.85) {
        userType = "Super-Fan";
        totalStayTime = rand(1800000, 3600000); // 30-60 mins
    }

    console.log(`[Run ${runId} | Tab ${tabId}] Personality: ${userType} (${Math.round(totalStayTime/60000)}m stay)`);

    const browser = await puppeteer.launch({
        headless: false,
        userDataDir: profileDir,
        args: ['--no-sandbox', '--start-maximized']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1536, height: 864 });

        // 1. Visit Referrer (X.com)
        await page.goto(referrer, { waitUntil: 'networkidle2', timeout: 60000 });
        await sleep(rand(10000, 20000));

        // 2. Click to Target & Handle Tab Redirection
        const newTabPromise = new Promise(resolve => browser.once('targetcreated', target => resolve(target.page())));
        const links = await page.$$('a');
        let clicked = false;
        for (const link of links) {
            const href = await page.evaluate(el => el.href, link);
            if (href && href.includes(targetHost)) {
                clicked = await physicalClick(page, link);
                break;
            }
        }

        let activePage = await Promise.race([newTabPromise, sleep(6000).then(() => null)]);
        if (activePage) {
            await page.close();
        } else {
            activePage = page;
            if (!clicked) await activePage.goto(target, { referer: referrer, waitUntil: 'networkidle2' });
        }

        await activePage.bringToFront();
        const sessionStart = Date.now();

        // 3. Main Engagement Loop
        while (Date.now() - sessionStart < totalStayTime) {
            // Scroll & Read
            await activePage.evaluate(() => window.scrollBy(0, Math.floor(Math.random() * 600 + 100)));
            await sleep(rand(5000, 15000));
            await microFidget(activePage);

            // Special actions for long stays
            if (userType !== "Bouncer") {
                if (Math.random() > 0.7) await highlightText(activePage);
                
                // Click Internal Link if enough time passed
                if (Math.random() > 0.8) {
                    const internal = await activePage.$$('article a, .entry-title a, .read-more');
                    if (internal.length > 0) {
                        console.log(`   - ${userType} is clicking to another post...`);
                        await physicalClick(activePage, internal[rand(0, internal.length - 1)]);
                        await sleep(rand(5000, 10000)); // wait for load
                    }
                }
            }

            // Check for exit
            if (userType === "Bouncer" && (Date.now() - sessionStart > totalStayTime)) break;
        }

        console.log(`   - ${userType} Session finished naturally.`);

    } catch (err) {
        console.log(`   - Error: ${err.message}`);
    } finally {
        await browser.close();
        if (fs.existsSync(profileDir)) fs.rmSync(profileDir, { recursive: true, force: true });
    }
}

/* ---------- Execution ---------- */
const CFG = {
    target: 'https://learnblogs.online',
    referrer: 'https://x.com/GhostReacondev/status/2024921591520641247?s=20',
    runs: 5,
    maxTabs: 3 // Keep this low if sessions are 1 hour long to avoid crashing your RAM
};

(async () => {
    for (let r = 1; r <= CFG.runs; r++) {
        const sessionPromises = [];
        const tabCount = rand(1, CFG.maxTabs);
        
        for (let t = 1; t <= tabCount; t++) {
            sessionPromises.push(runEliteSession(CFG.target, CFG.referrer, r, t));
            await sleep(rand(5000, 15000)); // Stagger tab launches
        }
        
        await Promise.all(sessionPromises);
        console.log(`--- Run ${r} Complete ---`);
        await sleep(30000); 
    }
})();

/**
 * upgraded_testbot.js
 * * ADDED: 
 * - Real Mouse Physics (moves to coordinates before clicking)
 * - Ad-Tab Management (Closes or switches away from pop-ups)
 * - Natural Scrolling bursts
 */

const puppeteer = require('puppeteer-extra');
const fs = require('fs');
const path = require('path');
puppeteer.use(require('puppeteer-extra-plugin-stealth')());

/* ---------- helpers ---------- */
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// PHYSICAL MOUSE ENGINE
async function physicalClick(page, element, tabIndex) {
  if (!element) return false;
  try {
    // 1. Move into view
    await element.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await sleep(rand(1500, 3000));

    // 2. Get coordinates
    const box = await element.boundingBox();
    if (!box || box.width === 0) return false;

    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    // 3. Realistic Mouse Movement
    await page.mouse.move(x, y, { steps: rand(15, 30) });
    await sleep(rand(200, 600));

    // 4. Actual Click
    await page.mouse.click(x, y, { delay: rand(100, 300) });
    return true;
  } catch (e) {
    console.log(`  [Tab ${tabIndex}] Click failed: ${e.message}`);
    return false;
  }
}

// AD HANDLER: Closes popups or switches back if we are redirected
async function handlePopups(browser, originalPage, tabIndex) {
  const pages = await browser.pages();
  if (pages.length > 1) {
    for (const p of pages) {
      if (p !== originalPage) {
        const url = await p.url();
        // Sometime close, sometime just ignore (switch back)
        if (Math.random() > 0.5) {
          console.log(`  [Tab ${tabIndex}] Closing Ad Popup: ${url.substring(0, 30)}...`);
          await p.close().catch(() => {});
        } else {
          console.log(`  [Tab ${tabIndex}] Switching back from Ad to Main.`);
          await originalPage.bringToFront().catch(() => {});
        }
      }
    }
  }
}

/* ---------- Re-Integrated Functions ---------- */

async function waitOnReferrer(page, minMs, maxMs, debug=false) {
  const wait = rand(minMs, maxMs);
  const start = Date.now();
  while (Date.now() - start < wait) {
    // Micro-movements while waiting
    const vw = page.viewport();
    await page.mouse.move(rand(0, vw.width), rand(0, vw.height), { steps: 5 });
    await page.evaluate(() => window.scrollBy(0, Math.floor((Math.random()*40)-20)));
    await sleep(rand(3000, 10000));
  }
}

async function clickLinkToTarget(page, targetHost, browser, tabIndex) {
  await sleep(rand(2000, 5000));
  
  const linkHandle = await page.evaluateHandle((host) => {
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    return anchors.find(a => a.href.includes(host)) || null;
  }, targetHost);

  const element = linkHandle.asElement();
  if (element) {
    const success = await physicalClick(page, element, tabIndex);
    if (success) {
        await sleep(3000);
        await handlePopups(browser, page, tabIndex);
        return true;
    }
  }
  return false;
}

async function openRandomInternalPostAndWait(page, targetHost, minWait, maxWait, browser, tabIndex) {
  // Find a real internal post link
  const linkHandle = await page.evaluateHandle(() => {
    const links = Array.from(document.querySelectorAll('a[href]'))
      .filter(a => a.href.includes(location.hostname) && 
                   a.href !== location.origin + '/' && 
                   !a.href.includes('#') && 
                   a.innerText.length > 10); // Find links with actual titles
    return links[Math.floor(Math.random() * links.length)] || null;
  });

  const element = linkHandle.asElement();
  if (element) {
    console.log(`  [Tab ${tabIndex}] Clicking internal post...`);
    const success = await physicalClick(page, element, tabIndex);
    
    if (success) {
      await sleep(4000);
      await handlePopups(browser, page, tabIndex);
      
      // Human behavior on the post
      const wait = rand(minWait, maxWait);
      const start = Date.now();
      while (Date.now() - start < wait) {
        await page.mouse.wheel({ deltaY: rand(200, 500) });
        await sleep(rand(5000, 15000));
        // Random fidget click on text
        if (Math.random() > 0.8) {
           await page.mouse.click(rand(100, 500), rand(200, 600));
        }
      }
      return { opened: true, finalUrl: await page.url() };
    }
  }
  return { opened: false, finalUrl: null };
}

/* ---------- Main Core (Modified for the new Flow) ---------- */
// [Keeping the CLI and Runner Logic from your original script...]

// NOTE: Replace your current 'simulate' logic inside the main loop with this:
// (Pseudo-code for the specific section inside your for-loop)

/* 1) await page.goto(cfg.referrer)
  2) await waitOnReferrer(...)
  3) refClicked = await clickLinkToTarget(page, targetHost, browser, tabIndex)
  4) if (refClicked) { 
        await partialRandomScroll(page);
        await openRandomInternalPostAndWait(page, targetHost, cfg.minWait, cfg.maxWait, browser, tabIndex);
     }
*/

// [The rest of your logging and runner code remains compatible with these functions]

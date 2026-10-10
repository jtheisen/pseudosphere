import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

test('shader renders, rotation stays unwrapped, and controls work on desktop and mobile', async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 5173, strictPort: true } });
  await server.listen();
  let browser;
  try {
    browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if(message.type() === 'error' && !message.text().includes('fonts.googleapis.com')) errors.push(message.text()); });
    await page.goto('http://127.0.0.1:5173');
    await page.locator('canvas').waitFor();
    await page.waitForTimeout(1500);
    assert.equal(await page.locator('[role="alert"]').count(), 0, 'shader should compile');
    assert.deepEqual(errors, [], 'no browser errors');
    await page.screenshot({ path: '/private/tmp/traktrix-desktop.png', fullPage: true });
    const box = await page.locator('canvas').boundingBox();
    for(let i=0; i<4; i++) {
      await page.mouse.move(box.x+100,box.y+box.height/2);
      await page.mouse.down();
      await page.mouse.move(box.x+box.width-60,box.y+box.height/2,{steps:5});
      await page.mouse.up();
    }
    const angle = parseFloat(await page.locator('.rotation-value').innerText());
    assert.ok(angle>360, `rotation should accumulate past 360°, got ${angle}`);
    await page.getByRole('button',{name:'Pure geometry'}).click();
    await page.getByRole('button',{name:'Show reflection domains'}).click();
    assert.equal(await page.getByRole('button',{name:'Show reflection domains'}).getAttribute('aria-pressed'),'true');
    await page.getByRole('button',{name:'Let it turn'}).click();
    await page.getByRole('button',{name:'Pause the journey'}).waitFor();
    await page.getByRole('button',{name:'Pause the journey'}).click();
    await page.getByRole('button',{name:'Reset view'}).click();
    assert.equal(parseFloat(await page.locator('.rotation-value').innerText()),0);
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:'/private/tmp/traktrix-mobile.png',fullPage:true});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'mobile layout should not overflow');
    assert.deepEqual(errors, [], 'no errors after interactions');
  } finally { await browser?.close(); await server.close(); }
});

import puppeteer from 'puppeteer';

(async () => {
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    
    console.log('Navigating to http://localhost:5174...');
    await page.goto('http://localhost:5174', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    
    // Screenshot 1: Main page
    console.log('Taking screenshot 1: Main page');
    await page.screenshot({ path: '/tmp/screenshot1-main.png', fullPage: false });
    
    // Click Get Started button
    console.log('Clicking Get Started button...');
    try {
      await page.click('button');  // Click first button (Get Started)
      await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
      console.log('Error clicking button:', e.message);
    }
    
    // Screenshot 2: Wizard page
    console.log('Taking screenshot 2: Wizard/Modal');
    await page.screenshot({ path: '/tmp/screenshot2-wizard.png', fullPage: true });
    
    // Go back - reload the page
    console.log('Reloading page...');
    await page.goto('http://localhost:5174', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    
    // Look for buttons and find the gear icon
    console.log('Looking for gear icon button...');
    const allButtons = await page.$$('button');
    console.log(`Found ${allButtons.length} buttons`);
    
    let gearClicked = false;
    for (let btn of allButtons) {
      const innerHTML = await btn.evaluate(el => el.innerHTML);
      if (innerHTML.includes('fa-cog') || innerHTML.includes('gear') || innerHTML.includes('⚙')) {
        console.log('Found gear icon, clicking...');
        await btn.click();
        await new Promise(r => setTimeout(r, 1000));
        gearClicked = true;
        break;
      }
    }
    
    if (!gearClicked && allButtons.length > 0) {
      console.log('Gear icon not found by content, trying last button...');
      const lastBtn = allButtons[allButtons.length - 1];
      const box = await lastBtn.boundingBox();
      console.log('Last button position:', box);
      await lastBtn.click();
      await new Promise(r => setTimeout(r, 1000));
    }
    
    // Screenshot 3: Settings panel
    console.log('Taking screenshot 3: Settings panel');
    await page.screenshot({ path: '/tmp/screenshot3-settings.png', fullPage: false });
    
    console.log('Screenshots saved successfully!');
    console.log('  - /tmp/screenshot1-main.png');
    console.log('  - /tmp/screenshot2-wizard.png');
    console.log('  - /tmp/screenshot3-settings.png');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
})();

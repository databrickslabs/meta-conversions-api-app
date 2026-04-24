import puppeteer from 'puppeteer';

(async () => {
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1600 });
    
    console.log('Navigating to http://localhost:5173...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    
    // Screenshot: Full page including header, center tile, and footer
    console.log('Taking full-page screenshot...');
    await page.screenshot({ path: '/tmp/full-page-screenshot.png', fullPage: true });
    
    console.log('Screenshot saved to /tmp/full-page-screenshot.png');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
})();

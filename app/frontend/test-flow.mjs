import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Helper to click button by text
async function clickButtonByText(page, text) {
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const btnText = await page.evaluate(el => el.innerText, btn);
    if (btnText.toLowerCase().includes(text.toLowerCase())) {
      await btn.click();
      return true;
    }
  }
  return false;
}

// Helper to find button text
async function getButtonTexts(page) {
  return await page.$$eval('button', buttons => buttons.map(b => b.innerText));
}

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const screenshotsDir = path.join(__dirname, 'test-screenshots');

  // Create screenshots directory
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  try {
    console.log('\n=== TESTING FULL FLOW ===\n');

    // Step 1: Home page screenshot
    console.log('Step 1: Navigate to home page');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
    await page.screenshot({ path: path.join(screenshotsDir, '01-home-page.png'), fullPage: true });
    console.log('✓ Screenshot saved: 01-home-page.png');

    // Get page content to verify Meta CAPI tile
    const homeContent = await page.evaluate(() => document.body.innerText);
    console.log('Home page content preview:', homeContent.substring(0, 200));

    // Step 2: Click "Get Started" button
    console.log('\nStep 2: Click "Get Started" button');
    const buttons = await getButtonTexts(page);
    console.log('Available buttons:', buttons);

    await clickButtonByText(page, 'Get Started');
    console.log('✓ Clicked "Get Started" button');

    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => null);
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: path.join(screenshotsDir, '02-wizard-step1.png'), fullPage: true });
    console.log('✓ Screenshot saved: 02-wizard-step1.png');

    // Step 3: Fill in access token and pixel ID
    console.log('\nStep 3: Fill in Access Token and Pixel ID');

    // Find all inputs
    const inputs = await page.$$('input[type="password"], input[type="text"]');
    console.log('Found inputs:', inputs.length);

    // Fill first input (access token)
    if (inputs.length > 0) {
      await inputs[0].click();
      await inputs[0].type('test_token_123');
      console.log('✓ Filled Access Token');
    }

    // Fill second input (pixel ID)
    if (inputs.length > 1) {
      await inputs[1].click();
      await inputs[1].type('123456789');
      console.log('✓ Filled Pixel ID');
    }

    // Click Next button
    await new Promise(r => setTimeout(r, 300));
    const btns = await getButtonTexts(page);
    console.log('Buttons on step 1:', btns);

    if (await clickButtonByText(page, 'Next')) {
      console.log('✓ Clicked Next button');
    } else {
      console.log('⚠ Could not find Next button');
    }

    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => null);
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: path.join(screenshotsDir, '03-wizard-step2.png'), fullPage: true });
    console.log('✓ Screenshot saved: 03-wizard-step2.png');

    // Step 4: Select "No" for test code and click Next
    console.log('\nStep 4: Select "No" for test code');

    // Look for radio buttons
    const radios = await page.$$('input[type="radio"]');
    console.log('Found radio buttons:', radios.length);

    // Get the labels to see what options are available
    const labels = await page.$$eval('label', els => els.map(e => e.innerText));
    console.log('Labels:', labels);

    // Try to click the "No" radio button
    if (radios.length > 1) {
      // Usually the second radio is "No"
      await radios[1].click();
      console.log('✓ Selected "No" for test code');
    }

    // Click Next
    await new Promise(r => setTimeout(r, 300));
    if (await clickButtonByText(page, 'Next')) {
      console.log('✓ Clicked Next button');
    }

    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => null);
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: path.join(screenshotsDir, '04-wizard-step3.png'), fullPage: true });
    console.log('✓ Screenshot saved: 04-wizard-step3.png');

    // Get the page content to see what's on step 3
    const step3Content = await page.evaluate(() => document.body.innerText);
    console.log('\nStep 3 (Review) content preview:', step3Content.substring(0, 300));

    // Step 5: Click "Save Configuration"
    console.log('\nStep 5: Click "Save Configuration" button');

    const step3Buttons = await getButtonTexts(page);
    console.log('Buttons on step 3:', step3Buttons);

    if (await clickButtonByText(page, 'Save Configuration')) {
      console.log('✓ Clicked Save Configuration button');
    } else if (await clickButtonByText(page, 'Save')) {
      console.log('✓ Clicked Save button');
    } else {
      console.log('⚠ Could not find Save button');
    }

    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => null);
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(screenshotsDir, '05-confirmation-page.png'), fullPage: true });
    console.log('✓ Screenshot saved: 05-confirmation-page.png');

    // Step 6: Click "Continue"
    console.log('\nStep 6: Click "Continue" button');

    const confirmButtons = await getButtonTexts(page);
    console.log('Buttons on confirmation page:', confirmButtons);

    if (await clickButtonByText(page, 'Continue')) {
      console.log('✓ Clicked Continue button');
    } else {
      console.log('⚠ Could not find Continue button');
    }

    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => null);
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: path.join(screenshotsDir, '06-post-setup-page.png'), fullPage: true });
    console.log('✓ Screenshot saved: 06-post-setup-page.png');

    // Get post-setup page content
    const postSetupContent = await page.evaluate(() => document.body.innerText);
    console.log('\nPost-setup page content preview:', postSetupContent.substring(0, 300));

    // Step 7: Click "Set Up a Job"
    console.log('\nStep 7: Click "Set Up a Job" button');

    const postSetupButtons = await getButtonTexts(page);
    console.log('Buttons on post-setup page:', postSetupButtons);

    if (await clickButtonByText(page, 'Set Up a Job')) {
      console.log('✓ Clicked Set Up a Job button');
    } else if (await clickButtonByText(page, 'Configure Job')) {
      console.log('✓ Clicked Configure Job button');
    } else if (await clickButtonByText(page, 'Job')) {
      console.log('✓ Clicked Job button');
    } else {
      console.log('⚠ Could not find Job button, available:', postSetupButtons);
    }

    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => null);
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(screenshotsDir, '07-column-mapping-form.png'), fullPage: true });
    console.log('✓ Screenshot saved: 07-column-mapping-form.png');

    // Get column mapping page content
    const mappingContent = await page.evaluate(() => document.body.innerText);
    console.log('\nColumn mapping page content preview (first 400 chars):', mappingContent.substring(0, 400));

    console.log('\n=== TEST COMPLETE ===');
    console.log(`Screenshots saved to: ${screenshotsDir}`);
    console.log(`\nScreenshot list:`);
    fs.readdirSync(screenshotsDir).forEach(file => {
      console.log(`  - ${file}`);
    });

  } catch (error) {
    console.error('Error during test:', error.message);
    console.error(error.stack);
  } finally {
    await browser.close();
  }
})();

import { connect } from "../src/client";

async function extractTestCases() {
  console.log("Connecting to dev-browser...");
  const client = await connect("http://localhost:9224");
  
  try {
    console.log("Getting page...");
    const page = await client.page("notion-extract");
    
    console.log("Navigating to Notion page...");
    await page.goto("https://shopos.notion.site/ShopOS-Cowork-2ec118db8f2980659851e80df9a2e042", {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });
    
    // Wait for Notion to fully render
    console.log("Waiting for Notion to render...");
    await page.waitForTimeout(10000);
    
    // Scroll incrementally to load all lazy-loaded content
    console.log("Scrolling to load all content...");
    
    // First, get the page height
    let previousHeight = 0;
    let scrollAttempts = 0;
    const maxScrollAttempts = 30;
    
    while (scrollAttempts < maxScrollAttempts) {
      // Scroll down
      await page.evaluate(() => {
        window.scrollBy(0, 800);
      });
      await page.waitForTimeout(500);
      
      // Check if we've loaded more content
      const currentHeight = await page.evaluate(() => document.body.scrollHeight);
      
      if (currentHeight === previousHeight) {
        // No new content loaded, try a few more times then stop
        scrollAttempts++;
        if (scrollAttempts > 5) {
          break;
        }
      } else {
        scrollAttempts = 0; // Reset counter when new content loads
        previousHeight = currentHeight;
      }
    }
    
    // Scroll back to top
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);
    
    // Take a full page screenshot
    console.log("Taking full page screenshot...");
    await page.screenshot({ path: "tmp/notion-test-cases-full.png", fullPage: true });
    
    // Extract all text content
    console.log("Extracting content...");
    const content = await page.evaluate(() => {
      // Get the entire page text
      const bodyText = document.body.innerText || "";
      
      // Also try to get structured content from Notion blocks
      const blocks = Array.from(document.querySelectorAll('[data-block-id]'));
      const blockTexts = blocks.map(block => {
        const el = block as HTMLElement;
        return {
          text: el.innerText?.trim() || "",
          tag: el.tagName
        };
      }).filter(b => b.text.length > 0);
      
      return {
        fullText: bodyText,
        blocks: blockTexts
      };
    });
    
    console.log("\n" + "=".repeat(80));
    console.log("FULL PAGE CONTENT");
    console.log("=".repeat(80) + "\n");
    console.log(content.fullText);
    
    // Look for test case patterns
    console.log("\n" + "=".repeat(80));
    console.log("SEARCHING FOR TEST CASES");
    console.log("=".repeat(80) + "\n");
    
    const lines = content.fullText.split('\n');
    let inTestCaseSection = false;
    let testCaseContent: string[] = [];
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Check if we're entering a test case section
      if (trimmedLine.match(/^Test Case \d+/i) || 
          trimmedLine.match(/^TC\s*\d+/i) ||
          trimmedLine.includes("Test Case:")) {
        inTestCaseSection = true;
      }
      
      // Look for brand-related content
      if (trimmedLine.toLowerCase().includes('brand') ||
          trimmedLine.toLowerCase().includes('voice') ||
          trimmedLine.toLowerCase().includes('tone') ||
          trimmedLine.toLowerCase().includes('style') ||
          trimmedLine.toLowerCase().includes('profile') ||
          trimmedLine.toLowerCase().includes('test case') ||
          trimmedLine.toLowerCase().includes('memory')) {
        testCaseContent.push(trimmedLine);
      }
    }
    
    if (testCaseContent.length > 0) {
      console.log("Found brand/test case related content:");
      testCaseContent.forEach((line, i) => console.log(`[${i}] ${line}`));
    } else {
      console.log("No test case content found in visible text.");
      console.log("The content may be in toggles or collapsed sections.");
    }
    
    // Try to find and expand toggles
    console.log("\n" + "=".repeat(80));
    console.log("LOOKING FOR TOGGLES/COLLAPSIBLE SECTIONS");
    console.log("=".repeat(80) + "\n");
    
    const toggleInfo = await page.evaluate(() => {
      // Find toggle blocks in Notion
      const toggleSelectors = [
        '[class*="toggle"]',
        '[class*="Toggle"]',
        '[data-block-id] > div[role="button"]',
        '.notion-toggle-block',
        '[class*="collapsible"]'
      ];
      
      const results: { selector: string; count: number; texts: string[] }[] = [];
      
      for (const selector of toggleSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          const texts = Array.from(elements).map(el => (el as HTMLElement).innerText?.substring(0, 100) || "");
          results.push({ 
            selector, 
            count: elements.length,
            texts: texts.slice(0, 10)
          });
        }
      }
      
      // Also look for "Test Cases" text specifically
      const allElements = Array.from(document.body.querySelectorAll('*'));
      const testCaseElements = allElements.filter(el => {
        const text = (el as HTMLElement).innerText?.trim();
        return text === 'Test Cases' || text?.match(/^Test Case \d+/);
      });
      
      const testCaseInfo = testCaseElements.map(el => ({
        tag: el.tagName,
        className: el.className,
        text: (el as HTMLElement).innerText?.substring(0, 100),
        hasChildren: el.children.length,
        parentClass: el.parentElement?.className
      }));
      
      return { toggleResults: results, testCaseElements: testCaseInfo };
    });
    
    console.log("Toggle elements found:", JSON.stringify(toggleInfo.toggleResults, null, 2));
    console.log("Test case elements found:", JSON.stringify(toggleInfo.testCaseElements, null, 2));
    
    // Try clicking on "Test Cases" to expand if it's a toggle
    console.log("\n" + "=".repeat(80));
    console.log("ATTEMPTING TO CLICK TEST CASES TOGGLE");
    console.log("=".repeat(80) + "\n");
    
    const clickResult = await page.evaluate(() => {
      // Find elements containing "Test Cases"
      const allElements = Array.from(document.body.querySelectorAll('*'));
      
      for (const el of allElements) {
        const text = (el as HTMLElement).innerText?.trim();
        if (text === 'Test Cases') {
          // Try to find a clickable parent or the element itself
          let target: HTMLElement | null = el as HTMLElement;
          
          // Walk up to find clickable element
          for (let i = 0; i < 5; i++) {
            if (!target) break;
            
            // Check if this element or its children have a toggle indicator
            const hasToggle = target.querySelector('[class*="triangle"], [class*="arrow"], [class*="toggle"], svg');
            if (hasToggle || target.getAttribute('role') === 'button') {
              target.click();
              return { clicked: true, element: target.className, text: text };
            }
            
            target = target.parentElement;
          }
          
          // If no toggle found, try clicking the element itself
          (el as HTMLElement).click();
          return { clicked: true, element: el.className, fallback: true };
        }
      }
      
      return { clicked: false };
    });
    
    console.log("Click result:", clickResult);
    
    // Wait and extract content again
    await page.waitForTimeout(2000);
    
    // Take another screenshot
    await page.screenshot({ path: "tmp/notion-after-expand.png", fullPage: true });
    
    // Extract content again
    const expandedContent = await page.evaluate(() => {
      return document.body.innerText || "";
    });
    
    console.log("\n" + "=".repeat(80));
    console.log("CONTENT AFTER CLICKING");
    console.log("=".repeat(80) + "\n");
    console.log(expandedContent);
    
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await client.disconnect();
  }
}

extractTestCases().catch(console.error);

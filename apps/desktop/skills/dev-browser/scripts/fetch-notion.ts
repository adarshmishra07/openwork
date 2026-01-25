import { connect } from "../src/client";
import { chromium } from "playwright";

async function fetchNotionTestCases() {
  console.log("Connecting to dev-browser...");
  const client = await connect("http://localhost:9224");
  
  try {
    console.log("Getting page...");
    const page = await client.page("notion-fetch");
    
    console.log("Navigating to Notion page...");
    await page.goto("https://shopos.notion.site/ShopOS-Cowork-2ec118db8f2980659851e80df9a2e042", {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });
    
    // Wait for Notion to fully render
    console.log("Waiting for Notion to render...");
    await page.waitForTimeout(8000);
    
    // Incrementally scroll to load all content
    console.log("Scrolling to load all content...");
    for (let i = 0; i < 10; i++) {
      await page.evaluate((scrollAmount) => {
        window.scrollBy(0, scrollAmount);
      }, 500);
      await page.waitForTimeout(500);
    }
    
    // Take a full page screenshot
    await page.screenshot({ path: "tmp/notion-full.png", fullPage: true });
    console.log("Full page screenshot saved");
    
    // Get all HTML to debug the structure
    const htmlInfo = await page.evaluate(() => {
      // Get all text blocks in Notion
      const blocks = Array.from(document.querySelectorAll('[data-block-id]'));
      const blockInfo = blocks.map(b => ({
        id: b.getAttribute('data-block-id'),
        classes: b.className,
        text: (b as HTMLElement).innerText?.substring(0, 100)
      }));
      
      // Look for any link or reference to "Test Cases"
      const allElements = Array.from(document.querySelectorAll('*'));
      const testCasesElements: any[] = [];
      
      for (const el of allElements) {
        const text = (el as HTMLElement).innerText?.trim();
        if (text === 'Test Cases') {
          testCasesElements.push({
            tag: el.tagName,
            classes: el.className,
            parent: el.parentElement?.className,
            href: (el as HTMLAnchorElement).href
          });
        }
      }
      
      return { blockCount: blocks.length, blocks: blockInfo.slice(0, 20), testCasesElements };
    });
    
    console.log("HTML analysis:", JSON.stringify(htmlInfo, null, 2));
    
    // The headings like "Test Cases" might be clickable page links
    // Let's check if clicking on them navigates to a subpage
    console.log("Checking if Test Cases heading is a link...");
    
    // Find the Test Cases block and check if it or its parent is a link
    const clickResult = await page.evaluate(() => {
      const blocks = Array.from(document.querySelectorAll('[data-block-id]'));
      for (const block of blocks) {
        const text = (block as HTMLElement).innerText?.trim();
        if (text === 'Test Cases') {
          // Check for any anchor inside
          const anchor = block.querySelector('a');
          if (anchor) {
            return { type: 'anchor', href: anchor.href };
          }
          
          // Check if block itself wraps a link
          const parent = block.parentElement;
          if (parent?.tagName === 'A') {
            return { type: 'parent-anchor', href: (parent as HTMLAnchorElement).href };
          }
          
          // Check for notion-link class
          const linkEl = block.querySelector('[class*="notion-link"], [class*="page-link"]');
          if (linkEl) {
            return { type: 'notion-link', className: linkEl.className };
          }
          
          // Return block info for debugging
          return { 
            type: 'block', 
            blockId: block.getAttribute('data-block-id'),
            className: block.className,
            hasOnClick: !!(block as any).onclick
          };
        }
      }
      return { type: 'not-found' };
    });
    
    console.log("Test Cases block analysis:", clickResult);
    
    // Try clicking on the Test Cases block to see if it's a link
    if (clickResult.type === 'block' && clickResult.blockId) {
      console.log("Attempting to click Test Cases block...");
      const blockId = clickResult.blockId;
      
      // Click using JavaScript
      const clicked = await page.evaluate((bid) => {
        const block = document.querySelector(`[data-block-id="${bid}"]`);
        if (block) {
          // First try finding a clickable element inside
          const clickableElements = block.querySelectorAll('a, [role="link"], [role="button"]');
          if (clickableElements.length > 0) {
            (clickableElements[0] as HTMLElement).click();
            return { clicked: true, method: 'child-element' };
          }
          
          // Try clicking the block itself
          (block as HTMLElement).click();
          return { clicked: true, method: 'block' };
        }
        return { clicked: false };
      }, blockId);
      
      console.log("Click result:", clicked);
      await page.waitForTimeout(3000);
      
      // Check if URL changed
      const urlAfterClick = page.url();
      console.log("URL after click:", urlAfterClick);
      
      // Take another screenshot
      await page.screenshot({ path: "tmp/notion-after-click.png", fullPage: true });
    }
    
    // Extract all visible content
    console.log("Extracting all visible content...");
    
    // Get the page content - use textContent for better content extraction
    console.log("Extracting content...");
    const content = await page.evaluate(() => {
      // Get the main Notion content area
      const notionPage = document.querySelector('.notion-page-content') || 
                         document.querySelector('[class*="notion-scroller"]') ||
                         document.querySelector('[class*="notion"]') ||
                         document.body;
      
      if (!notionPage) return { text: document.body?.innerText || "", html: "" };
      
      // Get all text blocks
      const blocks = Array.from(notionPage.querySelectorAll('[data-block-id], [class*="notion-text-block"], [class*="notion-header-block"], [class*="notion-sub_header-block"], [class*="notion-bulleted_list-block"], [class*="notion-numbered_list-block"], [class*="notion-toggle-block"], p, h1, h2, h3, li, div[contenteditable]'));
      
      const textParts: string[] = [];
      blocks.forEach(block => {
        const text = (block as HTMLElement).innerText?.trim();
        if (text && text.length > 0) {
          textParts.push(text);
        }
      });
      
      return { 
        text: notionPage.innerText || "",
        parts: textParts 
      };
    });
    
    console.log("\n=== FULL PAGE CONTENT ===\n");
    console.log(content.text);
    console.log("\n=== STRUCTURED PARTS ===\n");
    if (content.parts && content.parts.length > 0) {
      content.parts.forEach((part: string, i: number) => console.log(`[${i}] ${part}`));
    }
    
    // Find Test Cases section
    const lines = content.text.split('\n').filter((l: string) => l.trim());
    const testCasesIndex = lines.findIndex((line: string) => 
      line.toLowerCase().includes('test cases') && !line.toLowerCase().includes('other')
    );
    
    if (testCasesIndex !== -1) {
      console.log("\n\n=== TEST CASES SECTION (extracted) ===\n");
      // Get everything from Test Cases to end or next major section
      const testCasesContent = lines.slice(testCasesIndex);
      console.log(testCasesContent.join('\n'));
    }
    
    // Also take a screenshot for reference
    await page.screenshot({ path: "tmp/notion-page.png", fullPage: true });
    console.log("\nScreenshot saved to tmp/notion-page.png");
    
  } finally {
    await client.disconnect();
  }
}

fetchNotionTestCases().catch(console.error);

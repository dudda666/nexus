const fs = require('fs');

// 1. html
const htmlPath = '/Users/timofijfedosenko/Програми/site poster/index.html';
let htmlContent = fs.readFileSync(htmlPath, 'utf8');

const oldCatStr = '<div id="categories-container" style="margin: 0 20px 20px; display: flex; gap: 10px; overflow-x: auto; padding-bottom: 5px;">';
if(htmlContent.includes(oldCatStr)) {
    htmlContent = htmlContent.replace(oldCatStr, '<div id="categories-container" class="bottom-tab-bar">');
    fs.writeFileSync(htmlPath, htmlContent, 'utf8');
}

// 2. css
const cssPath = '/Users/timofijfedosenko/Програми/site poster/style.css';
let cssContent = fs.readFileSync(cssPath, 'utf8');

if (!cssContent.includes('.bottom-tab-bar')) {
    cssContent += `
/* Bottom Tab Bar (Categories) */
body {
    padding-bottom: 80px; /* Make space for bottom bar */
}

.bottom-tab-bar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    gap: 10px;
    overflow-x: auto;
    padding: 15px 20px;
    background: var(--card-bg);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    border-top: 1px solid var(--card-border);
    z-index: 1001; /* Keep above posts */
    scrollbar-width: none;
}
.bottom-tab-bar::-webkit-scrollbar {
    display: none;
}

/* Adjust scroll-to-top position so it doesn't overlap tab bar */
.scroll-to-top {
    bottom: 85px !important;
    z-index: 1000 !important;
}
`;
    // also make scroll-to-top robust
    cssContent = cssContent.replace('.scroll-to-top {', '.scroll-to-top {\n    z-index: 9999;');
    
    fs.writeFileSync(cssPath, cssContent, 'utf8');
    console.log("Categories fixed & CSS updated");
}

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const frontendDir = path.join(__dirname, 'frontend');

const translationMap = {
  'Coming Soon': 'قريباً',
  'Jump to audit trail': 'الانتقال لسجل التدقيق',
  'Jump to bids': 'الانتقال للعطاءات',
  'Jump to overview': 'الانتقال للنظرة العامة',
  'الانتقال للطلبات': 'الانتقال للطلبات'
};

let totalReplacements = 0;

function processDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
      processDirectory(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      processFile(fullPath);
    }
  }
}

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  const titleRegex = /title="([^"]+)"/g;
  
  content = content.replace(titleRegex, (match, titleVal) => {
    // Only process UI-visible static string tooltips (not Lit/Template literals right now, though we can safely replace those too if they match exactly)
    
    // Ignore dynamic titles that start with $
    if (titleVal.startsWith('$')) {
      return match;
    }
    
    // Ignore internal plugin/module names like "browser" or "nammerha-frontend" or "PostCSS"
    if (['browser', 'config ', 'nammerha-frontend', 'programmatic options', 'Load Options', 'Load Plugins', 'PostCSS'].includes(titleVal)) {
      return match;
    }
    
    // Ignore standard documentation titles
    if (titleVal.includes('logo by') || titleVal.includes('Documentation') || titleVal.includes('logo of')) {
      return match;
    }

    const translated = translationMap[titleVal] || titleVal;
    modified = true;
    totalReplacements++;
    return `aria-label="${translated}" data-tooltip="${translated}"`;
  });

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`[FIXED] ${path.relative(__dirname, filePath)}`);
  }
}

console.log('--- Starting Platinum Tooltip Transformation ---');
processDirectory(frontendDir);
console.log(`--- Finished. Replaced ${totalReplacements} native tooltips. ---`);

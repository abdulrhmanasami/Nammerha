const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'frontend');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

const SCRIPT_TAG = '<script type="module" src="/src/main.ts"></script>';

let modifiedCount = 0;

for (const file of files) {
  if (file === 'index.html') continue; // Already has it
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf-8');
  
  if (!content.includes(SCRIPT_TAG)) {
    // Insert right before </head>
    content = content.replace('</head>', `  ${SCRIPT_TAG}\n  </head>`);
    fs.writeFileSync(filePath, content);
    console.log(`Fixed ${file}`);
    modifiedCount++;
  }
}
console.log(`Modified ${modifiedCount} files.`);

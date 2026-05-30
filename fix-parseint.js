const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, 'backend', 'src', 'routes');
const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.ts'));

files.forEach(file => {
    const filePath = path.join(routesDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    // Pattern for: const limit = req.query.limit ? parseInt(...) : 50;
    const regex1 = /const\s+(\w+)\s*=\s*(?:req\.query\.?\w+|req\.query\[.*?\])\s*\?\s*parseInt\((req\.query\.?\w+|req\.query\[.*?\])\s*(?:as\s+string)?,\s*10\)\s*:\s*(\d+);/g;
    
    content = content.replace(regex1, (match, varName, reqParam, defaultVal) => {
        changed = true;
        return `const p_${varName} = parseInt(${reqParam} as string, 10);\n            const ${varName} = Number.isNaN(p_${varName}) ? ${defaultVal} : p_${varName};`;
    });

    // Pattern for: const limit = Math.min(req.query.limit ? parseInt(...) : 100, 500);
    const regex2 = /const\s+(\w+)\s*=\s*Math\.min\((?:req\.query\.?\w+|req\.query\[.*?\])\s*\?\s*parseInt\((req\.query\.?\w+|req\.query\[.*?\])\s*(?:as\s+string)?,\s*10\)\s*:\s*(\d+),\s*(\d+)\);/g;
    content = content.replace(regex2, (match, varName, reqParam, defaultVal, maxVal) => {
        changed = true;
        return `const p_${varName} = parseInt(${reqParam} as string, 10);\n            const ${varName} = Math.min(Number.isNaN(p_${varName}) ? ${defaultVal} : p_${varName}, ${maxVal});`;
    });
    
    // Pattern for: const offset = Math.max(req.query.offset ? parseInt(...) : 0, 0);
    const regex3 = /const\s+(\w+)\s*=\s*Math\.max\((?:req\.query\.?\w+|req\.query\[.*?\])\s*\?\s*parseInt\((req\.query\.?\w+|req\.query\[.*?\])\s*(?:as\s+string)?,\s*10\)\s*:\s*(\d+),\s*(\d+)\);/g;
    content = content.replace(regex3, (match, varName, reqParam, defaultVal, minVal) => {
        changed = true;
        return `const p_${varName} = parseInt(${reqParam} as string, 10);\n            const ${varName} = Math.max(Number.isNaN(p_${varName}) ? ${defaultVal} : p_${varName}, ${minVal});`;
    });

    // Pattern for: parseInt(String(req.query['limit'] ?? '50'), 10)
    // We will do a generic replacement if needed, but let's see what else there is.

    if (changed) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Fixed: ${file}`);
    }
});
console.log("Done");

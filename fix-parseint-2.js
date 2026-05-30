const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, 'backend', 'src', 'routes');
const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.ts'));

files.forEach(file => {
    const filePath = path.join(routesDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    // Pattern: parseInt(String(req.query['limit'] ?? '50'), 10)
    const regex1 = /const\s+(limit|offset)\s*=\s*Math\.(min|max)\(parseInt\(String\(req\.query\['(limit|offset)'\]\s*\?\?\s*'(\d+)'\),\s*10\),\s*(\d+)\);/g;
    content = content.replace(regex1, (match, varName, mathFunc, qParam, defVal, clampVal) => {
        changed = true;
        return `const p_${varName} = parseInt(String(req.query['${qParam}'] ?? '${defVal}'), 10);\n        const ${varName} = Math.${mathFunc}(Number.isNaN(p_${varName}) ? ${defVal} : p_${varName}, ${clampVal});`;
    });

    // Pattern: const limit = req.query['limit'] ? parseInt(String(req.query['limit']), 10) : undefined;
    const regex2 = /const\s+(limit|offset)\s*=\s*req\.query\['(limit|offset)'\]\s*\?\s*parseInt\(String\(req\.query\['(limit|offset)'\]\),\s*10\)\s*:\s*undefined;/g;
    content = content.replace(regex2, (match, varName, qParam1, qParam2) => {
        changed = true;
        return `const p_${varName} = req.query['${qParam1}'] ? parseInt(String(req.query['${qParam1}']), 10) : undefined;\n        const ${varName} = (p_${varName} === undefined || Number.isNaN(p_${varName})) ? undefined : p_${varName};`;
    });

    // Pattern: limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
    const regex3 = /(limit|offset):\s*req\.query\.(limit|offset)\s*\?\s*parseInt\(req\.query\.(limit|offset)\s*as\s+string,\s*10\)\s*:\s*(\d+),/g;
    content = content.replace(regex3, (match, varName, qParam1, qParam2, defVal) => {
        changed = true;
        return `${varName}: (function() { const p = parseInt(req.query.${qParam1} as string, 10); return Number.isNaN(p) ? ${defVal} : p; })(),`;
    });
    
    // Pattern: parseInt(req.query.max_distance_km as string, 10)
    const regex4 = /\?\s*parseInt\(req\.query\.max_distance_km\s*as\s+string,\s*10\)\s*:\s*(\d+)/g;
    content = content.replace(regex4, (match, defVal) => {
        changed = true;
        return `? (function() { const p = parseInt(req.query.max_distance_km as string, 10); return Number.isNaN(p) ? ${defVal} : p; })() : ${defVal}`;
    });

    if (changed) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Fixed: ${file}`);
    }
});
console.log("Done");

const fs = require('fs');
const path = require('path');

function isEnglishText(text) {
    const cleaned = text.replace(/<[^>]+>/g, ' ')
                       .replace(/&[a-z]+;/g, ' ')
                       .replace(/[0-9\W_]+/g, ' ')
                       .trim();
    return /[a-zA-Z]{4,}/.test(cleaned); // looking for words 4+ chars
}

const safeWords = new Set(['html', 'head', 'body', 'script', 'style', 'div', 'span', 'class', 'id', 'meta', 'link', 'href', 'src', 'alt', 'nammerha', 'phosphor', 'icons', 'vite', 'module', 'true', 'false', 'null', 'undefined', 'async', 'defer', 'charset', 'utf', 'viewport', 'content']);

function findEnglishInHTML(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (!fullPath.includes('node_modules') && !fullPath.includes('dist')) {
                findEnglishInHTML(fullPath);
            }
        } else if (fullPath.endsWith('.html')) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            
            // Remove scripts, styles, SVG
            const noScripts = content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                                     .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
                                     .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '');

            // Find text nodes (stuff between > and <)
            const matches = noScripts.match(/>([^<]+)</g);
            if (matches) {
                matches.forEach(m => {
                    const text = m.substring(1, m.length - 1).trim();
                    if (text.length > 3 && isEnglishText(text)) {
                        const words = text.match(/[a-zA-Z]+/g) || [];
                        const unknownWords = words.filter(w => !safeWords.has(w.toLowerCase()));
                        if (unknownWords.length > 0) {
                            console.log(`${fullPath}: Found -> "${text}" (words: ${unknownWords.join(', ')})`);
                        }
                    }
                });
            }
            
            // Check for missing RTL or hardcoded ltr
            if (content.includes('dir="ltr"')) {
                console.log(`${fullPath}: Found dir="ltr"! Should be RTL.`);
            }
            if (!content.includes('dir="rtl"')) {
                console.log(`${fullPath}: Missing dir="rtl" attribute!`);
            }
        }
    }
}

findEnglishInHTML('./frontend');

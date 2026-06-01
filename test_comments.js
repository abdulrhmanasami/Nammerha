const fs = require('fs');
const content = fs.readFileSync('frontend/project-details.html', 'utf-8');
const noComments = content.replace(/<!--[\s\S]*?-->/g, '');
const noScripts = noComments.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
                            .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '');
const matches = noScripts.match(/>([^<]+)</g);
if (matches) {
    matches.forEach(m => {
        const text = m.substring(1, m.length - 1).trim();
        if (text.length > 3 && /[a-zA-Z]{4,}/.test(text.replace(/&[a-z]+;/g, ' '))) {
            console.log(`Found english: ${text}`);
        }
    });
}

const fs = require('fs');
const path = require('path');

function processHtmlFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // Fix inputs: add dir="auto" to text-based inputs if not present
  content = content.replace(/<input([^>]*?)>/g, (match, p1) => {
    if (match.includes('dir="auto"')) return match;
    const typeMatch = match.match(/type="([^"]+)"/);
    const type = typeMatch ? typeMatch[1] : 'text'; // default is text
    const textTypes = ['text', 'email', 'tel', 'number', 'password', 'search', 'url'];
    if (textTypes.includes(type)) {
      return `<input${p1} dir="auto">`;
    }
    return match;
  });

  // Fix textareas: add dir="auto" if not present
  content = content.replace(/<textarea([^>]*?)>/g, (match, p1) => {
    if (match.includes('dir="auto"')) return match;
    return `<textarea${p1} dir="auto">`;
  });

  // Fix animate-pulse: add aria-hidden="true" if not present
  content = content.replace(/(<[^>]+\bclass="[^"]*\banimate-pulse\b[^"]*"[^>]*?)>/g, (match, p1) => {
    if (match.includes('aria-hidden="true"')) return match;
    // Don't add if it's a self-closing tag without space before >
    if (p1.endsWith('/')) {
        return `${p1.slice(0, -1)} aria-hidden="true" />`;
    }
    return `${p1} aria-hidden="true">`;
  });

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${path.basename(filePath)}`);
  }
}

function walkSync(currentDirPath, callback) {
  fs.readdirSync(currentDirPath).forEach(function (name) {
    var filePath = path.join(currentDirPath, name);
    var stat = fs.statSync(filePath);
    if (stat.isFile()) {
      if (filePath.endsWith('.html') && !filePath.includes('node_modules')) {
        callback(filePath);
      }
    } else if (stat.isDirectory()) {
      if (!filePath.includes('node_modules') && !filePath.includes('.git')) {
        walkSync(filePath, callback);
      }
    }
  });
}

walkSync('.', processHtmlFile);
console.log('Done processing HTML files.');

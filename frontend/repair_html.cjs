const fs = require('fs');
const path = require('path');

function processHtmlFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // Fix the malformed input tags
  content = content.replace(/\/\s*dir="auto">/g, 'dir="auto" />');

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Repaired ${path.basename(filePath)}`);
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
console.log('Done repairing HTML files.');

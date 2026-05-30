import os
import re

count = 0
for root, dirs, files in os.walk('/Users/abdulrahman/Github/Nammerha/frontend/src'):
    for file in files:
        if file.endswith(('.ts', '.js')):
            path = os.path.join(root, file)
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Find esc( or escapeHtml( followed by something that contains < and >
            matches = re.finditer(r'(?:esc|escapeHtml)\s*\(([^)]*<[^>]+>[^)]*)\)', content)
            for m in matches:
                print(f"Catastrophic UI Over-Escaping in {path}: {m.group(0).strip()[:100]}...")
                count += 1

print(f"Total over-escaping bugs: {count}")

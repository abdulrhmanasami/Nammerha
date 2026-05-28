import os
import re

count = 0
for root, dirs, files in os.walk('/Users/abdulrahman/Github/Nammerha/frontend/src'):
    for file in files:
        if file.endswith(('.ts', '.js')):
            path = os.path.join(root, file)
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Find innerHTML assignments
            matches = re.finditer(r'\.innerHTML\s*=\s*`([^`]*)`', content)
            for m in matches:
                template = m.group(1)
                # Find interpolations
                interpolations = re.findall(r'\$\{([^}]+)\}', template)
                for interp in interpolations:
                    # check if esc( is not in it, and it's not a simple map or function that returns safe HTML
                    if 'esc(' not in interp and 't(' not in interp and '.map' not in interp and 'render' not in interp:
                        print(f"Potential XSS in {path}: ${{{interp}}}")
                        count += 1
print(f"Total potential XSS: {count}")

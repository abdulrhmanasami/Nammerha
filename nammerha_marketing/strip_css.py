import re
import glob

def remove_css(file_path):
    with open(file_path, 'r') as f:
        content = f.read()
    
    # Remove @css block
    content = re.sub(r'\s*@css\s*static List<StyleRule> get styles => \[.*?\];\s*', '\n', content, flags=re.DOTALL)
    
    with open(file_path, 'w') as f:
        f.write(content)

for filepath in glob.glob('lib/**/*.dart', recursive=True):
    if 'main.server.dart' not in filepath:
        remove_css(filepath)

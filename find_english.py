import os
import re
from bs4 import BeautifulSoup

def is_english_text(text):
    # Strip whitespace and common punctuation/numbers
    text = re.sub(r'[\d\W_]+', '', text)
    # Check if there are any English characters
    if re.search(r'[a-zA-Z]', text):
        return True
    return False

def check_html_files(directory):
    for root, _, files in os.walk(directory):
        if 'node_modules' in root or 'dist' in root:
            continue
        for file in files:
            if file.endswith('.html'):
                path = os.path.join(root, file)
                with open(path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                soup = BeautifulSoup(content, 'html.parser')
                # Remove scripts and styles
                for script in soup(["script", "style", "svg"]):
                    script.extract()
                
                for element in soup.find_all(string=True):
                    text = element.strip()
                    if len(text) > 2 and is_english_text(text):
                        # Filter out common tags/attributes that bs4 might accidentally extract, or known safe English terms if any (like Nammerha)
                        if "{" in text or "}" in text: continue # probably inline JS or Vue/Alpine templates
                        print(f"{path}: Found English text -> {text[:100]}")

if __name__ == '__main__':
    check_html_files('./frontend')

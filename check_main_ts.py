import os
import glob

frontend_dir = "frontend"
html_files = glob.glob(f"{frontend_dir}/**/*.html", recursive=True)

missing_script = []

for file in html_files:
    if "node_modules" in file or "dist" in file:
        continue
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    if 'src="/src/main.ts"' not in content:
        missing_script.append(file)

if missing_script:
    print("Files missing main.ts:")
    for f in missing_script:
        print(f)
else:
    print("All HTML files correctly import main.ts")

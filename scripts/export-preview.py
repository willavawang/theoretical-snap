"""Export the mockup as one HTML file that opens without a local server."""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
html = (root / "dist/index.html").read_text()
for filename in ("styles.css", "akira.css", "results.css"):
    css = (root / "dist" / filename).read_text().removeprefix('@charset "UTF-8";')
    html = html.replace(f'<link rel="stylesheet" href="./{filename}">', "<style>\n" + css + "\n</style>")
scripts = []
for filename in ("analysis.js", "app.js"):
    scripts.append((root / "dist" / filename).read_text())
    html = html.replace(f'<script src="./{filename}" defer></script>', "")
html = html.replace("</body>", "<script>\n" + "\n".join(scripts) + "\n</script>\n</body>")
html = "\n".join(line.rstrip() for line in html.splitlines()) + "\n"
output = root / "theoretical-snap.html"
output.write_text(html)
print(output)

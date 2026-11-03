"""Export the mockup as one HTML file that opens without a local server."""
from pathlib import Path
from hashlib import sha256
import re

root = Path(__file__).resolve().parents[1]
index = root / "dist/index.html"
html = index.read_text()
# A published HTML page must load its own assets, even after a cached release.
for filename in ("styles.css", "akira.css", "results.css", "analysis.js", "app.js"):
    digest = sha256((root / "dist" / filename).read_bytes()).hexdigest()[:12]
    html = re.sub(
        rf'\./{re.escape(filename)}(?:\?v=[a-f0-9]+)?(?=")',
        f"./{filename}?v={digest}",
        html,
    )
index.write_text(html)
for filename in ("styles.css", "akira.css", "results.css"):
    css = (root / "dist" / filename).read_text().removeprefix('@charset "UTF-8";')
    html = re.sub(
        rf'<link rel="stylesheet" href="\./{re.escape(filename)}\?v=[a-f0-9]+">',
        lambda _: "<style>\n" + css + "\n</style>",
        html,
    )
scripts = []
for filename in ("analysis.js", "app.js"):
    scripts.append((root / "dist" / filename).read_text())
    html = re.sub(rf'<script src="\./{re.escape(filename)}\?v=[a-f0-9]+" defer></script>', "", html)
html = html.replace("</body>", "<script>\n" + "\n".join(scripts) + "\n</script>\n</body>")
html = "\n".join(line.rstrip() for line in html.splitlines()) + "\n"
output = root / "theoretical-snap.html"
output.write_text(html)
print(output)

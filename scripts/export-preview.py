"""Export the mockup as one HTML file that opens without a local server."""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
html = (root / "dist/index.html").read_text()
css = (root / "dist/styles.css").read_text().removeprefix('@charset "UTF-8";')
javascript = (root / "dist/app.js").read_text()
html = html.replace('<link rel="stylesheet" href="./styles.css">', "<style>\n" + css + "\n</style>")
html = html.replace('<script src="./app.js" defer></script>', "")
html = html.replace("</body>", "<script>\n" + javascript + "\n</script>\n</body>")
output = root / "theoretical-snap.html"
output.write_text(html)
print(output)

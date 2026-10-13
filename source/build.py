"""Builds the installable app (dist/) and a try-it-now preview page (preview/) from src/."""
import json, os, shutil
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC, PREV = os.path.join(ROOT, "src"), os.path.join(ROOT, "preview")
DIST = os.path.dirname(ROOT)  # the site lives at the top of the repo
css = open(os.path.join(SRC, "app.css")).read()
js = open(os.path.join(SRC, "presidency.js")).read() + "\n" + open(os.path.join(SRC, "app.js")).read()
VERSION = "2.5.0"

FONT = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap">'
BODY = '<div id="app"></div><div id="sheet-root"></div><div id="toast" class="toast" role="status" hidden></div>'

# Installable app: full document with manifest, icons and offline cache.
index = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Elders Quorum Notebook</title>
<meta name="description" content="Notes, class discussion and presidency tools for the elders quorum.">
<meta name="theme-color" content="#1F4D3A">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="EQ Notebook">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
{FONT}
<style>
:root {{ color-scheme: light; padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); }}
body {{ margin: 0; }}
[hidden] {{ display: none !important; }}
{css}
</style>
</head>
<body>
{BODY}
<script src="vendor/supabase.js"></script>
<script>
{js}
</script>
<script>
if ('serviceWorker' in navigator) {{ window.addEventListener('load', function () {{ navigator.serviceWorker.register('sw.js').catch(function () {{}}); }}); }}
</script>
</body>
</html>
"""

manifest = {
    "name": "Elders Quorum Notebook", "short_name": "EQ Notebook",
    "description": "Notes, class discussion and presidency tools for the elders quorum.",
    "start_url": "./", "scope": "./", "display": "standalone",
    "background_color": "#F4F5F2", "theme_color": "#1F4D3A",
    "icons": [
        {"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
        {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png"},
        {"src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
    ],
}

sw = f"""// Offline cache. Bump VERSION when you change the app so phones pick up the update.
const VERSION = 'sn-{VERSION}';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'vendor/supabase.js', 'icons/icon-192.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', e => {{ e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); }});
self.addEventListener('activate', e => {{ e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); }});
self.addEventListener('fetch', e => {{
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('supabase.co')) return; // live data: always from the network
  // The talk list and the page itself: try the network first so updates show up, fall back to the cache offline.
  if (url.pathname.endsWith('talks.json') || req.mode === 'navigate') {{
    e.respondWith(fetch(req).then(r => {{ const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return r; }}).catch(() => caches.match(req).then(r => r || caches.match('index.html'))));
    return;
  }}
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {{
    if (r.ok && (url.origin === location.origin || url.hostname.endsWith('gstatic.com') || url.hostname.endsWith('googleapis.com'))) {{ const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }}
    return r;
  }})));
}});
"""

talks = {
    "thisWeek": {"date": "", "title": "", "speaker": "", "url": "", "note": "", "questions": []},
    "conference": {"name": "October 2026 General Conference", "talks": []},
}


def icon(size, maskable=False):
    s = 4  # draw large, then scale down for smooth edges
    W = size * s
    img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    green = (31, 77, 58, 255)
    if maskable:
        d.rectangle([0, 0, W, W], fill=green)
        pad = W * 0.22
    else:
        d.rounded_rectangle([0, 0, W - 1, W - 1], radius=int(W * 0.22), fill=green)
        pad = W * 0.16
    # A notebook page
    x0, y0, x1, y1 = pad + W * 0.08, pad, W - pad - W * 0.08, W - pad
    d.rounded_rectangle([x0, y0, x1, y1], radius=int(W * 0.05), fill=(250, 251, 249, 255))
    # Four ink lines, one per pen color
    inks = [(28, 28, 28), (31, 95, 191), (192, 57, 43), (46, 125, 79)]
    lh = (y1 - y0) / 6
    for i, c in enumerate(inks):
        y = y0 + lh * (i + 1.25)
        x_end = x1 - (x1 - x0) * (0.18 if i % 2 == 0 else 0.34)
        d.rounded_rectangle([x0 + (x1 - x0) * 0.14, y, x_end, y + lh * 0.38], radius=int(lh * 0.19), fill=c + (255,))
    return img.resize((size, size), Image.LANCZOS)


def build():
    os.makedirs(os.path.join(DIST, "icons"), exist_ok=True)
    open(os.path.join(DIST, "index.html"), "w").write(index)
    json.dump(manifest, open(os.path.join(DIST, "manifest.webmanifest"), "w"), indent=2)
    open(os.path.join(DIST, "sw.js"), "w").write(sw)
    if not os.path.exists(os.path.join(DIST, "talks.json")):  # never overwrite the weekly talk
        json.dump(talks, open(os.path.join(DIST, "talks.json"), "w"), indent=2)
    shutil.copy(os.path.join(SRC, "README.md"), os.path.join(DIST, "README.md"))
    os.makedirs(os.path.join(DIST, "vendor"), exist_ok=True)
    shutil.copy(os.path.join(ROOT, "vendor", "supabase.js"), os.path.join(DIST, "vendor", "supabase.js"))
    icon(192).save(os.path.join(DIST, "icons/icon-192.png"))
    icon(512).save(os.path.join(DIST, "icons/icon-512.png"))
    icon(512, True).save(os.path.join(DIST, "icons/icon-maskable-512.png"))
    icon(180, True).convert("RGB").save(os.path.join(DIST, "icons/apple-touch-icon.png"))

    # Preview page for trying it in Claude (published as an artifact, which supplies its own document skeleton).
    os.makedirs(PREV, exist_ok=True)
    preview = f"<title>Elders Quorum Notebook</title>\n{FONT}\n<style>\n{css}\n</style>\n{BODY}\n<script>\n{js}\n</script>\n"
    open(os.path.join(PREV, "index.html"), "w").write(preview)
    json.dump(talks, open(os.path.join(PREV, "talks.json"), "w"), indent=2)


if __name__ == "__main__":
    build()
    print("rebuilt the site at the top of the repo")

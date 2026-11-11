"""Screenshots for the README and the landing page, taken from the running tool with a demo stack.

    python -X utf8 scripts/media/shoot.py [http://localhost:8765]

Needs `pip install playwright` + `playwright install chromium`, a running server with the archive, and
writes docs/media/{stack,help,parts,plates,colours,export,viewer}.jpg. Re-run after UI changes so the
pictures never lie about the version people download (same idea as lamina's scripts/media)."""
import os
import re
import sys
import time

from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765"
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "docs", "media")
SCALE = 1.5  # sharp enough to read on a phone when the pictures are shared in posts

LAYER = {  # every field the planner persists; the demo overrides what it names
    "type": "Drawers", "layout": "S", "height": 2, "facades": [[2]], "interior": "none",
    "key": "key", "labels": True, "rails": False, "manualSupports": False,
    "variant": "Flat", "baseplate": False, "dividers": False,
    "gridW": 1, "gridD": 1, "divW": 1, "divD": 2,
}
DEMO = {  # an L5 cart: drawers, two-bay drawers, a sustainer, grid roof, base + wheels + feet, wide backbone
    "name": "demo-cart", "depth": 5,
    "layers": [
        {**LAYER, "type": "Drawers", "layout": "L", "height": 2, "facades": [[1, 1]], "interior": "baseplate", "rails": True},
        {**LAYER, "type": "Sustainers", "layout": "L", "height": 1, "facades": [[1]], "variant": "Dividers"},
        {**LAYER, "type": "Drawers", "layout": "SS", "height": 2, "facades": [[2], [1, 1]], "key": "hidden"},
    ],
    "roof": {"type": "grid", "topHandle": True},
    "mods": {"base": True, "wheels": True, "feet": True, "backbone": "wide", "pullout": True, "wallmount": False, "pegboard": "none"},
}


def settled(page, timeout=120000):
    """Every visible <img> finished loading (help pictures render on first request); a broken
    picture counts as finished, and a timeout only costs that one screenshot its missing pictures."""
    try:
        page.wait_for_function("[...document.images].every(i => !i.src || i.complete || !i.getBoundingClientRect().height)", timeout=timeout)
    except Exception:
        print("warning: pictures still loading:", page.evaluate("[...document.images].filter(i => i.src && !i.complete && i.getBoundingClientRect().height).map(i => i.src).slice(0, 5)"))


def shot(page, name):
    settled(page)
    page.wait_for_timeout(1200)
    page.screenshot(path=os.path.join(OUT, name + ".jpg"), type="jpeg", quality=82)
    print("wrote", name)


def main():
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1500, "height": 950}, device_scale_factor=SCALE, color_scheme="light")
        page.goto(URL)
        page.get_by_role("heading", name="Compose your stack").wait_for(timeout=120000)
        # Seed the demo stack through the same localStorage state the app persists, then reload.
        page.evaluate("""(demo) => {
          const raw = localStorage.getItem('vault-configurator');
          const state = raw ? JSON.parse(raw) : {};
          state.stack = {...(state.stack || {}), ...demo};
          state.overrides = {};
          state.tab = 'stack';
          state.fitTarget = 'h2d-left';  // judge fit against the big bed, so the demo cart reads printable
          localStorage.setItem('vault-configurator', JSON.stringify(state));
          localStorage.setItem('vault-theme', 'light');
          location.reload();
        }""", DEMO)
        page.get_by_role("heading", name="Compose your stack").wait_for(timeout=120000)
        # The BOM landing is visible as the parts summary under the drawing.
        page.wait_for_function("document.body.innerText.includes('pieces')", timeout=240000)
        page.wait_for_timeout(4000)
        page.evaluate("window.scrollTo(0, 0)")
        shot(page, "stack")
        # Help: open the top layer's editor and ask for Lock help (manual page in the side column).
        page.get_by_role("button", name=re.compile(r"Edit .* drawer")).first.click()
        page.get_by_role("button", name="Help: Lock").click()
        page.wait_for_timeout(2500)
        # Taller viewport for this one shot: the sticky side column budgets the
        # drawing first, and the manual page in Help needs the extra height.
        page.set_viewport_size({"width": 1500, "height": 1400})
        page.wait_for_timeout(1200)
        shot(page, "help")
        page.set_viewport_size({"width": 1500, "height": 950})
        # Parts & colours: the colour card leads the page; printed parts follow.
        page.get_by_role("tab", name="2 Parts").click()
        page.get_by_role("heading", name="Parts & colours").wait_for(timeout=60000)
        page.wait_for_timeout(2000)
        page.evaluate("window.scrollTo(0, 0)")
        shot(page, "colours")
        # scrollIntoView directly: the heading peeking at the fold counts as
        # visible to scroll_into_view_if_needed and the shot would duplicate colours.
        page.get_by_role("heading", name="Printed parts").evaluate("e => e.scrollIntoView()")
        page.evaluate("window.scrollBy(0, -140)")
        page.wait_for_timeout(800)
        shot(page, "parts")
        # A cream box, not the first (charcoal) module: the viewer tints by
        # filament, and charcoal on the dark scene reads as a silhouette.
        page.get_by_role("button", name=re.compile(r"View .*Box.* in 3D")).first.click()
        page.get_by_role("dialog").wait_for(timeout=60000)
        time.sleep(12)  # three.js + a big STL
        shot(page, "viewer")
        page.keyboard.press("Escape")
        # Plates: the export card first, then the planned plates.
        page.get_by_role("tab", name="3 Plates").click()
        page.get_by_role("heading", name="Plates & export").wait_for(timeout=60000)
        page.wait_for_timeout(1500)
        page.evaluate("window.scrollTo(0, 0)")
        shot(page, "plates")
        page.get_by_role("button", name="Preview plates").click()
        page.wait_for_selector(".plate-card", timeout=240000)
        page.locator(".plate-card").first.scroll_into_view_if_needed()
        page.evaluate("window.scrollBy(0, -140)")  # keep the card below the sticky shell
        page.wait_for_timeout(800)
        shot(page, "export")
        browser.close()


if __name__ == "__main__":
    main()

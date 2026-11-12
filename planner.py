"""Local project handoff. Opens only a file this process just exported, and only in a named slicer.

The page can always download the 3MF. Opening Bambu Studio or OrcaSlicer is a convenience for the
computer that is actually running this server. Fit choices live in stackfit.py.
"""
import os
import urllib.parse

ALLOWED_APPS = {"bambu": "Bambu Studio", "orca": "OrcaSlicer"}


class HandoffError(PermissionError):
    """The request must not launch a program or touch the path it named."""


def under_output(path, output_root):
    real = os.path.realpath(path)
    root = os.path.realpath(output_root)
    try:
        return os.path.commonpath([root, real]) == root, real
    except ValueError:
        return False, real


def remember_export(path, exported, output_root):
    """Record one file the server wrote. Returns its real path. Refuses anything outside output/."""
    ok, real = under_output(path, output_root)
    if not ok or not os.path.isfile(real):
        raise HandoffError("refusing to publish a file outside the export folder")
    exported[os.path.basename(real)] = real
    return real


def origin_allows_handoff(origin, host_header):
    """A browser page on another site must not call the local handoff endpoint.

    Missing Origin is allowed so same-machine tools and tests can call it. A present Origin
    must be loopback, and the Host the browser used must be loopback too.
    """
    if not origin:
        return True
    parsed = urllib.parse.urlparse(origin)
    if parsed.scheme not in ("http", "https") or parsed.username or parsed.password:
        return False
    if parsed.hostname not in ("127.0.0.1", "localhost", "::1"):
        return False
    page_host = (host_header or "").split(":")[0].strip("[]")
    return not page_host or page_host in ("127.0.0.1", "localhost", "::1")


def plan_handoff(app, filename, *, platform, loopback, origin_ok, exported, output_root):
    """Decide how to open one exported file. Does not launch anything.

    app is 'bambu', 'orca' or 'folder'. filename is a basename, never a path.
    """
    if not loopback or not origin_ok:
        raise HandoffError("Slicer handoff only runs for a page opened on this computer. Download the 3MF instead.")
    if platform not in ("darwin", "win32"):
        raise HandoffError("This system cannot open Bambu Studio or OrcaSlicer for you. Download the 3MF and open it yourself.")
    name = str(filename or "")
    if not name or name != os.path.basename(name) or name in (".", ".."):
        raise HandoffError("Handoff accepts only a file this planner just exported.")
    if app not in ALLOWED_APPS and app != "folder":
        raise HandoffError("Unknown app. Choose Bambu Studio, OrcaSlicer, or the export folder.")
    path = exported.get(name)
    if not path:
        raise HandoffError("That file is not from an export this planner just wrote.")
    ok, real = under_output(path, output_root)
    if not ok or not os.path.isfile(real) or os.path.basename(real) != name:
        raise HandoffError("Refusing a path outside the export folder.")
    folder = os.path.dirname(real)
    if platform == "darwin":
        if app == "folder":
            return {"action": "argv", "argv": ["open", folder], "label": "Finder"}
        return {"action": "argv", "argv": ["open", "-a", ALLOWED_APPS[app], real], "label": ALLOWED_APPS[app]}
    if app == "folder":
        return {"action": "argv", "argv": ["explorer", folder], "label": "Explorer"}
    # Windows opens the 3MF with whatever app owns that extension. The path is still one we wrote.
    return {"action": "startfile", "path": real, "label": "the app associated with .3mf"}

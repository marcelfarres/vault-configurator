"""Build id = short hash of the files the app actually runs, so a client can tell which version a server runs
(e.g. after a NAS redeploy) without tags or build arguments. An explicit list, so stray files in a working
copy don't change it; line endings are normalised, so a Windows copy and a Linux image of the same commit agree."""
import hashlib
import os

FILES = ["assets_bootstrap.py", "catalog.py", "h2d_split.py", "mesh.py", "plates.py", "planner.py", "planner.mjs", "presets.py", "server.py", "stackfit.py", "version.py",
         "index.html", "site_print_data.json"]


def build_id(app_dir):
    h = hashlib.sha1()
    for name in FILES:
        path = os.path.join(app_dir, name)
        if os.path.isfile(path):
            h.update(name.encode())
            with open(path, "rb") as fh:
                h.update(fh.read().replace(b"\r\n", b"\n"))
    return h.hexdigest()[:10]


if __name__ == "__main__":
    print(build_id(os.path.dirname(os.path.abspath(__file__))))

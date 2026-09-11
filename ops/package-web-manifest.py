"""Record the Linux standalone artifact without embedding environment secrets."""
import datetime
import hashlib
import json
import pathlib
import platform
import subprocess
import sys

root = pathlib.Path(sys.argv[1])
files = {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
         for p in sorted(root.rglob("*")) if p.is_file() and p.name != "web-manifest.json"}
manifest = {
    "gitSha": subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip(),
    "node": subprocess.check_output(["node", "--version"], text=True).strip(),
    "os": platform.system(), "architecture": platform.machine(),
    "builtAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "files": files,
}
assert manifest["os"] == "Linux" and manifest["architecture"] == "x86_64"
assert (root / "server.js").is_file()
assert (root / ".next/static").is_dir() and (root / "public/fonts").is_dir()
(root / "web-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")

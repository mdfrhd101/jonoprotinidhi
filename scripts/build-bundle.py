"""Build HANDOFF_BUNDLE.md: the whole handoff kit in one file, for upload to a claude.ai Project.

usage (from the repo root):  python scripts/build-bundle.py
Order: CLAUDE.md, KICKOFF_PROMPT.md, HANDOFF.md, docs/00..08, adr/*.md, demo file map.
Excludes code and images. Fails if a listed file is missing so the bundle is never silently partial.
"""
import datetime
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "HANDOFF_BUNDLE.md"

ordered = ["CLAUDE.md", "KICKOFF_PROMPT.md", "HANDOFF.md"]
ordered += sorted(str(p.relative_to(ROOT)).replace("\\", "/") for p in (ROOT / "docs").glob("0*.md"))
ordered += sorted(str(p.relative_to(ROOT)).replace("\\", "/") for p in (ROOT / "adr").glob("*.md"))

missing = [f for f in ordered if not (ROOT / f).exists()]
if missing:
    sys.exit("Missing files: " + ", ".join(missing))

demo_files = sorted(
    str(p.relative_to(ROOT)).replace("\\", "/")
    for p in (ROOT / "client-demo").rglob("*")
    if p.is_file() and p.suffix in {".html", ".js", ".css", ".md"} and "_archive" not in p.parts
)

parts = [
    "# Jonoprotinidhi (জনপ্রতিনিধি) — Handoff bundle\n",
    f"Generated {datetime.date.today().isoformat()} by scripts/build-bundle.py. "
    "Upload this single file to a claude.ai Project as knowledge, then use section 2 of KICKOFF_PROMPT.md.\n",
    "Contents: " + ", ".join(ordered) + ".\n",
    "The runnable demos live in `client-demo/` (not included here, only listed at the end). "
    "They are the visual and UX spec: fetch them from the repository.\n",
]
for f in ordered:
    text = (ROOT / f).read_text(encoding="utf-8").strip()
    parts.append(f"\n\n{'=' * 78}\n<!-- FILE: {f} -->\n{'=' * 78}\n\n{text}\n")
parts.append(f"\n\n{'=' * 78}\n<!-- FILE MAP: client-demo -->\n{'=' * 78}\n\n" + "\n".join(f"- {f}" for f in demo_files) + "\n")

with OUT.open("w", encoding="utf-8", newline="\n") as fh:  # Path.write_text(newline=) needs Python 3.10; macOS ships 3.9
    fh.write("".join(parts))
size = OUT.stat().st_size
print(f"wrote {OUT.name}: {len(ordered)} files, {size / 1024:.0f} KB (~{size // 4:,} tokens)")

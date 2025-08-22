# app.py
import os
from pathlib import Path
from flask import Flask, render_template, request, jsonify, abort

app = Flask(__name__)

# 小説のルート（例: novel/）。環境変数 NOVEL_ROOT で切替可。
ROOT_DIR = Path(os.environ.get("NOVEL_ROOT", Path.cwd() / "novel")).resolve()

STAGES = [
    ("10.plot.md",   "Plot（プロット）"),
    ("20.script.md", "Script（台本）"),
    ("30.draft.md",  "Draft（暫定）"),
    ("40.final.md",  "Final（完成）"),
]

def safe_join(base: Path, relative: str) -> Path:
    # chapter_path（series-xx/vol-xx/CHxx-yyy）を安全に結合
    target = (base / relative).resolve()
    if not str(target).startswith(str(base)):
        abort(400, description="Invalid path")
    return target

def iter_structure():
    """series → vol → chapter の3階層を探索して返す"""
    if not ROOT_DIR.exists():
        return []
    series_list = []
    for series in sorted([p for p in ROOT_DIR.iterdir() if p.is_dir() and p.name.startswith("series-")]):
        vols = []
        for vol in sorted([v for v in series.iterdir() if v.is_dir() and v.name.startswith("vol-")]):
            chapters = []
            for ch in sorted([c for c in vol.iterdir() if c.is_dir() and c.name.startswith("CH")]):
                chapters.append({
                    "name": ch.name,
                    "relpath": str(ch.relative_to(ROOT_DIR)).replace("\\", "/"),
                })
            vols.append({"name": vol.name, "chapters": chapters})
        series_list.append({"name": series.name, "volumes": vols})
    return series_list

@app.route("/")
def index():
    data = iter_structure()
    return render_template("index.html", data=data, root=str(ROOT_DIR))

@app.route("/chapter/<path:chapter_path>")
def chapter(chapter_path):
    ch_dir = safe_join(ROOT_DIR, chapter_path)
    if not ch_dir.exists() or not ch_dir.is_dir():
        abort(404, description="Chapter not found")

    files = []
    for filename, label in STAGES:
        p = ch_dir / filename
        text = p.read_text(encoding="utf-8") if p.exists() else ""
        files.append({
            "filename": filename,
            "label": label,
            "content": text,
        })

    notes_path = ch_dir / "notes.md"
    notes = notes_path.read_text(encoding="utf-8") if notes_path.exists() else ""

    return render_template(
        "chapter.html",
        chapter_name=ch_dir.name,
        chapter_path=chapter_path,
        files=files,
        notes=notes
    )

@app.post("/api/save")
def api_save():
    data = request.get_json(force=True, silent=False)
    chapter_path = data.get("chapter_path")
    filename = data.get("filename")
    content = data.get("content", "")

    if not chapter_path or not filename:
        abort(400, description="chapter_path and filename are required")

    # 4ステージ+notes.md のみ許容
    allowed = {f for f, _ in STAGES} | {"notes.md"}
    if filename not in allowed:
        abort(400, description="filename not allowed")

    ch_dir = safe_join(ROOT_DIR, chapter_path)
    ch_dir.mkdir(parents=True, exist_ok=True)

    target = ch_dir / filename
    target.write_text(content, encoding="utf-8")
    return jsonify({"ok": True, "path": str(target)})

if __name__ == "__main__":
    ROOT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"* NOVEL_ROOT: {ROOT_DIR}")
    app.run(debug=True)

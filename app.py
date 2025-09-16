# app.py
import os
import re
from pathlib import Path
from flask import Flask, render_template, request, jsonify, abort, url_for
from werkzeug.middleware.proxy_fix import ProxyFix

app = Flask(__name__, static_folder="static", static_url_path="/static")
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1, x_prefix=1)  # ★ x_prefix=1

# 小説のルート（例: novel/）。環境変数 NOVEL_ROOT で切替可。
ROOT_DIR = Path(os.environ.get("NOVEL_ROOT", Path.cwd() / "novel")).resolve()

STAGES = [
    ("10.plot.md",   "Plot（プロット）"),
    ("20.script.md", "Script（台本）"),
    ("30.draft.md",  "Draft（暫定）"),
    ("40.final.md",  "Final（完成）"),
]

VOL_STAGES = [
    ("10.plot.md",   "Concept Plot"),
    ("15.sugar.md", "Highlight Plot"),
    ("20.script.md", "Character Plot"),
    ("30.draft.md",  "Draft Plot"),
    ("40.final.md",  "Final Plot"),
]

OUTLINE_DIRNAME = "_outline"

def get_outline_dir(volume_relpath: str) -> Path:
    vol_dir = safe_join(ROOT_DIR, volume_relpath)
    return vol_dir / OUTLINE_DIRNAME

def safe_join(base: Path, relative: str) -> Path:
    # chapter_path（series-xx/vol-xx/CHxx-yyy）を安全に結合
    target = (base / relative).resolve()
    if not str(target).startswith(str(base)):
        abort(400, description="Invalid path")
    return target

def read_title(dir_path: Path) -> str | None:
    """
    ディレクトリ内の title ファイルからタイトルを読み取る。
    - 優先: title.txt > title.md > .title
    - 先頭行のみ利用。Markdown の # 見出しがあれば除去。
    """
    for name in ("title.txt", "title.md", ".title"):
        p = dir_path / name
        if p.exists() and p.is_file():
            text = p.read_text(encoding="utf-8", errors="ignore").strip()
            if not text:
                return None
            first = text.splitlines()[0].strip()
            first = re.sub(r"^\s*#+\s*", "", first)  # 先頭 # を除去
            return first or None
    return None
def iter_structure():
    if not ROOT_DIR.exists():
        return []
    series_list = []
    for series in sorted([p for p in ROOT_DIR.iterdir() if p.is_dir() and p.name.startswith("series-")]):
        s_title = read_title(series)
        vols = []
        for vol in sorted([v for v in series.iterdir() if v.is_dir() and v.name.startswith("vol-")]):
            v_title = read_title(vol)
            # 章
            chapters = []
            for ch in sorted([c for c in vol.iterdir() if c.is_dir() and c.name.startswith("CH")]):
                c_title = read_title(ch)
                chapters.append({
                    "name": ch.name,
                    "title": c_title,
                    "relpath": str(ch.relative_to(ROOT_DIR)).replace("\\", "/"),
                })
            # ★ アウトライン
            outline_dir = vol / OUTLINE_DIRNAME
            outline_exists = outline_dir.is_dir()
            outline_rel = str(outline_dir.relative_to(ROOT_DIR)).replace("\\", "/") if outline_exists else None
            outline_title = read_title(outline_dir) if outline_exists else None

            vols.append({
                "name": vol.name,
                "title": v_title,
                "relpath": str(vol.relative_to(ROOT_DIR)).replace("\\", "/"),
                "next_ch": compute_next_ch_name(vol),
                "chapters": chapters,
                "outline": {
                    "exists": outline_exists,
                    "relpath": outline_rel,
                    "title": outline_title,
                }
            })
        series_list.append({
            "name": series.name,
            "title": s_title,
            "relpath": str(series.relative_to(ROOT_DIR)).replace("\\", "/"),
            "volumes": vols
        })
    return series_list

def get_chapter_neighbors(chapter_path: str):
    ch_dir = safe_join(ROOT_DIR, chapter_path)
    if not ch_dir.exists() or not ch_dir.is_dir():
        abort(404, description="Chapter not found")
    vol_dir = ch_dir.parent
    # vol 内の CH* ディレクトリをソート
    chapters = sorted([c for c in vol_dir.iterdir() if c.is_dir() and c.name.startswith("CH")])
    if not chapters:
        return chapter_path, chapter_path
    try:
        idx = [c.name for c in chapters].index(ch_dir.name)
    except ValueError:
        abort(404, description="Chapter not indexed")
    prev_idx = (idx - 1) % len(chapters)
    next_idx = (idx + 1) % len(chapters)
    prev_rel = str(chapters[prev_idx].relative_to(ROOT_DIR)).replace("\\", "/")
    next_rel = str(chapters[next_idx].relative_to(ROOT_DIR)).replace("\\", "/")
    return prev_rel, next_rel

CH_NUM_RE = re.compile(r"^CH(\d{2})")

def compute_next_ch_name(vol_dir: Path) -> str | None:
    """volディレクトリ内の既存CHを見て、未使用の最小番号(01..99)を返す。満杯ならNone。"""
    taken = set()
    if not vol_dir.exists():
        return "CH01"
    for c in vol_dir.iterdir():
        if c.is_dir() and c.name.startswith("CH"):
            m = CH_NUM_RE.match(c.name)
            if m:
                taken.add(int(m.group(1)))
    for i in range(1, 100):  # 01..99
        if i not in taken:
            return f"CH{i:02d}"
    return None

def create_chapter_under_volume(volume_relpath: str) -> Path:
    """指定volume配下に新規CHxxを作成し、4ステージ＋notes.mdを空で作る。"""
    vol_dir = safe_join(ROOT_DIR, volume_relpath)
    if not vol_dir.exists() or not vol_dir.is_dir():
        abort(400, description="volume not found")

    next_name = compute_next_ch_name(vol_dir)
    if not next_name:
        abort(400, description="この巻はCH99まで埋まっています")

    ch_dir = vol_dir / next_name
    if ch_dir.exists():
        abort(409, description="chapter already exists")

    ch_dir.mkdir(parents=True, exist_ok=False)
    # 空のステージファイルを作成
    for filename, _label in STAGES:
        (ch_dir / filename).write_text("", encoding="utf-8")
    (ch_dir / "notes.md").write_text("", encoding="utf-8")
    return ch_dir

@app.route("/")
def index():
    data = iter_structure()
    return render_template("index.html", data=data, root=str(ROOT_DIR))

@app.post("/api/create_outline")
def api_create_outline():
    data = request.get_json(force=True, silent=False)
    volume_path = data.get("volume_path")
    if not volume_path:
        abort(400, description="volume_path is required")

    vol_dir = safe_join(ROOT_DIR, volume_path)
    if not vol_dir.exists() or not vol_dir.is_dir():
        abort(404, description="Volume not found")

    outline_dir = vol_dir / OUTLINE_DIRNAME
    if outline_dir.exists():
        abort(409, description="Already exists")

    outline_dir.mkdir(parents=True, exist_ok=False)
    # 4ステージ＋notes、title
    for filename, _label in VOL_STAGES:
        (outline_dir / filename).write_text("", encoding="utf-8")
    (outline_dir / "notes.md").write_text("", encoding="utf-8")
    (outline_dir / "title.txt").write_text("全体プロット\n", encoding="utf-8")

    rel = str(outline_dir.relative_to(ROOT_DIR)).replace("\\", "/")
    return jsonify({
        "ok": True,
        "outline_relpath": rel,
        "list_url": url_for("v_outline", volume_path=volume_path),
        "single_url": url_for("v_outline_single", volume_path=volume_path),
        "fullscreen_url": url_for("v_outline_fullscreen", volume_path=volume_path)
    })

@app.route("/volume/<path:volume_path>/outline")
def v_outline(volume_path):
    outline_dir = get_outline_dir(volume_path)
    if not outline_dir.exists() or not outline_dir.is_dir():
        abort(404, description="Outline not found")

    files = []
    for filename, label in VOL_STAGES:
        p = outline_dir / filename
        files.append({
            "filename": filename,
            "label": label,
            "content": p.read_text(encoding="utf-8") if p.exists() else "",
        })
    notes_path = outline_dir / "notes.md"
    notes = notes_path.read_text(encoding="utf-8") if notes_path.exists() else ""
    vol_title = read_title(outline_dir.parent)

    return render_template(
        "v_outline.html",
        volume_path=volume_path,
        outline_path=str(outline_dir.relative_to(ROOT_DIR)).replace("\\", "/"),
        volume_name=outline_dir.parent.name,
        volume_title=vol_title,
        files=files,
        notes=notes,
    )

@app.route("/volume/<path:volume_path>/outline/single")
def v_outline_single(volume_path):
    outline_dir = get_outline_dir(volume_path)
    if not outline_dir.exists() or not outline_dir.is_dir():
        abort(404, description="Outline not found")

    stage_files = [f for f, _ in VOL_STAGES]
    stage = request.args.get("stage")
    if stage not in stage_files:
        stage = stage_files[0]

    label = dict(VOL_STAGES)[stage]
    p = outline_dir / stage
    content = p.read_text(encoding="utf-8") if p.exists() else ""
    idx = stage_files.index(stage)
    prev_stage = stage_files[(idx - 1) % len(stage_files)]
    next_stage = stage_files[(idx + 1) % len(stage_files)]
    vol_title = read_title(outline_dir.parent)

    return render_template(
        "v_outline_single.html",
        volume_path=volume_path,
        outline_path=str(outline_dir.relative_to(ROOT_DIR)).replace("\\", "/"),
        volume_name=outline_dir.parent.name,
        volume_title=vol_title,
        filename=stage,
        label=label,
        content=content,
        prev_stage=prev_stage,
        next_stage=next_stage,
    )

@app.route("/volume/<path:volume_path>/outline/fullscreen")
def v_outline_fullscreen(volume_path):
    outline_dir = get_outline_dir(volume_path)
    if not outline_dir.exists() or not outline_dir.is_dir():
        abort(404, description="Outline not found")

    stage_files = [f for f, _ in VOL_STAGES]
    stage = request.args.get("stage")
    if stage not in stage_files:
        stage = stage_files[0]

    label = dict(VOL_STAGES)[stage]
    p = outline_dir / stage
    content = p.read_text(encoding="utf-8") if p.exists() else ""
    vol_title = read_title(outline_dir.parent)

    # 章の上下ナビは無し → 空文字を渡す
    return render_template(
        "v_outline_fullscreen.html",
        volume_path=volume_path,
        outline_path=str(outline_dir.relative_to(ROOT_DIR)).replace("\\", "/"),
        volume_name=outline_dir.parent.name,
        volume_title=vol_title,
        filename=stage,
        label=label,
        content=content,
        prev_chapter="", next_chapter=""
    )

@app.post("/api/create_chapter")
def api_create_chapter():
    data = request.get_json(force=True, silent=False)
    volume_path = data.get("volume_path")
    if not volume_path:
        abort(400, description="volume_path is required")

    ch_dir = create_chapter_under_volume(volume_path)
    relpath = str(ch_dir.relative_to(ROOT_DIR)).replace("\\", "/")

    return jsonify({
        "ok": True,
        "chapter_name": ch_dir.name,
        "chapter_relpath": relpath,
        "chapter_url": url_for("chapter", chapter_path=relpath),
        "single_url": url_for("chapter_single", chapter_path=relpath)  # stageはデフォ(10.plot.md)
    })

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

    prev_chapter, next_chapter = get_chapter_neighbors(chapter_path)

    return render_template(
        "chapter.html",
        chapter_name=ch_dir.name,
        chapter_path=chapter_path,
        files=files,
        notes=notes,
        prev_chapter=prev_chapter, 
        next_chapter=next_chapter 
    )

@app.route("/chapter/<path:chapter_path>/single")
def chapter_single(chapter_path):
    ch_dir = safe_join(ROOT_DIR, chapter_path)
    if not ch_dir.exists() or not ch_dir.is_dir():
        abort(404, description="Chapter not found")

    stage_files = [f for f, _ in STAGES]
    stage = request.args.get("stage")
    if stage not in stage_files:
        stage = stage_files[0]

    idx = stage_files.index(stage)
    label = dict(STAGES)[stage]
    p = ch_dir / stage
    content = p.read_text(encoding="utf-8") if p.exists() else ""

    prev_idx = (idx - 1) % len(stage_files)
    next_idx = (idx + 1) % len(stage_files)
    prev_stage = stage_files[prev_idx]
    next_stage = stage_files[next_idx]

    # 章の上下ナビ
    prev_ch, next_ch = get_chapter_neighbors(chapter_path)

    return render_template(
        "single.html",
        chapter_name=ch_dir.name,
        chapter_path=chapter_path,
        filename=stage,
        label=label,
        content=content,
        prev_stage=prev_stage,
        next_stage=next_stage,
        prev_chapter=prev_ch,
        next_chapter=next_ch,
    )

@app.route("/chapter/<path:chapter_path>/fullscreen")
def chapter_fullscreen(chapter_path):
    ch_dir = safe_join(ROOT_DIR, chapter_path)
    if not ch_dir.exists() or not ch_dir.is_dir():
        abort(404, description="Chapter not found")

    stage_files = [f for f, _ in STAGES]
    stage = request.args.get("stage")
    if stage not in stage_files:
        stage = stage_files[0]

    label = dict(STAGES)[stage]
    p = ch_dir / stage
    content = p.read_text(encoding="utf-8") if p.exists() else ""

    # 章の上下ナビ（キーボード移動用に渡す）
    prev_ch, next_ch = get_chapter_neighbors(chapter_path)

    return render_template(
        "fullscreen.html",
        chapter_name=ch_dir.name,
        chapter_path=chapter_path,
        filename=stage,
        label=label,
        content=content,
        prev_chapter=prev_ch,
        next_chapter=next_ch,
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
    allowed = {f for f, _ in STAGES} | {f for f, _ in VOL_STAGES} | {"notes.md"}
    if filename not in allowed:
        abort(400, description="filename not allowed")

    ch_dir = safe_join(ROOT_DIR, chapter_path)
    ch_dir.mkdir(parents=True, exist_ok=True)

    target = ch_dir / filename
    target.write_text(content, encoding="utf-8")
    return jsonify({"ok": True, "path": str(target)})

@app.post("/api/set_title")
def api_set_title():
    data = request.get_json(force=True, silent=False)
    rel_path = data.get("path")     # series-xx / .../vol-xx / .../CHxx-...
    title = (data.get("title") or "").strip()

    if not rel_path:
        abort(400, description="path is required")

    target_dir = safe_join(ROOT_DIR, rel_path)
    if not target_dir.exists() or not target_dir.is_dir():
        abort(404, description="target directory not found")

    title_txt = target_dir / "title.txt"
    # 空なら既存のタイトルファイルを削除
    if title == "":
        for name in ("title.txt", "title.md", ".title"):
            p = target_dir / name
            if p.exists():
                try: p.unlink()
                except Exception: pass
        return jsonify({"ok": True, "title": None})

    # 1行目だけ保存（末尾改行付与）
    title_txt.write_text(title + "\n", encoding="utf-8")
    return jsonify({"ok": True, "title": title})

if __name__ == "__main__":
    ROOT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"* NOVEL_ROOT: {ROOT_DIR}")
    app.run(host="0.0.0.0", port=8001, debug=False)

# 小説フォルダのルート（例）を環境変数で指定
export NOVEL_ROOT=/home/eletim/novel/novel_builder/data
# サーバ起動
python3 app.py




├── series-01-[slug]/           # シリーズ/サブタイトルごとに分割してもOK
│   ├── vol-01-[arc-slug]/      # 巻（または章群＝アーク）
│   │   ├── CH01-[chapter-slug]/
│   │   │   ├── 10.plot.md
│   │   │   ├── 20.script.md
│   │   │   ├── 30.draft.md
│   │   │   ├── 40.final.md
│   │   │   └── notes.md        # 章専用メモ（調査メモ/TODO）
│   │   ├── CH02-[chapter-slug]/
│   │   │   ├── 10.plot.md
│   │   │   ├── 20.script.md
│   │   │   ├── 30.draft.md
│   │   │   ├── 40.final.md
│   │   │   └── notes.md
│   │   └── ...（続く）
│   └── vol-02-[arc-slug]/ ...


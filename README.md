# 小説フォルダのルート（例）を環境変数で指定
export NOVEL_ROOT=/home/eletim/novel/novel_builder/data
# サーバ起動
python3 app.py



Vol
・コンセプト＋大枠プロット
・メインキャラクター＋サブコンセプト
・シュガーシーン＋ドラフトプロット
・完成プロット

CH
・プロット
・台本
・下書き
・完成


├── series-01-[slug]/           # シリーズ/サブタイトルごとに分割してもOK
│   ├── vol-01-[arc-slug]/      # 巻（または章群＝アーク）
│   │   ├── CH01/
│   │   │   ├── 10.plot.md
│   │   │   ├── 20.script.md
│   │   │   ├── 30.draft.md
│   │   │   ├── 40.final.md
│   │   │   └── notes.md        # 章専用メモ（調査メモ/TODO）
│   │   ├── CH02/
│   │   │   ├── 10.plot.md
│   │   │   ├── 20.script.md
│   │   │   ├── 30.draft.md
│   │   │   ├── 40.final.md
│   │   │   └── notes.md
│   │   └── ...（続く）
│   └── vol-02-[arc-slug]/ ...


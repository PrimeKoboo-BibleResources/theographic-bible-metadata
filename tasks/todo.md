# グラフビューア実装計画（Phase1 / 20261027）

- ブランチ: `feature/graph-viewer`（develop から）
- 置き場所: `viewer/`
- 方針: 静的SPA（TypeScript + Vite + Cytoscape.js）、ソースには初学者向けの日本語コメントを十分に付与する
- データ源: `json/modified2/`（`api/` は無視）
- 日本語名: 追加しない

## 環境制約（本番 = AlmaLinux 8.10）
- Node 24.14.1 / yarn 1.22.22 / Apache 2.4.37 / Python 3.6.8
- Python 前処理は 3.6 互換で書く（walrus・`dict | dict`・`list[str]` 型注釈・`from __future__ import annotations` は使わない）

## ステップ
- [ ] 1. `viewer/` を Vite(vanilla-ts) で雛形作成、`yarn` で依存導入（cytoscape）
- [ ] 2. 前処理 `etl/build_viewer_data.py`（Python 3.6互換）
  - [ ] 2a. 軽量インデックス `index.json`（id, 種別, 表示名のみ。people/places/verses 検索用）
  - [ ] 2b. ノード詳細の分割JSON（種別ごと、verses は book 単位などチャンク化）
  - [ ] 2c. 関係定義表 `relations.json`（father↔children, partners↔partners 等の正逆ラベル）
- [ ] 3. 型定義とデータ取得層（`types.ts`, `data.ts`）
- [ ] 4. 検索UI（people / places / verses のみ）
- [ ] 5. グラフ描画（8種のノード形状・色、選択ノード視点でのエッジラベル切替、辿る＝隣接展開）
- [ ] 6. 詳細パネル／テーブル切替（全プロパティ表示、verses は展開ボタンで任意追加）
- [ ] 7. 検証：Abraham/Terah で `Terah is Father` ↔ `Abraham is Child` の切替、`yarn build` 成功、ブラウザ動作確認
- [ ] 8. Apache 設定例（VirtualHost 443、`mod_deflate`、SPA用の静的配信）を docs に記載
- [ ] 9. 作業記録を `memo/Answers/Phase1/` に出力

## レビュー
（実装後に記入）

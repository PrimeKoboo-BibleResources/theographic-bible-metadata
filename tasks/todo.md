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
- [x] 1. `viewer/` を Vite(vanilla-ts) で雛形作成、`yarn` で依存導入（cytoscape）
- [x] 2. 前処理 `etl/build_viewer_data.py`（Python 3.6互換）
  - [ ] 2a. 軽量インデックス `index.json`（id, 種別, 表示名のみ。people/places/verses 検索用）
  - [ ] 2b. ノード詳細の分割JSON（種別ごと、verses は book 単位などチャンク化）
  - [ ] 2c. 関係定義表 `relations.json`（father↔children, partners↔partners 等の正逆ラベル）
- [x] 3. 型定義とデータ取得層（`types.ts`, `data.ts`）
- [x] 4. 検索UI（people / places / verses のみ）
- [ ] 5. グラフ描画（8種のノード形状・色、選択ノード視点でのエッジラベル切替、辿る＝隣接展開）
- [ ] 6. 詳細パネル／テーブル切替（全プロパティ表示、verses は展開ボタンで任意追加）
- [ ] 7. 検証：Abraham/Terah で `Terah is Father` ↔ `Abraham is Child` の切替、`yarn build` 成功、ブラウザ動作確認
- [ ] 8. Apache 設定例（VirtualHost 443、`mod_deflate`、SPA用の静的配信）を docs に記載
- [ ] 9. 作業記録を `memo/Answers/Phase1/` に出力

## レビュー
（実装後に記入）

---

# 人物関係グラフ（Phase1 / 20261102）

- ブランチ: `feature/person-graph`（develop から）。置き場所: `graph/`（ビルド不要の静的ページ。`messages/` と同じ方針）
- 出力: SVG 基本、PDF・PNG は SVG から作成（AI 形式は不要）
- 親は一次ソースの father/mother を優先。異父/異母きょうだいがいる場合はその「もう一方の親」を描く。範囲外は無視
- `Genealogy of Jesus` 所属者は Jesus・Mary・Mary の partners 以外を除外（Matthew 1 / Luke 3 始まりは除外しない）
- 出生地・没地は人物に付随、範囲内の節の `event` は event カードにまとめる

## ステップ
- [x] 1. `graph/core.js`：範囲抽出・グラフモデル・階層レイアウト・SVG 生成（DOM 非依存。Node で検証可能）
- [x] 2. `graph/index.html` + `graph/app.js`：入力、表示、SVG/PNG/PDF ダウンロード
- [x] 3. 検証：Acts.16.11-18、Matthew.1、Genesis.25 を Node で生成して構造確認
- [x] 4. 作業記録を `memo/Answers/Phase1/` に出力

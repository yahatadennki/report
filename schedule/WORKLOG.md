# 作業記録

## 2026-11-24 Claude Code へ引き継ぎ・予算〜会議資料の動作確認

### 確認方法
- `node budget-core.test.cjs` / `node budget-ui.test.cjs` / 全JSの `node --check`：すべて合格。
- ローカルHTTPサーバー＋ヘッドレスChrome（CDP）で実画面を操作。新しいブラウザープロファイル（初期データ45件）で実施。

### 通しで確認した流れ（すべて正常）
1. 年間スケジュール → 予定（パナソニック冬フェア）を開く → 「￥ この予定の予算・実績」リンク（`budget.html?event=…&year=2026&fy=2026`）。チラシ保管庫リンク（`?year=2026&month=11&item=fair#plan=…`）も維持。
2. 予算画面で編集画面が自動で開き、フェア用の費目テンプレート（焼きそば・ポップコーン等）が入る。
3. 単価×数量×回数・実績を入力 → 合計表示 → 保存。未入力と0円の区別、「未確定」表示どおり。
4. 1月の活動（かわらばん冬号）が2026年度・下半期に入ることを確認。
5. 会議メモ保存 → 会議資料プレビュー → A3横PDF（2ページ）出力。
6. 費用明細CSV（BOM付き）、予算を含むバックアップJSON（events / budgets / budgetMeetings / appliedUpdates）。
7. スケジュールへ戻る → 予定のバッジ表示。スケジュール側で予定を保存しても予算データは消えない。

### 見つかった使いにくい点と対応
| 点 | 対応 |
|---|---|
| 単価・実績に「1,500」「１５００」「14,000円」と入れると、数値欄が空になり気づかず未入力になる | 文字入力にして、保存時にカンマ・全角・円を取り除く。数字でない欄は赤枠＋保存時にその欄へ移動 |
| スマホでは費目表が横にはみ出し、単価・数量・実績が画面外 | 700px以下は1費目ずつのカード表示（横スクロールなし） |
| 下半期だけで20件以上並び、予算を入れた活動を探しにくい／会議メモが遠い | 「予算登録済みだけ」チェックを追加。上部に「会議メモへ ↓」リンク |

### 未対応（気づいた点）
- 「予算 − 実績」は全明細が入力済みになるまで「未確定」。途中経過の差額は出ない（仕様どおり）。
- 1つの活動に複数の計上月は不可（CLAUDE.mdの仕様どおり）。
- データは端末のブラウザー内だけ。他の端末とはバックアップJSONで受け渡し。

### 変更ファイル
`dist/budget.html` `dist/budget.js` `dist/budget.css` `budget-ui.test.cjs` `CLAUDE.md` `WORKLOG.md`
保存形式（localStorage `yahata-schedule-v1`）は変更なし。既存データ・バックアップはそのまま使える。

### 公開
Sitesへの公開は未実施（この環境にSitesの公開権限・ツールなし）。`dist/` を既存Site（`.openai/hosting.json`）へ公開する必要あり。

## 2026-11-24 GitHub Pages へ移行
- ソース管理を ChatGPT（Codex）フォルダから GitHub `yahatadennki/report` の `schedule/` へ移した。旧Gitの履歴（過去のチラシ画像・PDFを含む）は持ち込まず、現在のファイルだけを登録。
- 公開URL：https://yahatadennki.github.io/report/schedule/dist/ （`schedule/` でも転送）。
- データ移行：旧サイトで「バックアップ保存」→ 新サイトの年間スケジュールで「読み込み」。予定・予算・会議メモが移る。
- `*.json` を `schedule/.gitignore` で除外（バックアップを誤って公開しない）。
- チラシ保管庫の戻り先は ChatGPT 側で新URLへ変更が必要。

## 2026-11-26 チラシ保管庫を Claude Code 管理へ
- チラシ保管庫を ChatGPT Sites から自前の Cloudflare（Workers + KV）へ移した。新URL: https://yahata-flyer-library.yahatadennki.workers.dev/
- ソースは非公開リポジトリ yawata51-dotcom/yahata-flyer-library（ローカル C:\Users\KouichiTakayama\Documents\yahata-flyer-library）。
- flyer-bridge.js・budget.html・index.html の保管庫リンクを新URLに変更。素材ボタンは保管庫の素材ページへ。
- report/sozai/ は保管庫の素材ページへ転送するだけにした。

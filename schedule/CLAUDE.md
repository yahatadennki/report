# ヤハタデンキ 年間スケジュール

## 開発の入口
- ビルド不要の静的HTML/JS。配信ファイルは `dist/`。
- `dist/index.html`: 年間スケジュール。`app.js` → `calendar.js` → `weekly.js` → `strategy-ui.js` が既存関数を拡張する。
- `dist/budget.html`: 活動ごとの予算・実績・会議資料。`budget-core.js` は計算・年度集計、`budget.js` は画面と保存。
- `budget-bridge.js`: スケジュールの予算リンクと金額表示。既存のバックアップ読み込みを妨げないこと。
- `flyer-bridge.js`: 別のチラシ保管庫への移動時に選択月とフェア日程を引き継ぐ。

## 保存と計算
- 保存先は同一オリジンのlocalStorage `yahata-schedule-v1`。サーバー共有・端末間自動同期はない。
- 既存 `events` は保持。費用は `budgets[イベントID@暦年]`、会議メモは `budgetMeetings[年度:期間]`。
- 予算明細は `price × quantity × times`。`actual` は費目全体の実績金額。空欄と0は別。単位は円。
- 金額集計は活動ごとの `period` (YYYY-MM、費用計上月)。年度は4月〜翌3月。
- 1つの活動に複数の計上月は未対応。期間別に分ける場合は別予定として登録。
- バックアップJSONは予定・予算・会議メモを含む。復元は既存スケジュールの読み込みから。
- 会議資料はブラウザ印刷（A3横、PDF保存可）。CSVは選択期間の費用明細。

## 検証
`node budget-core.test.cjs`
`node --check dist/budget.js`

## 公開（2026-11-24〜 GitHub Pages）
- ソースは GitHub `yahatadennki/report` リポジトリの `schedule/` フォルダで管理。公開対象は `schedule/dist/`。
- main へ push すると GitHub Pages（main / ルート）に反映：https://yahatadennki.github.io/report/schedule/dist/
- `schedule/index.html` は dist への転送だけ。
- 旧サイト（ChatGPT Sites）からの移行は、旧サイトで「バックアップ保存」→ 新サイトで「読み込み」。端末ごとに1回。
- バックアップJSONは公開リポジトリに入れない（`schedule/.gitignore` で *.json を除外）。
- チラシ保管庫は ChatGPT Sites のまま（https://yahata-flyer-library.yahatadennki.chatgpt.site/）。保管庫はChatGPTでのみ更新。
- localStorage は yahatadennki.github.io 全体で同じ保存領域。キー `yahata-schedule-v1` を他ページで使わないこと。
- ブラウザ確認は headless Chrome（CDP）で実施できる。

## 引き継ぎメモ（Claude Code）
- 予算明細の数値欄は `type="text" inputmode="decimal"`。入力時にカンマ・全角数字・「円」・空白を除いて保存する（`toNumberText`）。数値にならない欄は `.invalid`（赤枠）で保存時にそこへフォーカス。
- スマホ幅（700px以下）の費目表は、1費目＝1枚のカード表示（`td[data-label]`）。
- 作業記録は `WORKLOG.md`。検証には `node budget-ui.test.cjs` も追加で実行する。

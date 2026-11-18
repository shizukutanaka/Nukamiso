# Nukamiso

音声入力で字幕を作り、編集し、書き出すための**単一ファイル HTML 字幕エディタ**です。
`nukamiso.html` をブラウザで開くだけで動きます。インストールも、サーバーも、アカウントもありません。

A **single-file HTML subtitle editor**: dictate subtitles with your voice, edit them, and export.
Just open `nukamiso.html` in a browser. No install, no server, no account.

![Nukamiso editor](docs/screenshot-editor.png)

## 哲学 (Philosophy)

非交渉原則 — これらを破る変更は受け入れません。

- **Single-file** — 本体は `nukamiso.html` ひとつだけ
- **Zero-dependency** — 外部ライブラリ・CDN・Web フォントを一切読み込まない（唯一の例外は Phase H の文字起こしエンジンで、利用者の明示操作でのみ取得する。既定では読み込まれない）
- **Local-first** — データは端末内（localStorage）だけに保存される
- **Zero-telemetry** — テレメトリ送信は一切しない。通信先は CSP で Phase H の取得先（jsDelivr / Hugging Face）だけに限定され、それも利用者がダウンロードボタンを押したときだけ使う。ファイル文字起こし・編集・書き出しでは音声・字幕データは端末の外に出ない。唯一の例外は音声入力（Phase A）で、ブラウザの音声認識を使うため Chrome ではブラウザ側でサーバー認識が行われる（画面上の注記と PRIVACY.md で開示）

## 機能 (Features)

| Phase | 機能 |
|---|---|
| A | 音声入力（Web Speech API）。確定結果がタイムスタンプ付き字幕行になる。非対応ブラウザでは手入力で全機能が使える。なお認識はブラウザ実装依存で、Chrome では Google のサーバー認識を使うため、この経路では音声が端末の外に出る（UI に注記を表示）。完全ローカルで処理したい場合は Phase H のファイル文字起こしを使う |
| B | SRT / VTT / ASS / TXT の読み込みと書き出し（往復で意味を保存） |
| C | 翻訳ペイン: 第2言語トラックを並べて編集（外部 API 不使用、辞書置換で支援） |
| D | ユーザー辞書: 誤認識→正表記の置換ルール。認識結果と読み込んだ字幕に適用 |
| E | 波形ビュー: Web Audio API + canvas の自前実装（`NK.wave` に隔離、WaveSurfer.js 等の外部依存なし） |
| F | テスト: Node 単体テスト + ランダム往復 fuzz + Electron 実 UI テスト |
| G | 配布: Tauri 2.x の殻（`src-tauri/`）とタグ駆動のリリース workflow |
| H | ファイル文字起こし: 既存の音声/動画ファイルから**端末内で**文字起こしし、時刻付き字幕行にする（Whisper を端末内で実行。WebGPU 対応環境では WebGPU、非対応では WASM に自動で切り替える）。モデルは Tiny / Base / Small / Medium / Large v3 Turbo の5種から選択式（約42MB〜約1,088MB）。精度はモデル規模で大きく変わり、第三者ベンチマーク（transcriber.tools、2026-10-29測定）では日本語の文字誤り率が Base 26.3% → Large v3 Turbo 8.9%（自前実測ではない）。30秒ずつ処理し進捗表示と中断が可能。エンジン（Transformers.js、版固定）とモデルは利用者の明示操作でのみダウンロードし、取得元とサイズを事前に表示する。音声データは送信されない |
| I | 焼き込み書き出し: 開いた動画に現在の字幕を焼き込み、新しい動画ファイル（ブラウザ対応形式の MP4 または WebM）として書き出す。Canvas + MediaRecorder の標準機能だけで端末内で再エンコードし、通信は一切しない。字幕の見た目は ASS 書き出しと同じ仕様（白文字・黒縁・下部中央）。再生しながらの処理のため再生時間とほぼ同じ時間がかかり、結果全体をメモリに保持する（長尺の限界は下記） |

その他: 字幕の検証（`nkValidate` — 時刻逆行・重なり・長すぎる行などを指摘）、
キューの追加・削除・分割・結合・全体シフト、動画/音声ファイルの再生と現在行ハイライト、
File System Access API による保存（非対応環境ではダウンロードにフォールバック）、
日本語/英語 UI 切替、作業状態の自動保存（localStorage）。

## 使い方 (Usage)

1. `nukamiso.html` をブラウザで開く
2. 「動画/音声を開く」でメディアを読み込む（任意）
3. 🎙「音声入力開始」で話すか、「字幕を開く」で既存字幕を読み込むか、表で直接編集する
4. 形式を選んで「保存」

既存ファイルから字幕を作るには: メディアを開いたあと、「ファイルから文字起こし」で
モデルを選び、「エンジンをダウンロード」（初回のみ。エンジン約23MB＋モデル約42MB〜
約1,088MB、取得元は jsDelivr と Hugging Face）を押してから「文字起こし開始」。
認識は端末内で行われ、結果はそのまま編集・書き出しできます。
長いファイルは30秒ずつ処理され、途中経過の表示と中断ができます。
ブラウザが再生できない形式のファイルはデコードできず、その旨が表示されます。

字幕を動画に焼き込んで書き出すには: 動画を開いて字幕を用意したあと、
「字幕を焼き込んで書き出し」を押します。処理は端末内だけで行われ、
動画・音声・字幕が送信されることはありません。正直な限界として、
(1) 書き出しは動画を再生しながら行うため、再生時間とほぼ同じ時間がかかり、
その間タブを開いたままにする必要があります。(2) 結果全体をメモリに保持するため、
長い動画（目安として10分を超えるもの）ではメモリ不足で失敗することがあります。
(3) 出力形式はブラウザの MediaRecorder が対応するもの（MP4 または WebM）に
限られ、非対応ブラウザでは理由を表示して字幕ファイルの書き出しを案内します。

## テスト (Tests)

```sh
node tests/run-tests.js          # コアロジック単体 + fuzz（依存ゼロ）
# 実 UI テスト（Electron 34 + Xvfb が必要）:
xvfb-run -a <electron-binary> tests/ui-main.js --no-sandbox
```

## デスクトップ版 (Tauri)

`src-tauri/` に Tauri 2.x の殻があります。同じ `nukamiso.html` をそのまま内包します。

```sh
cd src-tauri && cargo build
```

タグ（`v*`）を push すると `.github/workflows/release.yml` が各 OS 向けにビルドします。

> **署名について**: リリースバイナリは**未署名**です。コード署名（Apple Developer /
> Azure Trusted Signing）は年間費用がかかるため行っていません。OS の警告が出る場合は、
> その旨を理解したうえで実行してください。ソースから自分でビルドすることもできます。

## プライバシー

データ収集は一切ありません。詳細は [PRIVACY.md](PRIVACY.md) を参照してください。

## License

MIT — see [LICENSE](LICENSE).

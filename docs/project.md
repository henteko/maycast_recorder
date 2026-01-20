# 📼 Project: Maycast Recorder

**"Failure is Impossible." —— The Full-Rust Open Core Recording Platform.**

## 1. プロダクト・ビジョン

* **Core Concept:** **「絶対に失敗しない収録」**
* PCの電源が落ちても、ブラウザがクラッシュしても、回線が切断されても、1フレームたりともデータを失わない。
* **"Local First, Cloud Synced."** —— データの実体は常にユーザーの手元（ローカル）にあり、サーバーは完全なコピーを持つまで追従する。


* **Philosophy:** **Unix Philosophy**
* 編集機能や配信機能はスコープ外。「確実に録る (Capture & Sync)」ことだけに一点集中する。


* **Target:**
* **Devs:** 収録インフラを自社アプリに組み込みたいエンジニア。
* **Pros:** 既存ツールのブラックボックス化によるデータ消失に疲弊したクリエイター。



---

## 2. ユーザーワークフロー：Director Mode

Maycast Recorderは、ゲストに録画ボタンを押させません。**「管理者が全てを掌握する」**スタジオ型ワークフローです。

| 状態 (State) | 動作定義 |
| --- | --- |
| **1. Standby** | ゲストはURLを開くだけ。WebCodecs初期化、カメラ/マイクチェック完了。 |
| **2. Recording** | 管理者が「REC開始」を押下。全クライアントが一斉にローカル録画＆チャンク送信を開始。 |
| **3. Finalizing** | 管理者が「REC停止」を押下。**通信は切断しない。**<br>

<br>「Stop & Flush」プロトコルが作動し、未到達データの回収を行う。 |
| **4. Synced** | サーバー上のデータとローカルデータがビット単位で完全一致した状態。<br>

<br>この表示が出て初めて、ゲストはブラウザを閉じることができる。 |

---

## 3. モード定義：Solo vs Director

Maycast Recorderは、2つの動作モードを持ちます。

### A. Solo Mode（スタンドアロンモード）

**Concept:** **"Serverless & Crash-proof"**

* サーバーを一切介さず、ブラウザ（WASM）とローカルストレージ（OPFS）だけで完結。
* ログイン不要、完全オフライン動作対応。
* SaaS版と全く同じ「堅牢な録音エンジン」を使用。

**特徴:**
* **即時収録:** URL（例: `/solo`）を開くだけで、デバイス選択・収録が可能
* **クラッシュ復元:** ブラウザクラッシュ後も、再訪問時に未保存データを復元可能
* **ローカルエクスポート:** `.mp4` として直接ダウンロード
* **シングルユーザー専用:** 他のユーザーとの共同作業は不可

**技術的差異:**
* **Storage:** OPFS（Origin Private File System）のみ
* **Export:** クライアント側でストリーム結合処理
* **Network:** なし（完全オフライン動作）

**開発優先度:** **Phase 1 最優先**
* 録画エンジンのバグ出しが単独で可能
* サーバー実装なしでプロダクトとしてリリース可能

### B. Director Mode（リモート管理モード）

**Concept:** 管理者が複数ゲストを一括制御

* WebSocket経由でリアルタイム同期
* サーバー（S3/R2）へのチャンクアップロード
* 複数人の同時収録に対応

**ワークフロー:** 「2. ユーザーワークフロー：Director Mode」参照

**開発優先度:** Phase 2以降

---

## 4. 技術アーキテクチャ：The "Full Rust" Stack

クライアント（WASM）とサーバー（Backend）を **Rust** で統一。型安全性を共有し、堅牢性と開発効率を最大化します。

### A. Repository Structure (Monorepo)

`Cargo Workspace` を採用し、通信プロトコルやデータ型を一元管理します。

```text
/maycast-recorder
├── /common        # [Shared] ChunkID, Manifest, WebSocket Message型定義
├── /wasm-core     # [Client] Muxingロジック, Audio Analysis (Rust -> WASM)
├── /server        # [Server] Axum API Server, Storage Drivers (Rust)
└── /web-client    # [UI] TypeScript + React/Svelte (WebCodecs制御)

```

### B. Client-Side (Frontend / WASM)

* **Encoding:** **WebCodecs API (TS)**
* ブラウザ経由でGPUハードウェアエンコーダーを駆動。
* **Stability First:** 1秒ごとのキーフレーム挿入を強制し、断片化（Fragment）への耐性を作る。


* **Muxing:** **Rust + WASM**
* エンコードされた生データを受け取り、**fMP4 (Fragmented MP4)** コンテナへ格納。
* 複雑なバイナリ処理をRustで行うことで、JSのGCによる遅延やバグを排除。


* **Safety Net:** **OPFS (Origin Private File System)**
* 生成したチャンクは即座にローカルサンドボックスへ物理書き込み。
* **Resumable Uploader:** クラッシュ復帰時、OPFS内の「未送信チャンク」を自動検出し、バックグラウンドで再送。



### C. Server-Side (Backend)

* **Framework:** **Rust (Axum + Tokio)**
* **Storage Strategy:** **`object_store` Crate**
* **Dev Mode:** ローカルファイルシステム (`./data/`)
* **SaaS Mode:** Cloudflare R2 / AWS S3
* 環境変数一つで保存先を切り替え。サーバーはステートレス（ディスクを持たない）構成。


* **Role:**
* **Verifier:** 収録終了時にマニフェスト（全ハッシュ値）を照合。
* **Streamer:** ダウンロード時にS3上のチャンクをオンザフライで結合してレスポンス。



---

## 5. データ保存戦略：Split-Chunk & Manifest

「サーバー上でファイルを結合（Append）する」リスクを回避するため、**「1秒ごとの断片（Chunk）をバラバラに保存する」**方式を採用します。

1. **Upload:** クライアントは `session_A/chunk_001.m4s` を順次PUT。順序が前後してもOK。
2. **Verify:** 終了時、不足しているChunk IDがあれば、サーバーがピンポイントで再送要求（NACK）。
3. **Download:** サーバーがバラバラのファイルをストリーム結合して、ユーザーには1本の `.mp4` として提供。

---

## 6. ビジネス戦略 (Open Core)

「失敗しない」価値をオープンにしつつ、利便性でマネタイズします。

| Edition | 対象 | 特徴 | 価格 |
| --- | --- | --- | --- |
| **Community** | 開発者 | • GitHub公開 (MIT/Apache 2.0)<br>

<br>• 完全な機能<br>

<br>• 自分のS3/サーバーを用意する必要あり | **Free** |
| **Maycast Cloud** | クリエイター | • **月額$5の破壊的価格**<br>

<br>• サーバー構築不要<br>

<br>• R2ストレージ活用による低コスト運用<br>

<br>• チーム/プロジェクト管理機能 | **$5 / mo** |
| **Enterprise** | 企業 | • オンプレミス/自社VPC<br>

<br>• SSO, SLA, Audit Logs | **Custom** |

---

## 7. 安全装置：The 4 Layers of Defense

Maycast Recorderは、以下の4段階で「失敗」を防ぎます。

1. **Crash Proof:** OPFSへのリアルタイム書き込みにより、電源断でもデータはブラウザ内に残る。
2. **Network Proof:** 回線切断時はローカル録画を継続し、復帰後に「Delta Sync（差分同期）」を行う。
3. **Performance Proof (Guardian):** WASM内でエンコード負荷を監視。危険域に達すると画質を自動で落とし、収録停止を防ぐ。
4. **Logic Proof:** Rustによる型共有で、クライアント・サーバー間のプロトコル不整合（バグ）をコンパイル時に排除。


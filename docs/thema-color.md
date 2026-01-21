### 1. デザインコンセプト：Dark "Obsidian" UI

プロフェッショナルなクリエイターやエンジニアは、長時間画面を見続けます。また、スタジオや暗い部屋での収録も想定されるため、**「ダークモード」を基本（デフォルト）** とします。
まぶしさを抑えつつ、**「REC（録画中）」や「警告（Warning）」などのステータスが暗闇で光る計器のように際立つ**設計にします。

### 2. カラーパレット定義

Rustのエコシステムや、最近のモダンなDevTools（VS Code, Linear, Vercel等）に馴染む、彩度高めでコントラストの強いパレットです。

#### A. ベースカラー (Background)

純粋な黒（#000000）ではなく、わずかに青みを含んだ深いグレーを使用し、高級感と目の疲れにくさを両立します。

| 用途 | 色名 | HEX | 役割 |
| --- | --- | --- | --- |
| **Main BG** | **Obsidian** | `#0F172A` | アプリ全体の背景色（Slate-900）。深い夜の色。 |
| **Panel BG** | **Charcoal** | `#1E293B` | サイドバーやカードの背景（Slate-800）。 |
| **Border** | **Graphite** | `#334155` | 境界線（Slate-700）。 |
| **Text** | **Mist** | `#F8FAFC` | メインテキスト（Slate-50）。ほぼ白。 |

#### B. ブランドカラー (Primary)

「Maycast」の名前から連想される「澄んだ空」「知性」「信頼」を表す色です。

| 用途 | 色名 | HEX | 役割 |
| --- | --- | --- | --- |
| **Brand** | **May Cyan** | `#06B6D4` | **プライマリカラー。** ロゴ、アクティブなボタン、強調表示に使用。<br>

<br>「五月の空」のような、少し緑がかった知的なシアン。 |
| **Accent** | **Rust Orange** | `#F97316` | **Rustへのオマージュ。** わずかなアクセント（リンクホバーやバッジ）に使用。<br>

<br>開発者に対する「Rust製である」という隠れたシグナル。 |

#### C. ステータスカラー (Functional)

「絶対に失敗しない」ツールにおいて最も重要な色です。ユニバーサルデザインを意識し、色覚多様性にも配慮した視認性の高い色を選びます。

| 用途 | 色名 | HEX | 役割 |
| --- | --- | --- | --- |
| **Recording** | **Crimson** | `#EF4444` | **最重要。** REC中のインジケーター、停止ボタン。<br>

<br>暗い背景で強烈に光る「赤」。 |
| **Safe / Synced** | **Neon Mint** | `#10B981` | 正常、保存完了、同期完了。<br>

<br>「安心」を与える鮮やかな緑。 |
| **Warning** | **Amber** | `#F59E0B` | CPU負荷上昇、ネットワーク遅延。<br>

<br>注意を促す黄色。 |

---

### 3. UIへの適用イメージ

この配色を実際の画面（Director Mode / Standalone Mode）にどう落とし込むかの具体例です。

#### 📼 収録画面 (The Recorder)

* **背景:** Obsidian (`#0F172A`)
* **波形ビジュアライザー (Waveform):**
* 通常時: **May Cyan** (`#06B6D4`) のグラデーション。
* クリッピング（音割れ）時: **Crimson** (`#EF4444`) に変化。一目で異常がわかるように。


* **RECボタン:**
* 待機中: 白枠のゴーストボタン。
* 録画中: **Crimson** (`#EF4444`) で点滅（Breath Animation）。


* **ステータスバー (右上):**
* 通常: `🟢 OPFS Active` (**Neon Mint**)
* ネット切断時: `🟡 Local Rec Only` (**Amber**)



#### 🛠️ 管理画面 (Dashboard)

* **サイドバー:** Charcoal (`#1E293B`)
* **リスト:** 交互に色を変えるストライプではなく、ボーダーライン (`#334155`) で区切るミニマルなデザイン。
* **プログレスバー:** データの同期状況を示すバーは **May Cyan** を使用し、完了すると **Neon Mint** に変わり「チェックマーク」が出る。

---

### 4. ロゴデザインの方向性

* **シンボル:** カセットテープのリール（録音）と、クラウド（雲）または盾（防御）をミニマルに融合させた幾何学的な形状。
* **カラー:** **May Cyan** (`#06B6D4`) の単色、または **Rust Orange** (`#F97316`) をワンポイント入れたバイカラー。

---

### 5. CSS変数 (Tailwind CSS Config)

開発ですぐに使えるよう、Tailwind CSSの設定形式でまとめておきます。

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        maycast: {
          bg: '#0F172A',       // Obsidian
          panel: '#1E293B',    // Charcoal
          border: '#334155',   // Graphite
          text: '#F8FAFC',     // Mist
          subtext: '#94A3B8',  // Slate-400
          
          primary: '#06B6D4',  // May Cyan (Brand)
          rust: '#F97316',     // Rust Orange (Accent)
          
          rec: '#EF4444',      // Crimson (Active)
          safe: '#10B981',     // Neon Mint (Success)
          warn: '#F59E0B',     // Amber (Warning)
        }
      }
    }
  }
}

```

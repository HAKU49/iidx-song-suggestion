# IIDX曲名検索アプリ 仕様書

## 概要

ユーザーが曖昧な文字列を入力すると、beatmania IIDXの収録曲の中から類似度の高い曲名を提案するWebアプリ。

IIDXの曲名は大文字小文字混在・記号混在など独特の表記が多く、
正確な曲名が思い出せないユーザーが「なんとなくこんな感じ」という入力で目的の曲にたどり着けることを目的とする。

用途としては、X(旧Twitter)などで曲名を含めたポストをする際曲名を正確に思い出せない場合の補助ツールとして想定している。

---

## 検索例（要件定義）

| 入力 | 期待される上位候補 |
|------|------------------|
| `Elephant Paoon` | `eRAseRmOToRpHAntOM` |
| `DOWNLOAD JUNGLE` | `DORNWALD ~Junge~` |

これらの例から、以下の類似性を検出できる必要がある。

- 大文字小文字を無視した文字の一致
- 音声（発音）の類似性（El≒eR、Paoon≒phAntOM など）
- 部分的な文字列の一致（DOWNLOAD≒DORNWALD、JUNGLE≒Junge など）

---

## 技術スタック

| 項目 | 内容 |
|------|------|
| フロントエンド | Vanilla HTML / CSS / JavaScript（単一ファイル） |
| バックエンド | **なし**（全処理をブラウザ上で完結） |
| ビルドツール | **不要** |
| データソース | chinimuruhi GitHub Pages（外部JSON） |
| デプロイ先 | Cloudflare Pages（静的ホスティング） |

### バックエンドが不要な根拠

IIDXの全収録曲数は33作累計で約2,000〜2,500曲。曲名文字列のみのJSONは推定100〜200KB程度であり、ブラウザのメモリに全件ロードして全件比較しても現代のブラウザで50ms以内に処理が完了する。データベースやサーバーサイド処理が必要になるのは数百万件規模からであり、このアプリには不要。

- データ量：全曲名JSON 約100〜200KB（ブラウザメモリに余裕で載る）
- 処理速度：2,500曲 × 3手法の類似度計算 → 50ms以内（体感ゼロ）
- 書き込み処理：**一切なし**（読み取り専用アプリ）
- 認証・セッション管理：**不要**（個人利用・公開検索のみ）

---

## データソース

### データソースモード

データの取得元は **設定値1箇所を変えるだけで切り替えられる** 設計とする。
将来的にプロジェクト内にJSONを持つ場合も、アプリ本体のロジックを変更せずに対応できる。

```javascript
// ============================================================
// データソース設定（ここだけ変更すればOK）
// ============================================================
const DATA_SOURCE = {
  mode: 'remote',  // 'remote' | 'local' で切り替え

  // mode: 'remote' のとき使用（ 外部GitHub Pages）
  remote: {
    titleUrl:      'https://chinimuruhi.github.io/IIDX-Data-Table/textage/title.json',
    normalizedUrl: 'https://chinimuruhi.github.io/IIDX-Data-Table/textage/normalized-title.json',
  },

  // mode: 'local' のとき使用（プロジェクト内ファイル）
  local: {
    titleUrl:      './data/title.json',
    normalizedUrl: './data/normalized-title.json',
  },
};
// ============================================================

function getDataUrls() {
  return DATA_SOURCE[DATA_SOURCE.mode];
}
```

| mode | データ取得元 | 新曲反映 | 用途 |
|------|------------|---------|------|
| `remote` | chinimuruhi GitHub Pages | 自動（現状） | 通常運用 |
| `local`  | `data/` フォルダ内のJSON | 手動更新が必要 | オフライン・独自管理 |

`local` モードに切り替えた場合は、以下のディレクトリにJSONを配置する。

```
project/
├── index.html
└── data/
    ├── title.json             # 手動で配置・更新
    ├── normalized-title.json  # 手動で配置・更新
    └── chart-info.json        # 手動で配置・更新
```

### 使用するJSON（remoteモード時）

有志の方（chinimuruhi 氏）が GitHub Pages で公開している IIDX データを使用する。

```
曲名データ:
https://chinimuruhi.github.io/IIDX-Data-Table/textage/title.json

処理済み曲名（記号・特殊文字を正規化済み）:
https://chinimuruhi.github.io/IIDX-Data-Table/textage/normalized-title.json

譜面情報（稼働状況・難易度・ノーツ数）:
https://chinimuruhi.github.io/IIDX-Data-Table/textage/chart-info.json
```

- `title.json` → 検索結果の表示用（元の曲名）
- `normalized-title.json` → 類似度計算用（記号除去・統一済み）
- `chart-info.json` → 楽曲の稼働状況・難易度情報（詳細は下記）

---

### chart-info.json の仕様

#### 概要

各楽曲IDをキーとして、譜面情報を持つオブジェクト。

```
https://chinimuruhi.github.io/IIDX-Data-Table/textage/chart-info.json
```

#### データ構造

```json
{
  "1001": {
    "bpm": 130,
    "in_ac": false,
    "in_inf": true,
    "level": {
      "sp": [0, 3, 6, 9, 0],
      "dp": [0, 4, 7, 10, 0]
    },
    "notes": {
      "sp": [0, 312, 564, 891, 0],
      "dp": [0, 421, 672, 1024, 0]
    }
  }
}
```

#### フィールド定義

| フィールド | 型 | 説明 | 利用予定 |
|-----------|-----|------|---------|
| `bpm` | number \| number[] | BPM。可変BPMの場合は `[最小, 最大]` の配列 | 将来 |
| `in_ac` | boolean | AC版（ゲームセンター稼働中）でプレー可能か | **現在実装予定** |
| `in_inf` | boolean | INFINITAS（PC版）でプレー可能か | **現在実装予定** |
| `level` | object | SP/DP 各難易度のレベル（0〜12、0は未収録） | 将来 |
| `notes` | object | SP/DP 各難易度のノーツ数 | 将来 |

#### in_ac / in_inf の詳細

```
in_ac: true  → 現在ACで遊べる曲
in_ac: false → 削除曲（過去に収録されていたがACでは遊べない）

in_inf: true  → INFINITAS で遊べる曲
in_inf: false → INFINITAS 未収録
```

> **注意**: 削除曲・INFINITAS限定曲を検索候補に含めるかどうかを制御するフィルター機能は、将来実装予定。実装時は本仕様書を更新すること。

#### level / notes の配列インデックス対応

SP・DP ともに、配列の各インデックスは以下の難易度に対応する。

| インデックス | SP難易度 | DP難易度 |
|------------|---------|---------|
| 0 | BEGINNER | （なし） |
| 1 | NORMAL | NORMAL |
| 2 | HYPER | HYPER |
| 3 | ANOTHER | ANOTHER |
| 4 | LEGGENDARIA | LEGGENDARIA |

値が `0` の場合はその難易度が存在しないことを示す。

> **現時点では level・notes は使用しない。** 将来的に難易度フィルター等の機能追加時に使用する。

### 新曲の自動反映（remoteモード時）

chinimuruhi 氏の GitHub Actions が定期的に TexTage をクローリングして JSON を更新する。
アプリは起動時にこの JSON を fetch するため、**開発者側の操作なしに新曲が自動反映される**。

### サーバー負担への配慮

GitHub Pages は静的ファイル配信であり、スクレイピングではなく通常の HTTP GET となる。
さらに以下のキャッシュ戦略で fetch 回数を最小化する。

```javascript
const CACHE_KEY = 'iidx_titles';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24時間

async function getTitles() {
  // localモードはキャッシュしない（常に最新ファイルを読む）
  if (DATA_SOURCE.mode === 'local') {
    const urls = getDataUrls();
    const res = await fetch(urls.titleUrl);
    return await res.json();
  }

  // remoteモードは24時間キャッシュ
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) {
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp < CACHE_TTL) return data;
  }
  const urls = getDataUrls();
  const res = await fetch(urls.titleUrl);
  const data = await res.json();
  localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
  return data;
}
```

- **remoteモード**: 24時間以内は同一ブラウザから fetch しない
- **localモード**: キャッシュなし（ファイルを直接読み込む）
- fetch は起動時1回のみ（検索のたびに fetch しない）

---

## 類似度計算アルゴリズム

3つの手法のスコアを重み付きで合算する。

### 前処理（正規化）

全ての比較は以下の正規化を行った文字列に対して実施する。

```
1. 全て小文字に変換（lowercase）
2. 記号・スペースを除去または統一
3. normalized-title.json の処理済み曲名と比較
```

### ① 音声類似（重み: 0.40）

**手法**: Double Metaphone

英語の発音をアルファベットコードに変換し、コードの一致度でスコアリングする。

`Elephant Paoon` → `eRAseRmOToRpHAntOM` のような
「見た目は違うが発音が似ている」ケースを拾うのがこの手法の主な役割。

```
Elephant → ELFNT
eRAseRmOToRpHAntOM → ELSR（頭音が一致）
```

使用ライブラリ候補: `talisman` (npm) / CDN から読み込み

### ② 編集距離（重み: 0.35）

**手法**: Levenshtein Distance

文字列を別の文字列に変換するための最小操作数（挿入・削除・置換）を距離として算出し、
文字列長で正規化してスコアに変換する。

`DOWNLOAD JUNGLE` → `DORNWALD ~Junge~` のような
「文字の並びが似ている」ケースに強い。

```
スコア = 1 - (levenshtein距離 / max(入力文字数, 曲名文字数))
```

### ③ N-gram 類似度（重み: 0.25）

**手法**: Bigram（2文字）の Jaccard 類似度

入力と曲名の共通する Bigram の割合でスコアリングする。
部分一致に強く、単語の順序が違っても共通部分を拾える。

```
"DOWNLOAD" の Bigram: {DO, OW, WN, NL, LO, OA, AD}
"DORNWALD" の Bigram: {DO, OR, RN, NW, WA, AL, LD}
共通: {DO, RN}（一部一致）
```

### スコア合算

```javascript
const totalScore =
  phoneticScore * 0.40 +
  levenshteinScore * 0.35 +
  ngramScore * 0.25;
```

上位10件をスコア降順で表示する。

---

## UI要件

### 基本動作

- テキスト入力欄が1つ
- 入力のたびにリアルタイムで候補を更新（debounce: 200ms）
- 上位10件の曲名をスコアと共に表示
  - 曲名は元のIIDXにおける曲名表記をそのまま表示すること
  - トップ1件は強調して表示
  - トップ1件以外の曲名は、トップ1件の下に小さめのフォントで表示する
  - スコアは基本非表示で、デバッグ用として切り替えられるようにする

### 元の楽曲のコピー機能
- 各候補に「楽曲名をコピーする」ボタンを配置
- ボタンをクリックすると、「コピーしました」の吹き出しを表示する

### 表示項目（各候補）

- 曲名（元の表記をそのまま表示）
- 類似度スコア（%表示）

### レスポンシブ対応

- PC・スマートフォン両対応
- ブラウザで動作（インストール不要）

### ローディング表示

- 初回起動時の JSON fetch 中はローディング表示

---

## セキュリティ要件

バックエンドなし・読み取り専用アプリではあるが、フォームを持つWebアプリとして以下のセキュリティ対策を必ず実装すること。

### XSS（クロスサイトスクリプティング）対策

**リスク**: ユーザー入力をそのままHTMLに埋め込むと、`<script>` タグなどが実行される。

**対策**: 検索結果・入力値をDOMに反映する際は `innerHTML` を使わず、必ず `textContent` または `createElement` を使う。

```javascript
// ❌ 絶対にやってはいけない
resultDiv.innerHTML = userInput;
resultDiv.innerHTML = `<li>${songTitle}</li>`;

// ✅ 正しい実装
const li = document.createElement('li');
li.textContent = songTitle;  // textContent はHTMLエスケープが自動
resultList.appendChild(li);
```

**Content Security Policy（CSP）ヘッダー**: Cloudflare Pages の `_headers` ファイルに設定する。

```
# _headers
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; connect-src 'self' https://chinimuruhi.github.io; style-src 'self' 'unsafe-inline'
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer
```

### SQLインジェクション対策

**リスク**: バックエンドもデータベースも存在しないため、このアプリでは**SQLインジェクションは構造上発生しない**。

ただし将来バックエンドを追加する場合は、プリペアドステートメント必須とする（現時点では対策不要）。

### 入力値バリデーション

ユーザー入力に対して以下のバリデーションを実装すること。

```javascript
function sanitizeInput(input) {
  // 最大文字数制限（100文字）
  const trimmed = input.trim().slice(0, 100);
  // 制御文字（改行・タブなど）を除去
  return trimmed.replace(/[\x00-\x1F\x7F]/g, '');
}
```

| バリデーション項目 | 内容 |
|------------------|------|
| 最大文字数 | 100文字（それ以上は切り捨て） |
| 制御文字除去 | 改行・タブ・NULL文字などを除去 |
| 空文字チェック | 空の場合は検索処理をスキップ |
| 型チェック | string型以外は処理しない |

### fetch時のセキュリティ

外部JSONのfetch時にエラーハンドリングを必ず実装し、予期しないレスポンスで処理が止まらないようにする。

```javascript
async function fetchSongs() {
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
    const contentType = res.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      throw new Error('Invalid content type');
    }
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Invalid data format');
    return data;
  } catch (e) {
    console.error('データ取得失敗:', e);
    return [];  // 失敗時は空配列を返してアプリを継続
  }
}
```

### debounceによる過負荷防止

検索入力にdebounce（200ms）を設定し、キー入力のたびに比較処理が走らないようにする。

```javascript
let debounceTimer;
inputEl.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const query = sanitizeInput(inputEl.value);
    if (query.length > 0) search(query);
    else clearResults();
  }, 200);
});
```

---

## セキュリティ要件

バックエンドなし・静的アプリでも以下の脅威に対応する必要がある。
DBが存在しないためSQLインジェクションは対象外だが、フロントエンド固有の脅威を網羅する。

### ① XSS（クロスサイトスクリプティング）対策【必須】

**脅威**: ユーザー入力や外部JSONに含まれる悪意あるHTMLタグ・スクリプトがそのまま画面に描画される。

**対策: DOM操作には必ず `textContent` を使い、`innerHTML` への直接代入を禁止する。**

```javascript
// ❌ 絶対禁止 - XSSの温床
element.innerHTML = userInput;
element.innerHTML = songTitle; // 外部JSONのデータも同様

// ✅ 必須 - テキストとして安全に描画
element.textContent = userInput;
element.textContent = songTitle;
```

動的にHTML要素を生成する場合も `createElement` + `textContent` で組み立てる。

```javascript
// ✅ 安全な要素生成パターン
function createSongCard(title, score) {
  const li = document.createElement('li');
  const titleSpan = document.createElement('span');
  titleSpan.textContent = title;   // ← textContent で代入
  const scoreSpan = document.createElement('span');
  scoreSpan.textContent = `${score}%`;
  li.appendChild(titleSpan);
  li.appendChild(scoreSpan);
  return li;
}
```

### ② 外部JSONの検証（JSONインジェクション対策）【必須】

**脅威**: fetch で取得した外部JSONが想定外の構造・型であった場合に、アプリがクラッシュしたり
意図しない値がDOMに流れ込む。

**対策: fetch後に型チェックとサニタイズを実施する。**

```javascript
function sanitizeTitles(raw) {
  if (!Array.isArray(raw)) throw new Error('Invalid data format');
  return raw
    .filter(item => typeof item === 'string')   // 文字列以外を除外
    .map(item => item.slice(0, 200));            // 異常に長い文字列を切り捨て
}

const data = await res.json();
const titles = sanitizeTitles(data);
```

### ③ Content Security Policy（CSP）【必須】

**脅威**: 外部スクリプトや予期しないリソースの読み込みによるXSS・データ漏洩。

**対策: `<meta>` タグでCSPを設定し、許可するリソースを明示的に制限する。**

```html
<meta http-equiv="Content-Security-Policy"
  content="
    default-src 'none';
    script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com;
    style-src  'self' 'unsafe-inline';
    connect-src https://chinimuruhi.github.io;
    font-src   'self';
    img-src    'self' data:;
  ">
```

- `connect-src` は chinimuruhi.github.io のみ許可（他ドメインへの通信をブロック）
- CDNライブラリを使う場合は `script-src` に追加する
- `'unsafe-inline'` はインラインスクリプト・スタイルが必要なため許可（単一HTMLファイル構成のため）

### ④ 入力値のサニタイズとバリデーション【必須】

**脅威**: 極端に長い入力や特殊文字による処理の異常・パフォーマンス劣化。

**対策: 入力値に対して長さ制限と正規化を行う。**

```javascript
function sanitizeInput(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .slice(0, 100)          // 100文字を上限とする
    .trim();                // 前後の空白除去
}

searchInput.addEventListener('input', () => {
  const query = sanitizeInput(searchInput.value);
  if (query.length < 1) { clearResults(); return; }
  search(query);
});
```

### ⑤ LocalStorage の安全な利用【必須】

**脅威**: LocalStorage に保存したデータが改ざんされ、パース時にクラッシュする（ストレージインジェクション）。

**対策: LocalStorage の読み込みは必ず try-catch で囲み、壊れていたら捨てて再fetchする。**

```javascript
function loadCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // 構造チェック
    if (!parsed.data || !parsed.timestamp) return null;
    return parsed;
  } catch {
    localStorage.removeItem(key); // 壊れたキャッシュは削除
    return null;
  }
}
```

### ⑥ Subresource Integrity（SRI）【推奨】

**脅威**: CDNから読み込む外部ライブラリが改ざんされた場合にスクリプトが汚染される。

**対策: CDNライブラリには `integrity` 属性を付与する。**

```html
<!-- 例: integrity ハッシュは使用するライブラリのCDNページから取得する -->
<script
  src="https://cdnjs.cloudflare.com/ajax/libs/example/1.0.0/example.min.js"
  integrity="sha384-xxxxxxxxxxxxxxxx"
  crossorigin="anonymous">
</script>
```

### セキュリティ要件 一覧

| # | 脅威 | 対策 | 優先度 |
|---|------|------|--------|
| ① | XSS | `textContent` 使用・`innerHTML` 禁止 | **必須** |
| ② | JSONインジェクション | 外部JSON取得後の型チェック・サニタイズ | **必須** |
| ③ | 外部リソース汚染 | CSP を `<meta>` で設定 | **必須** |
| ④ | 異常入力 | 入力値の長さ制限・正規化 | **必須** |
| ⑤ | ストレージ改ざん | LocalStorage読込を try-catch でラップ | **必須** |
| ⑥ | CDN改ざん | SRI（integrity属性）付与 | 推奨 |
| — | SQLインジェクション | DBなし・対象外 | 対象外 |

---

## ディレクトリ構成

```
project/
├── index.html       # アプリ本体（単一ファイル）
├── _headers         # Cloudflare Pages セキュリティヘッダー設定
├── SPEC.md          # 本仕様書
└── CLAUDE.md        # Claude Code 向けプロジェクトルール
```

---

## CLAUDE.md に記載するルール（Claude Code 向け）

```markdown
# IIDX曲名検索アプリ

## 概要
- SPEC.md を必ず参照してから実装すること。
- 楽曲名における、機種依存文字などの問題の対応については、SONG_INFO.md を参照すること。

## 実装ルール
- バックエンドは一切作らない。全処理をフロントエンド（index.html）で完結させる
- 外部ライブラリは CDN から読み込む（npm build 不要）
- データは必ずキャッシュ戦略（LocalStorage, TTL 24時間）を使うこと
- fetch は起動時1回のみ。検索処理のたびに fetch してはいけない

## セキュリティルール（必須）
- DOM操作は必ず textContent / createElement を使う。innerHTML は禁止
- 入力値は必ず sanitizeInput() を通してから使う
- fetch のレスポンスは必ず ok チェック・型チェックをしてから使う
- _headers ファイルに CSP・X-Frame-Options などを設定する

## テストケース（必ず通すこと）
- 入力「Elephant Paoon」→ eRAseRmOToRpHAntOM が上位3件以内に表示される
- 入力「DOWNLOAD JUNGLE」→ DORNWALD ~Junge~ が上位3件以内に表示される
- 入力「<script>alert(1)</script>」→ スクリプトが実行されず文字列としてそのまま表示される
```

---

## 将来の公開に向けた方針

- 現在は個人利用を想定しているが、将来的に IIDX ユーザーへの一般公開を予定している。

| 項目 | 内容 |
|------|------|
| ホスティング | Cloudflare Pages（無料・静的ホスティング） |
| 独自ドメイン | 任意（Cloudflare Pages のサブドメインでも可） |
| バックエンド | 不要（静的ファイルのみで動作） |
| 費用 | 無料枠で運用可能な見込み |

- 検索において、必要に応じて今後はそれぞれの曲に設定されている「アーティスト名」、「ジャンル名」からも楽曲を検索できるようにしたい

---

## 制約・注意事項

- データ使用については [chinimuruhi IIDX-Data-Table](https://chinimuruhi.github.io/IIDX-Data-Table/) および TexTage 様の規約に従うこと
- TexTage への直接アクセスは行わない（chinimuruhi 氏の JSON を経由する）
- GitHub Pages への過剰なリクエストを避けるため、キャッシュ戦略を必ず実装すること

---

## Todoリスト（人手レビュー用）

実装後・公開前に人の目で確認する項目。Claude Codeでの自動実装完了後に順番にチェックすること。

### 仕様レビュー
- [ ] 検索例（Elephant Paoon・DOWNLOAD JUNGLE）で期待する曲名が上位3件以内に出るか確認
- [ ] スコアの重み（音声0.40・編集距離0.35・N-gram0.25）が適切か実際に使って判断
- [ ] 表示件数（上位10件）は多すぎ・少なすぎないか確認
- [ ] debounce 200ms の体感が快適かどうか確認（遅すぎ・速すぎ調整）

### データソース確認
- [ ] `remote` モードで chinimuruhi の JSON が正常に取得できるか確認
- [ ] `local` モードに切り替えて、`data/` フォルダのJSONが読み込めるか確認
- [ ] 24時間キャッシュが正常に機能しているか（DevTools > Application > LocalStorageで確認）
- [ ] chinimuruhi 氏のデータ利用規約を改めて確認・遵守できているか

### セキュリティレビュー
- [ ] `<script>alert(1)</script>` を入力してスクリプトが実行されないことを確認（XSSテスト）
- [ ] DevTools > Network で fetch が起動時1回のみであることを確認
- [ ] CSPが正しく設定されているか（DevTools > Console にCSPエラーが出ていないか）
- [ ] LocalStorage に保存されるデータが曲名JSONとタイムスタンプのみであることを確認
- [ ] CDNライブラリに integrity 属性（SRI）が付いているか確認

### UI・UXレビュー
- [ ] スマートフォンで実際に操作して使いやすいか確認
- [ ] ローディング表示が出るか・完了後に消えるか確認
- [ ] 検索結果ゼロのとき適切なメッセージが出るか確認
- [ ] 日本語・記号・絵文字などの入力で異常動作しないか確認

### 公開前チェック（将来・一般公開時）
- [ ] Cloudflare Pages へのデプロイ動作確認
- [ ] 独自ドメイン設定（任意）
- [ ] `_headers` ファイルのセキュリティヘッダーが Cloudflare Pages 上で有効になっているか確認
- [ ] データソースを `remote` モードのままにしてあるか最終確認

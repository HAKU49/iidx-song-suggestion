'use strict';

/* ============================================================
   データソース設定（ここだけ変更すればOK）
   ============================================================ */
const DATA_SOURCE = {
  mode: 'remote',  // 'remote' | 'local'
  remote: {
    titleUrl:       'https://chinimuruhi.github.io/IIDX-Data-Table/textage/title.json',
    normalizedUrl:  'https://chinimuruhi.github.io/IIDX-Data-Table/textage/normalized-title.json',
    chartInfoUrl:   'https://chinimuruhi.github.io/IIDX-Data-Table/textage/chart-info.json',
    songInfoUrl:    'https://chinimuruhi.github.io/IIDX-Data-Table/textage/song-info.json',
    versionUrl:     'https://chinimuruhi.github.io/IIDX-Data-Table/textage/version.json',
    textageTagUrl:  'https://chinimuruhi.github.io/IIDX-Data-Table/textage/textage-tag.json',
  },
  local: {
    titleUrl:       './data/title.json',
    normalizedUrl:  './data/normalized-title.json',
    chartInfoUrl:   './data/chart-info.json',
    songInfoUrl:    './data/song-info.json',
    versionUrl:     './data/version.json',
    textageTagUrl:  './data/textage-tag.json',
  },
};

function getDataUrls() { return DATA_SOURCE[DATA_SOURCE.mode]; }

/* ============================================================
   キャッシュ設定
   ============================================================ */
const CACHE_KEY_TITLE      = 'iidx_titles_v1';
const CACHE_KEY_NORMALIZED = 'iidx_normalized_v1';
const CACHE_KEY_CHART      = 'iidx_chart_v3';  // v3: sp/dp notes added
const CACHE_KEY_SONG_INFO  = 'iidx_songinfo_v1';
const CACHE_KEY_VERSION    = 'iidx_version_v1';
const CACHE_KEY_TEXTAGE_TAG = 'iidx_textage_tag_v1';
const CACHE_TTL = 24 * 60 * 60 * 1000;

/* ============================================================
   セキュリティ：入力サニタイズ
   ============================================================ */
function sanitizeInput(raw) {
  if (typeof raw !== 'string') return '';
  return raw.slice(0, 100).trim().replace(/[\x00-\x1F\x7F]/g, '');
}

function sanitizeTitles(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('Invalid data format');
  }
  const result = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof k === 'string' && typeof v === 'string') {
      result[k] = v.slice(0, 300);
    }
  }
  return result;
}

function sanitizeSongInfo(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('Invalid song-info format');
  }
  const result = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof k === 'string' && typeof v === 'object' && v !== null) {
      result[k] = {
        artist:  typeof v.artist  === 'string' ? v.artist.slice(0, 200) : '',
        version: typeof v.version === 'number' ? v.version : -1,
      };
    }
  }
  return result;
}

function sanitizeVersionNames(raw) {
  if (!Array.isArray(raw)) throw new Error('Invalid version format');
  return raw.filter(v => typeof v === 'string').map(v => v.slice(0, 100));
}

function sanitizeChartInfo(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('Invalid chart-info format');
  }
  const result = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof k === 'string' && typeof v === 'object' && v !== null) {
      const level = (v.level && typeof v.level === 'object') ? v.level : {};
      const notes = (v.notes && typeof v.notes === 'object') ? v.notes : {};
      const sanitizeLevel = arr =>
        Array.isArray(arr)
          ? arr.slice(0, 5).map(n => (typeof n === 'number' ? Math.max(0, Math.min(12, n)) : 0))
          : [0, 0, 0, 0, 0];
      const sanitizeNotes = arr =>
        Array.isArray(arr)
          ? arr.slice(0, 5).map(n => (typeof n === 'number' ? Math.max(0, n) : 0))
          : [0, 0, 0, 0, 0];
      result[k] = {
        in_ac:    v.in_ac  === true,
        in_inf:   v.in_inf === true,
        sp:       sanitizeLevel(level.sp),
        dp:       sanitizeLevel(level.dp),
        spNotes:  sanitizeNotes(notes.sp),
        dpNotes:  sanitizeNotes(notes.dp),
      };
    }
  }
  return result;
}

function sanitizeTextageTag(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('Invalid textage-tag format');
  }
  const result = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof k === 'string' && typeof v === 'string') {
      result[k] = v.slice(0, 100);
    }
  }
  return result;
}

/* ============================================================
   LocalStorageキャッシュ
   ============================================================ */
function loadCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.data !== 'object' || typeof parsed.timestamp !== 'number') return null;
    if (Date.now() - parsed.timestamp >= CACHE_TTL) { localStorage.removeItem(key); return null; }
    return parsed.data;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

function saveCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
  } catch { /* quota超過等は無視 */ }
}

/* ============================================================
   データ取得
   ============================================================ */
async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('json')) throw new Error('Invalid content type');
  return res.json();
}

async function loadSongData() {
  // localモードはキャッシュしない
  if (DATA_SOURCE.mode === 'local') {
    const urls = getDataUrls();
    const [titleRaw, normRaw, chartRaw, songInfoRaw, versionRaw, textageTagRaw] = await Promise.all([
      fetchJson(urls.titleUrl),
      fetchJson(urls.normalizedUrl),
      fetchJson(urls.chartInfoUrl),
      fetchJson(urls.songInfoUrl),
      fetchJson(urls.versionUrl),
      fetchJson(urls.textageTagUrl),
    ]);
    return {
      title:        sanitizeTitles(titleRaw),
      normalized:   sanitizeTitles(normRaw),
      chart:        sanitizeChartInfo(chartRaw),
      songInfo:     sanitizeSongInfo(songInfoRaw),
      versionNames: sanitizeVersionNames(versionRaw),
      textageTag:   sanitizeTextageTag(textageTagRaw),
    };
  }

  // remoteモード：24時間キャッシュ（全ファイルキャッシュ済みなら fetch しない）
  const cachedTitle      = loadCache(CACHE_KEY_TITLE);
  const cachedNorm       = loadCache(CACHE_KEY_NORMALIZED);
  const cachedChart      = loadCache(CACHE_KEY_CHART);
  const cachedSongInfo   = loadCache(CACHE_KEY_SONG_INFO);
  const cachedVersion    = loadCache(CACHE_KEY_VERSION);
  const cachedTextageTag = loadCache(CACHE_KEY_TEXTAGE_TAG);
  if (cachedTitle && cachedNorm && cachedChart && cachedSongInfo && cachedVersion && cachedTextageTag) {
    return {
      title:        cachedTitle,
      normalized:   cachedNorm,
      chart:        cachedChart,
      songInfo:     cachedSongInfo,
      versionNames: cachedVersion,
      textageTag:   cachedTextageTag,
    };
  }

  const urls = getDataUrls();
  const [titleRaw, normRaw, chartRaw, songInfoRaw, versionRaw, textageTagRaw] = await Promise.all([
    fetchJson(urls.titleUrl),
    fetchJson(urls.normalizedUrl),
    fetchJson(urls.chartInfoUrl),
    fetchJson(urls.songInfoUrl),
    fetchJson(urls.versionUrl),
    fetchJson(urls.textageTagUrl),
  ]);
  const title        = sanitizeTitles(titleRaw);
  const normalized   = sanitizeTitles(normRaw);
  const chart        = sanitizeChartInfo(chartRaw);
  const songInfo     = sanitizeSongInfo(songInfoRaw);
  const versionNames = sanitizeVersionNames(versionRaw);
  const textageTag   = sanitizeTextageTag(textageTagRaw);
  saveCache(CACHE_KEY_TITLE,       title);
  saveCache(CACHE_KEY_NORMALIZED,  normalized);
  saveCache(CACHE_KEY_CHART,       chart);
  saveCache(CACHE_KEY_SONG_INFO,   songInfo);
  saveCache(CACHE_KEY_VERSION,     versionNames);
  saveCache(CACHE_KEY_TEXTAGE_TAG, textageTag);
  return { title, normalized, chart, songInfo, versionNames, textageTag };
}

/* ============================================================
   テキスト正規化（類似度計算用）
   ============================================================ */

/** スペースを保持したまま記号のみ除去（単語分割アルゴリズム用） */
function normalizeWithSpaces(str) {
  return str
    .toLowerCase()
    .replace(/[^\w\u3040-\u30ff\u4e00-\u9fff\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** スペースも記号も全て除去（前方一致・N-gram・音声アルゴリズム用） */
function normalizeNoSpaces(str) {
  return normalizeWithSpaces(str).replace(/\s/g, '');
}

/* ============================================================
   類似度アルゴリズム群

   各 fn は ctx オブジェクトを受け取る:
     ctx.noSp    … 入力（スペースなし正規化）
     ctx.noSp_c  … 候補（スペースなし正規化）
     ctx.withSp  … 入力（スペースあり正規化）
     ctx.withSp_c… 候補（スペースあり正規化）
   ============================================================ */

/* ---- Double Metaphone（簡易実装） ---- */
function doubleMetaphone(str) {
  if (!str) return ['', ''];
  const s = str.toUpperCase().replace(/[^A-Z]/g, '');
  if (!s) return ['', ''];

  let pri = '', sec = '';
  let i = 0;
  const len = s.length;

  function add(p, s2) {
    pri += p;
    sec += (s2 !== undefined ? s2 : p);
  }
  function at(pos, ...chars) { return chars.includes(s[pos]); }
  function substr(pos, n) { return s.slice(pos, pos + n); }

  // 先頭の特殊ケース
  if (substr(0, 2).match(/^(GN|KN|PN|AE|WR)/)) i = 1;
  if (s[0] === 'X') { add('S'); i = 1; }

  while (i < len) {
    const c = s[i];
    switch (c) {
      case 'A': case 'E': case 'I': case 'O': case 'U': case 'Y':
        if (i === 0) add('A');
        i++; break;
      case 'B':
        add('P');
        i += (s[i + 1] === 'B' ? 2 : 1); break;
      case 'C':
        if (i > 0 && s[i - 1] !== 'S' && substr(i, 2) === 'CI' && substr(i, 4) !== 'CIAN') {
          add('X'); i += 2; break;
        }
        if (substr(i, 2) === 'CE' || substr(i, 2) === 'CI') {
          add('S', 'X'); i += 2; break;
        }
        if (substr(i, 2) === 'CH') {
          add('X', 'K'); i += 2; break;
        }
        add('K'); i += (s[i + 1] === 'C' ? 2 : 1); break;
      case 'D':
        if (substr(i, 2) === 'DG' && at(i + 2, 'I', 'E', 'Y')) {
          add('J'); i += 3; break;
        }
        add('T'); i += (substr(i, 2) === 'DT' || substr(i, 2) === 'DD' ? 2 : 1); break;
      case 'F': add('F'); i += (s[i + 1] === 'F' ? 2 : 1); break;
      case 'G':
        if (at(i + 1, 'E', 'I', 'Y')) { add('K', 'J'); i += 2; break; }
        if (substr(i, 2) === 'GH') { add('K'); i += 2; break; }
        if (substr(i, 2) === 'GN') { i += 2; break; }
        add('K'); i += (s[i + 1] === 'G' ? 2 : 1); break;
      case 'H':
        if (at(i + 1, 'A', 'E', 'I', 'O', 'U')) { add('H'); }
        i++; break;
      case 'J': add('J', 'H'); i++; break;
      case 'K': add('K'); i += (s[i + 1] === 'K' ? 2 : 1); break;
      case 'L': add('L'); i += (s[i + 1] === 'L' ? 2 : 1); break;
      case 'M':
        add('M');
        i += (substr(i, 3) === 'MBM' || s[i + 1] === 'M' ? 2 : 1); break;
      case 'N': add('N'); i += (s[i + 1] === 'N' ? 2 : 1); break;
      case 'P':
        if (s[i + 1] === 'H') { add('F'); i += 2; break; }
        add('P'); i += (s[i + 1] === 'P' ? 2 : 1); break;
      case 'Q': add('K'); i += (s[i + 1] === 'Q' ? 2 : 1); break;
      case 'R': add('R'); i += (s[i + 1] === 'R' ? 2 : 1); break;
      case 'S':
        if (substr(i, 3) === 'SCH') { add('X', 'SK'); i += 3; break; }
        if (substr(i, 2) === 'SH' || substr(i, 2).match(/^S[IY]/)) { add('X'); i += 2; break; }
        add('S'); i += (s[i + 1] === 'S' ? 2 : 1); break;
      case 'T':
        if (substr(i, 2) === 'TH') { add('0', 'T'); i += 2; break; }
        if (substr(i, 3).match(/^T[IY]A/)) { add('X'); i += 3; break; }
        add('T'); i += (substr(i, 2) === 'TT' || substr(i, 2) === 'TD' ? 2 : 1); break;
      case 'V': add('F'); i++; break;
      case 'W':
        if (at(i + 1, 'A', 'E', 'I', 'O', 'U')) { add('A'); }
        i++; break;
      case 'X': add('KS'); i++; break;
      case 'Z':
        if (s[i + 1] === 'Z') { add('S'); i += 2; break; }
        add('S', 'TS'); i++; break;
      default: i++;
    }
  }
  return [pri.slice(0, 6), sec.slice(0, 6)];
}

function phoneticSimilarity(a, b) {
  if (!a || !b) return 0;
  const aOnly = a.replace(/[^\x00-\x7F]/g, '');
  const bOnly = b.replace(/[^\x00-\x7F]/g, '');
  if (!aOnly || !bOnly) return 0;

  const [ap1, ap2] = doubleMetaphone(aOnly);
  const [bp1, bp2] = doubleMetaphone(bOnly);
  if (!ap1 || !bp1) return 0;

  const scores = [
    cosineSim(ap1, bp1),
    cosineSim(ap1, bp2),
    cosineSim(ap2, bp1),
    cosineSim(ap2, bp2),
  ];
  return Math.max(...scores);
}

function cosineSim(a, b) {
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  let matches = 0;
  const minLen = Math.min(a.length, b.length);
  for (let i = 0; i < minLen; i++) if (a[i] === b[i]) matches++;
  return matches / maxLen;
}

/* ---- Levenshtein Distance ---- */
function levenshtein(a, b) {
  if (!a) return b.length;
  if (!b) return a.length;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const tmp = dp[i];
      dp[i] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[i], dp[i - 1]);
      prev = tmp;
    }
  }
  return dp[a.length];
}

function levenshteinSimilarity(a, b) {
  if (!a && !b) return 1;
  const dist = levenshtein(a, b);
  return 1 - dist / Math.max(a.length, b.length, 1);
}

/* ---- Bigram Jaccard ---- */
function bigrams(s) {
  const set = new Set();
  for (let i = 0; i < s.length - 1; i++) set.add(s[i] + s[i + 1]);
  return set;
}

function ngramSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a.length < 2 || b.length < 2) {
    // 1文字の場合は単純一致
    return a[0] === b[0] ? 1 : 0;
  }
  const ba = bigrams(a), bb = bigrams(b);
  let intersection = 0;
  for (const g of ba) if (bb.has(g)) intersection++;
  const union = ba.size + bb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/* ---- Prefix Match ---- */
function prefixSimilarity(input, candidate) {
  if (!input || !candidate) return 0;
  // 候補が入力で始まる（最も強いケース）
  if (candidate.startsWith(input)) {
    // 完全一致に近いほど高く、完全一致なら1.0
    return 0.7 + 0.3 * (input.length / candidate.length);
  }
  // 入力が候補で始まる（候補が入力の省略）
  if (input.startsWith(candidate)) {
    return candidate.length / input.length;
  }
  // 共通前方一致文字数
  let common = 0;
  const min = Math.min(input.length, candidate.length);
  for (let i = 0; i < min; i++) {
    if (input[i] === candidate[i]) common++;
    else break;
  }
  return common / Math.max(input.length, candidate.length);
}

/* ---- Word-level Levenshtein ---- */
// 入力をスペースで単語分割し、各単語の最良マッチを平均する
// 「DOWNLOAD JUNGLE」→「DORNWALD Junge」のような語順一致ケースに強い
function wordLevelSimilarity(inputWithSp, candidateWithSp) {
  const iWords = inputWithSp.split(/\s+/).filter(Boolean);
  const cWords = candidateWithSp.split(/\s+/).filter(Boolean);
  if (!iWords.length || !cWords.length) return 0;

  let total = 0;
  for (const iw of iWords) {
    let best = 0;
    for (const cw of cWords) {
      const s = levenshteinSimilarity(iw, cw);
      if (s > best) best = s;
    }
    total += best;
  }
  return total / iWords.length;
}

/* ============================================================
   SimilarityEngine（柔軟な差し替えのための戦略パターン）

   アルゴリズムを追加・削除・重み変更するには
   SimilarityEngine.algorithms 配列を編集するだけでOK。
   ・weight の合計が 1 でなくても自動正規化される
   ・enabled: false にするとそのアルゴリズムを除外

   各 fn が受け取る ctx:
     ctx.noSp    … 入力（スペースなし正規化）
     ctx.noSp_c  … 候補（スペースなし正規化）
     ctx.withSp  … 入力（スペースあり正規化）
     ctx.withSp_c… 候補（スペースあり正規化）
   ============================================================ */
const SimilarityEngine = {
  algorithms: [
    {
      id:      'prefix',
      name:    'Prefix Match（前方一致）',
      weight:  0.25,
      enabled: true,
      fn: ctx => prefixSimilarity(ctx.noSp, ctx.noSp_c),
    },
    {
      id:      'wordLevel',
      name:    'Word-level Levenshtein（単語単位編集距離）',
      weight:  0.35,
      enabled: true,
      fn: ctx => wordLevelSimilarity(ctx.withSp, ctx.withSp_c),
    },
    {
      id:      'ngram',
      name:    'Bigram Jaccard（N-gram）',
      weight:  0.25,
      enabled: true,
      fn: ctx => ngramSimilarity(ctx.noSp, ctx.noSp_c),
    },
    {
      id:      'phonetic',
      name:    'Double Metaphone（音声類似）',
      weight:  0.15,
      enabled: true,
      fn: ctx => phoneticSimilarity(ctx.noSp, ctx.noSp_c),
    },
  ],

  /**
   * スコア計算
   * compute(noSp, noSp_c, withSp, withSp_c) → 0〜1
   */
  compute(noSp, noSp_c, withSp, withSp_c) {
    const ctx = { noSp, noSp_c, withSp, withSp_c };
    const active = this.algorithms.filter(a => a.enabled);
    if (!active.length) return 0;
    const totalWeight = active.reduce((s, a) => s + a.weight, 0);
    if (!totalWeight) return 0;
    return active.reduce((s, a) => s + a.fn(ctx) * a.weight, 0) / totalWeight;
  },
};

/* ============================================================
   TexTage URL生成用定数・ヘルパー
   ============================================================ */

/**
 * version.json の配列インデックス → TexTage URL の {version} コードへの変換
 * index 0 = "1st style" → "1"
 * index 1 = "substream" → "s"
 * index N (N>=2) → String(N)  例: 21 → "21" (SPADA)
 */
function getVersionUrlCode(versionIdx) {
  if (versionIdx < 0) return '0';
  if (versionIdx === 0) return '1';
  if (versionIdx === 1) return 's';
  return String(versionIdx);
}

/**
 * 譜面レベル数値 → TexTage suffix 先頭文字
 * 1-9 → "1"-"9", 10 → "A", 11 → "B", 12 → "C", 0/その他 → "0"
 */
function levelToChar(level) {
  if (level <= 0 || level > 12) return '0';
  if (level <= 9) return String(level);
  return String.fromCharCode(55 + level); // 10→"A", 11→"B", 12→"C"
}

/** 難易度定義: [頭文字, 名称, difficulty_code, 色キー] */
const DIFFICULTIES = [
  { label: 'B', name: 'BEGINNER',    code: 'P', colorKey: 'beginner'    },
  { label: 'N', name: 'NORMAL',      code: 'N', colorKey: 'normal'      },
  { label: 'H', name: 'HYPER',       code: 'H', colorKey: 'hyper'       },
  { label: 'A', name: 'ANOTHER',     code: 'A', colorKey: 'another'     },
  { label: 'L', name: 'LEGGENDARIA', code: 'X', colorKey: 'leggendaria' },
];

/* ============================================================
   楽曲マージ処理
   同一タイトルの楽曲IDを1つにまとめ、in_ac/in_inf は OR でマージする
   （例: ID=1833 が in_inf のみ、ID=1877 が in_ac のみ
         → マージ後は in_ac: true, in_inf: true）
   ============================================================ */
let mergedSongs = null;  // Array<{ title, normRaw, in_ac, in_inf }>
let aliasByTitle = null; // Map<titleStr, string[]> 正規化済みエイリアス

/**
 * チャートサブオブジェクトを生成する
 */
function buildChartObj(textageTag, versionCode, sp, dp, spNotes, dpNotes) {
  return { textageTag, versionCode, sp, dp, spNotes, dpNotes };
}

function buildMergedSongs(title, normalized, chart, songInfo, versionNames, textageTagData) {
  const groups = new Map(); // titleStr → merged song object

  for (const id of Object.keys(title)) {
    const titleStr = title[id];
    if (!titleStr) continue;
    const normRaw     = normalized[id] || titleStr;
    const chartData   = chart[id]      || {};
    const extraData   = songInfo[id]   || {};
    const in_ac       = chartData.in_ac  === true;
    const in_inf      = chartData.in_inf === true;
    const artist      = extraData.artist || '';
    const versionIdx  = typeof extraData.version === 'number' ? extraData.version : -1;
    const versionName = versionIdx >= 0 && versionNames[versionIdx] ? versionNames[versionIdx] : '';
    const versionCode = getVersionUrlCode(versionIdx);
    const textageTag  = (textageTagData && textageTagData[id]) || '';
    const sp          = chartData.sp      || [0, 0, 0, 0, 0];
    const dp          = chartData.dp      || [0, 0, 0, 0, 0];
    const spNotes     = chartData.spNotes || [0, 0, 0, 0, 0];
    const dpNotes     = chartData.dpNotes || [0, 0, 0, 0, 0];

    // ID の種別を判定
    const isPureAC  = in_ac && !in_inf;   // AC専用
    const isPureINF = !in_ac && in_inf;   // INFINITAS専用
    const isShared  = in_ac && in_inf;    // 共通

    const chartObj = buildChartObj(textageTag, versionCode, sp, dp, spNotes, dpNotes);

    if (groups.has(titleStr)) {
      const existing = groups.get(titleStr);
      // in_ac / in_inf: どちらか一方でも true ならマージ後も true
      existing.in_ac  = existing.in_ac  || in_ac;
      existing.in_inf = existing.in_inf || in_inf;
      // バージョン: より早い収録（数値が小さい方）を優先（表示用）
      if (versionIdx >= 0 && (existing.versionIdx < 0 || versionIdx < existing.versionIdx)) {
        existing.versionIdx  = versionIdx;
        existing.versionName = versionName;
      }
      // acChart: Pure AC を優先。Pure が既にあれば上書きしない。Shared はスロット空きのみ
      if (isPureAC) {
        if (!existing.acChartFromPure) {
          existing.acChart = chartObj;
          existing.acChartFromPure = true;
        }
      } else if (isShared && !existing.acChart) {
        existing.acChart = chartObj;
      }
      // infChart: Pure INF を優先。Pure が既にあれば上書きしない。Shared はスロット空きのみ
      if (isPureINF) {
        if (!existing.infChartFromPure) {
          existing.infChart = chartObj;
          existing.infChartFromPure = true;
        }
      } else if (isShared && !existing.infChart) {
        existing.infChart = chartObj;
      }
    } else {
      const entry = {
        title: titleStr,
        normRaw,
        in_ac,
        in_inf,
        artist,
        versionIdx,
        versionName,
        acChart:         null,
        acChartFromPure: false,
        infChart:        null,
        infChartFromPure: false,
      };
      if (isPureAC) {
        entry.acChart = chartObj;
        entry.acChartFromPure = true;
      } else if (isPureINF) {
        entry.infChart = chartObj;
        entry.infChartFromPure = true;
      } else if (isShared) {
        entry.acChart  = chartObj;
        entry.infChart = chartObj;
      }
      groups.set(titleStr, entry);
    }
  }

  // 内部フラグを除いて返す
  return Array.from(groups.values()).map(({ acChartFromPure, infChartFromPure, ...rest }) => rest);
}

/* ============================================================
   エイリアスデータ（docs/ALIASES.json の内容をインライン埋め込み）
   ALIASES.json を更新した場合はここも合わせて更新すること
   ============================================================ */
const ALIASES_DATA = [
  {"title":"Elemental Creation","aliases":["エレクリ","エレメンタルクリエーション"]},
  {"title":"quell～the seventh slave～","aliases":["クエル","セブンスレイブ"]},
  {"title":"eRAseRmOToRpHAntOM","aliases":["モーターファントム","イレイザー"]},
  {"title":"Somnidiscotheque","aliases":["ソムニ","ソムニディスコ"]},
  {"title":"perditus†paradisus","aliases":["ペルパラ","ペルディトゥス"]},
  {"title":"VANESSA","aliases":["ヴァネッサ"]},
  {"title":"Scripted Connection⇒","aliases":["スクリプ","スクコネ"]},
  {"title":"Scripted Connection⇒ H mix","aliases":["スクリプH","スクコネH"]},
  {"title":"GOLDEN CROSS","aliases":["金クロ","ゴールデンクロス"]},
  {"title":"smooooch・∀・","aliases":["スムーチ","smooch"]},
  {"title":"嘆きの樹","aliases":["なげき","嘆き"]},
  {"title":"I'm so Happy","aliases":["愛無双","アイムソーハッピー"]},
  {"title":"天空の夜明け","aliases":["てんくう","てんくうのよあけ"]},
  {"title":"THANK YOU FOR PLAYING","aliases":["サンキュー","ありがとう"]},
  {"title":"fffff","aliases":["ファイブエフ","5f"]},
  {"title":"LOVE IS DREAMINESS","aliases":["ラブドリ","ラブドリーミネス"]},
  {"title":"MENDES","aliases":["メンデス"]},
  {"title":"Verflucht","aliases":["ファーフルフト","フルフト"]},
  {"title":"THE SAFARI","aliases":["サファリ"]},
  {"title":"AA","aliases":["ダブルエー","ダブルA"]},
  {"title":"Almagest","aliases":["アルマゲスト"]},
  {"title":"Evans","aliases":["エバンス"]},
  {"title":"Bad Maniacs","aliases":["バドマニ","バッドマニアクス"]},
  {"title":"gigadelic","aliases":["ギガデリック","ぎがでり"]},
  {"title":"quasar","aliases":["クエーサー"]},
  {"title":"BLACK.by X-Cross Fade","aliases":["ブラック","クロスフェード"]},
  {"title":"ICARUS","aliases":["イカロス"]},
  {"title":"reunion","aliases":["リユニオン"]},
  {"title":"Anisakis-somatic mutation type \"Forza\"-","aliases":["アニサキス","フォルツァ"]},
  {"title":"The Sampling Paradise","aliases":["さんぱら","サンプリングパラダイス"]},
  {"title":"FIRE FIRE","aliases":["ファイアファイア"]},
  {"title":"FUTURE is Dead","aliases":["フューチャーデッド","フューチャーイズデッド"]},
  {"title":"旋律のドグマ～Misérables～","aliases":["ドグマ","みぜらぶる"]},
  {"title":"灼熱Beach Side Bunny","aliases":["灼熱BSB","しゃくねつ"]},
  {"title":"JOMANDA","aliases":["ジョマンダ"]},
  {"title":"Sigmund","aliases":["ジグムント","ジークムント"]},
  {"title":"龍と少女とデコヒーレンス","aliases":["龍少女","デコヒーレンス"]},
  {"title":"GALGALIM","aliases":["ガルガリム"]},
  {"title":"†渚の小悪魔ラヴリィ～レイディオ†(IIDX EDIT)","aliases":["ラヴリィレイディオ","渚ラジオ"]},
  {"title":"Sense 2007","aliases":["センス"]},
  {"title":"Xepher","aliases":["ゼファー"]},
  {"title":"GENOCIDE","aliases":["ジェノサイド"]},
  {"title":"灼熱 Pt.2 Long Train Running","aliases":["灼熱2","ロングトレイン"]},
  {"title":"THE BLACK KNIGHT","aliases":["ブラックナイト","黒騎士"]},
  {"title":"SABER WING","aliases":["セイバーウィング"]},
  {"title":"Ristaccia","aliases":["リスタッチャ"]},
  {"title":"rage against usual","aliases":["レイジ"]},
  {"title":"CODE -CRiMSON-","aliases":["コードクリムゾン","クリムゾン"]},
  {"title":"CODE:1 [revision1.0.1]","aliases":["コード1","リビジョン"]},
  {"title":"CODE:2","aliases":["コード2"]},
  {"title":"Far east nightbird","aliases":["ファーイースト","ないとばーど"]},
  {"title":"1st Samurai","aliases":["ファーストサムライ","侍"]},
  {"title":"Colorful Cookie","aliases":["カラクッキー","カラフルクッキー"]},
  {"title":"少年A","aliases":["しょうねんA"]},
  {"title":"冬椿 ft. Kanae Asaba","aliases":["冬椿","ふゆつばき"]},
  {"title":"ANDROMEDA II","aliases":["アンドロメダ","アンドロ"]},
  {"title":"MIRACLE MEETS","aliases":["みらみー","ミラクルミーツ"]},
  {"title":"New Decade IIDX Edition","aliases":["ニューデケイド","にゅーでけいど"]},
  {"title":"ABSOLUTE","aliases":["アブソリュート"]},
  {"title":"Daisuke","aliases":["だいすけ","大輔"]},
  {"title":"POODLE","aliases":["プードル"]},
  {"title":"NEMESIS","aliases":["ネメシス"]},
  {"title":"GAMBOL","aliases":["ギャンボル"]},
  {"title":"Narcissus At Oasis","aliases":["ナルシサス","ナルシサスアットオアシス"]},
  {"title":"Electro Tuned(the SubS mix)","aliases":["エレクトロチューンド"]},
  {"title":"Digital MinD(A/T Libra mix)","aliases":["デジタルマインド"]},
  {"title":"Chrono Diver -PENDULUMs-","aliases":["クロノダイバー","ペンデュラムズ"]},
  {"title":"Element of SPADA","aliases":["エレメントオブスパーダ"]},
  {"title":"Proof of the existence","aliases":["プルーフ","プルーフオブエグジスタンス"]},
  {"title":"Beyond The Earth","aliases":["ビヨンドザアース"]},
  {"title":"Scars of FAUNA","aliases":["スカーズオブフォーナ","フォーナ"]},
  {"title":"Despair of ELFERIA","aliases":["デスペアオブエルフェリア","エルフェリア"]},
  {"title":"Nightmare before oversleep","aliases":["ナイトメアビフォーオーバースリープ"]},
  {"title":"chaos eater-IIDX edition-","aliases":["カオスイーター"]},
  {"title":"fallen leaves -IIDX edition-","aliases":["フォールンリーブス"]},
  {"title":"Lost wing at.0","aliases":["ロストウィング"]},
  {"title":"satellite020712 from \"CODED ARMS\"","aliases":["サテライト","コーデッドアームズ"]},
  {"title":"Queen's Tragedy","aliases":["クイーンズトラジェディ","クイトラ"]},
  {"title":"Rainbow after snow","aliases":["レインボーアフタースノー","にじゆき"]},
  {"title":"The Smile of You","aliases":["スマイルオブユー"]},
  {"title":"Bloody Tears(IIDX EDITION)","aliases":["ブラッディティアーズ"]},
  {"title":"DEATH†ZIGOQ～怒りの高速爆走野郎～","aliases":["デスジゴク","ジゴク"]},
  {"title":"CaptivAte～裁き～","aliases":["キャプティベイト","裁き"]},
  {"title":"電人イェーガーのテーマ(Theme of DENJIN J)","aliases":["でんじんテーマ","電人テーマ"]},
  {"title":"FLARE -炎舞- ft.Nana Takahashi","aliases":["フレア","炎舞"]},
  {"title":"THE SHINING POLARIS(kors k mix)","aliases":["シャイニングポラリス","ポラリス"]},
  {"title":"Love Is Eternity","aliases":["ラブイズエタニティ"]},
  {"title":"Back Into The Light","aliases":["バックイントゥザライト"]},
  {"title":"High School Love","aliases":["ハイスクールラブ"]},
  {"title":"Harmony and Lovely","aliases":["ハーモニーアンドラブリー"]},
  {"title":"in the Sky","aliases":["インザスカイ"]},
  {"title":"State Of The Art","aliases":["ステートオブザアート"]},
  {"title":"Bounce Bounce Bounce","aliases":["バウンスバウンスバウンス"]},
  {"title":"Never Fade Away","aliases":["ネバーフェードアウェイ"]},
  {"title":"Drive Me Crazy","aliases":["ドライブミークレイジー"]},
  {"title":"Release The Music","aliases":["リリースザミュージック"]},
  {"title":"Echo Of Forever","aliases":["エコーオブフォーエバー"]},
  {"title":"Rising in the Sun(original mix)","aliases":["ライジングインザサン"]},
  {"title":"Flash Back 90's","aliases":["フラッシュバック","フラバク"]},
  {"title":"Super Duper Racers","aliases":["スーパーデューパーレーサーズ"]},
  {"title":"Cyber True Color","aliases":["サイバートゥルーカラー"]},
  {"title":"Trill auf G","aliases":["トリルアウフG","トリルG"]},
  {"title":"I'm In Love Again","aliases":["アイムインラブアゲイン"]},
  {"title":"PUT YOUR FAITH IN ME(for beatmania II)","aliases":["プットユアフェイスインミー"]},
  {"title":"SP-TRIP MACHINE(for beatmania II)","aliases":["SPトリップマシン","トリップマシン"]},
  {"title":"Tizona d'El Cid","aliases":["ティソナデルシド","ティソナ"]},
  {"title":"The Hope of Tomorrow","aliases":["ホープオブトゥモロー"]},
  {"title":"Make Me Your Own","aliases":["メイクミーユアオウン"]},
  {"title":"Dancin' Into The Night","aliases":["ダンシンイントゥザナイト","ダンナイ"]},
  {"title":"I Was The One","aliases":["アイワズワン"]},
  {"title":"You Were The One","aliases":["ユーワーワン"]},
  {"title":"Light My Fire","aliases":["ライトマイファイア"]},
  {"title":"Ride To The Core","aliases":["ライドトゥザコア"]},
  {"title":"ASIAN VIRTUAL REALITIES (MELTING TOGETHER IN DAZZLING DARKNESS)","aliases":["アジバチャ"]},
  {"title":"spiral galaxy-L.E.D. STYLE SPREADING PARTICLE BEAM MIX-","aliases":["スパイラルギャラクシー","スパギャラ"]},
  {"title":"T-REX vs Velociraptor (In the Far east euphoria)","aliases":["ティレックス","ティレックスvsラプター"]},
  {"title":"Zenius -I- vanisher","aliases":["ゼニアス","ゼニバニ"]},
  {"title":"R∞tAge","aliases":["ルーテージ"]},
  {"title":"THE F∀UST","aliases":["ファウスト"]},
  {"title":"SOLID STATE SQUAD -RISEN RELIC REMIX-","aliases":["ソリステ","ソリッドステートスクワッド"]},
  {"title":"CHRONO DIVER -NORNIR-","aliases":["ノルニル","クロノノルニル"]},
  {"title":"BITTER CHOCOLATE STRIKER","aliases":["ビタチョコ","ビターチョコストライカー"]},
  {"title":"AIR RAID FROM THA UNDAGROUND","aliases":["エアレイド","アンダーグラウンド"]},
  {"title":"THE PEERLESS UNDER HEAVEN","aliases":["ピアレス","天下無双"]},
  {"title":"OUTER LIMITS ALTERNATIVE","aliases":["アウターリミッツ","アウタリミ"]},
  {"title":"YELLOW FROG from Steel Chronicle","aliases":["イエローフロッグ","スチクロ"]},
  {"title":"AA -rebuild-","aliases":["AAリビルド","ダブルエーリビルド"]},
  {"title":"VALLIS-NERIA","aliases":["バリスネリア"]},
  {"title":"DAWN-THE NEXT ENDEAVOUR-","aliases":["ドーン","ネクストエンデヴァー"]},
  {"title":"ALBA-黎明-","aliases":["アルバ","黎明"]},
  {"title":"AMRITA -不滅ノ花-","aliases":["アムリタ","不滅の花"]},
  {"title":"CaptivAte2～覚醒～","aliases":["キャプ2","覚醒"]},
  {"title":"CaptivAte～浄化～","aliases":["キャプ浄化","浄化"]},
  {"title":"CaptivAte～誓い～","aliases":["キャプ誓い","誓い"]},
  {"title":"Raison d'être～交差する宿命～","aliases":["レゾンデートル","交差する宿命"]},
  {"title":"Blind Justice～Torn souls,Hurt Faiths～","aliases":["ブラインドジャスティス","ブラジャス"]},
  {"title":"LETHEBOLG～双神威に斬り咲けり～","aliases":["レスボルグ","双神威"]},
  {"title":"ALFARSHEAR 双神威に廻る夢","aliases":["アルファシア","双神威廻る夢"]},
  {"title":"VALKYRIAS -英雄誕生-","aliases":["バルキリアス","英雄誕生"]},
  {"title":"Amor∞Fati","aliases":["アモルファティ"]},
  {"title":"COSMIC☆WONDER☆REVOLUTION","aliases":["コスワン","コズミックワンダー"]},
  {"title":"HELL SCAPER-Last Escape Remix-","aliases":["ヘルスケーパー","ラストエスケープ"]},
  {"title":"Inner Spirit -GIGA HiTECH MIX-","aliases":["インナースピリット","ギガハイテック"]},
  {"title":"STARS☆☆☆(Re-tuned by HΛL)-IIDX EDITION-","aliases":["スターズ","スターズHAL"]},
  {"title":"PLASMA SOUL NIGHT feat. Nana Takahashi / 709sec.","aliases":["プラズマソウル","プラズマナイト"]},
  {"title":"JUSTICE/GUILTY feat. Nana Takahashi & 709sec.","aliases":["ジャスギル","ジャスティスギルティ"]},
  {"title":"Indigo Vision(full flavour hide around mix)","aliases":["インディゴビジョン","インジゴ"]},
  {"title":"tripping contact(teranoid&MC Natsack Remix)","aliases":["トリッピングコンタクト","トリコン"]},
  {"title":"wanna be a \"BAD GIRL\" feat. Nana Takahashi","aliases":["ワナビー","バッドガール"]},
  {"title":"The Wind of China Express(The 4th Mashup)","aliases":["チャイナエクスプレス","チャイナ"]},
  {"title":"Programmed Sun(xac Antarctic Ocean mix)","aliases":["プログラムドサン","プロサン"]},
  {"title":"We're so Happy(P*Light Remix) IIDX ver.","aliases":["ウィーソーハッピー","ウィーソー"]},
  {"title":"Don't Stop The Music feat. Kanae Asaba","aliases":["ドンストップ","ドンストップザミュージック"]},
  {"title":"LOVE AGAIN TONIGHT～for Mellisa mix～","aliases":["ラブアゲイントゥナイト","ラブアゲイン"]},
  {"title":"JOURNEY TO \"FANTASICA\"(IIDX LIMITED)","aliases":["ファンタシカ","ジャーニーファンタシカ"]},
  {"title":"Disco Killer Music Lover","aliases":["ディスコキラー","ディスコキラーミュージックラバー"]},
  {"title":"Liquid Crystal Girl feat. echo","aliases":["リキクリガール","液晶少女"]},
  {"title":"kors k's Let's make an Image Song!","aliases":["イメソン","レッツメイクイメージソング"]},
  {"title":"Hollywood Galaxy(DJ NAGAI Remix)","aliases":["ハリウッドギャラクシー","ハリギャラ"]},
  {"title":"Burning Heat!(Full Option Mix)","aliases":["バーニングヒート","バーニング"]},
  {"title":"Dr. Chemical & Killing Machine","aliases":["ドクケミ","ドクターケミカル"]},
  {"title":"Devilz Sacrifice-贖罪の羊-","aliases":["デビルズサクリファイス","贖罪の羊"]},
  {"title":"kors k's How to make OTOGE CORE","aliases":["音ゲーコア","オトゲコア"]},
  {"title":"Apocalypse～dirge of swans～","aliases":["アポカリプス","ダージオブスワンズ"]},
  {"title":"PARANOIA MAX～DIRTY MIX～","aliases":["パラノイアマックス","パラマックス"]},
  {"title":"PARANOiA ～HADES～","aliases":["パラノイアハデス","ハデス"]},
  {"title":"HAERETICUS","aliases":["ヘレティカス","ヘレティクス"]},
  {"title":"Geirskögul","aliases":["ゲイルスコグル","ゲイル"]},
  {"title":"Giudecca","aliases":["ジュデッカ","ジューデッカ"]},
  {"title":"GloriosA","aliases":["グロリオーサ"]},
  {"title":"AsiaN distractive","aliases":["アジアンディストラクティブ","アジディス"]},
  {"title":"BabeL ～Grand Story～","aliases":["バベル","グランドストーリー"]},
  {"title":"DORNWALD ～Junge～","aliases":["ドルンヴァルト","ユンゲ"]},
  {"title":"Eine Haube ～聖地の果てにあるもの～","aliases":["アイネハウベ","聖地の果て"]},
  {"title":"ZETA～素数の世界と超越者～","aliases":["ゼータ","素数の世界"]},
  {"title":"Turii～Panta rhei～","aliases":["トゥーリー","パンタレイ"]},
  {"title":"Galaxy Collapse","aliases":["ギャラクシーコラプス","ギャラコラ"]},
  {"title":"GuNGNiR","aliases":["グングニル"]},
  {"title":"AO-∞","aliases":["AOインフィニティ","えーおー∞"]},
  {"title":"Ignis†Iræ","aliases":["イグニスイレ","イグニス"]},
  {"title":"HYPER BOUNDARY GATE","aliases":["ハイパーバウンダリーゲート","バウンダリーゲート"]},
  {"title":"GiGaGaHell","aliases":["ギガガヘル"]},
  {"title":"Scripted Connection⇒ A mix","aliases":["スクコネA","スクリプA"]},
  {"title":"Scripted Connection⇒ N mix","aliases":["スクコネN","スクリプN"]},
  {"title":"BALLAD FOR YOU～想いの雨～","aliases":["バラードフォーユー","想いの雨"]},
  {"title":"ALL MY TURN-このターンに、オレの全てを賭ける-","aliases":["オールマイターン","このターンに"]},
  {"title":"The Sealer ～ア・ミリアとミリアの民～","aliases":["シーラー","アミリア"]},
  {"title":"XENON II ～TOMOYUKIの野望～","aliases":["ゼノンII","トモユキの野望"]},
  {"title":"beatchic☆仮面～好き、でいさせて～","aliases":["ビートシック仮面","ビーチク"]},
  {"title":"Chasing After YOU ～夢の欠片～ ft. 小林マナ","aliases":["チェイシングアフターユー","夢の欠片"]},
  {"title":"恋はどう？モロ◎波動OK☆方程式!!","aliases":["恋はどう","モロ波動"]},
  {"title":"BLUE DRAGON(雷龍RemixIIDX)","aliases":["ブルードラゴン","雷龍"]},
  {"title":"BLO§OM","aliases":["ブロッサム"]},
  {"title":"B4U(BEMANI FOR YOU MIX)","aliases":["ビーフォーユー","B4U"]},
  {"title":"BAD BOY BASS!!(dj Remo-con MIX)","aliases":["バッドボーイベース","バドボーイ"]},
  {"title":"HYPER EUROBEAT(2DX style)","aliases":["ハイパーユーロビート","ハイユーロ"]},
  {"title":"ABSOLUTE EVIL","aliases":["アブソリュートイービル","絶対悪"]},
  {"title":"199024club -Re:BounceKiller-","aliases":["いっきゅうクラブ","リバウンスキラー"]},
  {"title":"DIVE～INTO YOUR HEART～","aliases":["ダイブ","イントゥユアハート"]},
  {"title":"Double ♥♥ Loving Heart","aliases":["ダブルラビングハート","ダブルハート"]},
  {"title":"GRID KNIGHT","aliases":["グリッドナイト"]},
  {"title":"Gravigazer","aliases":["グラビゲイザー","グラビ"]},
  {"title":"Grand Chariot","aliases":["グランシャリオ","グランドシャリオ"]},
  {"title":"Stargazing Trip ～星 探す旅～ ft. 小林マナ","aliases":["スターゲイジングトリップ","星探す旅"]},
  {"title":"DM STAR～関西 energy style～","aliases":["DMスター","関西エナジー"]},
  {"title":"HYPE THE CORE","aliases":["ハイプザコア"]},
  {"title":"A Tale Hidden In The Abyss","aliases":["アビスの物語","テイルヒドゥン"]},
  {"title":"Dans la nuit de l'éternité","aliases":["ダンラニュイ","エタニテ"]},
  {"title":"Hormiga obrera","aliases":["オルミガオブレラ","アリ曲"]},
  {"title":"Ubiquitous Fantastic Ride","aliases":["ユビキタスファンタスティックライド","ユビキタス"]},
  {"title":"GRADIUSIC CYBER","aliases":["グラディウシック","グラシック"]},
  {"title":"Highcharge Divolt","aliases":["ハイチャージダイヴォルト","ダイヴォルト"]},
  {"title":"Votum stellarum-Hommarju Remix-","aliases":["ボトゥムステラルム","ボトステラ"]},
  {"title":"全力 SPECIAL VACATION!!～限りある休日～","aliases":["ぜんりょくバケーション","限りある休日"]},
  {"title":"smooooch・∀・ (Snail's House Remix)","aliases":["スムーチスネイル","スムーチリミックス"]},
  {"title":"合体せよ!ストロングイェーガー!!(Ryu☆ remix)","aliases":["ストロングイェーガー","合体イェーガーリミックス"]},
  {"title":"クルクル☆ラブ～Opioid Peptide MIX～","aliases":["クルクルラブ","オピオイドペプチド"]},
  {"title":"花吹雪 ～ IIDX LIMITED ～","aliases":["はなふぶき","花吹雪IIDX"]},
  {"title":"CaptivAte～裁き～(SUBLIME TECHNO MIX)","aliases":["キャプ裁きサブライム","サブライムテクノ"]},
  {"title":"かげぬい ～ Ver.BENIBOTAN ～","aliases":["かげぬい","影縫い"]},
  {"title":"50th Memorial Songs-二人の時 ～under the cherry blossoms～-","aliases":["フィフティスメモリアル","二人の時桜"]},
  {"title":"太陽～T・A・I・Y・O～","aliases":["たいよう","タイヨー"]},
  {"title":"NEW GENERATION-もう、お前しか見えない-","aliases":["ニュージェネ","ニュージェネレーション"]},
  {"title":"NEW SENSATION-もう、あなたしか見えない-","aliases":["ニューセンセーション","ニューセンセ"]},
  {"title":"フェティッシュペイパー～脇の汗回転ガール～","aliases":["フェティッシュペイパー","わきのあせ"]},
  {"title":"夏色DIARY - L.E.D.-G STYLE MIX -","aliases":["夏色ダイアリー","なついろダイアリー"]},
  {"title":"Bahram Attack-猫叉Master Remix-","aliases":["バーラムアタック","猫叉バーラム"]},
  {"title":"鉄甲乙女-under the steel-","aliases":["てっこうおとめ","鉄甲乙女"]},
  {"title":"夕焼け～Fading Day～","aliases":["ゆうやけ","フェイディングデイ"]},
  {"title":"野球の遊び方 そしてその歴史 ～決定版～","aliases":["やきゅうの遊び方","野球決定版"]},
  {"title":"真 地獄超特急 -HELL or HELL-","aliases":["真地獄超特急","しんじごくちょうとっきゅう"]},
  {"title":"龍王の霊廟(Mausoleum Of The Primal Dragon)","aliases":["龍王の霊廟","りゅうおうのれいびょう"]},
  {"title":"ピアノ協奏曲第１番\"蠍火\" (BlackY Remix)","aliases":["さそりびリミックス","ピアノ協奏曲蠍火"]},
  {"title":"世界の果てに約束の凱歌を -ReUnion-","aliases":["世界の果てに","せかいのはてにかいかを"]},
  {"title":"灼熱Beach Side Bunny(かめりあ's \"Summertime D'n'B\" Remix)","aliases":["灼熱BSBかめりあ","灼熱サマータイム"]},
  {"title":"天使のカンタータ -Cantata of Angels-","aliases":["天使のカンタータ","エンジェルカンタータ"]},
  {"title":"デラむぅのでらっくす☆どり～むぅ","aliases":["デラむぅ","でらっくすどりーむ"]},
  {"title":"♥LOVE² シュガ→♥","aliases":["ラブラブシュガー","ラブシュガ"]},
  {"title":"走馬灯-The Last Song-","aliases":["そうまとう","走馬灯ラストソング"]},
  {"title":"即席！脳直★ミュージックシステム","aliases":["脳直ミュージック","のうちょくシステム"]},
  {"title":"キャトられ♥恋はモ～モク","aliases":["キャトられ","恋はモーモク"]},
  {"title":"紫陽花 -AZISAI-","aliases":["あじさい","アジサイ"]},
  {"title":"Sarutobi Champion is 拙者","aliases":["サルトビチャンピオン","猿飛チャンピオン"]},
  {"title":"次葉-turn the page-","aliases":["つぎは","ターンザページ"]},
  {"title":"神謳 -RESONANCE-","aliases":["かみうた","レゾナンス"]},
  {"title":"Hyper Drive feat. ぷにぷに電機","aliases":["ハイパードライブ","ぷにドライブ"]},
  {"title":"残像ニ繋ガレタ追憶ノHIDEAWAY","aliases":["残像ハイドアウェイ","ざんぞうハイドアウェイ"]},
  {"title":"スパークリング☆彡ハイパーチューン！！","aliases":["スパークリングハイパーチューン","スパチュン"]},
  {"title":"Raspberry♥Heart(English version)","aliases":["ラズベリーハート","ラズハート"]},
  {"title":"華爛漫-Flowers-","aliases":["はなあでやか","華爛漫"]},
  {"title":"死神自爆中二妹アイドルももかりん(1歳)","aliases":["死神アイドル","ももかりん"]},
  {"title":"少女アリスと箱庭幻想コンチェルト","aliases":["少女アリス","箱庭コンチェルト"]},
  {"title":"ラストセンチュリーメランコリック","aliases":["ラストセンチュリー","ラスセン"]},
  {"title":"カゴノトリ～弐式～","aliases":["カゴノトリ","かごのとり弐式"]},
  {"title":"零-ZERO-","aliases":["ぜろ","レイ"]},
  {"title":"超青少年ノ為ノ超多幸ナ超古典的超舞曲","aliases":["ちょうせいしょうねん","超古典舞曲"]},
  {"title":"妖隠し -あやかしかくし-","aliases":["あやかしかくし","妖隠し"]},
  {"title":"朝焼けから始まるボクらの小さな旅","aliases":["あさやけたび","朝焼けの旅"]},
  {"title":"麗 ～うらら～","aliases":["うらら","麗うらら"]},
  {"title":"伐折羅-vajra-","aliases":["ばさら","ヴァジュラ"]},
  {"title":"Clione (Ryu☆ Remix)","aliases":["クリオネリミックス","クリオネRyu"]},
  {"title":"Ha・lle・lu・jah","aliases":["ハレルヤ","はれるやー"]},
  {"title":"RIDE ON THE LIGHT(HI GREAT MIX)","aliases":["ライドオンザライト","ライドライト"]},
  {"title":"ピアノ協奏曲第１番\"蠍火\"","aliases":["蠍火","サソリビ","ピアコン"]},
  {"title":"パラドキシカル・タイムリープトライアル(Short Ver.)","aliases":["パラドキシカル","タイムリープ"]},
  {"title":"お米の美味しい炊き方、そしてお米を食べることによるその効果。","aliases":["お米の炊き方","おこめ"]},
  {"title":"#MAGiCVLGiRL_TRVP_B3VTZ","aliases":["マジックガール","マジカルガール","トラップビーツ"]},
  {"title":"L'amour et la liberté","aliases":["ラムール","ラムールエラリベルテ"]},
  {"title":"Illegal Function Call","aliases":["イリーガル","イリーガルファンクション"]},
  {"title":"⁽⁽ଘ( ˙꒳˙ )ଓ⁾⁾ beyond reason","aliases":["ビヨンドリーズン","顔文字曲"]},
  {"title":"London Affairs BeckonedWith Money Loved By Yellow Papers.","aliases":["ロンドンアフェアーズ","ロンドン"]},
  {"title":"DENJIN AKATSUKINI TAORERU-SF PureAnalogSynth Mix-","aliases":["電人暁に斃れる","でんじんあかつき"]},
  {"title":"ワルツ第17番 ト短調\"大犬のワルツ\"","aliases":["大犬のワルツ","おおいぬのワルツ","ワルツ17番"]},
  {"title":"Miracle 5ympho X","aliases":["ミラクルシンフォニックス","ミラクル5","シンフォX"]},
  {"title":"Dances with Snow Fairies","aliases":["ダンシズウィズスノウフェアリーズ","スノウフェアリー"]},
  {"title":"Session 9-Chronicles-","aliases":["セッション9","セッションナイン"]},
  {"title":"Breaking Dawn feat. NO+CHIN, AYANO","aliases":["ブレイキングドーン","ブレイキン"]},
  {"title":"24th Century BOY","aliases":["24世紀ボーイ","にじゅうよんせいきボーイ"]},
  {"title":"灼熱 Lost Summer Dayz","aliases":["灼熱ロスト","ロストサマーデイズ"]},
  {"title":"ぷろぐれっしぶ時空少女!うらしまたろ子ちゃん!","aliases":["うらしまたろ子","プログレ時空少女"]},
  {"title":"太陽SUNSUNボンジュールアバンチュール","aliases":["ボンジュールアバンチュール","太陽サンサン"]},
  {"title":"SpaceLand☆TOYBOX","aliases":["スペースランドトイボックス","スペランド"]},
  {"title":"Sweet Sweet ♥ Magic","aliases":["スウィートマジック","スイートスイートマジック"]},
  {"title":"Don't be afraid myself","aliases":["ドントビーアフレイド","ドンビー"]},
  {"title":"Little Little Princess","aliases":["リトルリトルプリンセス","リトプリ"]},
  {"title":"kors k's How to make OTOGE CORE 「LONG」","aliases":["音ゲーコアLONG","音ゲーコア長い版"]},
  {"title":"チェイスチェイスジョーカーズのうた(オニスタイルリミックス)","aliases":["チェイスチェイスジョーカーズのうた鬼","チェジョカオニ"]},
  {"title":"炸裂！イェーガー電光チョップ!!(JAEGER FINAL ATTACK)","aliases":["イェーガー電光チョップ","ジェーガーファイナルアタック"]},
  {"title":"オレはビートマニア！お前は何マニア？","aliases":["オレビー","俺はビートマニア"]},
  {"title":"キャッシュレスは愛情消すティッシュ","aliases":["キャッシュレス","愛情消すティッシュ"]},
  {"title":"Push on Beats!～音ゲの国のeX-ストリーマー～","aliases":["プッシュオンビーツ","音ゲの国のeXストリーマー"]},
  {"title":"50th Memorial Songs -Beginning Story-","aliases":["50thビギニングストーリー","ビギニングストーリー"]},
  {"title":"50th Memorial Songs -Flagship medley-","aliases":["50thフラッグシップメドレー","フラッグシップメドレー"]},
  {"title":"50th Memorial Songs -The BEMANI History-","aliases":["50thビーマニヒストリー","ビーマニヒストリー"]},
  {"title":"がっつり陰キャ!?怪盗いいんちょの億劫^^;","aliases":["いいんちょの億劫","陰キャいいんちょ"]},
  {"title":"表裏一体!?怪盗いいんちょの悩み♥","aliases":["いいんちょの悩み","ひょうりいったいいいんちょ"]},
  {"title":"もっと!モット!ときめき feat.松下","aliases":["もっとときめき","モットときめき"]},
  {"title":"パ→ピ→プ→Yeah!","aliases":["パピプイェー","パ→ピ→プ→"]},
  {"title":"Timepiece phase II(CN Ver.)","aliases":["タイムピースフェーズ2","タイムピースCN"]},
  {"title":"Y&Co. is dead or alive","aliases":["ワイアンドコー","デッドオアアライブ"]},
  {"title":"405nm(Ryu☆mix)","aliases":["405ナノメートル","よんまるごナノメートル"]},
  {"title":"Cleopatrysm","aliases":["クレオパトリズム","クレオパ"]},
  {"title":"Innocent Walls","aliases":["イノセントウォールズ","イノウォ"]},
  {"title":"逆月","aliases":["ぎゃくつき","さかつき"]},
  {"title":"Smug Face-どうだ、オレの生き様は-(ONLY ONE EDITION)","aliases":["スマグフェイス","どうだオレの生き様は"]},
  {"title":"CARRY ON NIGHT(English version)","aliases":["キャリーオンナイト","キャリオン英語"]},
  {"title":"Frozen Ray(original mix)","aliases":["フローズンレイ"]},
  {"title":"Summer Vacation(CU mix)","aliases":["サマーバケーション","サマバケ"]},
  {"title":"Be Rock U(1998 burst style)","aliases":["ビーロックユー","ビーロック"]},
  {"title":"I Was The One(80's EUROBEAT STYLE)","aliases":["アイワズザワン80s","ユーロビート版"]},
  {"title":"thunder HOUSE NATION Remix","aliases":["サンダーハウスネイション","サンダーリミックス"]},
  {"title":"Ready To Rockit Blues","aliases":["レディトゥロックイットブルース","ロックイットブルース"]},
  {"title":"Always We Trust In You","aliases":["オールウェイズウィートラスト","トラストインユー"]},
  {"title":"冥","aliases":["めい"]},
  {"title":"卑弥呼","aliases":["ひみこ"]},
  {"title":"電人、暁に斃れる。","aliases":["でんじん","電人暁"]},
  {"title":"凛として咲く花の如く","aliases":["凛花","りんか","凛として"]},
  {"title":"高高度降下低高度開傘","aliases":["高高度","こうこうど","HAHO"]},
  {"title":"恋愛=精度×認識力","aliases":["恋愛精度","れんあいせいど","恋愛イコール"]},
  {"title":"SOLID STATE SQUAD","aliases":["ソリッドステートスクワッド","ソリステ"]},
  {"title":"QUANTUM TELEPORTATION","aliases":["クアンタムテレポーテーション","量子テレポ"]},
  {"title":"DREAM OF SPACE UFO ABDUCTION","aliases":["ドリームオブスペース","スペースUFO"]},
  {"title":"ELECTRIC MASSIVE DIVER","aliases":["エレクトリックマッシブダイバー"]},
  {"title":"EXTREME MACH COLLIDER","aliases":["エクストリームマッハコライダー","エクマッハ"]},
  {"title":"SOUND OF GIALLARHORN","aliases":["ギャラルホルン","サウンドオブギャラルホルン"]},
  {"title":"THE DOOR INTO RAINBOW","aliases":["ドアイントゥレインボー","虹の扉"]},
  {"title":"Banger Banger Banger Banger","aliases":["バンガーバンガー","バンガー4"]},
  {"title":"The Rebellion of Sequencer","aliases":["リベリオン","リベリオンオブシーケンサー"]},
  {"title":"PSYCHE PLANET-GT","aliases":["サイキプラネット","サイキープラネット"]},
  {"title":"XANADU OF TWO","aliases":["ザナドゥオブツー","ザナドゥ"]},
  {"title":"SA.YO.NA.RA. SUPER STAR","aliases":["サヨナラスーパースター","さよならスーパースター"]},
  {"title":"Übertreffen","aliases":["ウーバートレッフェン","ウーバー"]},
  {"title":"Präludium","aliases":["プレリュディウム","プレリュード"]},
  {"title":"ÆTHER","aliases":["エーテル","アイテール"]},
  {"title":"VØID","aliases":["ヴォイド"]},
  {"title":"FiZZλ_PØT!OИ","aliases":["フィズポーション","フィズラムダポーション"]},
  {"title":"Uaigh Gealaí","aliases":["ウアイジャラー","アイルランド曲"]},
  {"title":"Amor De Verão","aliases":["アモールデヴェラン","アモール"]},
  {"title":"Mächö Mönky","aliases":["マッチョモンキー"]},
  {"title":"Flämingo","aliases":["フラミンゴ"]},
  {"title":"CODE:Ø","aliases":["コードゼロ","コードオー"]},
  {"title":"ACTØ","aliases":["アクトゼロ","アクトオー"]},
  {"title":"Space Battleship S4TØ","aliases":["スペースバトルシップサトー","宇宙戦艦サトー"]},
  {"title":"Xlø","aliases":["エクスロー"]},
  {"title":"dAuntl3ss","aliases":["ダウントレス"]},
  {"title":"M4K3 1T B0UNC3","aliases":["メイクイットバウンス"]},
  {"title":"Wolf 1061","aliases":["ウルフ1061","ウルフ"]},
  {"title":"∀","aliases":["ターン","ターンエー"]},
  {"title":"quaver♪","aliases":["クエーバー"]},
  {"title":"FERMI♡PARADOX","aliases":["フェルミパラドックス","フェルミ"]},
  {"title":"灼熱Beach Side Bunny(Masayoshi Iimori Remix)","aliases":["灼熱BSBイイモリ","灼熱飯盛"]},
  {"title":"Raspberry Potion(feat.あれたん♡ & ぎゃるのしん☆)","aliases":["ラズベリーポーション","ラズポ"]},
  {"title":"めうめうぺったんたん！！(ZAQUVA Remix)","aliases":["めうめう","めうぺった"]},
  {"title":"NEMESIS-gratitude remix- IIDX Edition","aliases":["ネメシスグラティテュード","ネメシスリミックス"]},
  {"title":"サヨナラ・ヘヴン-Celtic Chip Dance Mix-","aliases":["サヨナラヘヴン","サヨヘヴ"]},
  {"title":"airflow -dreaming of the sky- Game Edition","aliases":["エアフロー","airflow"]},
  {"title":"覚悟せよ！エンタンメ～ン～より身の切り売り自暴自棄版～","aliases":["覚悟せよ","自暴自棄版","エンタンメーン"]},
  {"title":"Life Is A Game ft.DD\"ナカタ\"Metal","aliases":["ライフイズアゲーム","ナカタメタル"]},
  {"title":"IDC feat.REVERBEE (Mo'Cuts Ver)","aliases":["アイディーシー","モカッツ"]},
  {"title":"Next Tales 2 Oath(IIDX 20th Anniv \"Ring\" Theme)","aliases":["ネクストテイルズ","Ringテーマ"]},
  {"title":"NO LIMIT-オレ達に限界は無い-","aliases":["ノーリミット","オレ達に限界は無い"]},
  {"title":"KOTONOHA ft. Kotoha","aliases":["コトノハ","ことのは"]},
  {"title":"elemental bender feat. Kanae Asaba","aliases":["エレメンタルベンダー","エレベン"]}
];

/* ============================================================
   エイリアス処理
   ============================================================ */

/** カタカナをひらがなに変換（ひらがな/カタカナ入力を区別せずマッチさせるため） */
function toHiragana(str) {
  return str.replace(/[\u30A1-\u30F6]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

/** ALIASES.json の配列から titleStr → [正規化エイリアス, ...] の Map を構築 */
function buildAliasByTitle(aliasData) {
  const map = new Map();
  for (const entry of aliasData) {
    if (typeof entry.title !== 'string' || !Array.isArray(entry.aliases)) continue;
    const aliases = entry.aliases
      .filter(a => typeof a === 'string')
      .map(a => toHiragana(normalizeNoSpaces(a)))
      .filter(Boolean);
    if (aliases.length > 0) map.set(entry.title, aliases);
  }
  return map;
}

/**
 * 入力 queryNoSp（スペースなし正規化済み）が titleStr のエイリアスと
 * どの程度一致するかを 0〜1 で返す。
 *   1.0  … 完全一致
 *   0.7〜0.99 … 前方一致（入力途中）
 *   それ以下 … Levenshtein 類似度
 */
function computeAliasScore(queryNoSp, titleStr) {
  if (!aliasByTitle) return 0;
  const aliases = aliasByTitle.get(titleStr);
  if (!aliases || aliases.length === 0) return 0;
  const q = toHiragana(queryNoSp);
  if (!q) return 0;
  let best = 0;
  for (const a of aliases) {
    // 完全一致
    if (q === a) return 1.0;
    // 前方一致（エイリアスの途中まで入力している場合）
    if (a.startsWith(q) && q.length >= 2) {
      const s = 0.7 + 0.3 * (q.length / a.length);
      if (s > best) best = s;
    }
    // Levenshtein 類似度
    const lev = levenshteinSimilarity(q, a);
    if (lev > best) best = lev;
  }
  return best;
}

/* ============================================================
   検索メイン処理
   ============================================================ */
function search(query, filter) {
  if (!mergedSongs) return [];
  const inputNoSp   = normalizeNoSpaces(query);
  const inputWithSp = normalizeWithSpaces(query);
  if (!inputNoSp) return [];

  // フィルタ適用
  const pool = mergedSongs.filter(song => {
    if (filter === 'ac')  return song.in_ac;
    if (filter === 'inf') return song.in_inf;
    return true; // 'all'
  });

  const scored = pool.map(song => {
    const candNoSp   = normalizeNoSpaces(song.normRaw);
    const candWithSp = normalizeWithSpaces(song.normRaw);
    const simScore   = SimilarityEngine.compute(inputNoSp, candNoSp, inputWithSp, candWithSp);
    const aliasScore = computeAliasScore(inputNoSp, song.title);
    const score      = Math.max(simScore, aliasScore);
    // フィルターに応じて AC版 / INF版 のチャートデータを選択
    // 'inf' → INF優先、フォールバックAC
    // 'ac'/'all' → AC優先、フォールバックINF（INFINITAS限定曲は acChart=null なので自動的に INF を使用）
    const chart = filter === 'inf'
      ? (song.infChart ?? song.acChart ?? null)
      : (song.acChart  ?? song.infChart ?? null);
    return {
      title: song.title, artist: song.artist, versionName: song.versionName, in_ac: song.in_ac, in_inf: song.in_inf, score,
      textageTag:  chart?.textageTag  ?? '',
      versionCode: chart?.versionCode ?? '',
      sp:          chart?.sp          ?? [0, 0, 0, 0, 0],
      dp:          chart?.dp          ?? [0, 0, 0, 0, 0],
      spNotes:     chart?.spNotes     ?? [0, 0, 0, 0, 0],
      dpNotes:     chart?.dpNotes     ?? [0, 0, 0, 0, 0],
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 10);
}

/* ============================================================
   日本語が含まれるか判定（フォント切り替え用）
   ============================================================ */
function hasJapanese(str) {
  return /[\u3040-\u30ff\u4e00-\u9fff]/.test(str);
}

/* ============================================================
   DOM操作
   ============================================================ */
const searchInput    = document.getElementById('searchInput');
const resultsArea    = document.getElementById('resultsArea');
const loadingArea    = document.getElementById('loadingArea');
const errorArea      = document.getElementById('errorArea');
const debugToggle    = document.getElementById('debugToggle');
const versionToggle  = document.getElementById('versionToggle');

let showScore   = false;
let showVersion = false;

function showLoading(v) { loadingArea.hidden = !v; }
function showError(msg) {
  errorArea.hidden = false;
  errorArea.textContent = msg;  // textContent で安全に表示
}
function hideError() { errorArea.hidden = true; }

function clearResults() {
  while (resultsArea.firstChild) resultsArea.removeChild(resultsArea.firstChild);
}

/**
 * 1行分の難易度ボタン群を生成する（SP or DP）
 * @param {string} rowLabel  - "SP" | "DP"
 * @param {string} playStyle - TexTage play_style コード ("1" | "D")
 * @param {string} textageTag
 * @param {string} versionCode
 * @param {number[]} levels   - [B, N, H, A, L] の各レベル値
 * @param {number[]} notesArr - [B, N, H, A, L] の各ノーツ数
 * @param {boolean} canLink   - in_ac || in_inf
 */
function createDiffRow(rowLabel, playStyle, textageTag, versionCode, levels, notesArr, canLink) {
  const row = document.createElement('div');
  row.className = 'chart-links-row';

  const label = document.createElement('span');
  label.className = 'chart-links-label';
  label.textContent = rowLabel;
  row.appendChild(label);

  DIFFICULTIES.forEach((diff, i) => {
    const level = (levels   && levels[i])   || 0;
    const notes = (notesArr && notesArr[i]) || 0;
    // level=0 → 未実装、notes=0 → TexTageに譜面ページ未作成
    const isDisabled = !canLink || level === 0 || notes === 0 || !textageTag || !versionCode;

    if (isDisabled) {
      const btn = document.createElement('span');
      btn.className = `chart-diff-btn chart-diff-btn--${diff.colorKey} chart-diff-btn--disabled`;
      btn.setAttribute('aria-disabled', 'true');
      btn.textContent = level > 0 ? `${diff.label}:${level}` : `${diff.label}:-`;
      row.appendChild(btn);
    } else {
      const levelChar = levelToChar(level);
      const query = `${playStyle}${diff.code}${levelChar}00`;
      const href = `https://textage.cc/score/${versionCode}/${textageTag}.html?${query}`;
      const btn = document.createElement('a');
      btn.className = `chart-diff-btn chart-diff-btn--${diff.colorKey}`;
      btn.href = href;
      btn.target = '_blank';
      btn.rel = 'noopener noreferrer';
      btn.textContent = `${diff.label}:${level}`;
      btn.setAttribute('aria-label', `${diff.name} Lv.${level} の譜面を TexTage で開く`);
      row.appendChild(btn);
    }
  });

  return row;
}

/**
 * 楽曲カード内に追加する譜面リンクブロックを生成する
 * @param {{ textageTag:string, versionCode:string, sp:number[], dp:number[], in_ac:boolean, in_inf:boolean }} song
 */
function createChartLinks(song) {
  const container = document.createElement('div');
  container.className = 'chart-links';

  const canLink = song.in_ac || song.in_inf;

  container.appendChild(createDiffRow('SP', '1', song.textageTag, song.versionCode, song.sp, song.spNotes, canLink));
  container.appendChild(createDiffRow('DP', 'D', song.textageTag, song.versionCode, song.dp, song.dpNotes, canLink));

  return container;
}

function createCopyBtn(titleText) {
  const btn = document.createElement('button');
  btn.className = 'copy-btn';
  btn.textContent = 'コピー';
  btn.setAttribute('aria-label', `${titleText} をコピー`);
  btn.setAttribute('type', 'button');

  const toast = document.createElement('span');
  toast.className = 'copy-toast';
  toast.textContent = 'コピーしました';
  toast.setAttribute('aria-hidden', 'true');
  btn.appendChild(toast);

  let toastTimer = null;
  btn.addEventListener('click', () => {
    navigator.clipboard.writeText(titleText).catch(() => {
      // clipboard API が使えない場合のフォールバック
      const ta = document.createElement('textarea');
      ta.value = titleText;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
  });
  return btn;
}

function createScoreBadge(score) {
  const badge = document.createElement('span');
  badge.className = 'score-badge';
  badge.textContent = (score * 100).toFixed(1) + '%';
  if (!showScore) badge.hidden = true;
  return badge;
}

/** アーティスト・バージョンのサブ情報要素を生成 */
function createSongMeta(artist, versionName) {
  const meta = document.createElement('div');
  meta.className = 'song-meta';

  if (artist) {
    const artistEl = document.createElement('span');
    artistEl.className = hasJapanese(artist) ? 'song-artist' : 'song-artist-latin';
    artistEl.textContent = artist;
    meta.appendChild(artistEl);
  }

  if (versionName) {
    const verEl = document.createElement('span');
    verEl.className = 'song-version';
    verEl.textContent = versionName;
    if (!showVersion) verEl.hidden = true;
    meta.appendChild(verEl);
  }

  return meta;
}

function renderResults(results) {
  clearResults();
  if (results.length === 0) {
    const p = document.createElement('p');
    p.className = 'results-empty';
    p.textContent = '候補が見つかりませんでした';
    resultsArea.appendChild(p);
    return;
  }

  // --- Top1カード ---
  const top = results[0];
  const topCard = document.createElement('div');
  topCard.className = 'top-card';

  const badge = document.createElement('span');
  badge.className = 'top-card-badge';
  badge.textContent = '#1 BEST MATCH';
  topCard.appendChild(badge);

  // タイトル + サブ情報をまとめる左側ブロック
  const topLeft = document.createElement('div');
  topLeft.style.cssText = 'flex:1;min-width:0;padding-top:14px;';
  const titleEl = document.createElement('div');
  titleEl.className = hasJapanese(top.title) ? 'top-card-title-jp' : 'top-card-title';
  titleEl.style.paddingTop = '0';
  titleEl.textContent = top.title;
  topLeft.appendChild(titleEl);
  topLeft.appendChild(createSongMeta(top.artist, top.versionName));
  topLeft.appendChild(createChartLinks(top));

  const topRight = document.createElement('div');
  topRight.className = 'top-card-right';
  topRight.appendChild(createScoreBadge(top.score));
  topRight.appendChild(createCopyBtn(top.title));

  topCard.appendChild(topLeft);
  topCard.appendChild(topRight);
  resultsArea.appendChild(topCard);

  // --- 2〜10位リスト ---
  if (results.length > 1) {
    const list = document.createElement('div');
    list.className = 'candidate-list';

    for (let i = 1; i < results.length; i++) {
      const item = results[i];
      const row = document.createElement('div');
      row.className = 'candidate-item';

      const rank = document.createElement('span');
      rank.className = 'candidate-rank';
      rank.textContent = `#${i + 1}`;

      // タイトル + サブ情報ブロック
      const nameBlock = document.createElement('div');
      nameBlock.style.cssText = 'flex:1;min-width:0;';
      const name = document.createElement('span');
      name.className = hasJapanese(item.title) ? 'candidate-name' : 'candidate-name candidate-name-latin';
      name.textContent = item.title;
      nameBlock.appendChild(name);
      nameBlock.appendChild(createSongMeta(item.artist, item.versionName));
      nameBlock.appendChild(createChartLinks(item));

      row.appendChild(rank);
      row.appendChild(nameBlock);
      row.appendChild(createScoreBadge(item.score));
      row.appendChild(createCopyBtn(item.title));
      list.appendChild(row);
    }
    resultsArea.appendChild(list);
  }
}

/* ============================================================
   バージョン表示トグル
   ============================================================ */
versionToggle.addEventListener('click', () => {
  showVersion = !showVersion;
  versionToggle.textContent = `収録バージョン表示: ${showVersion ? 'ON' : 'OFF'}`;
  versionToggle.setAttribute('aria-pressed', showVersion);
  document.querySelectorAll('.song-version').forEach(el => { el.hidden = !showVersion; });
});

/* ============================================================
   スコア表示トグル
   ============================================================ */
debugToggle.addEventListener('click', () => {
  showScore = !showScore;
  debugToggle.textContent = `スコア表示: ${showScore ? 'ON' : 'OFF'}`;
  debugToggle.setAttribute('aria-pressed', showScore);
  document.querySelectorAll('.score-badge').forEach(b => { b.hidden = !showScore; });
});

/* ============================================================
   テーマ切り替え
   ============================================================ */
const themeButtons = document.querySelectorAll('.theme-btn');
const THEME_STORAGE_KEY = 'iidx_theme';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'light' ? '' : theme);
  themeButtons.forEach(btn => {
    btn.setAttribute('aria-pressed', btn.dataset.themeTarget === theme);
  });
  try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch {}
}

themeButtons.forEach(btn => {
  btn.addEventListener('click', () => applyTheme(btn.dataset.themeTarget));
});

// 保存済みテーマを復元
(function () {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved && ['light', 'dark', 'sparkle', 'tricoro'].includes(saved)) applyTheme(saved);
  } catch {}
})();

/* ============================================================
   フィルター状態 & イベント
   ============================================================ */
let currentFilter = 'all'; // 'all' | 'ac' | 'inf'
const filterButtons = document.querySelectorAll('.filter-btn');

filterButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    currentFilter = btn.dataset.filter;
    filterButtons.forEach(b => b.setAttribute('aria-pressed', b === btn));
    triggerSearch();
  });
});

function triggerSearch() {
  const query = sanitizeInput(searchInput.value);
  if (!query) { clearResults(); return; }
  const results = search(query, currentFilter);
  renderResults(results);
}

/* ============================================================
   検索 debounce
   ============================================================ */
let debounceTimer;
searchInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(triggerSearch, 200);
});

/* ============================================================
   起動時データロード
   ============================================================ */
(async function init() {
  showLoading(true);
  hideError();
  try {
    const raw = await loadSongData();
    mergedSongs = buildMergedSongs(raw.title, raw.normalized, raw.chart, raw.songInfo, raw.versionNames, raw.textageTag);
    // エイリアスデータをインライン定数から構築（fetchなし）
    aliasByTitle = buildAliasByTitle(ALIASES_DATA);
  } catch (e) {
    showError('楽曲データの取得に失敗しました。ページを再読み込みしてください。(' + e.message + ')');
  } finally {
    showLoading(false);
  }
})();

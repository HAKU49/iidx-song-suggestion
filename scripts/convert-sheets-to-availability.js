#!/usr/bin/env node
'use strict';

/**
 * Phase 2: Google スプレッドシートの CSV 公開 URL から
 * data/chart-availability.json を生成する（Phase 1 の代替スクリプト）。
 *
 * app.js は変更不要。このスクリプトを実行するだけで JSON が更新される。
 *
 * ==============================
 * スプレッドシートの推奨フォーマット
 * ==============================
 * シート名: beginner_ac / beginner_inf / leggendaria_ac / leggendaria_inf (4シート)
 * 各シートの列:
 *   A列: song_name   … 楽曲名（日本語/英語、確認用・任意）
 *   B列: textage_id  … TexTage の song_id（例: verflcht）← 必須
 * 1行目はヘッダー行としてスキップ。
 * textage_id が空の行はスキップ。
 *
 * ====================
 * スプレッドシートの公開
 * ====================
 * Google スプレッドシート → ファイル → ウェブに公開 → CSV 形式で各シートを公開
 * 公開 URL 例:
 *   https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet={SHEET_NAME}
 *
 * ====================
 * 設定
 * ====================
 */

// TODO: 実際のスプレッドシート ID に変更してください
const SPREADSHEET_ID = '1IiWAaxnh6fUfn-EaIU6-e8-GCYF6NfX-KnQF57c40_Q';

const SHEET_URLS = {
  beginner_ac:    `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=beginner_ac`,
  beginner_inf:   `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=beginner_inf`,
  leggendaria_ac: `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=leggendaria_ac`,
  leggendaria_inf:`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=leggendaria_inf`,
};

const OUTPUT_JSON = require('path').join(__dirname, '../data/chart-availability.json');
const OUTPUT_JS   = require('path').join(__dirname, '../data/chart-availability.js');
const fs = require('fs');

if (SPREADSHEET_ID === 'YOUR_SPREADSHEET_ID') {
  console.error('ERROR: SPREADSHEET_ID が設定されていません。');
  console.error('       このファイルの SPREADSHEET_ID を実際の値に変更してください。');
  process.exit(1);
}

/**
 * CSV テキストから textage_id 列（B列）を抽出する。
 * ヘッダー行（1行目）はスキップ。空値はスキップ。
 */
function parseCsvIds(csvText) {
  const lines = csvText.split(/\r?\n/).slice(1); // ヘッダースキップ
  const ids = new Set();
  for (const line of lines) {
    // 簡易CSV: カンマ区切り、ダブルクォート対応
    const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const textageId = cols[1]; // B列
    if (textageId && /^[a-z0-9_]+$/.test(textageId)) {
      ids.add(textageId);
    }
  }
  return Array.from(ids).sort();
}

async function main() {
  const result = {};
  for (const [key, url] of Object.entries(SHEET_URLS)) {
    console.log(`Fetching ${key}...`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${key}`);
    const csv = await res.text();
    const ids = parseCsvIds(csv);
    result[key] = ids;
    console.log(`  ${key}: ${ids.length} songs`);
  }
  const json = JSON.stringify(result, null, 2);
  fs.writeFileSync(OUTPUT_JSON, json, 'utf8');
  fs.writeFileSync(OUTPUT_JS, `// Auto-generated. Do not edit manually.\n// Run: node scripts/convert-sheets-to-availability.js\nconst CHART_AVAILABILITY_DATA = ${json};\n`, 'utf8');
  console.log(`\nWritten to ${OUTPUT_JSON}`);
  console.log(`Written to ${OUTPUT_JS}`);
}

main().catch(e => { console.error(e); process.exit(1); });

#!/usr/bin/env node
'use strict';

/**
 * Phase 1: ローカルHTMLスナップショットから BEGINNER/LEGGENDARIA の
 * 利用可能楽曲 song_id を抽出して data/chart-availability.json を生成する。
 *
 * 注意: HTMLファイルは保存時点のスナップショットのため、最新の TexTage と
 *       件数が異なる場合がある。その際は手動で JSON を補正すること。
 *
 * Phase 2 への移行: scripts/convert-sheets-to-availability.js に差し替えるだけで
 *                   app.js の変更は不要。
 */

const fs   = require('fs');
const path = require('path');

// HTMLスナップショットのパス（INFのファイル名に typo "begginer" あり、変更不要）
const FILES = {
  beginner_ac:     '../local/textage_beginner_ac.html',
  beginner_inf:    '../local/textage_begginer_inf.html',
  leggendaria_ac:  '../local/textage_leggendaria_ac.html',
  leggendaria_inf: '../local/textage_leggendaria_inf.html',
};

const OUTPUT_JSON = path.join(__dirname, '../data/chart-availability.json');
const OUTPUT_JS   = path.join(__dirname, '../data/chart-availability.js');

/**
 * TexTage の譜面URL `textage.cc/score/{ver}/{id}.html` から
 * song_id 一覧を抽出する。
 * Shift-JIS ファイルを latin1 で読む（ASCII 範囲の song_id に影響なし）。
 */
function extractSongIds(filepath) {
  const content = fs.readFileSync(filepath, 'latin1');
  const pattern = /textage\.cc\/score\/[^/]+\/([a-z0-9_]+)\.html/g;
  const ids = new Set();
  let m;
  while ((m = pattern.exec(content)) !== null) {
    ids.add(m[1]);
  }
  return Array.from(ids).sort();
}

const result = {};
for (const [key, rel] of Object.entries(FILES)) {
  const filepath = path.join(__dirname, rel);
  if (!fs.existsSync(filepath)) {
    console.error(`ERROR: File not found: ${filepath}`);
    process.exit(1);
  }
  const ids = extractSongIds(filepath);
  result[key] = ids;
  console.log(`${key}: ${ids.length} songs`);
}

const json = JSON.stringify(result, null, 2);
fs.writeFileSync(OUTPUT_JSON, json, 'utf8');
fs.writeFileSync(OUTPUT_JS, `// Auto-generated. Do not edit manually.\n// Run: node scripts/extract-chart-availability.js\nconst CHART_AVAILABILITY_DATA = ${json};\n`, 'utf8');
console.log(`\nWritten to ${OUTPUT_JSON}`);
console.log(`Written to ${OUTPUT_JS}`);
console.log('NOTE: BEGINNER counts may differ from TexTage (HTML snapshots may be stale).');
console.log('      Manually edit data/chart-availability.json then re-run to apply changes.');

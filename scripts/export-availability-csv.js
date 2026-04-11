#!/usr/bin/env node
'use strict';

/**
 * local/ 内の TexTage HTMLスナップショットから
 * 曲名 (song_name) と textage_id を抽出して output/ にCSV書き出し。
 *
 * 使い方:
 *   node scripts/export-availability-csv.js
 *
 * 出力先: output/beginner_ac.csv, output/beginner_inf.csv, ...
 * ※ output/ は .gitignore 済み（GitHub非公開）
 */

const fs   = require('fs');
const path = require('path');

const FILES = {
  beginner_ac:     '../local/textage_beginner_ac.html',
  beginner_inf:    '../local/textage_begginer_inf.html',  // typo "begginer" はそのまま
  leggendaria_ac:  '../local/textage_leggendaria_ac.html',
  leggendaria_inf: '../local/textage_leggendaria_inf.html',
};

const OUTPUT_DIR = path.join(__dirname, '../output');

/**
 * HTMLエンティティを最低限デコードする
 */
function decodeEntities(str) {
  return str
    .replace(/<[^>]+>/g, '')      // 残留タグ除去
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
    .trim();
}

/**
 * HTML全体から { textageId, songName }[] を抽出する。
 *
 * 各 textage URL の出現位置を基点に、前後のウィンドウ内にある
 * <td class="tt1"...><b>曲名</b></td> を探して曲名と対応させる。
 * 同一 textageId は最初の出現のみ採用（重複除去）。
 */
function extractEntries(content) {
  const urlPattern = /textage\.cc\/score\/[^/]+\/([a-z0-9_]+)\.html/g;
  // tt0/tt1/tt2 クラスのセルから曲名を取得（TexTage が複数クラスを使用）
  const titlePattern = /class="tt[012]"[^>]*><b>([\s\S]*?)<\/b>/;

  const entries = [];
  const seen = new Set();
  let m;

  while ((m = urlPattern.exec(content)) !== null) {
    const textageId = m[1];
    if (seen.has(textageId)) continue;
    seen.add(textageId);

    // URL出現位置の前後500文字を探索ウィンドウとする
    const winStart = Math.max(0, m.index - 100);
    const winEnd   = Math.min(content.length, m.index + 500);
    const window   = content.slice(winStart, winEnd);

    const titleMatch = window.match(titlePattern);
    const songName = titleMatch ? decodeEntities(titleMatch[1]) : '';

    entries.push({ textageId, songName });
  }

  return entries;
}

function toCsvLine(songName, textageId) {
  const needsQuote = /[,"\n]/.test(songName);
  const safeName = needsQuote ? `"${songName.replace(/"/g, '""')}"` : songName;
  return `${safeName},${textageId}`;
}

// output/ ディレクトリを作成
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

for (const [key, rel] of Object.entries(FILES)) {
  const filepath = path.join(__dirname, rel);
  if (!fs.existsSync(filepath)) {
    console.error(`ERROR: File not found: ${filepath}`);
    continue;
  }

  const buf = fs.readFileSync(filepath);
  const content = new TextDecoder('shift_jis', { fatal: false }).decode(buf);
  const entries = extractEntries(content);

  const noTitle = entries.filter(e => !e.songName).length;
  const lines = ['song_name,textage_id', ...entries.map(e => toCsvLine(e.songName, e.textageId))];
  const outPath = path.join(OUTPUT_DIR, `${key}.csv`);
  fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');

  const warn = noTitle ? ` (曲名取得失敗: ${noTitle}件)` : '';
  console.log(`${key}: ${entries.length} songs → ${outPath}${warn}`);
}

console.log('\nDone! CSVs are in output/');

/**
 * Maps each Modern Office single (1-339) to its position in the 16x16 tileset.
 *
 * Strategy: For each single, take the first non-transparent 16x16 block,
 * then search all tileset cells for a pixel match. Output the mapping
 * as mo-tileset-positions.json.
 *
 * Usage: npx tsx scripts/map-mo-to-tileset.ts
 */

import * as fs from "fs";
import * as path from "path";
import { PNG } from "pngjs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const TILE = 16;
const ALPHA_THRESHOLD = 10;

const TILESET_PATH =
  "/Users/grid/Desktop/Modern_Office_Revamped_v1.2/Modern_Office_16x16.png";
const SINGLES_DIR =
  "/Users/grid/Desktop/Modern_Office_Revamped_v1.2/4_Modern_Office_singles/16x16";
const OUTPUT_PATH = path.join(__dirname, "mo-tileset-positions.json");

/** Extract RGBA values for a 16x16 cell from a PNG */
function extractCell(
  png: PNG,
  cellCol: number,
  cellRow: number,
): Uint8Array {
  const buf = new Uint8Array(TILE * TILE * 4);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const srcIdx =
        ((cellRow * TILE + y) * png.width + cellCol * TILE + x) * 4;
      const dstIdx = (y * TILE + x) * 4;
      buf[dstIdx] = png.data[srcIdx];
      buf[dstIdx + 1] = png.data[srcIdx + 1];
      buf[dstIdx + 2] = png.data[srcIdx + 2];
      buf[dstIdx + 3] = png.data[srcIdx + 3];
    }
  }
  return buf;
}

/** Check if a cell has any non-transparent pixels */
function cellHasContent(data: Uint8Array): boolean {
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > ALPHA_THRESHOLD) return true;
  }
  return false;
}

/** Get the first 16x16 non-transparent block from a single PNG (snapped to grid) */
function getFirstContentBlock(png: PNG): Uint8Array | null {
  // Find the top-left non-transparent pixel
  let minX = png.width,
    minY = png.height;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const idx = (y * png.width + x) * 4;
      if (png.data[idx + 3] > ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
      }
    }
  }
  if (minX >= png.width) return null;

  // Snap to 16px grid
  const startX = Math.floor(minX / TILE) * TILE;
  const startY = Math.floor(minY / TILE) * TILE;

  // Extract 16x16 block
  const buf = new Uint8Array(TILE * TILE * 4);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const sx = startX + x;
      const sy = startY + y;
      if (sx < png.width && sy < png.height) {
        const srcIdx = (sy * png.width + sx) * 4;
        const dstIdx = (y * TILE + x) * 4;
        buf[dstIdx] = png.data[srcIdx];
        buf[dstIdx + 1] = png.data[srcIdx + 1];
        buf[dstIdx + 2] = png.data[srcIdx + 2];
        buf[dstIdx + 3] = png.data[srcIdx + 3];
      }
    }
  }
  return buf;
}

/** Compare two RGBA buffers, ignoring fully transparent pixels */
function pixelMatch(a: Uint8Array, b: Uint8Array): boolean {
  for (let i = 0; i < a.length; i += 4) {
    const aAlpha = a[i + 3];
    const bAlpha = b[i + 3];
    // Both transparent → match
    if (aAlpha <= ALPHA_THRESHOLD && bAlpha <= ALPHA_THRESHOLD) continue;
    // One transparent, other not → no match
    if (aAlpha <= ALPHA_THRESHOLD || bAlpha <= ALPHA_THRESHOLD) return false;
    // Both opaque — compare RGB
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2])
      return false;
  }
  return true;
}

function main() {
  // Load tileset
  const tilesetData = fs.readFileSync(TILESET_PATH);
  const tileset = PNG.sync.read(tilesetData);
  const tsCols = tileset.width / TILE;
  const tsRows = tileset.height / TILE;
  console.log(`Tileset: ${tsCols}x${tsRows} cells`);

  // Pre-extract all tileset cells
  const tilesetCells: Array<{
    col: number;
    row: number;
    data: Uint8Array;
  }> = [];
  for (let r = 0; r < tsRows; r++) {
    for (let c = 0; c < tsCols; c++) {
      const data = extractCell(tileset, c, r);
      if (cellHasContent(data)) {
        tilesetCells.push({ col: c, row: r, data });
      }
    }
  }
  console.log(`Tileset non-empty cells: ${tilesetCells.length}`);

  // Load singles
  const files = fs
    .readdirSync(SINGLES_DIR)
    .filter((f) => f.endsWith(".png"))
    .sort((a, b) => {
      const na = parseInt(a.match(/(\d+)/)![1]);
      const nb = parseInt(b.match(/(\d+)/)![1]);
      return na - nb;
    });
  console.log(`Singles: ${files.length}`);

  const results: Array<{
    single: number;
    tilesetRow: number;
    tilesetCol: number;
    matched: boolean;
  }> = [];

  let matched = 0;
  let unmatched = 0;

  for (const file of files) {
    const idx = parseInt(file.match(/(\d+)/)![1]);
    const singleData = fs.readFileSync(path.join(SINGLES_DIR, file));
    const singlePng = PNG.sync.read(singleData);

    const block = getFirstContentBlock(singlePng);
    if (!block) {
      results.push({
        single: idx,
        tilesetRow: -1,
        tilesetCol: -1,
        matched: false,
      });
      unmatched++;
      continue;
    }

    let found = false;
    for (const cell of tilesetCells) {
      if (pixelMatch(block, cell.data)) {
        results.push({
          single: idx,
          tilesetRow: cell.row,
          tilesetCol: cell.col,
          matched: true,
        });
        matched++;
        found = true;
        break;
      }
    }

    if (!found) {
      results.push({
        single: idx,
        tilesetRow: -1,
        tilesetCol: -1,
        matched: false,
      });
      unmatched++;
    }
  }

  console.log(`\nMatched: ${matched}, Unmatched: ${unmatched}`);

  // Show row distribution
  const rowCounts = new Map<number, number>();
  for (const r of results) {
    if (r.matched) {
      rowCounts.set(r.tilesetRow, (rowCounts.get(r.tilesetRow) || 0) + 1);
    }
  }
  console.log("\nRow distribution:");
  for (const [row, count] of [...rowCounts.entries()].sort(
    (a, b) => a[0] - b[0],
  )) {
    const singles = results
      .filter((r) => r.tilesetRow === row)
      .map((r) => r.single);
    const range =
      singles.length > 0
        ? `${Math.min(...singles)}-${Math.max(...singles)}`
        : "";
    console.log(`  Row ${String(row).padStart(2)}: ${count} items (${range})`);
  }

  // Write output
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2) + "\n");
  console.log(`\nWritten to: ${OUTPUT_PATH}`);
}

main();

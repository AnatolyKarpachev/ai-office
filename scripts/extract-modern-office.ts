/**
 * Modern Office Revamped v1.2 Extraction Script
 *
 * Reads the 339 pre-cut singles from the Modern_Office_Revamped_v1.2 pack,
 * crops transparent padding, snaps to 16px grid, and emits per-item
 * directories with manifest.json + PNG — ready for the furniture catalog.
 *
 * Usage:  npx tsx scripts/extract-modern-office.ts
 * Output: webview-ui/public/assets/furniture/MO_*  (339 items)
 */

import * as fs from "fs";
import * as path from "path";
import { PNG } from "pngjs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const TILE = 16;
const ALPHA_THRESHOLD = 10;

const SINGLES_DIR = path.join(
  "/Users/grid/Desktop/Modern_Office_Revamped_v1.2/4_Modern_Office_singles/16x16",
);
const OUTPUT_DIR = path.join(root, "webview-ui/public/assets/furniture");

// ── Helpers ──────────────────────────────────────────────────

/** Find the tight bounding box of non-transparent pixels */
function getContentBounds(png: PNG): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  let minX = png.width,
    minY = png.height,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const idx = (y * png.width + x) * 4;
      if (png.data[idx + 3] > ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { minX, minY, maxX, maxY };
}

/** Snap bounds outward to 16px grid */
function snapToGrid(bounds: {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}): { x: number; y: number; w: number; h: number } {
  const x = Math.floor(bounds.minX / TILE) * TILE;
  const y = Math.floor(bounds.minY / TILE) * TILE;
  const x2 = Math.ceil((bounds.maxX + 1) / TILE) * TILE;
  const y2 = Math.ceil((bounds.maxY + 1) / TILE) * TILE;
  return { x, y, w: x2 - x, h: y2 - y };
}

/** Crop a PNG to the given rectangle */
function cropPng(
  src: PNG,
  rect: { x: number; y: number; w: number; h: number },
): PNG {
  const dst = new PNG({ width: rect.w, height: rect.h });
  for (let y = 0; y < rect.h; y++) {
    for (let x = 0; x < rect.w; x++) {
      const srcX = rect.x + x;
      const srcY = rect.y + y;
      const srcIdx = (srcY * src.width + srcX) * 4;
      const dstIdx = (y * rect.w + x) * 4;
      dst.data[dstIdx] = src.data[srcIdx];
      dst.data[dstIdx + 1] = src.data[srcIdx + 1];
      dst.data[dstIdx + 2] = src.data[srcIdx + 2];
      dst.data[dstIdx + 3] = src.data[srcIdx + 3];
    }
  }
  return dst;
}

/** Guess category from the index range (based on tileset layout observation) */
function guessCategory(idx: number): string {
  // Rough groupings based on visual inspection of the tileset:
  // 1-30: desks, tables
  // 31-60: storage, shelves, cabinets
  // 61-90: chairs, seating
  // 91-130: plants, decorations
  // 131-180: electronics, computers, phones
  // 181-240: wall decor, paintings, whiteboards
  // 241-280: misc items, kitchen, bathroom
  // 281-339: rugs, carpets, floor items
  if (idx <= 30) return "desks";
  if (idx <= 60) return "storage";
  if (idx <= 90) return "chairs";
  if (idx <= 130) return "decor";
  if (idx <= 180) return "electronics";
  if (idx <= 240) return "wall";
  if (idx <= 280) return "misc";
  return "decor";
}

/** Determine if an item should be placeable on walls */
function isWallItem(
  tileW: number,
  tileH: number,
  _idx: number,
): boolean {
  // Small flat items that are wider than tall could be wall art
  return tileH === 1 && tileW >= 1 && tileW <= 3;
}

// ── Main ──────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(SINGLES_DIR)) {
    console.error(`Singles dir not found: ${SINGLES_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(SINGLES_DIR)
    .filter((f) => f.endsWith(".png"))
    .sort((a, b) => {
      const na = parseInt(a.match(/(\d+)/)![1]);
      const nb = parseInt(b.match(/(\d+)/)![1]);
      return na - nb;
    });

  console.log(`Found ${files.length} singles to extract`);

  let extracted = 0;
  let skipped = 0;

  for (const file of files) {
    const idx = parseInt(file.match(/(\d+)/)![1]);
    const srcPath = path.join(SINGLES_DIR, file);
    const srcData = fs.readFileSync(srcPath);
    const png = PNG.sync.read(srcData);

    // Find content bounds
    const bounds = getContentBounds(png);
    if (!bounds) {
      skipped++;
      continue; // fully transparent
    }

    // Snap to 16px grid
    const rect = snapToGrid(bounds);
    if (rect.w === 0 || rect.h === 0) {
      skipped++;
      continue;
    }

    // Crop
    const cropped = cropPng(png, rect);
    const tileW = rect.w / TILE;
    const tileH = rect.h / TILE;

    // Determine footprint heuristic:
    // - Items taller than wide (or equal): tall item, footprintH=1
    // - Items wider than tall: flat item (carpet/rug), footprintH=tileH
    let footprintH: number;
    let backgroundTiles: number;
    if (tileH > tileW) {
      // Tall item (bookshelf, plant, etc.)
      footprintH = 1;
      backgroundTiles = tileH - 1;
    } else if (tileH <= 1) {
      // Flat single-row item
      footprintH = 1;
      backgroundTiles = 0;
    } else {
      // Wide or square item (desk, carpet, etc.)
      // Bottom row(s) are footprint, rest is background
      footprintH = Math.min(tileH, 2);
      backgroundTiles = Math.max(0, tileH - footprintH);
    }

    const id = `MO_${String(idx).padStart(3, "0")}`;
    const category = guessCategory(idx);
    const canPlaceOnWalls = isWallItem(tileW, tileH, idx);

    // Create output directory
    const outDir = path.join(OUTPUT_DIR, id);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    // Write cropped PNG
    const pngFileName = `${id}.png`;
    const pngBuffer = PNG.sync.write(cropped);
    fs.writeFileSync(path.join(outDir, pngFileName), pngBuffer);

    // Write manifest
    const manifest = {
      id,
      name: `Modern Office ${idx}`,
      category,
      type: "asset" as const,
      canPlaceOnWalls,
      canPlaceOnSurfaces: false,
      backgroundTiles,
      width: rect.w,
      height: rect.h,
      footprintW: tileW,
      footprintH,
    };
    fs.writeFileSync(
      path.join(outDir, "manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
    );

    extracted++;
  }

  console.log(`\nDone! Extracted: ${extracted}, Skipped (empty): ${skipped}`);
  console.log(`Output: ${OUTPUT_DIR}/MO_*`);
  console.log(`\nRebuild to apply: npm run build`);
}

main();

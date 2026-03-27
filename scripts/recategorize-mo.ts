/**
 * Recategorize all MO_ furniture items based on visual analysis.
 *
 * Applies range-based category mapping to manifest.json files.
 * Run after extract-modern-office.ts to fix categories.
 *
 * Usage: npx tsx scripts/recategorize-mo.ts
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const FURNITURE_DIR = path.join(
  root,
  "webview-ui/public/assets/furniture",
);

// ── Category mapping based on visual analysis of all 339 singles ──
// Derived from: contact sheet review, individual sprite sampling,
// reference designs (Office_Design_1/2), and tileset layout analysis.

interface RangeRule {
  start: number;
  end: number;
  category: string;
  canPlaceOnWalls?: boolean;
  canPlaceOnSurfaces?: boolean;
  namePrefix?: string;
}

const RANGE_RULES: RangeRule[] = [
  // Wood desk surfaces, table tops (tan colored flat pieces)
  { start: 1, end: 30, category: "desks", namePrefix: "Wood Desk" },
  // Gray/metal desk frames and surfaces
  { start: 31, end: 55, category: "desks", namePrefix: "Metal Desk" },
  // More desk/table variations
  { start: 56, end: 70, category: "desks", namePrefix: "Desk" },
  // Sofa/upholstery pieces (lavender/purple cushions)
  { start: 71, end: 80, category: "sofa", namePrefix: "Sofa" },
  // Floor/carpet pieces (dark maroon, brown)
  { start: 81, end: 90, category: "floor_decor", namePrefix: "Carpet" },
  // More floor patterns (gray)
  { start: 91, end: 95, category: "floor_decor", namePrefix: "Floor Tile" },
  // Small framed wall art
  { start: 96, end: 98, category: "wall_art", canPlaceOnWalls: true, namePrefix: "Wall Art" },
  // Potted plants, cacti
  { start: 99, end: 100, category: "plants", namePrefix: "Plant" },
  // Office chairs (blue/gray, on wheels) — front and back views
  { start: 101, end: 108, category: "chairs", namePrefix: "Office Chair" },
  // Brown/orange chairs
  { start: 109, end: 112, category: "chairs", namePrefix: "Chair" },
  // More wall art, framed pictures
  { start: 113, end: 115, category: "wall_art", canPlaceOnWalls: true, namePrefix: "Painting" },
  // Monitors, small screens
  { start: 116, end: 120, category: "electronics", canPlaceOnSurfaces: true, namePrefix: "Monitor" },
  // Computers, phones, electronics
  { start: 121, end: 130, category: "electronics", canPlaceOnSurfaces: true, namePrefix: "Computer" },
  // Laptops, screens
  { start: 131, end: 140, category: "electronics", canPlaceOnSurfaces: true, namePrefix: "Laptop" },
  // Desk lamps
  { start: 141, end: 146, category: "lighting", canPlaceOnSurfaces: true, namePrefix: "Desk Lamp" },
  // Briefcase
  { start: 147, end: 147, category: "misc", namePrefix: "Briefcase" },
  // Printers, devices, floppy disks
  { start: 148, end: 156, category: "electronics", namePrefix: "Device" },
  // Pens, small office items
  { start: 157, end: 160, category: "misc", canPlaceOnSurfaces: true, namePrefix: "Office Supply" },
  // Screens, keyboards, servers
  { start: 161, end: 168, category: "electronics", namePrefix: "Electronics" },
  // Whiteboards, vending machines, large screens
  { start: 169, end: 175, category: "electronics", namePrefix: "Screen" },
  // Bookshelves, shelf surfaces
  { start: 176, end: 180, category: "storage", namePrefix: "Shelf" },
  // Cabinets, drawers, wardrobes
  { start: 181, end: 195, category: "storage", namePrefix: "Cabinet" },
  // Bags, backpacks
  { start: 196, end: 200, category: "misc", namePrefix: "Bag" },
  // Cubicle walls, partitions, door panels
  { start: 201, end: 220, category: "wall", namePrefix: "Partition" },
  // Carpet/rug patterns
  { start: 221, end: 225, category: "floor_decor", namePrefix: "Rug" },
  // Computer setups, small electronics
  { start: 226, end: 231, category: "electronics", canPlaceOnSurfaces: true, namePrefix: "Computer" },
  // Robot figure
  { start: 232, end: 232, category: "decor", namePrefix: "Robot Figure" },
  // Delivery truck, mixed items
  { start: 233, end: 235, category: "misc", namePrefix: "Item" },
  // Staplers, clips, small items
  { start: 236, end: 240, category: "misc", canPlaceOnSurfaces: true, namePrefix: "Office Supply" },
  // Counter/reception desk surfaces
  { start: 241, end: 265, category: "desks", namePrefix: "Counter" },
  // Pointing hands, small items
  { start: 266, end: 270, category: "misc", namePrefix: "Item" },
  // Monitor arms, stands, electronics
  { start: 271, end: 280, category: "electronics", namePrefix: "Monitor Stand" },
  // L-shaped desks, counters (tan and gray)
  { start: 281, end: 300, category: "desks", namePrefix: "L-Desk" },
  // Lamp stands, poles
  { start: 301, end: 310, category: "lighting", namePrefix: "Lamp" },
  // Papers, backpacks, misc
  { start: 311, end: 316, category: "misc", namePrefix: "Item" },
  // City backdrop, decorative panels
  { start: 317, end: 320, category: "decor", namePrefix: "Backdrop" },
  // Printers, copier machines
  { start: 321, end: 326, category: "electronics", namePrefix: "Printer" },
  // Coffee machine, water cooler
  { start: 327, end: 330, category: "kitchen", namePrefix: "Kitchen" },
  // Kitchen appliances
  { start: 331, end: 334, category: "kitchen", namePrefix: "Appliance" },
  // Lanterns, lamps
  { start: 335, end: 336, category: "lighting", namePrefix: "Lantern" },
  // Potted plants, foliage
  { start: 337, end: 339, category: "plants", namePrefix: "Plant" },
];

// ── Per-item overrides (for items that don't fit their range) ──
const OVERRIDES: Record<number, Partial<RangeRule>> = {
  // Add individual corrections here after visual review:
  // e.g. 173: { category: "kitchen", namePrefix: "Vending Machine" },
};

function findRule(idx: number): RangeRule | null {
  for (const rule of RANGE_RULES) {
    if (idx >= rule.start && idx <= rule.end) return rule;
  }
  return null;
}

function main() {
  const dirs = fs
    .readdirSync(FURNITURE_DIR)
    .filter((d) => d.startsWith("MO_"))
    .sort();

  const categoryCounts: Record<string, number> = {};
  let updated = 0;

  for (const dir of dirs) {
    const idx = parseInt(dir.slice(3));
    const manifestPath = path.join(FURNITURE_DIR, dir, "manifest.json");
    if (!fs.existsSync(manifestPath)) continue;

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

    // Find category rule
    const override = OVERRIDES[idx];
    const rule = findRule(idx);
    if (!rule && !override) continue;

    const category = override?.category ?? rule?.category ?? manifest.category;
    const namePrefix =
      override?.namePrefix ?? rule?.namePrefix ?? "Modern Office";
    const canPlaceOnWalls =
      override?.canPlaceOnWalls ?? rule?.canPlaceOnWalls ?? false;
    const canPlaceOnSurfaces =
      override?.canPlaceOnSurfaces ?? rule?.canPlaceOnSurfaces ?? false;

    // Update manifest
    manifest.category = category;
    manifest.name = `${namePrefix} ${idx}`;
    manifest.canPlaceOnWalls = canPlaceOnWalls;
    manifest.canPlaceOnSurfaces = canPlaceOnSurfaces;

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    updated++;

    categoryCounts[category] = (categoryCounts[category] || 0) + 1;
  }

  console.log(`Updated ${updated} manifests\n`);
  console.log("Category distribution:");
  for (const [cat, count] of Object.entries(categoryCounts).sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${cat.padEnd(15)} ${count}`);
  }
}

main();

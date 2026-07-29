import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { corpusRoot } from '../corpus.js';
import { extractHoleGrid } from '../board-grid.js';

const svg = join(corpusRoot(), 'svg/core/breadboard/halfBreadboard.svg');
const out = 'data/boards/half-breadboard.json';

const grid = extractHoleGrid(readFileSync(svg, 'utf8'));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(grid, null, 2)}\n`);
console.log(`wrote ${Object.keys(grid.holes).length} holes to ${out}`);

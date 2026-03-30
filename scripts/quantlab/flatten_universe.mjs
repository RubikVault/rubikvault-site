import fs from 'node:fs/promises';

const SOURCE = '/Users/michaelpuchowezki/Dev/rubikvault-site/public/data/universe/v7/perfect_universe_v1.json';
const TARGET = '/Users/michaelpuchowezki/Dev/rubikvault-site/public/data/universe/v7/perfect_universe_v1_flat.json';

async function flatten() {
  const data = JSON.parse(await fs.readFile(SOURCE, 'utf-8'));
  const flat = [];
  
  if (data.habitats) {
    for (const key in data.habitats) {
      if (Array.isArray(data.habitats[key])) {
        flat.push(...data.habitats[key]);
      }
    }
  }
  
  await fs.writeFile(TARGET, JSON.stringify(flat, null, 2));
  console.log(`Flattened list to ${TARGET}. Count: ${flat.length}`);
}

flatten().catch(console.error);

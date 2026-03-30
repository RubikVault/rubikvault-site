import fs from 'fs/promises';
import path from 'path';

const START_DIR = '/Volumes/usbshare1/EODHD-History';

async function crawl(dir, depth = 0, maxDepth = 3) {
  if (depth > maxDepth) return;
  
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    let fileCount = 0;
    const subdirs = [];
    
    for (const entry of entries) {
      if (entry.isFile()) {
        fileCount++;
      } else if (entry.isDirectory()) {
         subdirs.push(entry.name);
      }
    }
    
    console.log(`${'  '.repeat(depth)}[DIR] ${path.basename(dir)} - Files: ${fileCount}`);
    
    for (const sub of subdirs) {
      await crawl(path.join(dir, sub), depth + 1, maxDepth);
    }
    
  } catch (err) {
    console.log(`${'  '.repeat(depth)}[ERR] ${path.basename(dir)}: ${err.message}`);
  }
}

console.log(`Starting crawl on ${START_DIR}...`);
crawl(START_DIR).then(() => console.log('Crawl finished.'));

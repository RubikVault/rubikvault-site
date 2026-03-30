import fs from 'fs';

const breakoutPath = 'public/data/snapshots/breakout-all.json';
const analysisPath = 'public/data/snapshots/stock-analysis.json';

function run() {
    try {
        if (!fs.existsSync(breakoutPath)) { console.log("breakout-all.json missing"); return; }
        if (!fs.existsSync(analysisPath)) { console.log("stock-analysis.json missing"); return; }

        const brkAll = JSON.parse(fs.readFileSync(breakoutPath, 'utf-8'));
        const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));

        // Create a map of Symbol -> Name
        const nameMap = {};
        for (const [key, val] of Object.entries(analysis)) {
            if (val && val.name) {
                const tkr = (val.ticker || key).toUpperCase();
                nameMap[tkr] = val.name;
            }
        }

        let mapped = 0;
        (brkAll.items || []).forEach(item => {
            const fullTicker = (item.ticker || '').toUpperCase();
            // Handle ticker splitting
            const parts = fullTicker.split(':');
            const symbol = parts[1] || parts[0]; 

            if (nameMap[symbol]) {
                item.name = nameMap[symbol];
                mapped++;
            } else if (nameMap[fullTicker]) {
                item.name = nameMap[fullTicker];
                mapped++;
            }
        });

        fs.writeFileSync(breakoutPath, JSON.stringify(brkAll, null, 2));
        console.log(`Successfully annotated ${mapped} items with Corporate Names layout.`);
    } catch (e) {
        console.error("Error annotating:", e);
    }
}

run();

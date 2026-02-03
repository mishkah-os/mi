
const fs = require('fs');
const lines = fs.readFileSync('static/pos/posv3.js', 'utf8').split('\n');

let balance = 0;
let persistOrderFlowStart = -1;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cleanLine = line.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, '""')
        .replace(/\/\/.*$/, '');

    let previousBalance = balance;
    for (const char of cleanLine) {
        if (char === '{') balance++;
        if (char === '}') balance--;
    }

    if (line.includes('async function persistOrderFlow')) {
        persistOrderFlowStart = i + 1;
    }

    if (persistOrderFlowStart > 0 && i < 8000) {
        if (previousBalance <= 3 && balance >= 4) {
            console.log(`[${i + 1}] 3->4 (Open): ${line.trim().substring(0, 50)}`);
        }
        if (previousBalance >= 4 && balance === 3) {
            console.log(`[${i + 1}] 4->3 (Close): ${line.trim().substring(0, 50)}`);
        }
    }
}

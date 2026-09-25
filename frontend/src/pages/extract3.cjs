const fs = require('fs');

const content = fs.readFileSync('FeeSetupPage_history.txt', 'utf8');
const lines = content.split('\n');

const fileLines = [];

for (const line of lines) {
    if (!line.trim()) continue;
    try {
        const parsed = JSON.parse(line);
        if (parsed.content) {
            const textLines = parsed.content.split('\n');
            for (const tLine of textLines) {
                const match = tLine.match(/^(\d+):\s(.*)$/);
                if (match) {
                    const lineNum = parseInt(match[1], 10);
                    fileLines[lineNum] = match[2];
                }
            }
        }
    } catch(e) {}
}

const out = [];
// Arrays in JS start at 0, but line nums start at 1
for (let i = 1; i < fileLines.length; i++) {
    if (fileLines[i] !== undefined) {
        out.push(fileLines[i]);
    } else {
        out.push(`// MISSING LINE ${i}`);
    }
}

fs.writeFileSync('C:\\Users\\BK Magsi\\Downloads\\school-management-system\\frontend\\src\\pages\\FeeSetupPage_reconstructed.tsx', out.join('\n'));

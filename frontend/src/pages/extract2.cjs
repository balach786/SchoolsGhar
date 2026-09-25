const fs = require('fs');

const content = fs.readFileSync('FeeSetupPage_history.txt', 'utf8');
const lines = content.split('\n');
let extracted = '';
let inBlock = false;
for (const line of lines) {
    if (line.includes('"step_index":1481')) {
        const parsed = JSON.parse(line);
        // The content field is a string, which is the tool response
        const text = parsed.content;
        const textLines = text.split('\n');
        for (const tLine of textLines) {
            // Remove the line numbers like '1: ', '234: '
            const match = tLine.match(/^\d+:\s(.*)$/);
            if (match) {
                extracted += match[1] + '\n';
            }
        }
    }
}
fs.writeFileSync('C:\\Users\\BK Magsi\\Downloads\\school-management-system\\frontend\\src\\pages\\FeeSetupPage_1481.txt', extracted);

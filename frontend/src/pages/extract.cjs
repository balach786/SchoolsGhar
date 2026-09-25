const fs = require('fs');
const readline = require('readline');

async function processLineByLine() {
  const fileStream = fs.createReadStream('C:\\Users\\BK Magsi\\.gemini\\antigravity-ide\\brain\\7e19ea62-0945-4790-aad3-f485785e4a0b\\.system_generated\\logs\\transcript_full.jsonl');

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (line.includes('FeeSetupPage.tsx') && line.includes('Showing lines 1 to')) {
      const parsed = JSON.parse(line);
      fs.writeFileSync('C:\\Users\\BK Magsi\\Downloads\\school-management-system\\frontend\\src\\pages\\FeeSetupPage_old_top.txt', parsed.content || JSON.stringify(parsed));
      console.log('Found top of file');
    }
    if (line.includes('FeeSetupPage.tsx') && line.includes('Showing lines')) {
        // Just extract all instances where we viewed the file
        fs.appendFileSync('C:\\Users\\BK Magsi\\Downloads\\school-management-system\\frontend\\src\\pages\\FeeSetupPage_history.txt', line + '\n');
    }
  }
}

processLineByLine();

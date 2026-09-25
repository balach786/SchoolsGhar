import { sanitizeCell } from './src/services/dataTransfer/spreadsheet.utils';

let passed = 0;
let failed = 0;

function assertEqual(name: string, actual: any, expected: any) {
    if (actual === expected) {
        passed++;
    } else {
        console.error([FAIL] : Expected '', got '');
        failed++;
    }
}

console.log('--- EXPORT SANITIZER TESTS ---');
assertEqual('=1+1', sanitizeCell('=1+1'), "'=1+1");
assertEqual('+cmd', sanitizeCell('+cmd'), "'+cmd");
assertEqual('-1+2', sanitizeCell('-1+2'), "'-1+2");
assertEqual('@SUM(A1:A2)', sanitizeCell('@SUM(A1:A2)'), "'@SUM(A1:A2)");
assertEqual('\\t=cmd', sanitizeCell('\t=cmd'), "'\t=cmd");
assertEqual('\\r=cmd', sanitizeCell('\r=cmd'), "'\r=cmd");
assertEqual('normal text', sanitizeCell('Muhammad Ali'), 'Muhammad Ali');
assertEqual('numeric 123', sanitizeCell(123), 123);
assertEqual('null', sanitizeCell(null), null);

console.log(\nTests Passed:  | Tests Failed: );
process.exit(failed > 0 ? 1 : 0);

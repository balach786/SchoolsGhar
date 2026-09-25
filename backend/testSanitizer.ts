import { sanitizeCell } from './src/services/dataTransfer/spreadsheet.utils';

console.log('=1+1 result =', sanitizeCell('=1+1'));
console.log('+cmd result =', sanitizeCell('+cmd'));
console.log('-1+2 result =', sanitizeCell('-1+2'));
console.log('@SUM result =', sanitizeCell('@SUM(A1:A2)'));
console.log('\\t=cmd result =', sanitizeCell('\t=cmd'));
console.log('\\r=cmd result =', sanitizeCell('\r=cmd'));
console.log('normal text result =', sanitizeCell('Muhammad Ali'));
console.log('numeric value result =', sanitizeCell(123));
console.log('numeric string result =', sanitizeCell('123'));
console.log('empty string result =', sanitizeCell(''));
console.log('null result =', sanitizeCell(null));
console.log('undefined result =', sanitizeCell(undefined));

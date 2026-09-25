const js = require('@eslint/js');
const ts = require('typescript-eslint');
module.exports = ts.config({ignores:['dist/**','node_modules/**']},{
 files:['src/**/*.ts'], extends:[js.configs.recommended,...ts.configs.recommended],
 rules:{'@typescript-eslint/no-explicit-any':'warn','@typescript-eslint/no-unused-vars':['warn',{argsIgnorePattern:'^_'}]}
});

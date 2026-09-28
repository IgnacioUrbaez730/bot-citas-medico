const fs = require('fs');
let code = fs.readFileSync('src/index.ts', 'utf8');

code = code.replace(/\\`/g, '`');
code = code.replace(/\\\$/g, '$');

fs.writeFileSync('src/index.ts', code);
console.log('Fixed syntax error');

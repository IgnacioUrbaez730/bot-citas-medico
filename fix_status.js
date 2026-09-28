const fs = require('fs');
let code = fs.readFileSync('src/index.ts', 'utf8');

code = code.replace("status: 'SCHEDULED'", "status: 'CONFIRMED'");

fs.writeFileSync('src/index.ts', code);
console.log('Fixed status enum');

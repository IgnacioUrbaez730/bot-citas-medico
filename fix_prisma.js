const fs = require('fs');
const filePath = 'prisma/schema.prisma';
let code = fs.readFileSync(filePath, 'utf8');

code = code.replace('contactPhone String        // Referencia', 'contactPhone String?       // Referencia');

fs.writeFileSync(filePath, code);
console.log('Fixed schema');

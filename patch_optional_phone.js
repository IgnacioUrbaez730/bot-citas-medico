const fs = require('fs');

// 1. Modificar Prisma Schema
const prismaPath = 'prisma/schema.prisma';
let prismaCode = fs.readFileSync(prismaPath, 'utf8');
prismaCode = prismaCode.replace('contactId  String', 'contactId  String?');
prismaCode = prismaCode.replace('contact    Contact   @relation(fields: [contactId], references: [id])', 'contact    Contact?  @relation(fields: [contactId], references: [id])');
fs.writeFileSync(prismaPath, prismaCode);

// 2. Modificar Backend (src/index.ts)
const indexPath = 'src/index.ts';
let indexCode = fs.readFileSync(indexPath, 'utf8');

// The endpoint currently has:
// if (!phone || !name) { return res.status(400).json({ error: 'Faltan datos obligatorios...' }); }
// Wait, I need to check exactly what it has.

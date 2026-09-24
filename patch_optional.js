const fs = require('fs');

// 1. Prisma Schema
const prismaPath = 'prisma/schema.prisma';
let prismaCode = fs.readFileSync(prismaPath, 'utf8');
prismaCode = prismaCode.replace('contactId  String\n', 'contactId  String?\n');
prismaCode = prismaCode.replace('contactId  String\r\n', 'contactId  String?\r\n');
prismaCode = prismaCode.replace('contact    Contact   @relation(fields: [contactId], references: [id])', 'contact    Contact?  @relation(fields: [contactId], references: [id])');
fs.writeFileSync(prismaPath, prismaCode);

// 2. Index.ts
const indexPath = 'src/index.ts';
let code = fs.readFileSync(indexPath, 'utf8');

// The replacement needs to be robust because of encoding
// We just find the check and comment out the !phone part
code = code.replace('if (!phone || !name)', 'if (!name)');

// Replace contact creation logic
const newContactLogic = `    let contact = null;
    if (phone && phone.trim() !== '') {
      let formattedPhone = phone.replace(/\\D/g, '');
      if (formattedPhone.startsWith('0')) {
        formattedPhone = '58' + formattedPhone.substring(1);
      } else if (!formattedPhone.startsWith('58') && formattedPhone.length === 10) {
        formattedPhone = '58' + formattedPhone;
      }

      contact = await prisma.contact.findUnique({ where: { phone: formattedPhone } });
      if (!contact) {
        contact = await prisma.contact.create({
          data: { 
            phone: formattedPhone, 
            name: contactName || name,
            nationalId: contactNationalId
          }
        });
      } else {
        if (contactName || contactNationalId) {
          await prisma.contact.update({
            where: { phone: formattedPhone },
            data: {
              ...(contactName && { name: contactName }),
              ...(contactNationalId && { nationalId: contactNationalId })
            }
          });
        }
      }
    }`;

code = code.replace(/    \/\/ Normalizar el telÃ©fono[\s\S]*?contactNationalId \}\)\n        \}\)\;\n      \}\n    \}/, newContactLogic);
code = code.replace(/    \/\/ Normalizar el teléfono[\s\S]*?contactNationalId \}\)\n        \}\)\;\n      \}\n    \}/, newContactLogic);

// Fix patient creation
code = code.replace('contactId: contact.id,', '...(contact && { contactId: contact.id }),');
code = code.replace('contactId: contact.id,', '...(contact && { contactId: contact.id }),');

fs.writeFileSync(indexPath, code);
console.log('Backend patched for optional phone');

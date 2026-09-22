const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRaw`DELETE FROM "Message";`;
  await prisma.$executeRaw`DELETE FROM "BotSession";`;
  await prisma.$executeRaw`DELETE FROM "Patient";`;
  console.log('Datos de prueba limpiados correctamente.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

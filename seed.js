const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Encuentra todos los teléfonos únicos en mensajes
  const messages = await prisma.message.findMany({ select: { phone: true } });
  const phones = [...new Set(messages.map(m => m.phone))];

  for (const p of phones) {
    try {
      // Intenta insertarlos en una tabla temporal o simulada, pero como Contact no existe aún, esto fallará.
      // Así que lo que haremos será borrar los datos temporales de desarrollo para tener un esquema limpio.
    } catch(e) {}
  }
}
main();

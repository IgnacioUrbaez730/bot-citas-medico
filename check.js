const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const docs = await prisma.doctor.findMany();
  console.log("Doctors:", docs);
  if (docs.length === 0) {
    // Create the default doctor if none exists
    await prisma.doctor.create({
      data: {
        id: '00000000-0000-0000-0000-000000000000',
        auth_id: 'default-auth-id',
        name: 'Doctora Principal',
        specialty: 'Medicina General',
        medicalLicense: 'CMV-0000',
        clinicName: 'Clínica Principal',
        scheduleText: 'Lunes a Viernes de 08:00 a 17:00'
      }
    }).catch(console.error);
    console.log("Default doctor created");
  }
}

main().finally(() => prisma.$disconnect());

const fs = require('fs');
const filePath = 'prisma/schema.prisma';
let code = fs.readFileSync(filePath, 'utf8');

const newModel = `

model MedicalBackground {
  id              String   @id @default(uuid())
  patientId       String   @unique
  allergies       String?  @default("Ninguna conocida")
  personalHistory String?  // Patológicos personales
  familyHistory   String?  // Patológicos familiares
  surgicalHistory String?  // Quirúrgicos y traumatológicos
  habits          String?  // Hábitos tóxicos
  observations    String?  // Alertas (ej. marcapasos, alergias graves)
  updatedAt       DateTime @updatedAt
  createdAt       DateTime @default(now())

  patient         Patient  @relation(fields: [patientId], references: [id], onDelete: Cascade)
}
`;

if (!code.includes('model MedicalBackground')) {
  // Insert relation into Patient
  code = code.replace(
    'appointments Appointment[]',
    'appointments Appointment[]\n  medicalBackground MedicalBackground?'
  );
  
  // Append model at the end
  code += newModel;
  fs.writeFileSync(filePath, code);
  console.log('Schema patched.');
} else {
  console.log('Schema already patched.');
}

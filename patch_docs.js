const fs = require('fs');

// Patch SDD
const sddPath = 'docs/architecture/SDD.md';
let sdd = fs.readFileSync(sddPath, 'utf8');
if (!sdd.includes('MedicalBackground')) {
  sdd = sdd.replace('## 4. Base de Datos (PostgreSQL vía Prisma)', '## 4. Base de Datos (PostgreSQL vía Prisma)\n\n### MedicalBackground\n- Modelo 1:1 con `Patient` para almacenar antecedentes permanentes (Alergias, Quirúrgicos, Patológicos).\n- Extrae estos datos del modelo `ClinicalNote` para que no se dupliquen por consulta.');
  fs.writeFileSync(sddPath, sdd);
}

// Patch ScDD
const scddPath = 'docs/architecture/ScDD.md';
let scdd = fs.readFileSync(scddPath, 'utf8');
if (!scdd.includes('PatientProfileScreen')) {
  scdd = scdd.replace('## 2. Directorio de Pacientes (PatientsScreen)', '## 2. Directorio de Pacientes (PatientsScreen)\n\n### AddPatientScreen\n- **Propósito:** Registrar un paciente nuevo ("walk-in").\n- **UI:** Formulario con opción de autocalcular Cédula Escolar para menores (Parto Múltiple).\n\n### PatientProfileScreen\n- **Propósito:** Ver y editar datos demográficos y antecedentes permanentes (`MedicalBackground`).\n- **UI:** Pestañas (Datos Personales, Antecedentes Base). Botón para iniciar Nueva Consulta.');
  fs.writeFileSync(scddPath, scdd);
}

console.log('Docs updated.');

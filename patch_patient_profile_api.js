const fs = require('fs');
const filePath = 'src/index.ts';
let code = fs.readFileSync(filePath, 'utf8');

const newEndpoints = `
// OBTENER PERFIL COMPLETO DEL PACIENTE
app.get('/api/doctor/patients/:id', async (req, res) => {
  try {
    const patient = await prisma.patient.findUnique({
      where: { id: req.params.id },
      include: {
        contact: true,
        medicalBackground: true
      }
    });
    if (!patient) return res.status(404).json({ error: 'Paciente no encontrado' });
    res.json(patient);
  } catch (error) {
    console.error('Error fetching patient:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ACTUALIZAR PERFIL DEL PACIENTE (DATOS PERMANENTES Y ANTECEDENTES)
app.put('/api/doctor/patients/:id', async (req, res) => {
  const { id } = req.params;
  const { 
    name, nationalId, birthDate, gender, bloodType, email, occupation, address, emergencyContact,
    medicalBackground 
  } = req.body;

  try {
    // Parsear fecha si viene
    let parsedBirthDate = undefined;
    if (birthDate) {
      if (birthDate.includes('/')) {
        const parts = birthDate.split('/');
        if (parts.length === 3) parsedBirthDate = new Date(\`\${parts[2]}-\${parts[1]}-\${parts[0]}T12:00:00Z\`);
      } else {
        parsedBirthDate = new Date(birthDate);
      }
    }

    const updatedPatient = await prisma.patient.update({
      where: { id },
      data: {
        name,
        nationalId,
        ...(parsedBirthDate !== undefined && { birthDate: parsedBirthDate }),
        gender,
        bloodType,
        email,
        occupation,
        address,
        emergencyContact,
        // Si mandan antecedentes, hacemos un upsert anidado
        ...(medicalBackground && {
          medicalBackground: {
            upsert: {
              create: {
                allergies: medicalBackground.allergies,
                personalHistory: medicalBackground.personalHistory,
                familyHistory: medicalBackground.familyHistory,
                surgicalHistory: medicalBackground.surgicalHistory,
                habits: medicalBackground.habits,
                observations: medicalBackground.observations
              },
              update: {
                allergies: medicalBackground.allergies,
                personalHistory: medicalBackground.personalHistory,
                familyHistory: medicalBackground.familyHistory,
                surgicalHistory: medicalBackground.surgicalHistory,
                habits: medicalBackground.habits,
                observations: medicalBackground.observations
              }
            }
          }
        })
      },
      include: { medicalBackground: true }
    });

    res.json({ success: true, patient: updatedPatient });
  } catch (error) {
    console.error('Error updating patient:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});
`;

if (!code.includes("app.put('/api/doctor/patients/:id'")) {
  code = code.replace('app.listen(PORT', newEndpoints + '\napp.listen(PORT');
  fs.writeFileSync(filePath, code);
  console.log('Endpoints de Perfil de Paciente agregados.');
} else {
  console.log('Endpoints ya existen.');
}

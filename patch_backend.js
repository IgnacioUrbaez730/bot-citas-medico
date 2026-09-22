const fs = require('fs');
const filePath = 'src/index.ts';
let code = fs.readFileSync(filePath, 'utf8');

const newEndpoint = `
// ENDPOINT PARA GUARDAR LA HISTORIA CLINICA DESDE FLUTTER
app.post('/api/doctor/medical-record', async (req, res) => {
  const { appointmentId, patientId, demographics, soapData } = req.body;
  
  if (!appointmentId || !patientId) {
    return res.status(400).json({ error: 'Faltan datos requeridos (appointmentId, patientId)' });
  }

  try {
    // 1. Actualizar demografía del paciente
    if (demographics) {
      const updateData: any = {};
      if (demographics.gender) updateData.gender = demographics.gender;
      if (demographics.bloodType) updateData.bloodType = demographics.bloodType;
      if (demographics.email) updateData.email = demographics.email;
      if (demographics.occupation) updateData.occupation = demographics.occupation;
      if (demographics.address) updateData.address = demographics.address;
      if (demographics.emergencyContact) updateData.emergencyContact = demographics.emergencyContact;
      // Convertir fecha de nacimiento si viene
      if (demographics.birthDate) {
        const parts = demographics.birthDate.split('/');
        if (parts.length === 3) {
           updateData.birthDate = new Date(\`\${parts[2]}-\${parts[1]}-\${parts[0]}T12:00:00Z\`);
        }
      }
      
      if (Object.keys(updateData).length > 0) {
        await prisma.patient.update({
          where: { id: patientId },
          data: updateData
        });
      }
    }

    // 2. Guardar/Actualizar la Nota Clínica (Historia)
    const note = await prisma.clinicalNote.upsert({
      where: { appointmentId },
      update: {
        soapData: soapData,
        isSigned: true, // Podemos marcarla como firmada al guardarla
      },
      create: {
        appointmentId,
        soapData: soapData,
        isSigned: true,
      }
    });

    res.json({ success: true, note });
  } catch (error) {
    console.error('Error saving medical record:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});
`;

if (!code.includes('/api/doctor/medical-record')) {
  code = code.replace('app.listen(PORT', newEndpoint + '\napp.listen(PORT');
  fs.writeFileSync(filePath, code);
  console.log('Endpoint agregado.');
} else {
  console.log('Endpoint ya existe.');
}

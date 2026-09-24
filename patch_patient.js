const fs = require('fs');
const filePath = 'src/index.ts';
let code = fs.readFileSync(filePath, 'utf8');

const newEndpoint = `
// ENDPOINT PARA CREAR UN PACIENTE (CON VALIDACION Y CEDULA ESCOLAR)
app.post('/api/doctor/patients', async (req, res) => {
  const { 
    phone, 
    name, 
    nationalId, 
    birthDate, 
    isMinor, 
    twinNumber = 1, 
    contactName, 
    contactNationalId,
    gender,
    bloodType,
    email,
    occupation,
    address,
    emergencyContact
  } = req.body;

  if (!phone || !name) {
    return res.status(400).json({ error: 'El teléfono del titular y el nombre del paciente son obligatorios.' });
  }

  // Normalizar el teléfono (formato Vzla 58)
  let formattedPhone = phone.replace(/\\D/g, '');
  if (formattedPhone.startsWith('0')) {
    formattedPhone = '58' + formattedPhone.substring(1);
  } else if (!formattedPhone.startsWith('58') && formattedPhone.length === 10) {
    formattedPhone = '58' + formattedPhone;
  }

  try {
    const doctor = await prisma.doctor.findFirst();
    if (!doctor) return res.status(400).json({ error: 'No hay doctor configurado' });

    // 1. Manejo del Titular (Contact)
    let contact = await prisma.contact.findUnique({ where: { phone: formattedPhone } });
    if (!contact) {
      contact = await prisma.contact.create({
        data: { 
          phone: formattedPhone, 
          name: contactName || name,
          nationalId: contactNationalId
        }
      });
    } else {
      // Actualizar datos del titular si vienen en el request
      if (contactName || contactNationalId) {
        await prisma.contact.update({
          where: { phone: formattedPhone },
          data: {
            ...(contactName && { name: contactName }),
            ...(contactNationalId && { nationalId: contactNationalId })
          }
        });
        contact.nationalId = contactNationalId || contact.nationalId;
      }
    }

    // Parsear fecha de nacimiento si viene
    let parsedBirthDate = null;
    if (birthDate) {
      // Intentar parsear ISO o YYYY-MM-DD. Si viene DD/MM/YYYY, habría que transformarlo.
      // Por seguridad, si es string y contiene '/', lo volteamos.
      if (birthDate.includes('/')) {
        const parts = birthDate.split('/');
        if (parts.length === 3) parsedBirthDate = new Date(\`\${parts[2]}-\${parts[1]}-\${parts[0]}T12:00:00Z\`);
      } else {
        parsedBirthDate = new Date(birthDate);
      }
    }

    // 2. Cálculo de Cédula (o Cédula Escolar)
    let finalNationalId = nationalId;
    
    if (!finalNationalId && isMinor && parsedBirthDate && contact.nationalId) {
      // Formula: [Parto Gemelar: 1,2..] + [Últimos 2 del año] + [Cédula Titular]
      const yearStr = parsedBirthDate.getFullYear().toString().slice(-2); // ej: "24" para 2024
      const parentIdClean = contact.nationalId.replace(/\\D/g, ''); // Solo números
      finalNationalId = \`\${twinNumber}\${yearStr}\${parentIdClean}\`;
    }

    // 3. Validación de Duplicados
    if (finalNationalId) {
      const existingById = await prisma.patient.findFirst({ where: { nationalId: finalNationalId } });
      if (existingById) {
        return res.status(409).json({ error: 'Ya existe un paciente registrado con esta cédula.' });
      }
    } else {
      // Validación estricta para niños sin cédula escolar generable
      const existingByName = await prisma.patient.findFirst({ 
        where: { 
          contactPhone: formattedPhone,
          name: name
        } 
      });
      if (existingByName) {
        return res.status(409).json({ error: 'Este paciente ya está registrado bajo este titular.' });
      }
    }

    // 4. Creación del Paciente
    const patient = await prisma.patient.create({
      data: {
        doctorId: doctor.id,
        contactPhone: formattedPhone,
        name,
        nationalId: finalNationalId,
        birthDate: parsedBirthDate,
        gender,
        bloodType,
        email,
        occupation,
        address,
        emergencyContact
      }
    });

    res.json({ success: true, patient, generatedSchoolId: !nationalId && finalNationalId ? true : false });
  } catch (error) {
    console.error('Error creating patient:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});
`;

if (!code.includes('/api/doctor/patients')) {
  code = code.replace('app.listen(PORT', newEndpoint + '\napp.listen(PORT');
  fs.writeFileSync(filePath, code);
  console.log('Endpoint agregado.');
} else {
  console.log('Endpoint ya existe.');
}

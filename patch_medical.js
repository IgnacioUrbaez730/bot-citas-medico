const fs = require('fs');
let code = fs.readFileSync('src/index.ts', 'utf8');

const regex = /app\.post\('\/api\/doctor\/medical-record', async \(req, res\) => \{[\s\S]*?res\.status\(500\)\.json\(\{ error: 'Error al guardar la historia clÃ­nica' \}\);\n  \}\n\}\);/;
const regexAlt = /app\.post\('\/api\/doctor\/medical-record', async \(req, res\) => \{[\s\S]*?res\.status\(500\)\.json\(\{ error: 'Error al guardar la historia clínica' \}\);\n  \}\n\}\);/;

const newEndpoint = `app.post('/api/doctor/medical-record', async (req, res) => {
  const { appointmentId, patientId, soapData } = req.body;

  if (!appointmentId || !patientId || !soapData) {
    return res.status(400).json({ error: 'Faltan datos obligatorios para la historia médica.' });
  }

  try {
    let finalApptId = appointmentId;

    if (appointmentId.startsWith('manual-')) {
      const doctor = await prisma.doctor.findFirst();
      const newAppt = await prisma.appointment.create({
        data: {
          doctorId: doctor.id,
          patientId: patientId,
          dateTime: new Date(),
          reason: 'Consulta Ad-hoc',
          status: 'COMPLETED'
        }
      });
      finalApptId = newAppt.id;
    }

    const note = await prisma.clinicalNote.upsert({
      where: { appointmentId: finalApptId },
      update: {
        soapData: soapData,
        isSigned: true
      },
      create: {
        appointmentId: finalApptId,
        soapData: soapData,
        isSigned: true
      }
    });

    if (!appointmentId.startsWith('manual-')) {
      await prisma.appointment.update({
        where: { id: finalApptId },
        data: { status: 'COMPLETED' }
      });
    }

    res.json({ success: true, note });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al guardar la historia clínica' });
  }
});`;

if (code.match(regex)) {
  code = code.replace(regex, newEndpoint);
} else {
  code = code.replace(regexAlt, newEndpoint);
}

fs.writeFileSync('src/index.ts', code);
console.log('Patched medical record endpoint');

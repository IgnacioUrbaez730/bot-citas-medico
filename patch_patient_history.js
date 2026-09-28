const fs = require('fs');
let code = fs.readFileSync('src/index.ts', 'utf8');

const regex = /app\.get\('\/api\/doctor\/patients\/:id', async \(req, res\) => \{[\s\S]*?res\.status\(500\)\.json\(\{ error: 'Error del servidor' \}\);\n  \}\n\}\);/;
const newEndpoint = `app.get('/api/doctor/patients/:id', async (req, res) => {
  try {
    const patient = await prisma.patient.findUnique({
      where: { id: req.params.id },
      include: {
        contact: true,
        medicalBackground: true,
        appointments: {
          orderBy: { dateTime: 'desc' },
          include: { clinicalNote: true }
        }
      }
    });
    if (!patient) return res.status(404).json({ error: 'Paciente no encontrado' });
    res.json(patient);
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});`;

code = code.replace(regex, newEndpoint);

fs.writeFileSync('src/index.ts', code);
console.log('Patched GET patient to include history');

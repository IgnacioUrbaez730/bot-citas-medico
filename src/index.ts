import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import whatsappRoutes from './routes/whatsapp.routes';
import { WhatsAppService } from './services/whatsapp.service';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const whatsappService = new WhatsAppService();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

app.use('/api/webhook/whatsapp', whatsappRoutes);

app.post('/api/doctor/extract-config', async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Falta el texto' });
  }
  
  try {
    const { GeminiProvider } = require('./providers/gemini.provider');
    const gemini = new GeminiProvider();
    const config = await gemini.extractConfig(text);
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: 'Error extrayendo configuración' });
  }
});

app.post('/api/doctor/send', async (req, res) => {
  const { phone, message } = req.body;

  if (!phone || !message) {
    return res.status(400).json({ error: 'Faltan parámetros' });
  }

  try {
    const { WhatsAppProvider } = require('./providers/whatsapp.provider');
    const provider = new WhatsAppProvider();
    await provider.sendTextMessage(phone, message);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo enviar el mensaje' });
  }
});

app.post('/api/doctor/book-manual', async (req, res) => {
  const { phone, patientName, reason, dateTime } = req.body;

  if (!phone || !patientName || !dateTime) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' });
  }

  let formattedPhone = phone.replace(/\D/g, '');
  if (formattedPhone.startsWith('0')) {
    formattedPhone = '58' + formattedPhone.substring(1);
  } else if (!formattedPhone.startsWith('58') && formattedPhone.length === 10) {
    formattedPhone = '58' + formattedPhone;
  }

  try {
    const doctor = await prisma.doctor.findFirst();
    if (!doctor) throw new Error('No hay un doctor configurado');

    let contact = await prisma.contact.findUnique({ where: { phone: formattedPhone } });
    if (!contact) {
      contact = await prisma.contact.create({ data: { phone: formattedPhone, alias: patientName } });
    }

    let patient = await prisma.patient.findFirst({
      where: { contactPhone: formattedPhone, name: patientName }
    });
    
    if (!patient) {
      patient = await prisma.patient.create({
        data: {
          doctorId: doctor.id,
          contactPhone: formattedPhone,
          name: patientName,
        }
      });
    }

    const appointmentDate = new Date(dateTime);
    const appointment = await prisma.appointment.create({
      data: {
        doctorId: doctor.id,
        patientId: patient.id,
        dateTime: appointmentDate,
        reason: reason || 'Consulta General',
        status: 'SCHEDULED'
      }
    });

    const { WhatsAppProvider } = require('./providers/whatsapp.provider');
    const whatsappProvider = new WhatsAppProvider();
    const friendlyDate = appointmentDate.toLocaleString('es-VE', { 
      weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' 
    });
    await whatsappProvider.sendTextMessage(
      formattedPhone,
      `Hola ${patientName}, el doctor ha agendado una cita manualmente para ti el día ${friendlyDate}. ¡Te esperamos!`
    );

    res.json({ success: true, appointment });
  } catch (error) {
    res.status(500).json({ error: 'Error agendando la cita manualmente' });
  }
});

app.post('/api/doctor/update-appointment', async (req, res) => {
  const { appointmentId, action, newDateTime } = req.body;

  if (!appointmentId || !action) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' });
  }

  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { doctor: true, patient: { include: { contact: true } } }
    });
    if (!appointment) return res.status(404).json({ error: 'Cita no encontrada' });
    
    const { WhatsAppProvider } = require('./providers/whatsapp.provider');
    const whatsappProvider = new WhatsAppProvider();

    if (action === 'CANCEL') {
      await prisma.appointment.update({
        where: { id: appointmentId },
        data: { status: 'CANCELLED' }
      });
      await whatsappProvider.sendTextMessage(
        appointment.patient.contactPhone,
        `Hola ${appointment.patient.name}, lamentablemente su cita programada ha sido cancelada por el doctor.`
      );
    } else if (action === 'RESCHEDULE') {
      if (!newDateTime) throw new Error('Falta newDateTime para reprogramar');
      
      const appointmentDate = new Date(newDateTime);
      await prisma.appointment.update({
        where: { id: appointmentId },
        data: { dateTime: appointmentDate }
      });
      
      const friendlyDate = appointmentDate.toLocaleString('es-VE', { 
        weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' 
      });
      
      await whatsappProvider.sendTextMessage(
        appointment.patient.contactPhone,
        `Hola ${appointment.patient.name}, el doctor ha reprogramado su cita para el día ${friendlyDate}.`
      );
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error actualizando cita' });
  }
});

app.post('/api/doctor/medical-record', async (req, res) => {
  const { appointmentId, patientId, soapData } = req.body;

  if (!appointmentId || !patientId || !soapData) {
    return res.status(400).json({ error: 'Faltan datos obligatorios para la historia médica.' });
  }

  try {
    const note = await prisma.clinicalNote.upsert({
      where: { appointmentId },
      update: {
        soapData: soapData,
        status: 'SIGNED'
      },
      create: {
        appointmentId,
        patientId,
        soapData: soapData,
        status: 'SIGNED'
      }
    });

    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: 'COMPLETED' }
    });

    res.json({ success: true, note });
  } catch (error) {
    res.status(500).json({ error: 'Error al guardar la historia clínica' });
  }
});

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

  if (!name) {
    return res.status(400).json({ error: 'El nombre del paciente es obligatorio.' });
  }

  try {
    const doctor = await prisma.doctor.findFirst();
    if (!doctor) return res.status(400).json({ error: 'No hay doctor configurado' });

    let contact = null;
    let formattedPhone = null;

    if (phone && phone.trim() !== '') {
      formattedPhone = phone.replace(/\\D/g, '');
      if (formattedPhone.startsWith('0')) {
        formattedPhone = '58' + formattedPhone.substring(1);
      } else if (!formattedPhone.startsWith('58') && formattedPhone.length === 10) {
        formattedPhone = '58' + formattedPhone;
      }

      contact = await prisma.contact.findUnique({ where: { phone: formattedPhone } });
      if (!contact) {
        contact = await prisma.contact.create({
          data: { 
            phone: formattedPhone, 
            name: contactName || name,
            nationalId: contactNationalId
          }
        });
      } else {
        if (contactName || contactNationalId) {
          await prisma.contact.update({
            where: { phone: formattedPhone },
            data: {
              ...(contactName && { name: contactName }),
              ...(contactNationalId && { nationalId: contactNationalId })
            }
          });
        }
      }
    }

    let finalNationalId = nationalId;
    let generatedSchoolId = false;

    if (isMinor) {
      const birthYear = birthDate ? new Date(birthDate).getFullYear().toString().slice(-2) : '00';
      const ciRepresentante = contactNationalId || contact?.nationalId || '00000000';
      finalNationalId = \`\${twinNumber}\${birthYear}\${ciRepresentante}\`;
      generatedSchoolId = true;
    }

    if (finalNationalId) {
      const existingById = await prisma.patient.findFirst({ where: { nationalId: finalNationalId } });
      if (existingById) {
        return res.status(409).json({ error: 'Ya existe un paciente registrado con esta cédula.' });
      }
    } else if (formattedPhone) {
      const existingByName = await prisma.patient.findFirst({ 
        where: { 
          contactPhone: formattedPhone,
          name: name
        }
      });
      if (existingByName) {
        return res.status(409).json({ error: 'Ya existe un paciente con este nombre asociado a este número.' });
      }
    }

    let parsedBirthDate = undefined;
    if (birthDate) {
      if (birthDate.includes('/')) {
        const parts = birthDate.split('/');
        if (parts.length === 3) parsedBirthDate = new Date(\`\${parts[2]}-\${parts[1]}-\${parts[0]}T12:00:00Z\`);
      } else {
        parsedBirthDate = new Date(birthDate);
      }
    }

    const patient = await prisma.patient.create({
      data: {
        doctorId: doctor.id,
        ...(contact && { contactPhone: contact.phone }), // FIXED THIS TO USE contactPhone instead of contactId depending on schema
        name,
        ...(finalNationalId && { nationalId: finalNationalId }),
        ...(parsedBirthDate !== undefined && { birthDate: parsedBirthDate }),
        gender,
        bloodType,
        email,
        occupation,
        address,
        emergencyContact
      }
    });

    res.json({ success: true, patient, generatedSchoolId });
  } catch (error: any) {
    res.status(500).json({ error: 'Error al registrar el paciente', details: error.message });
  }
});

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
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ACTUALIZAR PERFIL DEL PACIENTE
app.put('/api/doctor/patients/:id', async (req, res) => {
  const { id } = req.params;
  const { 
    name, nationalId, birthDate, gender, bloodType, email, occupation, address, emergencyContact,
    medicalBackground 
  } = req.body;

  try {
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
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.listen(PORT, () => {
  console.log(\`Servidor escuchando en puerto \${PORT}\`);
});

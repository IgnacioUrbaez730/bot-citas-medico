import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import whatsappRoutes from './routes/whatsapp.routes';
import { WhatsAppService } from './services/whatsapp.service';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const whatsappService = new WhatsAppService();

app.use(cors()); // Permitir peticiones desde Flutter Web
app.use(express.json());

app.use('/api/webhook/whatsapp', whatsappRoutes);

// ENDPOINT PARA LA CONFIGURACIÓN CON IA (FLUTTER)
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
    console.error(error);
    res.status(500).json({ error: 'Error procesando texto' });
  }
});

// ENDPOINT PARA LA APP DE FLUTTER
app.post('/api/doctor/send', async (req, res) => {
  const { phone, text } = req.body;
  if (!phone || !text) {
    return res.status(400).json({ error: 'Faltan datos' });
  }
  
  try {
    await whatsappService.doctorManualOverride(phone, text);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error enviando mensaje' });
  }
});

// ENDPOINT PARA AGENDAR MANUALMENTE DESDE FLUTTER
app.post('/api/doctor/book-manual', async (req, res) => {
  const { phone, patientName, dateTime, reason } = req.body;
  if (!phone || !patientName || !dateTime) {
    return res.status(400).json({ error: 'Faltan datos requeridos (phone, patientName, dateTime)' });
  }

  // Normalizar el teléfono para Venezuela (Ej: 0412 -> 58412)
  let formattedPhone = phone.replace(/\D/g, '');
  if (formattedPhone.startsWith('0')) {
    formattedPhone = '58' + formattedPhone.substring(1);
  } else if (!formattedPhone.startsWith('58') && formattedPhone.length === 10) {
    formattedPhone = '58' + formattedPhone;
  }

  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    // Obtener el doctor (asumiendo que hay uno solo por ahora)
    const doctor = await prisma.doctor.findFirst();
    if (!doctor) throw new Error('No hay un doctor configurado');

    // 1. Asegurar que el Contacto existe
    let contact = await prisma.contact.findUnique({ where: { phone: formattedPhone } });
    if (!contact) {
      contact = await prisma.contact.create({ data: { phone: formattedPhone, alias: patientName } });
    }

    // 2. Asegurar que el Paciente existe
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

    // 3. Crear la cita
    const appointmentDate = new Date(dateTime);
    const appointment = await prisma.appointment.create({
      data: {
        doctorId: doctor.id,
        patientId: patient.id,
        dateTime: appointmentDate,
        reason: reason || 'Consulta generada manualmente',
        status: 'CONFIRMED'
      }
    });

    // 4. Enviar WhatsApp de confirmacion
    const options: Intl.DateTimeFormatOptions = { 
      timeZone: 'America/Caracas', 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    };
    const dateStr = appointmentDate.toLocaleString('es-VE', options);
    
    const msg = `✅ *Cita Confirmada*\nHola, el ${doctor.name} te ha agendado una cita para *\n${patientName}*\n\n📅 Cuándo: ${dateStr}\n\nTe esperamos.`;
    
    const { WhatsAppProvider } = require('./providers/whatsapp.provider');
    const whatsappProvider = new WhatsAppProvider();
    await whatsappProvider.sendTextMessage(formattedPhone, msg);

    res.json({ success: true, appointment });
  } catch (error: any) {
    console.error('[Book Manual Error]:', error);
    res.status(500).json({ error: 'Error interno guardando la cita manual: ' + error.message });
  }
});

// ENDPOINT PARA ELIMINAR/REPROGRAMAR CITA DESDE FLUTTER
app.post('/api/doctor/update-appointment', async (req, res) => {
  const { appointmentId, action, newDateTime } = req.body;
  if (!appointmentId || !action) {
    return res.status(400).json({ error: 'Faltan datos requeridos (appointmentId, action)' });
  }

  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { doctor: true, patient: { include: { contact: true } } }
    });

    if (!appointment) throw new Error('Cita no encontrada');

    const phone = appointment.patient.contactPhone;
    const { WhatsAppProvider } = require('./providers/whatsapp.provider');
    const whatsappProvider = new WhatsAppProvider();

    if (action === 'CANCEL') {
      await prisma.appointment.update({
        where: { id: appointmentId },
        data: { status: 'CANCELLED' }
      });

      const msg = `⚠️ *Cita Cancelada*\nHola, tu cita para *\n${appointment.patient.name}* ha sido cancelada por el doctor. Por favor contáctanos para agendar una nueva.`;
      await whatsappProvider.sendTextMessage(phone, msg);
    } 
    else if (action === 'RESCHEDULE') {
      if (!newDateTime) throw new Error('Falta newDateTime para reprogramar');
      
      const appointmentDate = new Date(newDateTime);
      await prisma.appointment.update({
        where: { id: appointmentId },
        data: { dateTime: appointmentDate }
      });

      const options: Intl.DateTimeFormatOptions = { timeZone: 'America/Caracas', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
      const dateStr = appointmentDate.toLocaleString('es-VE', options);

      const msg = `🔄 *Cita Reprogramada*\nHola, el ${appointment.doctor.name} ha reprogramado tu cita para *\n${appointment.patient.name}*\n\n📅 Nuevo horario: ${dateStr}\n\nTe esperamos.`;
      await whatsappProvider.sendTextMessage(phone, msg);
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('[Update Appointment Error]:', error);
    res.status(500).json({ error: 'Error actualizando la cita: ' + error.message });
  }
});

app.get('/', (req, res) => {
  res.send('Servidor de Citas IA activo ??');
});


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
           updateData.birthDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T12:00:00Z`);
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

  if (!name) {
    return res.status(400).json({ error: 'El teléfono del titular y el nombre del paciente son obligatorios.' });
  }

  // Normalizar el teléfono (formato Vzla 58)
  let formattedPhone = phone.replace(/\D/g, '');
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
        if (parts.length === 3) parsedBirthDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T12:00:00Z`);
      } else {
        parsedBirthDate = new Date(birthDate);
      }
    }

    // 2. Cálculo de Cédula (o Cédula Escolar)
    let finalNationalId = nationalId;
    
    if (!finalNationalId && isMinor && parsedBirthDate && contact.nationalId) {
      // Formula: [Parto Gemelar: 1,2..] + [Últimos 2 del año] + [Cédula Titular]
      const yearStr = parsedBirthDate.getFullYear().toString().slice(-2); // ej: "24" para 2024
      const parentIdClean = contact.nationalId.replace(/\D/g, ''); // Solo números
      finalNationalId = `${twinNumber}${yearStr}${parentIdClean}`;
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
        if (parts.length === 3) parsedBirthDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T12:00:00Z`);
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

app.listen(PORT, () => {
  console.log('[Server] Corriendo en http://localhost:' + PORT);
});

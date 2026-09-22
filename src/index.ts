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

app.get('/', (req, res) => {
  res.send('Servidor de Citas IA activo ??');
});

app.listen(PORT, () => {
  console.log('[Server] Corriendo en http://localhost:' + PORT);
});

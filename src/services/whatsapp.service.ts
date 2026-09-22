import { PrismaClient } from '@prisma/client';
import { WhatsAppMessage } from '../schemas/whatsapp.schema';
import EventEmitter from 'events';
import { WhatsAppProvider } from '../providers/whatsapp.provider';
import { GeminiProvider } from '../providers/gemini.provider';

const prisma = new PrismaClient();
export const chatEvents = new EventEmitter();
const whatsappProvider = new WhatsAppProvider();
const geminiProvider = new GeminiProvider();

export class WhatsAppService {
  async processMessage(message: WhatsAppMessage) {
    const phone = message.from;
    const userText = message.text?.body || "";
    
    // ScDD: Asegurarnos de que el Contacto exista en la BD antes de cualquier otra cosa
    await prisma.contact.upsert({
      where: { phone },
      update: {},
      create: { phone }
    });

    let session = await prisma.botSession.findUnique({
      where: { phone }
    });

    if (!session) {
      session = await prisma.botSession.create({
        data: {
          phone,
          doctorId: '00000000-0000-0000-0000-000000000000',
          step: 'CHAT_MODE' // Ya no usamos estados rígidos
        }
      });
    }

    // Guardar el mensaje entrante en la base de datos (Para que Flutter lo lea)
    await prisma.message.create({
      data: {
        phone: phone,
        sender: 'patient',
        text: userText
      }
    });

    console.log(`[Service] Procesando mensaje de ${phone}. Texto: "${userText}"`);

    // 1. Buffer para acumular mensajes (Modo Espera)
    const globalAny: any = global;
    if (!globalAny.messageBuffer) globalAny.messageBuffer = {};
    if (!globalAny.messageBuffer[phone]) globalAny.messageBuffer[phone] = { timer: null, text: [] };

    // Agregar el nuevo mensaje al historial de este bloque
    globalAny.messageBuffer[phone].text.push(userText);

    // Si ya habÃ­a un temporizador corriendo, lo cancelamos (el paciente sigue escribiendo)
    if (globalAny.messageBuffer[phone].timer) {
      clearTimeout(globalAny.messageBuffer[phone].timer);
    }

    // 2. Iniciamos el cronómetro de ESPERA (30 segundos)
    console.log(`[Service] Modo espera activado para ${phone}. Esperando 30 segundos...`);
    
    globalAny.messageBuffer[phone].timer = setTimeout(async () => {
      console.log(`[Service] Tiempo de espera agotado para ${phone}. Procesando con IA...`);
      
      try {
        // A) Buscar perfil de la doctora en BD (para el prompt)
        const doctor = await prisma.doctor.findUnique({
          where: { id: '00000000-0000-0000-0000-000000000000' } // ID por defecto
        });

        // B) Buscar las últimas interacciones del historial en BD para contexto
        const dbHistory = await prisma.message.findMany({
          where: { phone },
          orderBy: { createdAt: 'desc' },
          take: 15 // Últimos 15 mensajes
        });
        dbHistory.reverse(); // Orden cronológico para la IA

        // C) Instrucciones Maestras Mejoradas (Inyectamos la info real del Doctor)
        const systemPrompt = `
Eres el asistente virtual empático de la clínica de la Doctora ${doctor?.name || 'Principal'}. 
Especialidad: ${doctor?.specialty || 'General'}.
Horario de Atención (LEER ATENTAMENTE): "${doctor?.scheduleText || 'No especificado'}".
Duración por cita: ${doctor?.slotDuration || 30} minutos.

Tu objetivo es leer el historial del paciente y responder como un humano profesional de la salud, no como un robot rígido.

REGLAS DE TRIAJE (MUY IMPORTANTE):
1. Si el paciente menciona síntomas de EMERGENCIA (fiebre alta, dificultad respiratoria, etc.), DEBES detener cualquier intento de agendar y derivarlo a emergencias.
2. Si el paciente te dice su nombre, DEBES usar la herramienta (función) 'guardar_nombre_paciente' inmediatamente.
3. Sé breve, muy educado y usa emojis médicos ocasionalmente (🩺). 
4. NUNCA inventes horarios. Limítate a lo que dice el Horario de Atención.
`;

        const aiResponse = await geminiProvider.generateResponse(dbHistory, systemPrompt, phone, doctor);
        
        // Guardar la respuesta de la IA en la base de datos
        await prisma.message.create({
          data: {
            phone: phone,
            sender: 'bot',
            text: aiResponse
          }
        });

        await whatsappProvider.sendTextMessage(phone, aiResponse);
        console.log(`[Service] Respuesta enviada a ${phone}`);
      } catch (error) {
        console.error(`[Service] Error al generar respuesta:`, error);
      }

      // Limpiar el buffer para este número
      delete globalAny.messageBuffer[phone];
    }, 30000);

    chatEvents.emit('whatsapp:message:received', {
      message,
      session
    });
  }

  // MÉTODO PARA QUE LA APP FLUTTER ENVIE MENSAJES Y CANCELE LA IA
  async doctorManualOverride(phone: string, text: string) {
    const globalAny: any = global;
    
    // 1. Apagar el "Modo Espera" si estaba corriendo
    if (globalAny.messageBuffer && globalAny.messageBuffer[phone] && globalAny.messageBuffer[phone].timer) {
      clearTimeout(globalAny.messageBuffer[phone].timer);
      delete globalAny.messageBuffer[phone];
      console.log(`[Service] IA cancelada manualmente por el Doctor para ${phone}`);
    }

    // 2. Enviar el mensaje por Meta
    await whatsappProvider.sendTextMessage(phone, text);
    console.log(`[Service] Mensaje manual enviado a ${phone}`);
  }
}

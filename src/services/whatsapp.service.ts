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

Tu objetivo es leer el historial del paciente y responder como un humano profesional de la salud.

REGLAS DE TRIAJE Y AGENDAMIENTO (¡OBLIGATORIAS!):
1. Si el paciente te dice su nombre, usa la herramienta 'guardar_nombre_paciente'.
2. Si el paciente pide saber turnos disponibles para una fecha o pide agendar sin dar hora, TIENES QUE usar la herramienta 'revisar_agenda' pasándole la fecha. NUNCA inventes horarios.
3. Si el paciente ya acordó una fecha exacta (YYYY-MM-DD), una hora exacta (HH:mm) y un motivo, ¡ES OBLIGATORIO usar la herramienta 'agendar_cita'! NO le digas que la agendaste sin haber llamado a la herramienta. NO uses 'guardar_nombre_paciente' cuando el usuario pide agendar.
4. Si el paciente menciona síntomas graves de emergencia (fiebre altísima, dificultad respiratoria), mándalo a urgencias inmediatamente y no agendes nada.
5. Sé amable y conversacional. 
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

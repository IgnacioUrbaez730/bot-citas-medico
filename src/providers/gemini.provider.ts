import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

export class GeminiProvider {
  private ai: GoogleGenAI;

  constructor() {
    if (!process.env.GEMINI_API_KEY) {
      console.warn('[GeminiProvider] Advertencia: GEMINI_API_KEY no configurada en .env');
    }
    
    // Inicializamos el cliente oficial de Gemini
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
  }

  /**
   * Genera una respuesta inteligente basada en el historial de chat y soporta Function Calling.
   */
  // Método de blindaje: Reintento automático si Google nos da error 429 (Cuota excedida)
  private async generateContentWithRetry(options: any, maxRetries: number = 3): Promise<any> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await this.ai.models.generateContent(options);
      } catch (error: any) {
        const errorMsg = error.message || '';
        const isRateLimit = errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED') || errorMsg.includes('quota');
        
        if (isRateLimit && i < maxRetries - 1) {
          const waitTime = (i + 1) * 12000; // 12 segundos, luego 24 segundos
          console.warn(`[GeminiProvider] ⚠️ Límite de cuota (429). Esperando ${waitTime/1000}s para reintentar... (Intento ${i+1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        } else {
          throw error; // Si no es 429 o ya no quedan reintentos, lanzamos el error
        }
      }
    }
  }

  async generateResponse(
    history: any[],
    systemInstruction: string,
    phone: string,
    doctorConfig: any
  ): Promise<string> {
    try {
      // 1. Declarar Herramientas (Tools)
      const functionDeclarations: any[] = [
        {
          name: 'guardar_nombre_paciente',
          description: 'Úsala CADA VEZ que el paciente diga su nombre o cómo quiere que lo llamen, para guardarlo en la base de datos.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              nombre: { type: Type.STRING, description: 'El nombre del paciente' },
            },
            required: ['nombre'],
          },
        },
        {
          name: 'revisar_agenda',
          description: 'Busca los horarios ocupados de un día específico para saber qué turnos están disponibles.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              fecha: { type: Type.STRING, description: 'Fecha en formato YYYY-MM-DD' },
            },
            required: ['fecha'],
          },
        },
        {
          name: 'agendar_cita',
          description: 'Guarda oficialmente una cita médica en la base de datos.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              fecha: { type: Type.STRING, description: 'Fecha de la cita en formato YYYY-MM-DD' },
              hora: { type: Type.STRING, description: 'Hora de la cita en formato HH:mm (24h)' },
              motivo: { type: Type.STRING, description: 'Breve motivo de la consulta' }
            },
            required: ['fecha', 'hora', 'motivo'],
          },
        }
      ];

      // 2. Construir la historia consolidando roles consecutivos y manejando mensajes vacíos (audios)
      const contents: any[] = [];
      
      for (const msg of history) {
        const role = msg.sender === 'patient' ? 'user' : 'model';
        // Si el texto está vacío (pasa cuando envían audios/imágenes), le ponemos un placeholder
        const text = msg.text?.trim() ? msg.text.trim() : '[El paciente envió un audio o multimedia que la IA aún no puede procesar]';

        if (contents.length > 0 && contents[contents.length - 1].role === role) {
          // Si es el mismo rol consecutivo, concatenamos el texto (Gemini no soporta user -> user)
          contents[contents.length - 1].parts[0].text += `\n${text}`;
        } else {
          // Nuevo rol, agregamos el bloque
          contents.push({ role, parts: [{ text }] });
        }
      }

      // Si por alguna extraña razón el historial termina en 'model', Gemini lanzará error 400.
      // Como esto se ejecuta tras un mensaje del paciente, SIEMPRE debería terminar en 'user'.
      if (contents.length > 0 && contents[contents.length - 1].role === 'model') {
        contents.push({ role: 'user', parts: [{ text: '[El paciente está esperando respuesta]' }] });
      }

      // 3. Ejecutar Gemini (Con Blindaje Anti-429)
      const response = await this.generateContentWithRetry({
        model: 'gemini-3.5-flash',
        contents: contents,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.2,
          tools: [{ functionDeclarations }],
        },
      });

      // 4. Manejar llamadas a funciones
      if (response.functionCalls && response.functionCalls.length > 0) {
        const call = response.functionCalls[0];
        console.log(`[GeminiProvider] 🤖 IA solicitó ejecutar: ${call.name}`, call.args);
        
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();
        let toolResponseData: any = {};

        if (call.name === 'guardar_nombre_paciente') {
          const nombre = call.args.nombre;
          await prisma.contact.update({ where: { phone }, data: { aiName: nombre } });
          console.log(`[GeminiProvider] ✅ Nombre "${nombre}" guardado en BD para ${phone}`);
          toolResponseData = { success: true, message: `Nombre ${nombre} guardado exitosamente.` };
        }
        
        else if (call.name === 'revisar_agenda') {
          const fecha = call.args.fecha; // YYYY-MM-DD
          const startOfDay = new Date(`${fecha}T00:00:00.000Z`);
          const endOfDay = new Date(`${fecha}T23:59:59.999Z`);
          
          const appointments = await prisma.appointment.findMany({
            where: {
              doctorId: doctorConfig.id,
              dateTime: { gte: startOfDay, lte: endOfDay },
              status: { not: 'CANCELLED' }
            },
            select: { dateTime: true }
          });
          
          const ocupadas = appointments.map((a: any) => a.dateTime.toISOString());
          console.log(`[GeminiProvider] 📅 Consultando agenda para ${fecha}. Citas ocupadas: ${ocupadas.length}`);
          
          toolResponseData = { 
            fechaConsulta: fecha,
            citasOcupadasISO: ocupadas,
            mensaje: 'Compara estas citas ocupadas con mi horario de atención y ofrécele al paciente opciones de horas disponibles que no choquen con las ocupadas. Calcula bien los minutos (Ej: si la cita dura 30 mins, 08:00 a 08:30).'
          };
        }

        else if (call.name === 'agendar_cita') {
          const { fecha, hora, motivo } = call.args;
          const dateTimeString = `${fecha}T${hora}:00.000Z`;
          const appointmentDate = new Date(dateTimeString);
          
          try {
            // Buscar o crear Paciente vinculado al contacto
            let patient = await prisma.patient.findFirst({ where: { contactPhone: phone } });
            if (!patient) {
              const contact = await prisma.contact.findUnique({ where: { phone }});
              patient = await prisma.patient.create({
                data: { doctorId: doctorConfig.id, contactPhone: phone, name: contact?.name || contact?.aiName || 'Paciente Nuevo' }
              });
            }

            const newAppt = await prisma.appointment.create({
              data: {
                doctorId: doctorConfig.id,
                patientId: patient.id,
                dateTime: appointmentDate,
                reason: motivo || 'Consulta general'
              }
            });
            console.log(`[GeminiProvider] ✅ Cita agendada para ${phone} el ${dateTimeString}`);
            toolResponseData = { success: true, message: `Cita agendada para el ${fecha} a las ${hora}. Id: ${newAppt.id}` };
          } catch (err: any) {
            console.error(`[GeminiProvider] ❌ Error agendando cita:`, err);
            toolResponseData = { success: false, message: 'La hora seleccionada ya está ocupada o hubo un error en la base de datos. Pide al paciente que elija otra hora.' };
          }
        }
        
        // Responderle a Gemini el resultado de la función para que genere el texto final
        const toolResponseContent = {
          role: 'user',
          parts: [{
            functionResponse: {
              name: call.name,
              response: toolResponseData
            }
          }]
        };
        
        const finalContents = [...contents, response.candidates?.[0]?.content, toolResponseContent].filter(Boolean);
        
        const finalResponse = await this.generateContentWithRetry({
          model: 'gemini-3.5-flash',
          contents: finalContents,
          config: {
            systemInstruction: systemInstruction,
            temperature: 0.2,
            tools: [{ functionDeclarations }],
          }
        });
        
        return finalResponse.text || "Operación realizada, ¿en qué más te puedo ayudar?";
      }
      
      return response.text || "Lo siento, tuve un problema procesando tu mensaje.";
    } catch (error: any) {
      console.error('[GeminiProvider] Error procesando con IA:', error);
      return `Disculpa, mi cerebro virtual está en mantenimiento. Error interno: ${error.message || 'Desconocido'}`;
    }
  }
}

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
              nombre: {
                type: Type.STRING,
                description: 'El nombre del paciente',
              },
            },
            required: ['nombre'],
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

      // 3. Ejecutar Gemini
      const response = await this.ai.models.generateContent({
        model: 'gemini-3.6-flash',
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
        
        if (call.name === 'guardar_nombre_paciente') {
          const { PrismaClient } = require('@prisma/client');
          const prisma = new PrismaClient();
          const nombre = call.args.nombre;
          
          await prisma.contact.update({
            where: { phone },
            data: { aiName: nombre }
          });
          console.log(`[GeminiProvider] ✅ Nombre "${nombre}" guardado en la BD para ${phone}`);
          
          // Debemos decirle a la IA que ya lo hicimos para que pueda responder al usuario
          const toolResponseContent = {
            role: 'user',
            parts: [{
              functionResponse: {
                name: 'guardar_nombre_paciente',
                response: { success: true, message: `Nombre ${nombre} guardado exitosamente.` }
              }
            }]
          };
          
          const finalContents = [...contents, response.candidates?.[0]?.content, toolResponseContent].filter(Boolean);
          
          const finalResponse = await this.ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: finalContents,
            config: {
              systemInstruction: systemInstruction,
              temperature: 0.2,
              tools: [{ functionDeclarations }],
            }
          });
          
          return finalResponse.text || "¡Listo! Ya guardé tu nombre. ¿En qué más te puedo ayudar?";
        }
      }
      
      return response.text || "Lo siento, tuve un problema procesando tu mensaje.";
    } catch (error: any) {
      console.error('[GeminiProvider] Error procesando con IA:', error);
      return `Disculpa, mi cerebro virtual está en mantenimiento. Error interno: ${error.message || 'Desconocido'}`;
    }
  }
}

import { GoogleGenAI } from '@google/genai';
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
   * Genera una respuesta inteligente basada en el mensaje del usuario y las instrucciones de sistema
   */
  async generateResponse(userMessage: string, systemInstruction: string): Promise<string> {
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: userMessage,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.3 // Temperatura baja para que sea profesional y predecible en medicina
        }
      });
      
      return response.text || "Lo siento, tuve un problema procesando tu mensaje.";
    } catch (error: any) {
      console.error('[GeminiProvider] Error procesando con IA:', error);
      // Para saber exactamente por qué está fallando en vivo
      return `Disculpa, mi cerebro virtual está en mantenimiento. Error interno: ${error.message || 'Desconocido'}`;
    }
  }
}

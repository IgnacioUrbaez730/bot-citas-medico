import dotenv from 'dotenv';

dotenv.config();

export class WhatsAppProvider {
  private apiUrl = 'https://graph.facebook.com/v20.0';
  private token: string;
  private phoneId: string;

  constructor() {
    this.token = process.env.WHATSAPP_API_TOKEN || '';
    this.phoneId = process.env.WHATSAPP_PHONE_ID || '';

    if (!this.token || !this.phoneId) {
      console.warn('[WhatsAppProvider] Advertencia: WHATSAPP_API_TOKEN o WHATSAPP_PHONE_ID no están configurados en .env');
    }
  }

  /**
   * Envía un mensaje de texto simple a un número de WhatsApp
   * @param to Número de destino con código de país (ej. 584121234567)
   * @param text El texto del mensaje a enviar
   */
  async sendTextMessage(to: string, text: string): Promise<boolean> {
    const url = `${this.apiUrl}/${this.phoneId}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      to: to,
      type: 'text',
      text: {
        body: text
      }
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('[WhatsAppProvider] Error al enviar mensaje:', data);
        return false;
      }

      console.log(`[WhatsAppProvider] Mensaje enviado a ${to} exitosamente.`);
      return true;
    } catch (error) {
      console.error('[WhatsAppProvider] Excepción al enviar mensaje:', error);
      return false;
    }
  }
}

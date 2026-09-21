import { Request, Response } from 'express';
import { WhatsAppVerifySchema, WhatsAppPayloadSchema } from '../schemas/whatsapp.schema';
import { WhatsAppService } from '../services/whatsapp.service';

const whatsappService = new WhatsAppService();

export class WhatsAppController {
  verifyWebhook = (req: Request, res: Response) => {
    try {
      const query = WhatsAppVerifySchema.parse(req.query);
      const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'citas_token_secreto';

      if (query['hub.mode'] === 'subscribe' && query['hub.verify_token'] === verifyToken) {
        console.log('[Webhook] Verificado por Meta exitosamente.');
        res.status(200).send(query['hub.challenge']);
      } else {
        res.status(403).send('Forbidden');
      }
    } catch (error) {
      res.status(400).send('Bad Request');
    }
  };

  receiveMessage = async (req: Request, res: Response) => {
    res.status(200).send('EVENT_RECEIVED');

    console.log('[Webhook] Raw payload:', JSON.stringify(req.body, null, 2));

    try {
      const payload = WhatsAppPayloadSchema.parse(req.body);

      for (const entry of payload.entry) {
        for (const change of entry.changes) {
          const messages = change.value.messages;
          
          if (messages && messages.length > 0) {
            for (const message of messages) {
              await whatsappService.processMessage(message);
            }
          }
        }
      }
    } catch (error) {
      console.log('[Webhook] Ignorando evento o error de parseo:', error);
    }
  };
}

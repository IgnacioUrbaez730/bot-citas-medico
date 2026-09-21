import { z } from 'zod';

export const WhatsAppVerifySchema = z.object({
  'hub.mode': z.string(),
  'hub.verify_token': z.string(),
  'hub.challenge': z.string(),
});

const WhatsAppMessageSchema = z.object({
  from: z.string(),
  id: z.string(),
  timestamp: z.string(),
  type: z.enum(['text', 'audio', 'image', 'document', 'interactive', 'button']),
  text: z.object({
    body: z.string(),
  }).optional(),
  audio: z.object({
    id: z.string(),
    mime_type: z.string().optional(),
  }).optional(),
});

export const WhatsAppPayloadSchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(
    z.object({
      id: z.string(),
      changes: z.array(
        z.object({
          value: z.object({
            messaging_product: z.literal('whatsapp'),
            messages: z.array(WhatsAppMessageSchema).optional(),
          }),
          field: z.literal('messages'),
        })
      ),
    })
  ),
});

export type WhatsAppVerifyQuery = z.infer<typeof WhatsAppVerifySchema>;
export type WhatsAppPayload = z.infer<typeof WhatsAppPayloadSchema>;
export type WhatsAppMessage = z.infer<typeof WhatsAppMessageSchema>;

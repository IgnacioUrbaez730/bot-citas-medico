import { Router } from 'express';
import { WhatsAppController } from '../controllers/whatsapp.controller';

const router = Router();
const controller = new WhatsAppController();

router.get('/', controller.verifyWebhook);
router.post('/', controller.receiveMessage);

export default router;

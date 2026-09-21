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

app.get('/', (req, res) => {
  res.send('Servidor de Citas IA activo ??');
});

app.listen(PORT, () => {
  console.log('[Server] Corriendo en http://localhost:' + PORT);
});

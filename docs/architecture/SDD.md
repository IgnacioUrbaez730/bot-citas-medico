# SDD: Spec-Driven Development (Especificaciones Técnicas)
**Proyecto:** ControlCitas IA

## 1. Arquitectura de Base de Datos (Prisma/PostgreSQL)

Para mantener la separación de responsabilidades exigida en las Reglas del Proyecto, el esquema se divide en dos dominios estrictos:

### Dominio CRM (WhatsApp)
```prisma
model Contact {
  phone      String    @id // Llave primaria: Número de WhatsApp
  alias      String?   // Nombre editado manualmente por la doctora
  aiName     String?   // Nombre inferido automáticamente por Gemini
  createdAt  DateTime  @default(now())
  
  // Relaciones
  messages   Message[]
  patients   Patient[] // 1 Contacto puede representar a N Pacientes
}

model Message {
  id        String   @id @default(uuid())
  phone     String
  sender    String   // 'bot', 'patient', 'doctor'
  text      String
  createdAt DateTime @default(now())
  
  contact   Contact  @relation(fields: [phone], references: [phone])
}

model BotSession {
  phone        String   @id
  doctorId     String
  step         String   @default("WELCOME")
  temporalData Json?
  updatedAt    DateTime @updatedAt
}
```

### Dominio Clínico
```prisma
model Patient {
  id           String        @id @default(uuid())
  contactPhone String        // FK a Contact (El representante en WhatsApp)
  doctorId     String
  name         String        // Nombre real del paciente
  nationalId   String?       // Cédula/DNI (Opcional)
  birthDate    DateTime?
  createdAt    DateTime      @default(now())
  
  // Relaciones
  contact      Contact       @relation(fields: [contactPhone], references: [phone])
  doctor       Doctor        @relation(fields: [doctorId], references: [id])
  appointments Appointment[]
}
```

## 2. Flujo de Toma de Control (Manual Override)
1. **Frontend (Flutter):** El usuario envía un `POST` a `/api/doctor/send` en el backend.
2. **Backend (Node.js):** 
   - Busca el proceso global `global.messageBuffer[phone]` y detiene el temporizador (`clearTimeout`).
   - Usa `WhatsAppProvider.sendTextMessage` para enviar el payload a Meta Graph API.
3. **Database (Supabase):** El frontend o backend guardan el mensaje en la tabla `Message` para persistencia y lectura en tiempo real mediante WebSockets (Supabase Streams).

## 3. Flujo de Gestión Manual de Agenda
1. **Creación (Flutter -> Node):** La pantalla de `CalendarScreen` envía `POST` a `/api/doctor/book-manual`.
   - Node normaliza el teléfono.
   - Crea/busca el `Contact` y `Patient`.
   - Inserta la cita en `Appointment`.
   - Notifica por WhatsApp usando `WhatsAppProvider`.
2. **Edición/Cancelación:** Flutter envía `POST` a `/api/doctor/update-appointment`.
   - Actualiza el estado (`CANCELLED`) o fecha en `Appointment`.
   - Informa pasivamente a Flutter (que hace fetch nuevamente) y activamente al paciente vía WhatsApp.

## 4. Flujo de Function Calling (Próxima Implementación)
- Se habilitará la propiedad `tools` en el `GeminiProvider`.
- Si Gemini deduce la intención de agendar, retorna un llamado a función.
- El backend procesa el llamado, inserta en `Appointment` y le devuelve la confirmación a Gemini para que construya la respuesta humana final.

# SDD: Spec-Driven Development (Especificaciones Técnicas)
**Proyecto:** ControlCitas IA

## 1. Arquitectura de Base de Datos (Prisma/PostgreSQL)

Para mantener la separación de responsabilidades exigida en las Reglas del Proyecto, el esquema se divide en dos dominios estrictos:

### Dominio CRM (WhatsApp)
```prisma
model Contact {
  phone      String    @id // Llave primaria: Número de WhatsApp
  name       String?   // Nombre legal del titular (opcional/manual)
  nationalId String?   // Cédula/DNI del titular del WhatsApp
  alias      String?   // Nombre editado manualmente por la doctora
  aiName     String?   // Nombre inferido automáticamente por Gemini
  createdAt  DateTime  @default(now())
  
  // Relaciones
  messages   Message[]
  patients   Patient[] // 1 Contacto puede representar a N Pacientes
}
```

### Dominio Clínico
```prisma
model Patient {
  id               String        @id @default(uuid())
  doctorId         String
  contactPhone     String?       // FK Opcional a Contact (El representante en WhatsApp)
  name             String?       // Nombre real del paciente
  nationalId       String?       // Cédula del paciente (Calculada automáticamente para menores)
  birthDate        DateTime?
  gender           String?
  bloodType        String?
  email            String?
  occupation       String?
  address          String?
  emergencyContact String?
  createdAt        DateTime      @default(now())
  
  appointments     Appointment[]
  medicalBackground MedicalBackground?
}

model MedicalBackground {
  id              String   @id @default(uuid())
  patientId       String   @unique
  allergies       String?  @default("Ninguna conocida")
  personalHistory String?  
  familyHistory   String?  
  surgicalHistory String?  
  habits          String?  
  observations    String?  
}

model ClinicalNote {
  id              String      @id @default(uuid())
  appointmentId   String      @unique
  audioUrl        String?
  soapData        Json?       // Contiene motivo, evolucion, diagnostico, recipe, e indicaciones
  prescriptionUrl String?
  isSigned        Boolean     @default(false)
}
```

## 2. Flujo de Toma de Control (Manual Override)
1. **Frontend (Flutter):** El usuario envía un `POST` a `/api/doctor/send` en el backend.
2. **Backend (Node.js):** 
   - Busca el proceso global y detiene el temporizador.
   - Usa `WhatsAppProvider.sendTextMessage` para enviar el payload a Meta Graph API.
3. **Database:** Guarda el mensaje en `Message` para persistencia y lectura en tiempo real mediante WebSockets (Supabase Streams).

## 3. Flujo de Gestión de Pacientes y Agendas
1. **Creación de Paciente:** `POST /api/doctor/patients` (Soporta número de WhatsApp opcional y cálculo de Cédula Escolar para menores).
2. **Perfil Médico Permanente:** `GET /api/doctor/patients/:id` y `PUT /api/doctor/patients/:id` para gestionar demografía y `MedicalBackground`.
3. **Historia Médica Diaria:** `POST /api/doctor/medical-record` guarda la evolución de una cita particular en `ClinicalNote.soapData`.

## 4. Estructura SOAP para Historia Médica
- **Subjetivo / Objetivo:** Motivo, Enfermedad actual, Examen físico.
- **Diagnóstico:** Diagnóstico médico.
- **Plan:** Dividido en **recipe** (medicinas) e **indicaciones** (instrucciones para el paciente) para la futura impresión de PDFs separados.

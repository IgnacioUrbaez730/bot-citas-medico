# ScDD: Schema-Driven Development (Estructuras y Modelos)
**Proyecto:** ControlCitas IA

## 1. Visión del Sistema
El sistema es un puente automatizado entre un servicio de mensajería (WhatsApp) y un sistema de gestión clínica. Su propósito principal es liberar la carga administrativa del personal médico automatizando el triaje y el agendamiento mediante Inteligencia Artificial, manteniendo siempre la posibilidad de intervención humana.

## 2. Definición de Entidades Conceptuales

### 2.1 Módulo de Comunicación (El CRM)
Define cómo interactúa el sistema con el mundo exterior.
- **Contacto (Contact):** Es la persona física dueña del número de WhatsApp. Puede interactuar con la IA. La aplicación del médico le puede asignar un alias (ej. "Ignacio (Papá de Diego)") para reconocerlo en el futuro.
- **Sesión de Bot (BotSession):** El estado temporal de la conversación (ej. Triaje, Agendando, Silenciado).
- **Mensaje (Message):** Unidad básica de comunicación (Texto, Audio, etc).

### 2.2 Módulo Clínico (El Consultorio)
Define la lógica pura del negocio de la salud.
- **Paciente (Patient):** Es la persona que recibe el servicio médico. Un Paciente siempre está vinculado a un Contacto, ya que los niños o personas mayores pueden no tener teléfono propio y son representados por el Contacto.
- **Cita (Appointment):** El espacio de tiempo reservado para un Paciente con un Doctor.
- **Historia / Nota (ClinicalNote):** El registro médico generado después de la cita.

## 3. Reglas Estrictas de Migración y Operación
- **Dependencia de Contacto:** `Message`, `BotSession` y `Patient` tienen como llave foránea el teléfono (`phone`) hacia `Contact`. Por diseño estricto de base de datos relacional, **el Contacto debe existir antes de poder guardar un mensaje o iniciar una sesión**.
- **Upsert en Webhook:** Para cumplir la regla anterior sin que los mensajes se pierdan, el backend Node.js (`whatsapp.service.ts`) realiza obligatoriamente un `upsert` en la tabla `Contact` en el milisegundo exacto en que entra el payload de Meta, garantizando que el `Contact` siempre exista antes de que se propague a Flutter o a la IA.

## 4. Flujo Conceptual Principal
1. Un **Contacto** escribe al sistema.
2. La IA evalúa la conversación y determina si es una emergencia (se cancela el flujo) o una consulta.
3. La IA captura el nombre del **Paciente** y el motivo de consulta.
4. La IA (vía Function Calling) busca espacios disponibles y propone fechas.
5. Tras confirmar, se crea una **Cita** vinculada al **Paciente**, quien a su vez está vinculado al **Contacto**.

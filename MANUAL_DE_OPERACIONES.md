# 📘 Manual de Operaciones: Motor de WhatsApp con IA
**Autor:** Techscript
**Proyecto Original:** ControlCitas IA (SaaS Médico)
**Propósito:** Este documento sirve como guía para clonar, entender y replicar la arquitectura de un bot de WhatsApp profesional con IA para cualquier modelo de negocio (clínicas, restaurantes, inmobiliarias, etc.).

---

## 🛠️ Stack Tecnológico (La Arquitectura)
A diferencia de herramientas No-Code (como n8n o Zapier), este motor está construido 100% en código para garantizar propiedad intelectual, escalabilidad multi-cliente y capacidad de conectarse a aplicaciones móviles nativas (Flutter).

* **Backend:** Node.js con TypeScript (Rápido, tipado y estándar de la industria).
* **Framework Web:** Express.js (Para exponer los webhooks).
* **Base de Datos:** PostgreSQL alojado en Supabase (Permite migraciones fáciles y alta disponibilidad).
* **ORM:** Prisma (Para comunicarse con la base de datos de forma segura).
* **Validación:** Zod (Para asegurar que los datos que envía Meta sean correctos y evitar hackeos).
* **API de Mensajería:** WhatsApp Cloud API Oficial de Meta (Aprobado, sin riesgo de baneos).
* **Cerebro (IA):** Google Gemini SDK (Para procesamiento de lenguaje natural y triaje).

---

## 🚀 Flujo de Trabajo (Cómo funciona por dentro)

1. **Recepción (Inbound):** El paciente escribe a WhatsApp. Los servidores de Meta envían un `POST` a nuestro túnel público, que lo redirige a `http://localhost:3000/api/webhook/whatsapp`.
2. **Validación:** El controlador recibe el payload y Zod verifica que tenga la estructura oficial de Meta.
3. **Estado (Base de Datos):** Prisma consulta la tabla `BotSession` usando el número de teléfono para saber en qué parte de la conversación está el usuario (¿Es nuevo? ¿Está agendando? ¿Es una emergencia?).
4. **Cerebro IA:** El mensaje y el historial se envían al `GeminiProvider`. Gemini evalúa el "Prompt de Sistema" (Reglas del negocio) y genera una respuesta natural.
5. **Envío (Outbound):** El `WhatsAppProvider` toma la respuesta de Gemini y usa la API de Graph de Meta (`fetch` con Bearer Token) para disparar el mensaje de vuelta al celular del usuario.

---

## 📋 Guía de Replicación (Cómo crear un bot nuevo en 1 hora)

Para usar este mismo código para otro cliente de **Techscript** (ej: Una Pizzería), sigue estos pasos:

### 1. Preparar la Base de Datos
* En tu archivo `schema.prisma`, cambia las tablas relacionadas al negocio. 
* *Ejemplo Pizzería:* Eliminar `Doctor` y `Appointment`, crear tablas `Pizza`, `Order` y `Delivery`.
* Ejecuta `npx prisma db push` para actualizar Supabase.

### 2. Configurar la App en Meta for Developers
1. Crea una app de tipo "Negocios" en [developers.facebook.com](https://developers.facebook.com/).
2. Añade el producto **WhatsApp**.
3. En configuración de la API, copia el **Identificador del número de teléfono** y genera un **Token de acceso**.
4. Pega esos valores en tu archivo `.env` (`WHATSAPP_PHONE_ID` y `WHATSAPP_API_TOKEN`).

### 3. Levantar el Túnel y el Servidor
* Abre una terminal y corre: `npm run tunnel` (Usa el puerto 3000 y tiene antidesmayo).
* Abre otra terminal y corre: `npm run dev`.

### 4. Conectar el Webhook en Meta
1. Ve a Meta > WhatsApp > Configuración > Webhooks.
2. Dale a **Editar**. Pega la URL del túnel agregando `/api/webhook/whatsapp`.
3. Pega el Token de Verificación (ej: `citas_token_secreto`) que está en tu `.env`.
4. Dale a "Administrar campos del webhook" y suscríbete a `messages`.

### 5. Modificar el Cerebro (El Prompt de Gemini)
* Ve al servicio donde se llama a Gemini.
* Cambia la instrucción principal.
* *Ejemplo Pizzería:* "Eres el asistente virtual de la Pizzería Luigi. Eres amable, italiano y tu trabajo es tomar pedidos. El menú es..."

---

## 📱 Visión Multi-Tenant (Para construir un SaaS)
Si quieres vender esto como un servicio mensual, no necesitas crear un código para cada cliente. 
1. Crea una tabla `Company` o `Doctor` en Prisma.
2. Agrega allí campos como `whatsappToken`, `phoneId`, y `systemPrompt`.
3. Cuando llegue un mensaje, busca el ID de destino, carga el token y el prompt dinámicamente desde la base de datos, ¡y listo! Un solo servidor Node.js puede darle servicio a miles de negocios distintos simultáneamente.

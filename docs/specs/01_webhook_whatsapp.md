# Especificación: Webhook de WhatsApp

## 1. Descripción General
Este módulo es el punto de entrada seguro de nuestra aplicación. Se encarga de recibir, validar y enrutar los mensajes entrantes desde la API de Meta Cloud (WhatsApp).

## 2. Endpoints Requeridos
- **GET /api/webhook/whatsapp (Verificación):** 
  - Propósito: Meta lo llama una sola vez cuando configuramos el sistema en su panel.
  - Validación: Compara el hub.verify_token enviado por Meta contra nuestra variable de entorno .env.
- **POST /api/webhook/whatsapp (Recepción):** 
  - Propósito: Recibe los mensajes reales (texto o audios) de los pacientes.

## 3. Flujo Principal (POST)
Dado que Meta exige una respuesta rápida (menos de 3 segundos), usaremos un modelo **Orientado a Eventos** para la recepción:
1. Meta envía el JSON con el mensaje del paciente.
2. Nuestro controlador responde inmediatamente con 200 OK para evitar que Meta nos penalice o reintente el envío duplicando el mensaje.
3. Se extrae el número de teléfono (paciente) y el contenido (texto o ID del audio).
4. El repositorio consulta la tabla BotSession.
   - **Si no hay sesión:** Crea una nueva con el paso WELCOME.
   - **Si ya hay sesión:** Recupera en qué parte de la conversación está el usuario.
5. Se emite un evento interno de Node.js (ej. chat.incoming) que será escuchado por nuestro futuro módulo de IA.

## 4. Manejo de Errores
- **Token Inválido (GET):** Retornar 403 Forbidden. Protege contra intrusos escaneando nuestra API.
- **Estructura Incompleta (POST):** WhatsApp envía otros eventos como "Mensaje Leído" o "Entregado". Nuestro sistema debe filtrarlos, ignorarlos silenciosamente y retornar 200 OK.
- **Fallo de BD:** Si la base de datos no responde, registrar el error en consola pero mantener el 200 OK a Meta.

## 5. Reglas de Negocio Estrictas
- **Privacidad:** No se guardará ninguna información en la tabla permanente Patient durante este webhook. Todo el estado temporal se guarda en BotSession hasta que el paciente confirme sus datos, cumpliendo la regla de MVP y limpieza de datos.

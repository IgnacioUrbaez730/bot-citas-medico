# Especificación: Panel Médico en Flutter (App Multiplataforma)

## 1. Descripción General
Esta aplicación es la interfaz visual para los médicos y administradores de la clínica. Permite supervisar en tiempo real las conversaciones que la IA está teniendo con los pacientes y, de ser necesario, "tomar el control" manual del chat (Manual Override), apagando la IA temporalmente para ese paciente.

## 2. Stack Tecnológico
- **Framework:** Flutter (Soporta Web, Android APK, iOS).
- **Base de Datos en Tiempo Real:** Supabase Flutter SDK.
- **Peticiones HTTP:** Paquete `http` para comunicarse con el servidor Node.js.
- **Arquitectura de Interfaz:** `flutter_chat_ui` para renderizar las burbujas de mensaje estilo WhatsApp.

## 3. Flujo de Trabajo (Tiempo Real)
1. **Escucha (Streams):** La aplicación se conecta directamente a la tabla `BotSession` y `Message` de Supabase usando WebSockets (Streams). 
2. **Actualización UI:** Cuando la IA o el paciente insertan un nuevo mensaje en la base de datos, la interfaz de Flutter se actualiza instantáneamente sin necesidad de recargar la página.
3. **Roles en el Chat:**
   - Mensajes del lado Izquierdo: Paciente (`sender: 'patient'`).
   - Mensajes del lado Derecho: IA o Doctor (`sender: 'bot'` o `'doctor'`).

## 4. Manual Override (Toma de Control)
Si el médico decide responder manualmente desde la aplicación:
1. El médico escribe el mensaje en la interfaz y presiona Enviar.
2. Flutter inserta el mensaje en la tabla `Message` de Supabase (con un ID generado por fecha) bajo el rol `sender: 'doctor'`.
3. Inmediatamente, Flutter hace una petición `POST` al endpoint `/api/doctor/send` de nuestro backend en Node.js (Render).
4. El backend de Node.js recibe la petición, cancela cualquier temporizador (`setTimeout`) que la IA tuviera pendiente para ese número, y usa la API de Meta para enviar el mensaje real al WhatsApp del paciente.
5. El bot queda silenciado para ese paciente hasta que se reinicie la sesión.

## 5. Próximos Desarrollos (Pendientes)
- **Vista de Calendario:** Leer la tabla `Appointment` de Supabase y mostrar las citas confirmadas por la IA en una cuadrícula semanal/mensual.
- **Compilación de APK:** Empaquetar la aplicación en formato Android instalable (`flutter build apk`).

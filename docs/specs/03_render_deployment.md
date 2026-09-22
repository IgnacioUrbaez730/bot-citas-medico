# Especificación: Despliegue en Producción (Cloud)

## 1. Descripción General
Para garantizar que el bot de WhatsApp funcione 24/7 sin depender de una computadora local y sin sufrir los bloqueos de los túneles temporales (como localhost.run), la aplicación backend se despliega en un entorno Cloud.

## 2. Proveedor Elegido: Render.com
Se seleccionó **Render.com** (Web Service) por las siguientes razones:
- Despliegue gratuito y directo desde repositorios de GitHub.
- Soporte nativo para entornos Node.js.
- Persistencia de estado en memoria (crucial para mantener los `setTimeout` de 30 segundos del búfer de mensajes de la IA, lo cual descarta opciones "Serverless" puras como Vercel).

## 3. Guía de Replicación para Nuevos Bots
Para montar un bot nuevo en la nube, se deben seguir estos pasos:

### A. Preparación del Repositorio (Git)
1. Asegurarse de que el archivo `.gitignore` incluya `node_modules/` y `.env`. (NUNCA subir claves secretas al repositorio público/privado).
2. Hacer push del código fuente a una rama principal (`main`) en GitHub.

### B. Configuración en Render
1. Crear un nuevo **Web Service**.
2. Conectar el repositorio de GitHub correspondiente.
3. **Language:** Node (Importante: NO seleccionar Docker a menos que exista un Dockerfile).
4. **Build Command:** `npm install && npx prisma generate` (Es obligatorio compilar el cliente de Prisma para que el servidor entienda la base de datos de Supabase).
5. **Start Command:** `npm run dev` (O `npm start` si está transpilado a JS).

### C. Inyección de Variables de Entorno (Environment Variables)
En la sección "Environment" de Render, replicar todas las variables del `.env` local:
- `DATABASE_URL` y `DIRECT_URL` (Supabase).
- `WHATSAPP_API_TOKEN` (Token de Meta).
- `WHATSAPP_PHONE_ID` (ID del Teléfono).
- `WHATSAPP_VERIFY_TOKEN` (Token del Webhook).
- `GEMINI_API_KEY` (Token de Google).

## 4. Renovación de Tokens de Meta
**Importante:** Durante la fase de desarrollo, Meta provee un Token Temporal de 24 horas. Si el bot deja de enviar mensajes misteriosamente pero los recibe sin error, es probable que el token haya expirado (Código de error de Meta: `190 OAuthException`). 
- **Solución:** Generar un nuevo token en Meta for Developers y actualizar la variable `WHATSAPP_API_TOKEN` en la pestaña Environment de Render. Guardar reiniciará el servidor automáticamente.
- **En Producción:** Se debe generar un Token Permanente vinculando una cuenta comercial real.

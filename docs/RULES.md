# Reglas de Oro del Proyecto (Golden Rules)

## 1. SDD (Spec-Driven Development)
Todo nuevo módulo, flujo o cambio estructural DEBE ser documentado previamente en una especificación formal (`docs/specs/`) antes de escribir la primera línea de código de lógica. La especificación manda sobre el código. El código es solo la implementación de la especificación.

## 2. ScDD (Schema-Driven Development)
Prohibido empezar a programar lógica sin antes definir las estructuras de datos. Toda nueva entidad debe nacer primero en el **Schema de Prisma** y en sus respectivos flujos de datos. El esquema de la base de datos es el corazón del proyecto y los controladores/servicios deben adaptarse a él.

## 3. Independencia de Módulos (Separation of Concerns)
Prohibido el "código espagueti". Los sistemas deben mantenerse modulares e independientes:
- **Capa CRM (Contactos):** Tablas como `Contact`, `Message`, `BotSession`. Manejan la interfaz con Meta/WhatsApp.
- **Capa Clínica (Pacientes):** Tablas como `Patient`, `Appointment`, `ClinicalNote`. Manejan la lógica de salud.
- **Regla de Entidades:** El dueño del teléfono (Contacto) NO es necesariamente el paciente. Un contacto puede tener múltiples pacientes a su cargo (ej. un representante legal o padre).

## 3. Actualización de Tareas (`task.md` y `specs`)
Cada vez que se altere el alcance del proyecto, se deben actualizar inmediatamente las listas de tareas y los archivos de especificación en la carpeta `docs/specs`.

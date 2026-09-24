# ScDD: Screen-Driven Development (Navegación e Interfaces)
**Proyecto:** ControlCitas IA

## 1. Topología de Pantallas (Flutter Web)

### 1.1 AuthScreen
- **Ruta:** `/`
- **Componentes:** Card central con Login (Email/Password).
- **Acción:** Llama a Supabase Auth. Si es exitoso, redirige a `/main`.

### 1.2 MainLayout (Scaffold base)
- **Ruta:** `/main`
- **Componentes:** Drawer a la izquierda (o BottomNavBar en móviles).
- **Sub-pantallas (Páginas hijas):**
  - `DashboardScreen` (Métricas)
  - `ChatScreen` (Mensajería)
  - `CalendarScreen` (Agenda manual e IA)
  - `PatientsScreen` (Directorio)
  - `SettingsScreen` (Prompt e instrucciones del Bot)

---

## 2. Flujo Clínico (Directorio y Consultas)

### 2.1 PatientsScreen (Directorio)
- **UI:** Grid/Lista de pacientes registrados.
- **Acciones:**
  - **Botón (+):** Abre `AddPatientScreen` para registro manual de walk-ins.
  - **Tap en Tarjeta:** Abre `PatientProfileScreen` del paciente seleccionado.

### 2.2 AddPatientScreen (Registro de Walk-in)
- **UI:** Formulario de registro inicial.
- **Lógica Especial:**
  - El teléfono de WhatsApp es opcional.
  - Contiene switch "¿Es menor de edad sin cédula?" para generar Cédula Escolar (1 + Año + CI Representante).

### 2.3 PatientProfileScreen (Perfil y Antecedentes)
- **UI:** TabBar con dos pestañas.
  - **Datos Demográficos:** Nombre, Fecha de nacimiento, Contacto.
  - **Antecedentes:** Alergias, Patológicos, Quirúrgicos, Hábito.
- **Acción:** Botón flotante para iniciar nueva consulta (`MedicalRecordScreen`).

### 2.4 MedicalRecordScreen (Historia Médica Diaria)
- **UI:** 
  - **Cabecera:** Muestra únicamente el Nombre del Paciente y la Fecha de la consulta.
  - **Cuerpo:** Formulario tipo SOAP (Motivo, Evolución, Examen Físico, Diagnóstico, Plan).
  - **Plan Separado:** Dos campos de texto separados para **Récipe** (Medicinas) e **Indicaciones**.
- **Acción:** Guarda en la base de datos (ClinicalNote) y cambia el estado de la cita a COMPLETED.

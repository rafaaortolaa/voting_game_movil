# 👑 ¿Quién es más probable?

Un juego de fiesta multijugador web en tiempo real para móviles y ordenadores, diseñado para destapar verdades y reírse entre amigos.

Cada jugador se conecta desde su propio móvil mediante un código de sala o escaneando un código QR, y vota en secreto en cada ronda sin necesidad de instalar ninguna aplicación ni registrarse.

---

## ✨ Características Principales

- **🌐 Multijugador Universal en Tiempo Real**: Conexión instantánea a través de **WebSockets seguros (WSS con TLS)** sobre el puerto 443 estándar, 100% compatible con cualquier teléfono móvil (iPhone, Android, Xiaomi, etc.) y cualquier tipo de red (WiFi, Datos móviles 4G/5G, CGNAT o modo incógnito).
- **📱 Entrada rápida por QR o Código**: Entra en 2 segundos escaneando el código QR generado en la pantalla del anfitrión o escribiendo el código de 4 letras.
- **🎭 Cuatro Modos de Juego**:
  - 😄 **Colegueo**: Preguntas desenfadadas, anécdotas y humor entre amigos (con votaciones).
  - 🌶️ **Fuerte**: Preguntas comprometidas, salseo, infidelidades y verdades sin filtro (con votaciones).
  - 🎉 **Retos Colegas**: Retos divertidos, pruebas de fiesta y risas pensadas para hacer entre colegas chicos y chicas (sin ser tan fuertes ni sexuales). El sistema elige a alguien al azar en cada ronda para cumplirlo.
  - 🔥 **Retos Fuertes**: Retos atrevidos, descarados, besos, prendas y alto voltaje (+18). Al que le toca al azar le toca cumplirlo ante el grupo.
- **🎲 Mecánica de Retos sin Votación y sin Puntuación**: En los modos de Retos no hay votos ni tablas de puntuación: es un modo libre y continuo pensado para disfrutar y reírse en grupo. El sistema selecciona a una persona al azar en cada tarjeta. Si el reto es interpersonal (de hacer algo a otra persona, pareja o interacción entre chicos y chicas), el juego elige automáticamente también con qué persona debe hacerlo y adapta el texto con su nombre. El anfitrión puede pasar al siguiente reto con un solo toque, cambiar de persona elegida o de acompañante.
- **✍️ Preguntas Personalizadas**: El anfitrión puede escribir preguntas propias en cualquier momento de la partida.
- **⚔️ Sistema de Desempate Automático**: Si dos o más jugadores empatan en votos, se activa una ronda relámpago exclusiva para desempatar entre los afectados.
- **⏱️ Temporizador y Reglas Configurables**:
  - Tiempo por pregunta ajustable (sin límite, 10 s, 15 s, 20 s, 30 s, 45 s, 60 s o 90 s).
  - Número de rondas objetivo para proclamar al ganador.
- **⏳ Sala de Espera en Vivo**: Si alguien nuevo entra con la partida ya empezada, no interrumpe la ronda: ve en tiempo real la pregunta y el temporizador en espera, y se incorpora automáticamente como jugador en la siguiente ronda.
- **🛡️ Reconexión Automática & Tolerancia a Fallos**:
  - Si un jugador recarga la página por error o cambia de pestaña, recupera automáticamente su número, puntos y votos emitidos.
  - Alerta de seguridad (`beforeunload`) para prevenir cierres o refrescos accidentales.
- **🚫 Nombres Únicos**: Validación para impedir apodos duplicados en la misma sala.
- **🤖 Bots de Prueba**: Rellena la sala con hasta 15 jugadores automáticos con un solo clic para probar la partida o jugar en grupos reducidos.
- **🎨 Diseño Moderno y Responsive**: Interfaz oscura con estética neón/glassmorphism, animaciones fluidas, confeti de celebración y optimización total para pantallas táctiles.

---

## 🎮 Cómo Jugar

### 1. El Anfitrión (Host)
1. Abre la web y escribe tu nombre.
2. Pulsa en **"Crear partida"**.
3. Comparte el código de 4 letras o muestra el **código QR** en pantalla para que tus amigos lo escaneen desde sus móviles.
4. Ajusta el modo de juego, el tiempo por ronda y las rondas para ganar.
5. Cuando todos estén listos, pulsa **"Empezar"**.

### 2. Los Jugadores
1. Escanea el QR del anfitrión o entra en la web y escribe el código de la sala.
2. Escribe tu nombre o apodo y pulsa **"Unirme"**.
3. Se te asignará un número identificativo.
4. En cada ronda, lee la pregunta y pulsa sobre el número/nombre de la persona a la que votas (no puedes votarte a ti mismo).
5. ¡Descubre quién ha recibido más votos y quién ha votado a quién!

---

## 📂 Estructura de Archivos

```
├── index.html        # Estructura principal y carga de librerías (WSS, QR)
├── style.css         # Diseño visual, sistema de colores, animaciones y responsive
├── app.js            # Lógica completa del juego, gestión de salas, estados y votaciones
├── preguntas.js      # Banco de preguntas clasificadas por modo (Colegueo y Fuerte)
└── README.md         # Documentación del proyecto
```

---

## 🛠️ Personalización de Preguntas

Puedes añadir tus propias preguntas fácilmente editando el archivo [`preguntas.js`](preguntas.js):

```javascript
const Q = {
  colegueo: [
    "¿Quién tiene más papeletas para...",
    "¿Quién sería capaz de..."
  ],
  fuerte: [
    "¿Quién es más probable que...",
    "¿Quién volvería con su peor ex..."
  ],
  retos_colegas: [
    "Haz un duelo de miradas fijas con quien tengas enfrente...",
    "Deja que una persona del sexo opuesto te cambie el peinado..."
  ],
  retos_fuertes: [
    "Besa en el cuello a la persona a tu derecha...",
    "Quítate dos prendas de ropa o..."
  ]
};
```

> **Consejo**: Separa cada frase entre comillas dobles y comas. Si necesitas comillas dentro de una pregunta, utiliza comillas simples (ejemplo: `'hola'`).

---

## 🚀 Despliegue en la Web

Al ser un proyecto **100% estático** (solo HTML, CSS y JavaScript cliente), puedes alojarlo gratis en cualquier plataforma en menos de 1 minuto:

### Opción A: GitHub Pages
1. Sube estos archivos a un repositorio de GitHub.
2. Ve a **Settings** > **Pages**.
3. En **Branch**, selecciona `main` (o `master`) y carpeta `/ (root)`.
4. Pulsa **Save** y tu enlace estará listo.

### Opción B: Vercel / Netlify
1. Arrastra la carpeta del proyecto a la web de [Netlify Drop](https://app.netlify.com/drop) o impórtala desde GitHub en [Vercel](https://vercel.com).
2. Se desplegará instantáneamente sin necesidad de comandos de compilación.

### Opción C: En Local
Puedes abrir `index.html` directamente en tu navegador, o levantarlo con un servidor local básico:
```bash
# Con Python
python -m http.server 8000

# Con Node.js (npx)
npx serve .
```

---

## 🔒 Arquitectura y Privacidad

- **Sin Base de Datos**: No se almacena ninguna información personal, nombres ni resultados en servidores externos.
- **Conexión Cifrada (WSS TLS)**: La comunicación en tiempo real viaja cifrada de extremo a extremo a través del puerto seguro 443 (WebSockets seguros), compatible con cualquier navegador y red móvil.
- **Identificador de Sesión**: Cada navegador genera un identificador local aleatorio (`pid`) en `localStorage` únicamente para permitir la reconexión si se pierde la conexión de red temporalmente.

---

## 📄 Licencia

Este proyecto está disponible para uso personal y para fiestas entre amigos. ¡Siéntete libre de clonarlo, modificarlo y añadir tus propias preguntas!

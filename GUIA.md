# Guía: instalar Mis Finanzas en el iPhone y conectarla a Google Drive

Son tres partes. La primera basta para tener la app en el teléfono; la segunda y la tercera
activan la sincronización con Google Drive.

Los nombres de botones y menús de GitHub y Google cambian de vez en cuando; si alguno no
coincide exactamente, busca el más parecido.

---

## Parte 1 — Publicar la app (unos 5 minutos)

La app debe vivir en una dirección web para poder instalarse en el iPhone. Solo se publica
el programa; **tus datos no se suben ahí**.

Se usa GitHub Pages, que es gratis. El repositorio debe ser **público**: cualquiera con la
dirección podría ver el código del programa, pero no tus movimientos, que viven en tu
dispositivo y en tu Drive.

### 1.1 Crear el repositorio
1. Entra a <https://github.com> con tu cuenta.
2. Arriba a la derecha, botón **+** → **New repository**.
3. Repository name: `finanzas-app`. Visibilidad: **Public**. No marques ninguna otra casilla.
4. **Create repository**.

### 1.2 Subir los archivos
1. En la página del repositorio recién creado, toca el enlace **uploading an existing file**.
2. Abre la carpeta `finanzas-app` en Finder, selecciona **todos los archivos de adentro**
   (Cmd + A) y arrástralos a la página. Arrastra los archivos, no la carpeta: `index.html`
   debe quedar en la raíz del repositorio.
3. Abajo, **Commit changes**.

### 1.3 Activar GitHub Pages
1. En el repositorio: **Settings** → en el menú lateral, **Pages**.
2. En **Source** elige **Deploy from a branch**.
3. En **Branch** elige **main** y la carpeta **/ (root)** → **Save**.
4. Espera uno o dos minutos y recarga esa página: arriba aparecerá tu dirección, con esta forma:
   `https://TU-USUARIO.github.io/finanzas-app/`
   **Anótala** y ábrela para comprobar que la app carga.

### Cómo actualizar la app más adelante
Cada vez que un archivo cambie (por ejemplo, `config.js` en la Parte 3): en el repositorio →
**Add file** → **Upload files** → arrastra los archivos cambiados → **Commit changes**.
Los archivos con el mismo nombre se reemplazan. El cambio tarda uno o dos minutos en verse.

## Parte 2 — Instalarla en el iPhone (1 minuto)

1. En el iPhone abre **Safari** (tiene que ser Safari) y entra a tu dirección de GitHub Pages.
2. Toca el botón **Compartir** → **Agregar a pantalla de inicio** → **Agregar**.
3. Abre la app desde el ícono nuevo. Hazlo siempre desde ahí, no desde Safari, porque
   el ícono y Safari guardan sus datos por separado.

En la computadora, usa la misma dirección de GitHub Pages en tu navegador (ya no el archivo
`index.html` con doble clic, que guarda sus datos aparte).

> **Tus datos actuales:** lo que ya registraste abriendo `index.html` con doble clic está en
> ese navegador. Para llevarlo a la versión publicada: en la versión vieja ve a
> *Reportes y ajustes → Descargar respaldo*, y en la versión publicada usa
> *Restaurar respaldo*.

## Parte 3 — Conectar Google Drive (unos 10 minutos, una sola vez)

Google exige que cada app tenga una "credencial" propia. Es gratis.

### 3.1 Crear el proyecto
1. Entra a <https://console.cloud.google.com> con tu cuenta de Google.
2. Arriba, abre el selector de proyectos → **Proyecto nuevo** → nombre: `Mis Finanzas` → **Crear**.
   Asegúrate de que quede seleccionado.

### 3.2 Activar Google Drive
1. Menú → **APIs y servicios** → **Biblioteca**.
2. Busca **Google Drive API** → **Habilitar**.

### 3.3 Pantalla de consentimiento
1. Menú → **APIs y servicios** → **Pantalla de consentimiento de OAuth**
   (puede aparecer como **Google Auth Platform**).
2. Tipo de usuario / público: **Externo**.
3. Nombre de la app: `Mis Finanzas`. Correo de asistencia y de contacto: el tuyo.
4. En **Usuarios de prueba** (o **Público**), agrega tu propio correo de Google.

### 3.4 Crear la credencial
1. **Credenciales** (o **Clientes**) → **Crear credenciales** → **ID de cliente de OAuth**.
2. Tipo de aplicación: **Aplicación web**.
3. En **Orígenes autorizados de JavaScript** agrega solo el dominio, sin `/finanzas-app`
   y sin barra final:
   `https://TU-USUARIO.github.io`
4. En **URI de redireccionamiento autorizados** agrega la dirección completa de la app,
   **con** barra final:
   `https://TU-USUARIO.github.io/finanzas-app/`
   (La app te muestra la dirección exacta en *Reportes y ajustes → Google Drive*.)
5. **Crear**. Copia el **ID de cliente** (termina en `.apps.googleusercontent.com`).
   No necesitas el "secreto de cliente".

### 3.5 Pegar el ID en la app
1. Abre el archivo `config.js` de la carpeta `finanzas-app` con TextEdit.
2. Pega el ID entre las comillas:
   `window.GOOGLE_CLIENT_ID = '1234-abcd.apps.googleusercontent.com';`
3. Guarda y sube `config.js` a GitHub (Parte 1, "Cómo actualizar la app").

### 3.6 Conectar
1. Abre la app → **Reportes y ajustes** → **Conectar con Google Drive**.
2. Elige tu cuenta. Google mostrará un aviso de que la app no está verificada (es normal,
   porque es tuya): **Configuración avanzada** → **Ir a Mis Finanzas** → **Permitir**.
3. Haz lo mismo en el otro dispositivo. Conecta primero el que ya tiene tus datos.

---

## Cómo funciona después

- En tu Drive aparecerá el archivo **`mis-finanzas-datos.json`**. No lo edites ni lo borres.
- Cada cambio se sube solo a los pocos segundos; junto al título verás *Guardado en Drive*.
- Lo registrado en el teléfono aparece en la computadora al abrir la app, y viceversa.
- La sesión con Google dura cerca de una hora. Cuando venza verás **Reconectar Drive** junto
  al título: tócalo y listo. Mientras tanto, lo que registres se guarda en el dispositivo y
  se sube al reconectar.
- Mientras el proyecto de Google esté en modo "prueba", Google puede pedirte autorizar de
  nuevo cada 7 días. Para evitarlo, en la pantalla de consentimiento usa **Publicar app**.
- El botón de **respaldo manual** sigue disponible como copia adicional.

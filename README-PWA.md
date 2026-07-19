# PUÑO CALLEJERO 3D — Progressive Web App

## ¿Qué es esta PWA?

Una aplicación web que funciona como juego nativo en tu teléfono Android sin necesidad de instalar desde Google Play. Se descarga una sola vez y luego funciona **completamente offline** después de la primera apertura.

## Archivos incluidos

- **index.html** — El juego completo (incluye toda la lógica 3D)
- **manifest.json** — Metadatos de la app (nombre, icono, shortcuts)
- **sw.js** — Service Worker (gestiona caché offline)
- **icon.svg** — Icono en vector (se convierte a PNG en el navegador)

## Instalación en Android

### Opción 1: Servidor local (recomendado para probar)

```bash
# En la carpeta con los archivos:
python3 -m http.server 8000
# Luego abre http://localhost:8000 en Chrome de tu PC
```

### Opción 2: En tu teléfono (más realista)

1. **Coloca los archivos en un servidor web** (Netlify, Vercel, GitHub Pages, o tu propio servidor)
   - Sube `index.html`, `manifest.json`, `sw.js` e `icon.svg`
   - Asegúrate de que todos los archivos están en el mismo directorio raíz

2. **Abre el sitio en Chrome (Android)**
   - Ve a la URL de tu servidor
   - Espera unos segundos hasta que se cargue completamente
   - Verás un icono de **"Instalar"** (⬇️ o "Añadir a pantalla de inicio") en la barra superior

3. **Pulsa "Instalar"** (o "Agregar a pantalla de inicio" en iOS)
   - La app se descarga completamente en tu dispositivo
   - Aparecerá un icono en la pantalla de inicio

4. **Abre la app desde el icono**
   - Funciona en modo pantalla completa como un juego nativo
   - La primera vez necesita conexión; luego es completamente offline

## Características PWA

✅ **Funciona offline** — Se cachea completamente en la primera carga  
✅ **Instancia única** — No ocupa espacio como una app nativa (es la web)  
✅ **Acceso desde pantalla de inicio** — Icono en el launcher  
✅ **Pantalla completa** — Sin barra de navegación  
✅ **Atajos** — Toca prolongado en el icono: opciones "Torneo" y "Rey de Mesa"  
✅ **Notificaciones (opcional)** — Push notifications si quieres añadirlas

## Servidores gratuitos recomendados

### GitHub Pages (lo más fácil)

1. Crea un repo en GitHub: `puño-callejero`
2. Sube los archivos a la rama `main` o `gh-pages`
3. Activa GitHub Pages en Configuración → Pages
4. Tu PWA está en: `https://tuusuario.github.io/puño-callejero/`

### Netlify (alternativa)

1. Arrastra la carpeta de archivos a **drop.netlify.com**
2. Instant deploy, dominio automático
3. URL lista en 30 segundos

### Vercel

1. `vercel deploy` (si tienes vercel CLI)
2. Tu PWA en producción con CDN global

## Troubleshooting

**"No me aparece el botón de instalar"**
- Espera a que cargue por completo
- Recarga la página (puede tardar hasta 10s)
- Asegúrate de que `sw.js` se descarga sin errores (abre DevTools)

**"Aparece offline después de instalar"**
- Es normal: el SW cachea y la app es independiente de la web
- Toca el icono y lanza el juego desde ahí

**"Juego lento en línea"**
- Entra una vez, espera al caching, luego funcionará perfecto offline
- La primera carga puede tardar según tu conexión (los 30MB de THREE.js son grandes)

**"Borrar caché"**
- Abre DevTools (F12) → Storage → Clear all data
- O desinstala y reinstala la app

## Controles (igual que la versión web)

**PC/Teclado:**
- **W/S** — Arriba/Abajo (menús)
- **A/D** — Izquierda/Derecha (personajes, combate)
- **P** — Confirmar / Puño / Siguiente
- **K** — Patada
- **E** — Especial
- **S** — Súper

**Móvil/Touch:**
- **Toca arriba** — Salta / Especial
- **Toca abajo** — Agacha / Defensa
- **Arrastra izquierda** — Camina izquierda
- **Arrastra derecha** — Camina derecha
- **Doble toque** — Dash
- **Toca izquierda del centro** — Puño
- **Toca derecha del centro** — Patada

## Desarrollo/Actualizar

Si quieres cambiar algo del juego:

1. Edita `index.html` (el código del juego está dentro)
2. Vuelve a subir a tu servidor
3. Los usuarios verán la actualización en 24-48h (caché de SW)
4. Para forzar actualización inmediata, cambia el `CACHE_NAME` en `sw.js` (ej: `'puño-v2'`)

## Licencia

Código original: Libre para uso personal y estudio.  
Si lo compartes, menciona la autoría.

---

¡A jugar! 🥊

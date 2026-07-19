# Publicar tu PWA en GitHub Pages (5 minutos)

## 1. Crea una cuenta en GitHub (si no tienes)
https://github.com/signup

## 2. Crea un repositorio nuevo
- Nombre: `puño-callejero` (o lo que prefieras)
- **Haz público** (Public)
- NO inicialices con README
- Click **Create repository**

## 3. Sube los archivos

### Opción A: Desde GitHub Web (más fácil)

1. En tu repo nuevo, click en **Add file** → **Upload files**
2. Arrastra estos archivos:
   - `index.html`
   - `manifest.json`
   - `sw.js`
   - `icon.svg`
3. Click **Commit changes**

### Opción B: Desde terminal (si tienes git)

```bash
cd carpeta-con-los-archivos

git init
git add .
git commit -m "Initial PWA commit"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/puño-callejero.git
git push -u origin main
```

## 4. Activa GitHub Pages

1. En tu repo, ve a **Settings** (engranaje arriba a la derecha)
2. En el panel izquierdo, click en **Pages**
3. En "Build and deployment":
   - Source: **Deploy from a branch**
   - Branch: **main** (o la rama que usaste)
   - Folder: **/(root)**
4. Click **Save**

GitHub procesará en ~1 minuto.

## 5. Tu PWA está lista

Tu URL es:
```
https://TU_USUARIO.github.io/puño-callejero/
```

Ej: `https://juan.github.io/puño-callejero/`

## 6. Compartir el link

Envía ese URL a tus amigos. Cuando lo abran en Chrome (Android):
- Aparecerá el botón "Instalar"
- Se descarga como app
- Funciona completamente offline

---

## ¿Cambios después?

1. Edita `index.html` directamente en GitHub (click en el archivo → pencil ✏️)
2. O sube archivos nuevos desde **Add file**
3. GitHub actualiza automáticamente en ~1-2 minutos
4. Los usuarios verán la actualización (pueden necesitar refrescar o borrar caché)

---

## Alternativa: Netlify (aún más fácil)

1. Ve a https://drop.netlify.com
2. Arrastra tu carpeta de archivos
3. **Listo** — Tu URL está lista en 30 segundos
4. Puedes compartir el enlace

Con Netlify NO necesitas tener cuenta; es deploy instantáneo.

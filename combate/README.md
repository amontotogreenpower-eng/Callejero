# COMBATE MOCAP

Juego de lucha 3D para navegador con **dos luchadores construidos sobre el
esqueleto estándar de Mixamo** (`mixamorig:Hips`, `mixamorig:LeftArm`, …) y
**control por captura de movimiento con MediaPipe Pose**: te pones delante de
la webcam y tus puñetazos, patadas, guardia, agachadas y saltos se convierten
en golpes dentro del juego.

También se juega entero con teclado o con controles táctiles, sin cámara.

```
combate/
├── index.html          página, importmap y menú
├── styles.css
├── src/
│   ├── rig.js          esqueleto Mixamo + muñeco + carga de GLB
│   ├── clips.js        poses y clips de animación
│   ├── animator.js     reproductor con fundido cruzado
│   ├── moves.js        frame data de los golpes
│   ├── fighter.js      física, máquina de estados y cajas de golpeo
│   ├── combat.js       detección de impactos
│   ├── ai.js           oponente de la máquina
│   ├── mocap.js        MediaPipe Pose Landmarker
│   ├── retarget.js     landmarks → rotaciones de hueso
│   ├── gestures.js     pose → órdenes de combate
│   ├── input.js        teclado y botones táctiles
│   ├── stage.js        escenario, luces, cámara y chispas
│   ├── hud.js          barras de vida, rondas, panel de captura
│   ├── audio.js        efectos de sonido sintetizados
│   └── main.js         bucle de juego y rondas
└── tests/              pruebas que corren sin navegador
```

## Cómo jugarlo

Hace falta servirlo por HTTP (los módulos ES y la cámara no funcionan
abriendo el fichero directamente):

```bash
cd combate
python3 -m http.server 8080
# abre http://localhost:8080
```

La cámara solo la permite el navegador en `localhost` o bajo HTTPS. Si lo
subes a GitHub Pages, Netlify o similar, ya va con HTTPS y funciona.

Las librerías (three.js y MediaPipe) se cargan desde CDN, así que la primera
carga necesita conexión.

## Controles

| Acción | Jugador 1 | Jugador 2 |
|---|---|---|
| Moverse | `A` / `D` | `←` / `→` |
| Saltar | `W` | `↑` |
| Agacharse | `S` | `↓` |
| Bloquear | `Espacio` | `0` (num) |
| Jab / Directo / Gancho | `J` / `K` / `L` | `1` / `2` / `3` |
| Patada baja / alta / ascendente | `U` / `I` / `O` | `4` / `5` / `6` |

`Esc` vuelve al menú, `R` reinicia la ronda. En móvil aparecen botones
táctiles.

## Gestos con cámara

| Gesto | Efecto |
|---|---|
| Puño al frente | jab (rápido) o directo (más explosivo) |
| Puño con recorrido lateral | gancho |
| Puño de abajo arriba | gancho ascendente |
| Rodilla o pie al frente, por debajo de la cadera | patada baja |
| Pierna al frente por encima de la cadera | patada alta |
| Manos junto a la cara | guardia (bloqueo) |
| Bajar el cuerpo | agacharse (esquiva los golpes altos) |
| Impulso hacia arriba | salto |
| Desplazarte a un lado | avanzar o retroceder |

Consejos: colócate a 2–3 m de la cámara con el **cuerpo entero visible**, con
luz de frente, y pulsa **Calibrar postura** de pie y relajado. El botón
**Espejo** invierte izquierda/derecha si tu cámara ya entrega la imagen
reflejada.

Todos los umbrales están en `DEFAULT_TUNING`, en `src/gestures.js`, y están
normalizados por el ancho de hombros: funcionan igual estando cerca o lejos
de la cámara.

El teclado sigue activo mientras juegas con cámara: lo que pulses tiene
prioridad sobre el gesto, lo que va bien para practicar.

## Cómo funciona el retargeting

`src/retarget.js` convierte los 33 puntos de MediaPipe en rotaciones del
esqueleto. La idea:

1. **Cambio de ejes.** MediaPipe entrega `worldLandmarks` en metros con el
   origen entre las caderas, con la Y hacia abajo y la Z hacia el fondo. Se
   pasa al espacio del personaje (`x, -y, -z`): X lateral, Y arriba, Z hacia
   el rival.

2. **Cadera y pecho por bases ortonormales.** El vector cadera-izquierda →
   cadera-derecha y el vector cadera → hombros forman una base; de ahí sale
   la rotación de `Hips`. Lo mismo con los hombros para el pecho, y la
   diferencia entre ambas se reparte a partes iguales entre `Spine`,
   `Spine1` y `Spine2`.

3. **Extremidades por dirección.** Cada hueso sabe hacia dónde apunta en
   reposo; se calcula la rotación mínima que lleva esa dirección a la
   observada (hombro→codo, codo→muñeca, cadera→rodilla, rodilla→tobillo…).

4. **Twist resuelto por el plano del hijo.** Una dirección no fija el giro
   sobre el propio eje del hueso, y por eso los codos y las rodillas suelen
   doblarse hacia cualquier lado en las implementaciones ingenuas. Aquí, tras
   orientar el brazo, se aplica un giro sobre su eje para que el antebrazo
   caiga en el plano correcto. En las pruebas la desviación de las cadenas
   sale en **0.0°**.

5. **Suavizado exponencial** por hueso (constante de tiempo configurable) y
   descarte de los puntos con poca confianza, para que la pose no dé saltos
   cuando MediaPipe pierde el cuerpo.

La pose capturada se mezcla con la animación del juego: mientras te mueves
libremente manda tu cuerpo; cuando se dispara un golpe, manda el clip para
que la acción se lea con claridad y las hitboxes sean justas.

## Usar personajes y animaciones de Mixamo

El juego trae un muñeco construido por código, así que no necesita descargar
nada. Si quieres tu propio personaje:

1. Descárgalo de [mixamo.com](https://www.mixamo.com) en **formato glTF
   (.glb), "With Skin"**.
2. En el menú, dentro de *Controles y gestos*, cárgalo con el selector de
   fichero. Sustituye al luchador 1.
3. Si aparece de espaldas, pulsa **Girar 180°**.

Funciona porque todo el sistema habla en nombres de hueso Mixamo, y tanto las
poses como el retargeting se traducen al espacio de cada hueso
(`offsetLocal = restWorld⁻¹ · q · restWorld`), de modo que sirven igual para
el muñeco procedural que para un rig importado con sus propias orientaciones.

## Ajustes rápidos

| Qué | Dónde |
|---|---|
| Daño, alcance y frame data de los golpes | `src/moves.js` |
| Poses y tiempos de las animaciones | `src/clips.js` |
| Velocidad, salto, gravedad, separación | constantes de `src/fighter.js` |
| Umbrales de los gestos | `DEFAULT_TUNING` en `src/gestures.js` |
| Dificultad de la IA | `LEVELS` en `src/ai.js` |
| Duración de ronda y rondas para ganar | `ROUND_TIME` / `ROUNDS_TO_WIN` en `src/main.js` |

## Pruebas

Corren en Node, sin navegador (solo necesitan three.js):

```bash
npm install
npm test
```

- `tests/animacion.test.mjs` — esqueleto, clips, **alcance real de cada golpe
  en el instante del impacto**, retargeting con landmarks sintéticos y
  reconocimiento de gestos.
- `tests/combate.test.mjs` — 12 rondas de IA contra IA más las reglas de daño
  (bloqueo, esquiva agachado, patada baja que atraviesa la guardia alta,
  aturdimiento, KO, empuje, límites del escenario).

La comprobación de alcance es la que evita una trampa nada evidente: los
giros del torso **se acumulan** sobre los brazos, así que un ángulo escrito
pensando en ejes de mundo puede acabar mandando el puño al lado contrario.

## Limitaciones conocidas

- MediaPipe estima 33 puntos: no hay dedos, y la profundidad (Z) es la
  componente menos precisa. Los golpes muy cortos o pegados al cuerpo se
  detectan peor que los francos.
- Un solo cuerpo por cámara (`numPoses: 1`): el modo de dos jugadores es a
  teclado.
- La captura pide una webcam y descarga el modelo de MediaPipe la primera
  vez; sin eso el juego arranca igual en modo teclado.

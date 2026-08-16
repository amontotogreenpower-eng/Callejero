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
│   ├── rig.js          esqueleto Mixamo + muñeco + carga de FBX/GLB
│   ├── clips.js        poses y clips de animación
│   ├── animator.js     reproductor con fundido cruzado
│   ├── moves.js        frame data de los golpes
│   ├── fighter.js      física, máquina de estados y cajas de golpeo
│   ├── footlock.js     fijado del pie de apoyo con IK (evita el patinaje)
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

## Vista previa

En el menú hay dos botones para ver las cosas antes de pelear:

- **Ver el personaje** — muestra al luchador solo, con la cámara girando a su
  alrededor. Es lo que se abre automáticamente al cargar un personaje propio.
- **Probar cámara sin pelear** — arranca la captura y el luchador copia tus
  movimientos, con la vista previa de la webcam y el gesto detectado en el
  panel de la esquina. Sirve para colocarte y calibrar sin prisa.

Si la cámara no arranca, lo dice con el motivo concreto y el juego sigue
funcionando con teclado.

## Usar personajes de Mixamo

El juego trae un muñeco construido por código, así que no necesita descargar
nada. Si quieres tu propio personaje:

1. Descárgalo de [mixamo.com](https://www.mixamo.com) en **FBX**, con skin y
   sin animación (Mixamo no ofrece glTF; también vale un `.glb` o `.gltf` si
   ya lo has convertido con Blender u otra herramienta).
2. En el menú, dentro de *Controles y gestos*, cárgalo con el selector de
   fichero. Sustituye al luchador 1 y se abre la vista previa.
3. Si aparece de espaldas, pulsa **Girar 180°** (normalmente se detecta solo).

Tres cosas hacen que esto funcione con ficheros que vienen de sitios
distintos:

- **Los nombres se normalizan.** El mismo esqueleto llega escrito de muchas
  formas: `mixamorig:LeftArm` en el FBX original, `mixamorig_LeftArm` cuando
  pasa por glTF (los dos puntos no son válidos ahí), `mixamorig1:LeftArm` en
  una segunda descarga, o `Armature|mixamorig:Hips`. Todas se reducen al mismo
  nombre canónico.
- **Las poses se traducen al espacio de cada hueso**
  (`offsetLocal = restWorld⁻¹ · q · restWorld`), así que sirven igual para el
  muñeco procedural, cuyos huesos están alineados con los ejes del mundo, que
  para un rig de Mixamo real, donde cada hueso tiene su propia orientación.
- **La orientación se detecta por los pies.** Muchos modelos vienen mirando
  hacia atrás; el giro se aplica al estado de reposo, no solo a la malla. Si
  se rotara solo la malla, el personaje miraría bien pero golpearía hacia
  atrás.

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
- `tests/combate.test.mjs` — 12 rondas de IA contra IA, las reglas de daño
  (bloqueo, esquiva agachado, patada baja que atraviesa la guardia alta,
  aturdimiento, KO, empuje, límites del escenario) y el **arrastre del pie de
  apoyo al caminar**.

Dos comprobaciones cubren trampas que no se ven leyendo el código:

- **Alcance de los golpes.** Los giros del torso *se acumulan* sobre los
  brazos, así que un ángulo escrito pensando en ejes de mundo puede acabar
  mandando el puño al lado contrario.
- **Arrastre del pie.** En una marcha correcta siempre hay un pie casi quieto
  respecto al suelo. La prueba mide, fotograma a fotograma, el menor de los
  dos desplazamientos: con el cuerpo a 2,5 m/s el pie apoyado se mueve a
  0,09 m/s.

## Por qué los pies no patinan

Que la animación de andar no resbale no sale gratis; aquí hay tres piezas:

1. **La zancada da la distancia real.** El ciclo de marcha recorre 1,48 m,
   medido sobre la propia animación.
2. **La reproducción va al ritmo del avance.** La velocidad del clip se
   calcula a partir de la velocidad del luchador, y al retroceder el ciclo se
   reproduce hacia atrás.
3. **El pie de apoyo se clava al suelo** (`footlock.js`). Aun encajando la
   zancada, la pierna describe un arco y el tobillo nunca avanza justo a la
   velocidad del cuerpo. Mientras un pie está apoyado se fija su posición en
   el mundo y la pierna se resuelve con IK de dos huesos, doblando la rodilla
   en el mismo plano en el que ya estaba. Las longitudes se miden en cada
   fotograma sobre las posiciones reales, así que funciona con cualquier
   escala de modelo importado.

La marcha usa además interpolación lineal en vez de suavizada: el pie apoyado
tiene que barrer hacia atrás a velocidad constante.

## Limitaciones conocidas

- MediaPipe estima 33 puntos: no hay dedos, y la profundidad (Z) es la
  componente menos precisa. Los golpes muy cortos o pegados al cuerpo se
  detectan peor que los francos.
- Un solo cuerpo por cámara (`numPoses: 1`): el modo de dos jugadores es a
  teclado.
- La captura pide una webcam y descarga el modelo de MediaPipe la primera
  vez; sin eso el juego arranca igual en modo teclado.
- Mientras la captura está activa el fijado de pies se desactiva: manda tu
  cuerpo, no la animación.

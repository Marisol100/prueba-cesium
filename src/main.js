import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

const viewer = new Cesium.Viewer('cesiumContainer', {
  animation: false,
  timeline: false,
  geocoder: false,
  homeButton: true,
  sceneModePicker: true,
  baseLayerPicker: false,
  navigationHelpButton: true,
  infoBox: false,
  selectionIndicator: false
});

viewer.scene.globe.maximumScreenSpaceError = 0.5;

// Diagnóstico de imágenes
const capa = viewer.imageryLayers.get(0);
capa.readyEvent.addEventListener((proveedor) => {
  console.log('Proveedor listo:', proveedor.constructor.name);
});
capa.errorEvent.addEventListener((error) => {
  console.error('Error al cargar la capa:', error);
});

// Orientación inicial
const ubicacion = Cesium.Cartesian3.fromDegrees(
  -97.21765, 19.62350, 0
);
let angulo = 41;

function orientarMapa() {
  viewer.camera.lookAt(
    ubicacion,
    new Cesium.HeadingPitchRange(
      Cesium.Math.toRadians(angulo),
      Cesium.Math.toRadians(-25),
      1200
    )
  );

  const etiqueta = document.getElementById('anguloMapa');
  if (etiqueta) etiqueta.textContent = `${angulo}°`;
}

// Panel de orientación
const controles = document.createElement('div');
controles.style.cssText = `
  position:absolute; top:100px; right:15px; z-index:1000;
  padding:14px; background:rgba(20,30,45,.94); color:white;
  border-radius:10px; font-family:Arial,sans-serif;
  text-align:center; box-shadow:0 3px 12px #0006; width:190px;
`;

controles.innerHTML = `
  <div style="font-weight:bold;margin-bottom:12px">
    Orientación del mapa
  </div>
  <div style="display:flex;gap:8px">
    <button id="girarIzquierda" style="flex:1;padding:10px;cursor:pointer">↶</button>
    <button id="girarDerecha" style="flex:1;padding:10px;cursor:pointer">↷</button>
  </div>
  <div style="margin:12px 0">
    Ángulo: <strong id="anguloMapa">41°</strong>
  </div>
  <button id="restablecerNorte" style="width:100%;padding:9px;cursor:pointer">
    Restablecer norte
  </button>
`;
document.body.appendChild(controles);

document.getElementById('girarIzquierda').addEventListener('click', () => {
  angulo = ((angulo - 15) % 360 + 360) % 360;
  orientarMapa();
});
document.getElementById('girarDerecha').addEventListener('click', () => {
  angulo = (angulo + 15) % 360;
  orientarMapa();
});
document.getElementById('restablecerNorte').addEventListener('click', () => {
  angulo = 0;
  orientarMapa();
});

orientarMapa();

// Edificios 3D disponibles
async function cargarEdificios3D() {
  try {
    console.log('Cargando edificios 3D...');
    const edificios = await Cesium.createOsmBuildingsAsync();
    viewer.scene.primitives.add(edificios);
    console.log('Capa de edificios 3D cargada correctamente.');
  } catch (error) {
    console.error('No se pudieron cargar los edificios 3D:', error);
  }
}
cargarEdificios3D();

// ==========================================
// DIBUJAR Y EDITAR BARDA GRIS
// ==========================================

let puntosBarda = [];
let marcadoresBarda = [];
let bardaDibujada = null;
let segmentosBarda = [];
let espiralesBarda = [];
let modoDibujo = false;
let indiceArrastrando = null;
let rotacionOriginal = true;
let ignorarClick = false;

const CLAVE_BARDAS = 'watchDome.pruebaCesium.barda';

function guardarBarda() {
  const datos = {
    puntos: puntosBarda,
    altura: entradaAltura.value,
    grosor: entradaGrosor.value
  };

  localStorage.setItem(CLAVE_BARDAS, JSON.stringify(datos));
}

function cargarBardaGuardada() {
  try {
    const guardado = localStorage.getItem(CLAVE_BARDAS);
    if (!guardado) return;

    const datos = JSON.parse(guardado);

    if (!Array.isArray(datos.puntos)) return;

    puntosBarda = datos.puntos.filter(p =>
      Number.isFinite(p.longitud) &&
      Number.isFinite(p.latitud) &&
      Number.isFinite(p.altura)
    );

    if (datos.altura !== undefined) {
      entradaAltura.value = datos.altura;
    }

    if (datos.grosor !== undefined) {
      entradaGrosor.value = datos.grosor;
    }

    puntosBarda.forEach((_, indice) => crearMarcador(indice));
    actualizarBarda();

    estado.textContent = puntosBarda.length
      ? `Se recuperaron ${puntosBarda.length} puntos guardados.`
      : 'No hay puntos guardados.';
  } catch (error) {
    console.error('No se pudo recuperar la barda guardada:', error);
  }
}

// Panel
const panel = document.createElement('div');
panel.style.cssText = `
  position:absolute; top:300px; right:15px; z-index:1000;
  width:220px; padding:14px; background:rgba(35,40,45,.96);
  color:white; border-radius:10px; font-family:Arial,sans-serif;
  box-shadow:0 3px 12px #0006;
`;

panel.innerHTML = `
  <div style="font-weight:bold;margin-bottom:10px">Dibujar y editar bardas</div>
  <label for="alturaBarda" style="display:block;margin-bottom:5px"> Altura de la barda (metros) </label>
  <input id="alturaBarda" type="number" min="1" max="30" step="0.5" value="8"
    style="width:100%;box-sizing:border-box;padding:8px;margin-bottom:10px">
  <label for="grosorBarda" style="display:block;margin-bottom:5px"> Grosor del muro (metros) </label>
  <input id="grosorBarda" type="number" min="0.2" max="5" step="0.1" value="0.6"
  style="width:100%;box-sizing:border-box;padding:8px;margin-bottom:10px">

  <button id="iniciarBarda" style="width:100%;padding:9px;margin-bottom:6px">
    Empezar a dibujar
  </button>
  <button id="deshacerPunto" style="width:100%;padding:9px;margin-bottom:6px">
    Deshacer último punto
  </button>
  <button id="terminarBarda" style="width:100%;padding:9px;margin-bottom:6px">
    Terminar trazado
  </button>
  <button id="limpiarBarda" style="width:100%;padding:9px">
    Borrar trazado
  </button>
  <p id="estadoBarda" style="font-size:12px;line-height:1.4">
    Pulsa "Empezar a dibujar" y marca puntos en el mapa.
  </p>
`;
document.body.appendChild(panel);

const estado = document.getElementById('estadoBarda');
const entradaAltura = document.getElementById('alturaBarda');
const entradaGrosor = document.getElementById('grosorBarda');
const botonIniciar = document.getElementById('iniciarBarda');


function obtenerPunto(posicionPantalla) {
  const rayo = viewer.camera.getPickRay(posicionPantalla);
  let cartesiano = rayo
    ? viewer.scene.globe.pick(rayo, viewer.scene)
    : undefined;

  if (!Cesium.defined(cartesiano)) {
    cartesiano = viewer.camera.pickEllipsoid(
      posicionPantalla,
      viewer.scene.globe.ellipsoid
    );
  }

  if (!Cesium.defined(cartesiano)) return null;

  const c = Cesium.Cartographic.fromCartesian(cartesiano);
  return {
    longitud: c.longitude,
    latitud: c.latitude,
    altura: Math.max(0, c.height)
  };
}

function posicionDe(punto) {
  return Cesium.Cartesian3.fromRadians(
    punto.longitud, punto.latitud, punto.altura + 1
  );
}

function crearMarcador(indice) {
  const p = puntosBarda[indice];
  marcadoresBarda[indice] = viewer.entities.add({
    name: `Vértice ${indice + 1}`,
    position: posicionDe(p),
    point: {
      pixelSize: 13,
      color: Cesium.Color.YELLOW,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    },
    label: {
      text: String(indice + 1),
      font: '12px sans-serif',
      pixelOffset: new Cesium.Cartesian2(0, -20),
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    }
  });
}

function actualizarBarda() {
  // Eliminar los segmentos y la espiral anteriores
  segmentosBarda.forEach(entidad => viewer.entities.remove(entidad));
  espiralesBarda.forEach(entidad => viewer.entities.remove(entidad));

  segmentosBarda = [];
  espiralesBarda = [];
  bardaDibujada = null;

  const altura = Math.max(
    1,
    Math.min(30, Number(entradaAltura.value) || 8)
  );

  const grosor = Math.max(
    0.2,
    Math.min(5, Number(entradaGrosor.value) || 0.6)
  );

  if (puntosBarda.length < 2) return;

  // Construir un muro sólido entre cada par de vértices
  for (let i = 0; i < puntosBarda.length - 1; i++) {
    const a = puntosBarda[i];
    const b = puntosBarda[i + 1];

    const lonMedia = (a.longitud + b.longitud) / 2;
    const latMedia = (a.latitud + b.latitud) / 2;

    const metrosEste =
      (b.longitud - a.longitud) *
      Math.cos(latMedia) *
      6378137;

    const metrosNorte =
      (b.latitud - a.latitud) * 6378137;

    const longitud = Math.sqrt(
      metrosEste * metrosEste + metrosNorte * metrosNorte
    );

    if (longitud < 0.1) continue;

    const alturaBase = (a.altura + b.altura) / 2;

    const centro = Cesium.Cartesian3.fromRadians(
      lonMedia,
      latMedia,
      alturaBase + altura / 2
    );

    const rumbo = Math.atan2(metrosEste, metrosNorte);

    const orientacion = Cesium.Transforms.headingPitchRollQuaternion(centro,
    new Cesium.HeadingPitchRoll(rumbo, 0, 0)
    );

    const muro = viewer.entities.add({
      name: `Muro de concreto, tramo ${i + 1}`,
      position: centro,
      orientation: orientacion,
      box: {
        dimensions: new Cesium.Cartesian3(
          grosor,
          longitud,
          altura
        ),
        material: Cesium.Color.fromCssColorString('#92928B'),
        outline: true,
        outlineColor: Cesium.Color.BLACK
      }
    });

    segmentosBarda.push(muro);

    // Espiral metálica ilustrativa sobre el muro
    const radio = 0.3;
    const paso = 0.8;
    const vueltas = Math.max(1, longitud / paso);
    const muestras = Math.ceil(vueltas * 24);
    const posicionesEspiral = [];

    const inicio = Cesium.Cartesian3.fromRadians(
      a.longitud,
      a.latitud,
      a.altura + altura + radio
    );

    const fin = Cesium.Cartesian3.fromRadians(
      b.longitud,
      b.latitud,
      b.altura + altura + radio
    );

    const direccion = Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.subtract(
        fin,
        inicio,
        new Cesium.Cartesian3()
      ),
      new Cesium.Cartesian3()
    );

    const centroEspiral = Cesium.Cartesian3.lerp(
      inicio,
      fin,
      0.5,
      new Cesium.Cartesian3()
    );

    const arriba = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
      centroEspiral,
      new Cesium.Cartesian3()
    );

    const lateral = Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.cross(
        direccion,
        arriba,
        new Cesium.Cartesian3()
      ),
      new Cesium.Cartesian3()
    );

    for (let j = 0; j <= muestras; j++) {
      const t = j / muestras;
      const anguloEspiral = t * vueltas * Math.PI * 2;

      const base = Cesium.Cartesian3.lerp(
        inicio,
        fin,
        t,
        new Cesium.Cartesian3()
      );

      const desplazamientoLateral = Cesium.Cartesian3.multiplyByScalar(
        lateral,
        radio * Math.cos(anguloEspiral),
        new Cesium.Cartesian3()
      );

      const desplazamientoVertical = Cesium.Cartesian3.multiplyByScalar(
        arriba,
        radio * Math.sin(anguloEspiral),
        new Cesium.Cartesian3()
      );

      let puntoEspiral = Cesium.Cartesian3.add(
        base,
        desplazamientoLateral,
        new Cesium.Cartesian3()
      );

      puntoEspiral = Cesium.Cartesian3.add(
        puntoEspiral,
        desplazamientoVertical,
        puntoEspiral
      );

      posicionesEspiral.push(puntoEspiral);
    }

    const cable = viewer.entities.add({
      name: `Concertina ilustrativa, tramo ${i + 1}`,
      polyline: {
        positions: posicionesEspiral,
        width: 3,
        material: Cesium.Color.DARKSLATEGRAY,
        clampToGround: false
      }
    });

    espiralesBarda.push(cable);
  }

  estado.textContent =
    'Muro 3D actualizado. Arrastra los vértices amarillos para modificar el trazado.';
}

const manejador = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

// Seleccionar vértice para moverlo
manejador.setInputAction((evento) => {
  const elegido = viewer.scene.pick(evento.position);
  indiceArrastrando = null;

  if (!Cesium.defined(elegido) || !elegido.id) return;

  const indice = marcadoresBarda.findIndex(m => m === elegido.id);
  if (indice === -1) return;

  indiceArrastrando = indice;
  rotacionOriginal = viewer.scene.screenSpaceCameraController.enableRotate;
  viewer.scene.screenSpaceCameraController.enableRotate = false;
  ignorarClick = true;
}, Cesium.ScreenSpaceEventType.LEFT_DOWN);

// Arrastrar vértice
manejador.setInputAction((evento) => {
  if (indiceArrastrando === null) return;

  const nuevo = obtenerPunto(evento.endPosition);
  if (!nuevo) return;

  puntosBarda[indiceArrastrando] = nuevo;
  marcadoresBarda[indiceArrastrando].position = posicionDe(nuevo);
  actualizarBarda();
  guardarBarda();

  estado.textContent = `Moviendo vértice ${indiceArrastrando + 1}.`;
}, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

// Soltar vértice
manejador.setInputAction(() => {
  if (indiceArrastrando !== null) {
    viewer.scene.screenSpaceCameraController.enableRotate = rotacionOriginal;
    indiceArrastrando = null;
    estado.textContent = 'Vértice actualizado. Puedes mover otro punto amarillo.';
  }
}, Cesium.ScreenSpaceEventType.LEFT_UP);

// Añadir puntos con clic
manejador.setInputAction((evento) => {
  if (ignorarClick) {
    ignorarClick = false;
    return;
  }
  if (!modoDibujo) return;

  const nuevo = obtenerPunto(evento.position);
  if (!nuevo) {
    estado.textContent = 'No se pudo marcar. Haz clic sobre el terreno.';
    return;
  }

  puntosBarda.push(nuevo);
  crearMarcador(puntosBarda.length - 1);
  actualizarBarda();
  guardarBarda();

  estado.textContent = puntosBarda.length < 2
    ? 'Primer punto agregado. Haz clic en otro lugar.'
    : `Hay ${puntosBarda.length} puntos. Arrastra los puntos amarillos para editar.`;
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

botonIniciar.addEventListener('click', () => {
  modoDibujo = true;
  botonIniciar.textContent = 'Dibujo activo';
  estado.textContent = 'Haz clic en cada esquina o cambio de dirección de la barda.';
});

document.getElementById('deshacerPunto').addEventListener('click', () => {
  if (puntosBarda.length === 0) {
    estado.textContent = 'No hay puntos que deshacer.';
    return;
  }

  puntosBarda.pop();
  const marcador = marcadoresBarda.pop();
  if (marcador) viewer.entities.remove(marcador);
  actualizarBarda();
  guardarBarda();

  estado.textContent = `Puntos restantes: ${puntosBarda.length}.`;
});

document.getElementById('terminarBarda').addEventListener('click', () => {
  modoDibujo = false;
  botonIniciar.textContent = 'Continuar dibujando';
  estado.textContent =
    `Trazado terminado con ${puntosBarda.length} puntos. Puedes mover los vértices amarillos.`;
});

document.getElementById('limpiarBarda').addEventListener('click', () => {
  modoDibujo = false;
  puntosBarda = [];

  localStorage.removeItem(CLAVE_BARDAS);

  if (bardaDibujada) viewer.entities.remove(bardaDibujada);
  bardaDibujada = null;

  marcadoresBarda.forEach(m => viewer.entities.remove(m));
  marcadoresBarda = [];
  botonIniciar.textContent = 'Empezar a dibujar';
  estado.textContent = 'Trazado borrado. Puedes empezar de nuevo.';

  segmentosBarda.forEach(e => viewer.entities.remove(e));
  espiralesBarda.forEach(e => viewer.entities.remove(e));

  segmentosBarda = [];
  espiralesBarda = [];
  bardaDibujada = null;
});

entradaAltura.addEventListener('change', () => {
  actualizarBarda();
  guardarBarda();
});

entradaGrosor.addEventListener('change', () => {
  actualizarBarda();
  guardarBarda();
});

console.log('Herramienta interactiva de bardas lista.');

cargarBardaGuardada();
# Deriv Analyzer v1.9 — estabilidad de conexión y hora de Deriv

## Mi sala de trading

La candidata `feature/trading-room` parte de la rama auditada. Conecta la API pública para iniciar el análisis automático mientras el panel permanezca abierto. Se proponen seis activos iniciales (o los que haya disponibles), ampliables hasta doce, sin exigir pestañas abiertas. Usa «Editar activos» para añadir, quitar o reemplazar, y «Importar mis pestañas» para incorporar símbolos presentes en URLs de `dtrader.deriv.com`. Si la URL no incluye un símbolo válido, no se infiere a partir del título ni se inspecciona tu cuenta.

La selección persiste localmente, incluso si decides dejarla vacía. Cada tarjeta muestra dirección, hora del cierre analizado, vigencia y puntuación técnica. Una alerta dura hasta el siguiente minuto; el seguimiento prospectivo dura cinco minutos desde el tick observado. Una alerta caducada pasa a ESPERAR: no es una invitación a entrar tarde. El identificador de vela evita repetir alertas, también al reabrir el panel.

El escáner sigue evaluando hasta doce activos del catálogo, priorizando tu selección. Las alternativas requieren señal vigente, puntuación mínima de 60, diez puntos sobre el mínimo de las señales vigentes de la sala (o sobre cero si no hay ninguna), y el filtro retrospectivo auditado. Estos criterios son técnicos y exploratorios. «Aprobar reemplazo» cambia únicamente la selección: nunca cambia pestañas ni realiza operaciones. «Abrir / activar pestaña» activa la pestaña de ese símbolo o abre una nueva; no cambia el símbolo de otras pestañas.

Las primeras 151 señales prospectivas tuvieron 75 aciertos y 76 fallos. **No existe ventaja financiera demostrada. La puntuación no es una probabilidad.** Se conservan las exportaciones, el almacenamiento prospectivo previo y los mecanismos de conexión auditados. No se solicitan credenciales.

La suite ampliada se ejecuta con `node --test tests/*.test.cjs`: 59 pruebas, incluidas las 48 originales. El workflow valida pushes a la rama de la sala y PR hacia la rama auditada o `main`.

## Correcciones tras la prueba real de v1.8

- Las dos señales prospectivas observadas en la v1.8 (`1HZ10V` y `1HZ30V`) demostraron que el registro ya funciona; fueron almacenadas en `chrome.storage.local`. Esta versión usa la misma clave `deriv_analyzer_forward_v16`, por lo que se mantienen mientras se cargue como **actualización de la misma extensión** (no si se instala como extensión nueva o se elimina la anterior).
- Se envía `ping` cada 30 s para evitar cierres por inactividad (documentación oficial de Deriv).
- Si se corta la conexión, se reintenta hasta 6 veces (2, 4, 8, 16, 30, 30 s), incluso sin monitoreo. Si el monitoreo estaba activo, se reanuda después de recuperar hora y catálogo. No se envían órdenes.
- Se consulta `{time:1}` al conectar y se renueva cada 5 minutos. Se usa un reloj monotónico y un margen por latencia y precisión del servidor. No se escanea ni registra con hora desconocida o caducada; no se sustituye por la hora local. Una sincronización que tarda más de 4 s se rechaza.
- Al reconectar manualmente, el cierre del socket anterior ya no puede pisar los controles del socket nuevo.
- El monitoreo se reanuda tras una reconexión exitosa. Los pendientes no se eliminan al desconectar y el panel muestra la hora de vencimiento de cada señal.
- En el registro se muestran códigos de cierre WebSocket para ayudar a diagnosticar posibles problemas adicionales.

## Precauciones y funcionamiento

El seguimiento es experimental y usa ticks públicos observados después de emitir señales calculadas sobre velas cerradas. El precio de salida se toma del último tick en o antes del vencimiento, si está a <=15 s. **No es una simulación exacta de un contrato Rise/Fall**, ni se comprueba disponibilidad, payout, comisiones o condiciones del contrato. Ninguna operación se compra ni se ejecuta. Pueden aparecer discrepancias respecto a liquidaciones reales.

El monitoreo automático funciona solamente mientras el panel lateral siga abierto. No se siguen señales en segundo plano cuando se cierra el panel, pero los registros persisten localmente. Es posible exportar el seguimiento aunque esté vacío.

## Uso

1. En Chrome, para no perder los registros, **actualiza los archivos dentro de la carpeta original de la extensión** y pulsa `Recargar` en `chrome://extensions`; evita eliminarla y crear otra con un ID distinto. Alternativamente realiza una exportación CSV con v1.8 antes de reemplazarla.
2. Abre el panel, pulsa `Conectar API` y comprueba el mensaje `Hora Deriv sincronizada`.
3. Comprueba si los pendientes vencieron; pulsa `Evaluar señales vencidas`, o activa el monitoreo para que evalúe durante los escaneos automáticos.
4. Exporta `Seguimiento CSV` y revisa los resultados.

## Auditoría de estabilidad

El informe de fallos, correcciones y límites está en [AUDIT.md](AUDIT.md). Se conserva el diseño, la clave de almacenamiento y las reglas técnicas de las señales. La entrada prospectiva espera un tick posterior a la emisión de la señal, cancela la suscripción y mantiene fija la duración seleccionada al iniciar el escaneo. Los registros heredados se conservan, pero sus resultados por cierre de vela se separan de la tasa por tick observado.

Los pendientes nunca se eliminan para hacer sitio: al alcanzar 1.500 pendientes se detiene el registro de nuevas señales. La retención elimina primero registros resueltos antiguos. Las escrituras entre paneles se coordinan con Web Locks y se fusionan por ID. Si falla el almacenamiento, el registro indica que el resultado solo existe en memoria; expórtalo antes de cerrar el panel.

### Pruebas

Desde la raíz del repositorio, con Node.js 20 o posterior:

```sh
node --test tests/*.test.cjs
```

La suite funciona sin red ni paquetes adicionales y simula WebSocket, la API, los temporizadores y `chrome.storage.local`.

Comprobaciones adicionales, opcionales para otras máquinas:

```sh
# Requiere Playwright y Chromium instalados; CHROMIUM_PATH permite elegir el ejecutable.
node tests/browser-smoke.cjs
# Requiere Python 3 y el paquete websockets con soporte de proxy.
node tests/live-api-smoke.cjs
```

La primera usa el DOM real del panel con API y almacenamiento simulados; no instala la extensión. La segunda consulta datos públicos reales, sin autenticación ni operaciones: hora, catálogo, tres páginas de velas, ticks, cancelación de suscripción, historial al vencimiento y ping. No crea registros en tu perfil de Chrome.

Resultados de la auditoría: 48 pruebas automáticas aprobadas, comprobación DOM aprobada y contrato público real aprobado. Sigue pendiente la prueba integral como extensión instalada en un Chrome que permita cargarla, incluyendo persistencia real y monitoreo prolongado. La política administrada de Chromium de este entorno bloquea extensiones adicionales.

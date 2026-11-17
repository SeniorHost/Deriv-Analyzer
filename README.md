# Deriv Analyzer v1.9 — estabilidad de conexión y hora de Deriv

## Mi sala de trading

La candidata `feature/trading-room` parte de la rama auditada. Conecta la API pública para iniciar el análisis automático mientras el panel permanezca abierto. Se proponen seis activos iniciales (o los que haya disponibles), ampliables hasta doce, sin exigir pestañas abiertas. Usa «Editar activos» para añadir, quitar o reemplazar, y «Revisar gráficos de Deriv» para consultar símbolos visibles en URLs de `dtrader.deriv.com`, sin cambiar la selección. Esa consulta no detecta los gráficos internos de la web. Un símbolo detectado solo se incorpora reemplazando explícitamente uno seleccionado; solo «Añadir» aumenta el número de activos. Si la URL no incluye un símbolo válido, no se infiere a partir del título ni se inspecciona tu cuenta.

La selección persiste localmente, incluso si decides dejarla vacía. Cada tarjeta muestra dirección, hora del cierre analizado, vigencia y puntuación técnica. Una alerta dura hasta el siguiente minuto; el seguimiento prospectivo dura cinco minutos desde el tick observado. Una alerta caducada pasa a ESPERAR: no es una invitación a entrar tarde. El identificador de vela evita repetir alertas, también al reabrir el panel.

El escáner sigue evaluando hasta doce activos del catálogo, priorizando tu selección. Las alternativas requieren señal vigente, puntuación mínima de 60, diez puntos sobre el mínimo de las señales vigentes de la sala (o sobre cero si no hay ninguna), y el filtro retrospectivo auditado. Estos criterios son técnicos y exploratorios. «Aprobar reemplazo» cambia únicamente la selección: nunca cambia pestañas ni realiza operaciones. «Ir a Deriv (sin cambiar gráficos)» enfoca una pestaña de Deriv existente, priorizando la URL del símbolo. No afirma activar el gráfico interno ni cambia URLs. Si no hay ninguna pestaña, ofrece un botón aparte para crearla explícitamente. Un reemplazo conserva el número de seleccionados y no permite duplicados. Las selecciones de más de seis guardadas previamente se conservan; si se añadieron por error, usa «Quitar», sin que la extensión adivine cuáles eliminar.

Las primeras 151 señales prospectivas tuvieron 75 aciertos y 76 fallos. **No existe ventaja financiera demostrada. La puntuación no es una probabilidad.** Se conservan las exportaciones, el almacenamiento prospectivo previo y los mecanismos de conexión auditados. No se solicitan credenciales.

La suite ampliada se ejecuta con `node --test tests/*.test.cjs`: 71 pruebas, con los 59 casos de la candidata anterior y doce regresiones de sincronización. El caso anterior que esperaba crear una pestaña cuando otro activo ya estaba abierto ahora exige enfocar Deriv sin crearla; se conserva su cobertura de navegación. El workflow valida pushes a la rama de la sala y PR hacia la rama auditada o `main`.

## Comparador de estrategias (experimental)

La rama `feature/duration-comparator`, basada en `a92d913`, añade una sección plegable independiente. Compara 1, 3, 5 y 10 minutos, y 5/10 ticks **reales**. El horizonte de la sala sigue siendo cinco minutos; no se cambian indicadores ni alertas.

Elige activo, modalidad y duración. Se muestran por separado referencia retrospectiva y seguimiento prospectivo, con aciertos/fallos/empates, muestra evaluada, tasa observada sin empates e intervalo Wilson 95%. Menos de 30 casos decisivos se etiqueta «Datos insuficientes»; a partir de 30 sigue siendo «experimental» y «Sin ventaja demostrada». Los intervalos son puntuales, no corrigen comparaciones múltiples ni garantizan independencia. No se selecciona un ganador.

Los retrospectivos por tiempo usan los cierres históricos auditados; los de ticks requieren pulsar «Consultar ventana histórica de ticks». Se consulta hasta 1.000 eventos reales, como máximo una vez por minuto y activo; no se convierten velas en ticks ni se rellena una secuencia incompleta. Puede no haber suficientes señales del tramo retrospectivo dentro de esa ventana. En ticks, la señal usa los indicadores de velas cerradas y la entrada hipotética es el primer tick estrictamente posterior al cierre, como máximo 15 segundos después. La salida es el quinto o décimo evento posterior a esa entrada; los casos de cada duración no se solapan en índices.

«Recopilar prospectivo» viene desactivado. Al activarlo se observan señales nuevas de los activos de la sala, con cotización propia posterior a la señal y al margen del reloj sincronizado. Hasta tres flujos simultáneos comparten la conexión existente. Se evalúan las seis duraciones sin nuevas entradas del mismo activo durante diez minutos; las modalidades comparten entrada y sus resultados están correlacionados. La resolución de tiempo de la API es en segundos, no milisegundos. Para minutos se usa el último tick observado en o antes del vencimiento, de antigüedad ≤15 segundos; para ticks se cuentan eventos posteriores, incluso si tienen el mismo precio y segundo.

Una desconexión, reinicio sin flujo activo, secuencia desordenada o silencio de 15 segundos deja lo pendiente «INCOMPLETA», nunca lo reconstruye inventando ticks. Los resultados ya resueltos se conservan. Un panel que ya posee un flujo por activo mantiene su reserva mediante Web Locks. Desactivar la recopilación impide entradas nuevas; los flujos ya iniciados terminan. Se guardan hasta 120 grupos de seis evaluaciones en una clave independiente; los registros anteriores no se migran a modalidades inventadas ni se alteran.

El CSV del comparador incluye todos sus prospectivos en memoria y el retrospectivo visible, con fuentes explícitas `PROSPECTIVO_FLUJO`, `RETROSPECTIVO_CIERRE` o `RETROSPECTIVO_TICKS`. Los CSV anteriores siguen disponibles. Estas observaciones no representan contratos ejecutables ni liquidaciones reales, y no tienen en cuenta pagos o costes.

Validación ampliada: **88 pruebas** (incluidas las 71 anteriores), más prueba de navegador con API simulada. Las comprobaciones de una extensión instalada y sesiones largas reales siguen pendientes.

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

# Deriv Analyzer v2.2 — simulación multioperación y diagnóstico

Candidata en `feature/auto-demo-multi-monitor`, basada en `fix/auto-demo-responsive` (`2a6381e`). No ejecuta operaciones y no existe ventaja financiera demostrada.

La vista completa añade **DERIV AUTO DEMO — MONITOR**, un libro de simulación optativo e independiente. Parte APAGADO; solo inicia con confirmación explícita de saldo/límites virtuales. Defaults 9.989 / 9.900 / 10.500 USD, inversión fija máxima 2 USD, seis posiciones de cinco minutos y exposición máxima inicial 12 USD. Consume las señales del radar, cotiza propuestas públicas frescas y observa ticks; reserva exposición, detiene entradas al alcanzar límites y no reanuda tras cortes/reinicio. El informe ZIP conserva los nueve archivos anteriores y añade siete, incluido diagnóstico y evaluación prospectiva; contiene un HTML autónomo.

La sección **SALUD DEL SISTEMA** conserva incidencias, detecta pausas y permite descargar un diagnóstico incluso con el motor detenido. El panel muestra hasta seis posiciones y los candidatos rechazados por capacidad. La evaluación prospectiva usa pagos observados, Wilson y agrupaciones descriptivas; la sombra es optativa y solo utiliza los ticks ya disponibles de activos admitidos. No influye en la selección activa. Consulta [uso y arquitectura v2.2](MULTI_MONITOR.md).

La corrección de respuesta distingue INICIANDO/SIMULANDO/DETENIENDO/DETENIDO/ERROR. Detener está fijo y disponible desde el inicio, no espera a persistencia y bloquea continuaciones anteriores. Cómputos y validaciones pesados se ejecutan fuera del hilo de interfaz; un único escritor agrupa registros sin borrarlos. La actividad muestra fechas de lectura y guardado, sin una barra financiera que aparente trabajo. Una restauración conserva registros y deja la simulación detenida.

**Las compras y la autenticación están bloqueadas. No se conecta ninguna cuenta DEMO ni real.** El saldo virtual no es el saldo confirmado de una cuenta; se informa como no disponible. La documentación de autenticación devolvió Forbidden; se entrega la alternativa de simulación segura, con requisitos futuros documentados. Los pagos de propuestas no prueban ejecución ni rentabilidad.

Consulta [uso del monitor](AUTO_DEMO_MONITOR.md), [seguridad y límites](AUTO_DEMO_SECURITY.md) y [formatos del informe](EXPORTS.md). Los registros anteriores siguen en sus claves/CSV, separados del nuevo módulo.

- **Mejores señales disponibles**: hasta 25 tarjetas dinámicas con tendencia, RISE/FALL/SIN CONFIRMACIÓN, método versionado, explicación, vigencia, antigüedad y evidencia. Cada análisis se publica antes de esperar el seguimiento prospectivo o terminar la tanda. Una señal nueva reemplaza primero una tarjeta amarilla; las confirmadas conservan su posición mientras sean válidas; una vela caducada no se reactiva.
- **Colores del radar**: tarjeta verde RISE vigente, roja FALL vigente, amarilla sin confirmación, gris pendiente/caducada/antigua/error. Se actualizan nodos por símbolo sin reconstruir la cuadrícula ni consultar la API para pintar.
- **Mi sala · favoritos**: selección manual independiente, inicialmente seis y máximo siete, con añadir/quitar/reemplazar/reordenar. Se conserva la selección anterior completa al migrar, incluidos los símbolos fuera del límite activo; la clave anterior no se borra. El escáner y la detección de pestañas nunca añaden favoritos por su cuenta.
- **Vista completa/compacta** y **Abrir en ventana**: tabla del catálogo con búsqueda y filtros; una sola vista controla la conexión pública y las demás reflejan resultados y envían controles. Sin vistas abiertas no hay monitoreo.
- Recorrido progresivo de todas las familias compatibles del catálogo, presupuesto global predeterminado de 36 solicitudes de datos/60 s, dos trabajadores, caché incremental y reintentos limitados. Muestra progreso real y datos antiguos. No descarga 2.400 velas por activo cada minuto.
- Registro de once métodos: Forex, Range Break y Volatility; observadores conservadores de Boom/Crash, Step y Jump. Los desconocidos se abstienen. La regla Volatility anterior queda intacta. No se selecciona un método por su tasa retrospectiva.
- Investigación avanzada separada en desarrollo/validación/reservado con purgas, prospectivo posterior con retrasos 0/2/5 s, original pareado, estadísticas y CSV. Sin pagos observados declarados: **Rentabilidad no evaluable**.

Consulta [instalación y límites](INSTALL.md), [reglas y versiones](STRATEGIES.md) y [evidencia de auditoría](AUDIT.md). Permanecen el lector original, comparador, seguimiento y CSV anteriores. Los resultados antiguos no se convierten en resultados v2. Los permisos siguen siendo `sidePanel`, `tabs` y `storage`: sin inyección en Deriv, credenciales ni lectura de sus gráficos internos.

## Historial de funcionalidades anteriores

Las secciones siguientes documentan las versiones anteriores y sus decisiones de auditoría. Sus límites antiguos de doce activos y conteos de pruebas corresponden a esas versiones; en esta candidata rigen los límites descritos arriba.

## Interfaz sencilla — feature/simple-chart-reader

La pantalla principal contiene una sola tarjeta por activo seleccionado: tendencia observada ALCISTA/BAJISTA/LATERAL, estado SUBE/BAJA/SIN CONFIRMACIÓN, productor explícito, velas de un minuto y evaluación de cinco minutos. La hora de emisión y vigencia solo se muestran con señal vigente del método elegido. La tendencia se obtiene de la diferencia entre el último y primero de cuatro cierres completos de 5m, la misma lectura direccional de ese marco; no modifica ni sustituye ninguna confirmación. Sin datos recientes se declara así, en vez de inventar una tendencia lateral.

Por defecto se muestra el lector adaptativo. En «Avanzado» puedes elegir explícitamente el sistema original; esa preferencia se guarda separada de la selección y los registros. No hay fallback al otro método si el elegido no confirma. «Métodos en desacuerdo» identifica los dos estados sin crear una señal combinada. Las condiciones de confirmación v1.0.0 y los indicadores originales son idénticos a `5d25b05`.

«Mejores condiciones técnicas observadas» conserva las alternativas del sistema original con aprobación manual, claramente identificadas. «Avanzado» está plegado por defecto e incluye controles, indicadores, diagnósticos por familia/activo, resultados retrospectivos/prospectivos, comparador, registros y todos los CSV. Los detalles del lector son listas de diagnóstico, no otra colección de tarjetas.

El diagnóstico cuenta frecuencia de señales y condiciones ausentes en observaciones no confirmadas sobre el mismo tramo histórico reservado. Los motivos son no exclusivos: sus conteos no se suman como muestras independientes ni prueban causalmente cuál filtro debe retirarse. No se ajusta ninguna regla para elevar la frecuencia. Los resultados de una instantánea pública y sus límites se documentan en AUDIT.md; no hay evidencia de mejora predictiva.

Validación ampliada: 125 pruebas, incluidas las 112 anteriores, y prueba de navegador para tendencia sin confirmación, método principal, desacuerdo, señal vigente/caducada, estadísticas ocultas, una sola colección de seis tarjetas, preferencias, CSV y seguimiento conservados.

## Lector inteligente de gráficos (v1.0.0 experimental)

La rama `feature/adaptive-chart-reader` añade un lector OHLC independiente, sin sustituir señales originales ni el comparador. Abre su sección para consultar las seis tarjetas seleccionadas (hasta doce), sus explicaciones y detalles de evaluación. No lee la pantalla de Deriv ni opera sobre sus botones.

Clasificación por catálogo verificado: FOREX exige mercado y tipo `forex`; Range Break exige `synthetic_index/range_index`; Volatility exige `synthetic_index/random_index`, tipo `stockindex` y códigos oficiales comprobados (`R_10/25/50/75/100`, `1HZ10/15/25/30/50/75/90/100V`). Un nombre comercial parecido no basta: las familias desconocidas muestran ESPERAR y no reciben reglas inventadas.

Las reglas fijas registradas son estructura/rechazo y ruptura/retest para FOREX, rechazo/falsa ruptura y continuación de canal para Range Break, e impulso multitemporal para Volatility. Cada hipótesis registra regla y versión. Los últimos 240 minutos se estudian con cuerpos, mechas, niveles previos, pivotes confirmados, ATR y contexto. Se agregan bloques UTC completos de 5m y 15m; no se rellena una vela ausente. Los pivotes se conocen solo después del cierre de dos velas a su derecha y conservan su hora de confirmación. La estructura principal se lee en 5m, con confirmación en 1m y contexto de 15m; el seguimiento dura cinco minutos desde el tick de entrada.

No se cambia de regla por porcentaje histórico. Contradicciones entre temporalidades, indicadores originales opuestos, datos incompletos, mercado cerrado o condiciones ambiguas producen ESPERAR. FOREX usa un filtro horario UTC fijo de 07:00 a 20:00; es una hipótesis de contexto, no una ventaja demostrada.

Los detalles separan: evaluación original, evaluación del lector y sus reglas, y seguimiento futuro pareado. El comparador sigue en su propia sección y almacenamiento. El último 30% cronológico se evalúa sin ajustar parámetros a ese resultado; no es una prueba externa ni una garantía fuera de muestra. Las muestras de resultados no se solapan dentro de cada serie; sus frecuencias de señal y los intervalos Wilson son descriptivos y no corrigen correlación o comparaciones múltiples.

La recopilación futura del lector viene **desactivada**. Al activarla, original y lector pueden compartir una entrada observada para comparación; ESPERAR no se fuerza a RISE/FALL. Para el lector se estudian también retrasos de entrada de 2 y 5 segundos, con precios realmente recibidos y vencimiento a cinco minutos de cada entrada. Son escenarios correlacionados, no tres muestras independientes. Solo se acepta la entrada inicial si la hipótesis sigue vigente. Hay hasta tres flujos, reserva entre paneles, vigilancia de silencio de 15 s y descarte explícito tras cortes. Se conserva todo resultado ya resuelto. Los datos y CSV del lector usan una clave nueva y no alteran registros previos.

La suite ampliada contiene 112 pruebas, incluidas las 88 anteriores; se añade validación de navegador para tarjetas, detalles, recopilación, retrasos, interrupción y CSV. Sigue pendiente la validación instalada y prolongada con datos reales. Todas las reglas son hipótesis experimentales; no se ha demostrado utilidad predictiva ni rentabilidad.

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

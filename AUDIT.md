# Auditoría técnica de Deriv Analyzer v1.9

Base inspeccionada: `72e9091fb1dfdd874d6743e84a7cb952b6ace408`, coincidente con `origin/main` al comprobarlo. Trabajo en la rama local `audit/v1.9-stability`.

Se revisaron los ocho archivos originales: README, manifest, background, panel HTML/JS, CSS, indicadores y seguimiento. No se cambian el HTML, el CSS, los permisos ni las reglas y umbrales de las señales. No se añade compra, venta, autorización de cuenta ni automatización de operaciones.

## Fallos corregidos

| Área | Fallo reproducible | Corrección |
| --- | --- | --- |
| Inicio | Escaneo habilitado antes de recibir hora y catálogo; catálogo previo reutilizable tras reconectar | Habilitar únicamente con hora válida y catálogo normalizado no vacío; invalidar la sesión anterior |
| WebSocket | Un socket en CONNECTING podía quedar indefinidamente; `send()` que lanza dejaba solicitudes y temporizadores pendientes | Plazo de apertura de 12 s; limpieza inmediata en errores de envío |
| Reconexión | Solo se recuperaba una desconexión con monitoreo activo; cierre de un socket sin respuesta podía quedarse esperando otro evento | Recuperación acotada también en modo manual; desconexión explícita tras error o dos pings sin respuesta |
| Sesiones | Continuaciones de ping/hora de la conexión vieja podían modificar contadores o el reloj nuevos | Comprobar identidad del socket después de cada espera y antes de aplicar respuestas |
| Hora | Se conservaba el desfase de una sesión vieja y se usaba el reloj local si fallaba la sincronización | Invalidación por sesión, ancla monotónica, caducidad de 10 minutos y renovación; rechazar RTT >4 s; bloquear cálculos sin reloj fiable |
| Velas cerradas | Precisión de segundos y latencia podían admitir una vela recién terminada sin margen | Aplicar margen conservador de un segundo más medio RTT |
| Entrada prospectiva | El primer tick podía pertenecer a un instante anterior a emitir la señal; no se gestionaba explícitamente la suscripción | Suscripción temporal: esperar tick posterior a emisión más incertidumbre, comprobar frescura y cancelar incluso tras timeout |
| Duración | Cambiar el selector durante una consulta mezclaba el horizonte del backtest con el prospectivo | Capturar el horizonte del escaneo y pasarlo al registro |
| Restauración | Una lectura de almacenamiento tardía podía sustituir señales creadas entretanto | Esperar restauración antes de registrar o evaluar; no sobrescribir formatos desconocidos |
| Persistencia | La cola capturaba referencias mutables; los errores se absorbían y se anunciaban registros guardados | Capturas profundas; separar registros duraderos de resultados solo en memoria y permitir reintentar escrituras |
| Varias ventanas | Dos paneles podían sobrescribir la lista completa o devolver una señal resuelta a pendiente | Read/merge/write bajo Web Lock del mismo origen; cambios por ID y prioridad del primer registro duradero y resultados ya resueltos |
| Retención | `slice(-1500)` eliminaba pendientes sin evaluar | Recortar primero resueltos antiguos y bloquear nuevas entradas al alcanzar 1.500 pendientes |
| Resultados | Datos incompletos o direcciones desconocidas podían producir un resultado; se mezclaban registros heredados con ticks | Validación de registros/precios/tiempos; mantener inválidos sin liquidarlos; separar la tasa heredada |
| Vencimiento | Falta de pruebas sobre ticks posteriores o demasiado antiguos | Mantener solo último tick <= vencimiento con antigüedad <=15 s; sin dato fiable, seguir pendiente; mantener ruta de cierre heredado exacto |
| Backtest | Hora de entrada y salida usaba apertura aunque el precio era de cierre | Etiquetar ambas con `epoch + 60`; unificar `TA.backtest` con la validación del último 30 % |
| Huecos | Indicadores trataban minutos ausentes como observaciones contiguas | Reiniciar calentamiento en cada hueco, exigir 60 minutos previos contiguos para señal y continuidad durante la duración simulada |
| Caché | Pedía 180 velas en cada actualización; truncaba antes de quitar la vela abierta y perdía una vela cerrada | Cero consultas cuando ya está el último cierre; actualización de pocas velas solapadas; filtrar abiertas antes de conservar 2.400 |
| Historial | Un error de transporte provocaba reconstrucción con tres consultas adicionales; cancelación tardía podía seguir paginando | Propagar errores sin multiplicar consultas; comprobar cancelación y sesión después de cada respuesta; primera página de 801 para compensar la abierta |
| Datos | Conversión de `null` a cero y timestamps no alineados podían pasar la normalización | Rechazar nulos, precios no positivos, OHLC inválido y epochs no enteros/alineados; deduplicar por minuto |
| Navegación | Error en consulta de pestañas no devolvía respuesta y podía lanzar una excepción | API de promesas con manejo de errores para consulta y actualización; conservar URL y restringir a DTrader |

## Evidencia ejecutada

- `node --test tests/*.test.cjs`: **48 aprobadas, 0 fallidas, 0 omitidas**. Incluye fallos de red, reconexión, seis reintentos, heartbeat, respuesta tardía, reloj local alterado, caducidad, suscripciones, restauración, errores de almacenamiento, dos paneles concurrentes, Rise/Fall/empate, vencimientos, legado, retención y caché.
- Indicadores EMA, RSI Wilder y ATR contrastados con cálculos independientes; MACD comprobado en serie constante y, junto con todos los indicadores y señales, mediante equivalencia con prefijos del historial. No se encontró dependencia de observaciones futuras en las fórmulas originales. Se corrigieron tiempos y continuidad, sin optimizar parámetros según resultados.
- Integración simulada de 12 símbolos: tres trabajadores como máximo, 36 páginas iniciales, 2.400 velas cerradas por símbolo, resultados y tres tipos de exportación. Ninguna solicitud financiera.
- `node tests/browser-smoke.cjs`: **aprobado**, DOM real en Chromium, API y almacenamiento simulados, conexión, escaneo, CSV y recarga; cero errores de página. Servidor local temporal interno a la prueba, cerrado al finalizar.
- `node tests/live-api-smoke.cjs`: **aprobado**, endpoint público actual `wss://api.derivws.com/trading/v1/options/ws/public`: 95 símbolos, 2.400 velas cerradas, 90 casos retrospectivos en esa muestra, tick y `forget`, historial anterior al vencimiento y ping. El número de casos varía con el mercado; no constituye una estimación de rentabilidad.
- Sintaxis JavaScript y revisión de espacios con `git diff --check`.

## Límites y comprobaciones pendientes

1. Chromium administrado conserva `ExtensionInstallBlocklist: ["*"]`. No se cambió esa política. Falta validar esta rama como extensión instalada en un navegador autorizado: panel lateral, eventos del service worker, persistencia real entre reinicios y navegación real de DTrader. La prueba DOM simula las APIs de Chrome; la prueba pública usa un cliente WebSocket externo, no demuestra por sí sola el transporte desde la extensión.
2. Falta una sesión prolongada con datos reales, reconexiones reales y vencimientos prospectivos de 1 y 5 minutos. Los fallos y las liquidaciones se probaron automáticamente con API simulada; los datos de salida histórica también se consultaron en la API pública.
3. La hora pública tiene precisión limitada y los temporizadores del navegador pueden retrasarse al suspender el equipo. Se prefieren descartar entradas o conservar pendientes antes que inventar precios. Tras periodos sin datos puede ser necesaria reconexión manual.
4. Si Deriv ya no ofrece un tick anterior o igual al vencimiento dentro de 15 s, no se liquida esa señal. Los registros heredados mal formados se conservan para exportación, sin corregir su contenido por conjetura.
5. El backtest utiliza cierres históricos como referencia idealizada, no un precio ejecutable. Wilson presupone condiciones estadísticas que no garantizan independencia entre señales/activos; el filtrado de activos y las consultas repetidas también pueden introducir sesgo de selección. No se estiman pagos, costes, contratos reales ni rentabilidad.

La auditoría inicial se realizó sin publicar cambios. Los pushes posteriores, autorizados expresamente, se limitan a `audit/v1.9-stability`, vinculada al PR #1. No se fusiona con `main`, no se publican releases ni se despliega la extensión.


## Validación continua del PR #1 (2026-11-17)

Se añade `.github/workflows/validation.yml` a la misma rama candidata, sin cambios en estrategias, indicadores, diseño ni pruebas existentes.

- Eventos: cada `push` a `audit/v1.9-stability` y cada `pull_request` dirigido a `main`.
- Un solo job con Node.js 20 en Ubuntu, permisos `contents: read`, sin credenciales Git persistentes, sin instalaciones de dependencias del proyecto ni consultas a Deriv.
- Comprueba sintaxis con `node --check` para todos los archivos JS/CJS versionados y ejecuta `node --test tests/*.test.cjs`.
- Ejecuta `git diff --check` sobre el árbol de trabajo y los cambios del evento (base/head de PR o before/head de push; contempla la creación de rama). El checkout conserva el historial para resolver esas referencias.
- Cancela ejecuciones anteriores del mismo workflow/ref al recibir nuevos cambios; no crea versiones, releases ni despliegues.

Validación local previa al push: Node.js **20.20.2**, **48 pruebas aprobadas, 0 fallidas, 0 canceladas, 0 omitidas**. Sintaxis de los 13 archivos JS/CJS versionados aprobada; `git diff --check` aprobado tanto para los cambios locales como para la candidata respecto a la base de `main`. No se encontraron fallos que requirieran modificar la aplicación.

El resultado local no acredita una ejecución en GitHub Actions. La consulta de la API de GitHub devuelve `Forbidden` en este entorno; el estado remoto debe verificarse en [Validate candidate](https://github.com/SeniorHost/Deriv-Analyzer/actions/workflows/validation.yml). La validación como extensión instalada sigue pendiente según los límites anteriores.


## Mi sala de trading — candidata feature/trading-room

Base: `8634638` de `audit/v1.9-stability`. Se mantiene una sola rama de implementación. Cambios de interfaz y coordinación; no se cambian las fórmulas ni los umbrales de los indicadores, el backtest ni la liquidación prospectiva auditada.

- Selección inicial de seis activos del catálogo, máximo doce, editable y persistida con la clave independiente `deriv_analyzer_room_v1`. Una selección intencionadamente vacía no se sustituye por los valores iniciales. Restauración inválida o fallo de escritura se notifican, sin anunciar un guardado inexistente.
- Importación deduplicada de pestañas de `https://dtrader.deriv.com/` cuyo parámetro `symbol` sea válido. No se interpreta el contenido de cuentas ni títulos ambiguos. Activación y enfoque de una pestaña coincidente; creación de una nueva si no existe. No se reescriben otras pestañas.
- Tarjetas principales solo para los seleccionados; hasta doce activos se escanean, con prioridad para la selección. Horizonte de cinco minutos, velas de un minuto y monitoreo automático tras conectar. El usuario puede pausarlo y se detiene al cerrar el panel.
- Alertas por símbolo/vela, sin repetir el aviso por cambios de dirección de esa vela. La vigencia técnica termina 60 segundos después del cierre de origen y no se confunde con el vencimiento prospectivo de cinco minutos desde el tick de entrada. Se muestra ESPERAR cuando caducan o no hay reloj fiable. Se recuerdan los últimos 240 IDs de alerta localmente.
- Alternativas limitadas a tres: señal vigente, puntuación ≥60 y ≥10 puntos sobre el mínimo vigente seleccionado (cero si ninguno), además de `back.enough`. Reemplazo únicamente mediante botón de aprobación y comprobación de vigencia al aprobar; no se realiza navegación automática por ranking.
- Aviso visible del resultado observado de 151 señales (75 aciertos, 76 fallos), ausencia de ventaja financiera demostrada y puntuación técnica distinta de probabilidad. Sin compras ni credenciales.
- Se conservan las 48 pruebas originales. Once nuevas pruebas cubren selección, persistencia, fallos de guardado, recomendaciones, vigencia, deduplicación, sugerencias caducadas, importación, activación y creación de pestañas.
- Validación: **59 pruebas aprobadas, 0 fallidas y 0 omitidas**; prueba DOM real en Chromium con API simulada aprobada. La prueba de navegador comprueba seis tarjetas iniciales, análisis de doce activos, alta/reemplazo/baja, importación, registro prospectivo, CSV y restauración de siete activos después de editar y recargar. Sin errores de página.
- Workflow ampliado para push a `feature/trading-room` y PR hacia `audit/v1.9-stability` o `main`; mantiene permisos de solo lectura y Node.js 20. El push solicita la ejecución automática. El estado remoto de Actions y la creación del PR dependen del acceso a GitHub, cuya API previamente devolvió `Forbidden`; no se equipara el pase local a una ejecución remota confirmada.

Sigue pendiente la validación como extensión instalada en Chrome autorizado y una sesión prolongada con datos reales. Los mocks de pestañas prueban el contrato de navegación, no la experiencia de una cuenta real de Deriv. No hay fusiones, releases, despliegues ni operaciones financieras.


## Corrección de sincronización de gráficos — base d767a98

Se mantiene `feature/trading-room` y se prepara una única actualización para el PR #2. Causa confirmada: la importación anterior hacía unión de símbolos de URLs con la selección. Cambiar una URL y repetir la importación podía conservar el símbolo viejo y añadir el nuevo, pasando de seis a siete. Además, si no había URL coincidente, «Abrir» creaba una pestaña aunque el activo pudiera existir como gráfico interno.

### Investigación y límite técnico

Se consultaron la página pública `https://dtrader.deriv.com/` y el código público `deriv-com/deriv-app`, revisión `580a898d07ffc9f2996b42660b29eab12be1578c`:

- `packages/trader/src/Stores/Modules/Trading/trade-store.ts`, líneas 598–618: lee un símbolo de `window.location.search` y estado `trade_store` de sesión. Una URL no representa un inventario de seis gráficos internos.
- Mismo archivo, líneas 1951–1973, y `packages/trader/src/Modules/Trading/Containers/trade-chart.tsx`, líneas 135–156: hay estado de layout y callbacks internos entre componentes del gráfico. No se encontró un contrato público compatible para enumerar todos los gráficos internos y activar uno por símbolo desde una extensión.
- Esto no acredita que el código público coincida exactamente con la interfaz desplegada del usuario. No se accedió a una cuenta, no se inspeccionaron credenciales ni se pulsaron botones financieros. No se implementaron heurísticas de DOM, inyección en stores privados ni asociaciones inventadas con posiciones de gráficos.

### Comportamiento corregido

- «Agregar activo manualmente» aumenta la selección únicamente por clic explícito, hasta doce; el valor se captura al hacer clic para que un doble clic no añada el siguiente elemento del desplegable.
- «Reemplazar» exige que el activo de origen siga seleccionado, conserva el número y rechaza duplicados. La restauración deduplica por símbolo antes de contar. No se recortan selecciones previas legítimas de siete o más: el usuario puede quitar el activo que considere sobrante.
- «Revisar gráficos de Deriv» solo muestra una referencia de URLs de pestañas Chrome y declara que los gráficos internos no están sincronizados. Nunca une esa lista con la selección. Se ofrece un reemplazo manual individual y explícito, con validación contra el catálogo.
- «Ir a Deriv (sin cambiar gráficos)» reutiliza una pestaña con URL coincidente o enfoca una de Deriv existente. No cambia la URL ni cierra o altera gráficos. La respuesta distingue URL coincidente de espacio de trabajo; no afirma haber activado un gráfico interno.
- Si no hay pestaña identificable, se ofrece una acción separada «Crear nueva pestaña de Chrome». La creación se serializa y vuelve a consultar pestañas para evitar duplicados por doble clic.
- Manifest V3 conserva exactamente `sidePanel`, `tabs`, `storage` y los permisos de host anteriores; no se añade `scripting` ni content scripts. Las funciones de enfoque de ventanas usan la API estándar sin nuevos permisos.
- Velas de un minuto, horizonte prospectivo de cinco minutos, indicadores, alertas, almacenamiento prospectivo y CSV no se modifican.

### Validación de la actualización

Se mantienen los 59 casos previos, actualizando la expectativa del caso que antes exigía crear una pestaña adicional cuando ya había Deriv abierto: ahora exige enfoque sin creación. Se agregan doce casos sobre conservación de seis activos, deduplicación, cambio de URL, inspección sin mutación, reemplazo explícito, doble clic, identificación parcial, navegación, creación explícita serializada, URLs pendientes de cargar y permisos MV3. La consulta incluye pestañas pendientes y filtra únicamente el origen exacto de Deriv, sin guardar ni registrar otras URLs.

Resultado de la validación completa: 71 pruebas aprobadas en Node.js 20.20.2, cero fallidas/omitidas; prueba Chromium con API simulada aprobada, sintaxis JS/CJS, YAML y `git diff --check` aprobados. El navegador verifica específicamente seis tarjetas tras reemplazar y revisar URLs, un aumento a siete solo tras «Añadir», vuelta a seis tras «Quitar» y restauración de seis al recargar. No acredita enumeración o activación de los gráficos internos reales: esa integración queda explícitamente no disponible.


## Comparador de duraciones — feature/duration-comparator, base a92d913

Actualización independiente, sin fusionar las ramas previas. Archivos principales: `comparator.js` (lógica pura), `comparator-ui.js` (coordinación y vista), integración acotada en `panel.js`/HTML, workflow, documentación y pruebas. Manifest y permisos no se amplían. EMA/RSI/MACD/ATR, alertas, selección, navegación y seguimiento prospectivo anterior conservan su comportamiento.

### Evidencia de API y reglas

Se consultó el endpoint público actual `wss://api.derivws.com/trading/v1/options/ws/public` sin autenticación: `{time:1}`, historial real de 30 ticks, historial solicitado de 6.000 y suscripción de `1HZ10V`. Se observaron respuesta temporal válida, 30 eventos históricos, dos eventos de suscripción con epoch/quote/symbol y el mismo ID de suscripción (no ID único de evento). La petición de 6.000 devolvió **1.000**, sin error. No se asume que el count solicitado sea garantizado ni que ese comportamiento sea un máximo universal o permanente. La aplicación limita su consulta manual a una ventana de 1.000 y declara la cobertura parcial; no pagina por segundos para inventar el orden de ticks con el mismo timestamp.

Retrospectivo de tiempo: validación auditada por cierres, último 30%, independiente por duración, sin solapamiento dentro de cada serie. Retrospectivo de ticks: señales causales calculadas sobre velas cerradas; primer evento > cierre y a ≤15 s, salida en índice de entrada +5/+10, usando exclusivamente la secuencia real devuelta por la API, sin ordenar ni filtrar registros inválidos. Una respuesta incompleta se rechaza entera. Los datos precalculados de los indicadores se verifican mediante prefijos.

Prospectivo: optativo, las seis duraciones habilitadas conjuntamente. Entrada observada de su propia suscripción después de la señal y margen de incertidumbre del reloj Deriv; el instante guardado es el epoch del tick (precisión de segundos). Minutos: último tick ≤ target, antigüedad máxima 15 s; espera un evento posterior y margen de cuatro segundos para confirmar la salida. Ticks: quinto/décimo evento posterior a la entrada, contando repeticiones válidas de precio/segundo. Sin secuencia global de eventos de la API, se afirma conteo del **flujo recibido sin interrupción**, no identidad con una liquidación contractual.

Solo tres flujos simultáneos y entradas del mismo símbolo separadas por más de diez minutos. Una señal sin capacidad no se registra ni se presenta como muestra evaluada; no se reconstruyen entradas pasadas. Timeout de entrada de nueve segundos y vigilancia de silencio de quince segundos. Un corte o evento inválido marca solo lo pendiente como incompleto; no modifica resultados resueltos. Tras reinicio se invalidan secuencias pendientes sin propietario vivo; otro panel con un Web Lock activo no se interrumpe por abrir una segunda vista.

Persistencia versionada y separada `deriv_analyzer_comparator_v1`, hasta 120 grupos, escrituras coordinadas por Web Lock y resultados terminales inmutables al fusionar. Versiones desconocidas fallan de forma cerrada. No se copian registros previos como si fueran nuevas modalidades; los CSV y resultados originales siguen intactos. Escrituras del flujo limitadas a una cada cinco segundos, además de las transiciones de resultado/entrada; no se guarda cada evento. Cachés retrospectivas limitadas a doce activos. Historial de ticks manual con una solicitud en curso y reutilización de ventana durante 60 s.

Wilson se calcula sobre aciertos/fallos, con empates contados aparte y sin considerarlos fallos ni victorias. Se muestra n total y n decisivo, sin tasa para n decisivo cero. Menos de 30 decisivos: insuficiente; resto: experimental. Todos los casos muestran «Sin ventaja demostrada». No hay umbral de rentabilidad ni selección automática de duración. Las comparaciones entre duraciones comparten entrada y no constituyen muestras independientes entre sí. Se advierte explícitamente de múltiples comparaciones y de la falta de ajuste de los intervalos puntuales. No se reoptimizan parámetros.

### Validación

- Comprobación adicional con datos públicos reales: 1.000 ticks y 800 velas cerradas normalizados por el módulo; 11 casos retrospectivos para 5 ticks y 11 para 10 ticks, ambos etiquetados correctamente como insuficientes. No son 22 muestras independientes: comparten señales de origen.
- **88 pruebas unitarias aprobadas en Node.js 20.20.2**, cero fallidas/omitidas: se conservan las 71 previas y se agregan 17 para duraciones, ticks idénticos, vencimientos, futuro/desorden, reloj, interrupciones, restauración no destructiva, deduplicación, exclusión temporal, Wilson y causalidad retrospectiva.
- Prueba Chromium con API simulada: sección adicional, resultados separados, ventana no válida indicada como insuficiente, recopilación optativa, quinto/décimo ticks resueltos, corte con cuatro evaluaciones temporales incompletas, CSV con fuente explícita, persistencia/recarga y seis activos conservados. Cero solicitudes de compra, venta, propuesta o autorización. Se corrigió una espera asíncrona incorrecta del test para comprobar el estado realmente guardado antes de exportar.
- Comprobación de sintaxis JS/CJS, YAML y `git diff --check` antes de crear el único commit. Workflow ampliado para push de la nueva rama y PR contra `feature/trading-room`; el resultado remoto requiere acceso a GitHub y no se deduce del pase local.

### Límites pendientes

Faltan pruebas de la extensión instalada y una sesión real prolongada que complete los cuatro horizontes de minutos; la cobertura temporal completa se simuló en las pruebas unitarias. La ventana de ticks históricos suele contener pocos casos y no acredita historial exhaustivo. El silencio de mercado puede invalidar un flujo válido pero no observable: se prefiere omitirlo. Los intervalos Wilson no corrigen selección de activos ni comparaciones múltiples. Los registros son análisis experimental, no contratos, cotizaciones ejecutables, pagos ni evidencia de rentabilidad.


## Lector adaptativo — feature/adaptive-chart-reader, base 8eaea0e

Nueva candidata separada para revisión, sin fusiones ni modificaciones de permisos. Archivos añadidos: `adaptive.js`, `adaptive-follow.js`, `adaptive-ui.js`, `tests/adaptive.test.cjs`. Integración aislada en panel/HTML, fixture de navegador, harness, documentación y workflow. Un error del lector se registra y no convierte en fallido el escaneo original.

### Metadatos y reglas fijadas

Se comprobó el catálogo público actual: `market=forex` y `underlying_symbol_type=forex`; `synthetic_index/range_index` para RB100/RB200; `synthetic_index/random_index/stockindex` para los códigos oficiales R_10/25/50/75/100 y 1HZ10/15/25/30/50/75/90/100V. Se verifican conjuntamente esos campos. No se usa el nombre como prueba de familia; códigos nuevos o metadatos ambiguos esperan revisión en lugar de recibir reglas arbitrarias. La clasificación histórica presupone que esos metadatos de familia siguen siendo aplicables al símbolo; no se dispone de un catálogo versionado por fecha.

Registro v1.0.0: `forex-structure`, `forex-retest`, `range-rejection`, `range-breakout`, `volatility-impulse`. Elegibilidad fija por familia, sin selección por rendimiento. Ventana causal de 240 velas de 1m. Agregación UTC de 5m/15m solo con todos los minutos, orden correcto y cierre completo; se exigen al menos seis bloques 5m y cuatro 15m recientes/contiguos, además de 61 minutos contiguos recientes. Comparación de cuatro cierres para contexto 15m y dirección 5m. Estructura HH/HL/LH/LL basada en pivotes 5m confirmados por dos velas a cada lado, con confirmación fechada al cierre de la segunda derecha; también se describen pivotes 1m. Ningún pivote se usa antes de conocerse y no se conectan vecinos a través de huecos.

Niveles: máximos/mínimos de veinte velas anteriores, excluyendo las dos del patrón actual. Margen de ruptura 0,1 ATR, proximidad/retest 0,3 ATR. Canal de investigación entre 1,5 y 8 ATR. Rechazo: mecha de al menos dos cuerpos y cuerpo confirmado; envolventes por cuerpos cerrados; indecisión si cuerpo ≤10% del rango. FOREX: contexto UTC 07–20 en días laborables y ATR/precio entre 0,000015 y 0,01. Volatility: tres cuerpos de igual dirección, impulso ≥ATR, cuerpo final ≥50% del rango y variación ATR actual/frente a quince velas atrás entre 0,5 y 2. Son umbrales heurísticos fijados, no calibrados contra porcentajes observados.

Se esperan datos si faltan marcos completos, hay contradicción 5m/15m, indicadores originales direccionales opuestos, indecisión o catálogo que indica cierre/suspensión. Los candidatos opuestos no se resuelven buscando la mejor tasa: el consenso queda ESPERAR. La explicación conserva patrones, niveles, contexto, estrategia y versión. La emisión real se distingue del cierre de origen; la caducidad es el siguiente minuto de ese cierre. El ID prospectivo usa la vela de origen y versión, no la hora cambiante de un recálculo.

### Evaluación y prospectivos separados

Tres conjuntos: original auditado intacto; lector con retrospectivos por regla y consenso más prospectivos propios; comparador de duraciones/ticks intacto. El nuevo benchmark comparte las mismas oportunidades cronológicas con el original: empieza después del 70% (y calentamiento mínimo de 240), horizonte de cinco minutos, sin solapamiento de resultados por serie. Se corrigió el redondeo decimal del corte usando `ceil`. No se entrenan ni ajustan reglas con ese tramo; es una partición histórica de referencia, no un conjunto externo independiente. Los indicadores originales se calculan causalmente y se pasan por índice al lector. Los flags actuales de mercado abierto/suspendido se eliminan del benchmark para no filtrar el pasado con información presente; en vivo sí se aplican.

Frecuencias: señales direccionales / cierres elegibles; no se confunden con muestras independientes de resultados. Wilson usa aciertos/fallos y cuenta empates aparte. Cada regla y el consenso tienen métricas retrospectivas por activo/horizonte. Los prospectivos se desglosan por productor/version, activo y retraso: no se mezclan estrategias distintas ni se atribuyen resultados a candidatos no emitidos. El comparador conserva métricas separadas. Los detalles declaran evidencia insuficiente y ausencia de ventaja; los porcentajes no son probabilidad futura y los intervalos no corrigen múltiples comparaciones.

Recopilación del lector optativa y por defecto apagada. Hasta tres flujos, solo seleccionados y sin cohortes solapadas durante 310 segundos desde la entrada. Se observa un tick propio después de emitir la hipótesis y margen del reloj público; no se admite entrada inicial tras caducidad. Original pareado de retraso cero y lector con retrasos 0/2/5 s, sin forzar direcciones si alguno espera. Cada retraso toma un tick recibido al superar ese umbral (tolerancia máxima 15 s) y vence 300 s después de su propia entrada. Último tick ≤ vencimiento con antigüedad ≤15 s, confirmado después; sin datos fiables se marca incompleto. Todos esos escenarios comparten origen y están correlacionados. La resolución temporal es de segundos de la API, no milisegundos inventados.

Persistencia `deriv_analyzer_adaptive_v1`, esquema 1, regla v1.0.0 en grupos y versión exacta del productor en cada entrada (original 1.9 o lector 1.0.0). CSV con fuente, estrategia, versión, horizonte, retraso, entrada, vencimiento y resultado. Web Locks coordinan flujos y escrituras; resultados resueltos no se reescriben al fusionar; reinicio/corte invalida solo pendientes sin propietario vivo. Versiones de almacenamiento desconocidas no se sobrescriben. Retención de 120 grupos eliminando primero completos; los registros y claves anteriores no se migran ni cambian.

Rendimiento: se reutilizan los OHLC/cache y la conexión públicos existentes, sin solicitudes de velas nuevas. Análisis local por ventana acotada, evaluaciones retrospectivas en una cola cooperativa, pausa cada 24 cierres y actualización como máximo cada diez minutos/activo. Caché de doce activos; tres flujos prospectivos y snapshots por cinco segundos o cambio de resultado. El lector no determina el ranking ni reemplaza activos ni estrategias automáticamente.

### Validación y límites

- 112 pruebas aprobadas en Node.js 20.20.2, cero fallidas/omitidas, incluidas las 88 anteriores: 24 nuevas sobre metadatos, patrones, pivotes confirmados, estructura, niveles, rupturas, rechazos, agregación UTC, faltantes, causalidad, partición temporal, disponibilidad presente sin fugas al pasado, versiones, resultados pareados, entradas demoradas, restauración, deduplicación, caducidad e aislamiento de errores.
- Prueba pública real: 599 velas cerradas para cada uno de 1HZ10V, RB100 y frxEURUSD, familia correctamente identificada y respuesta ESPERAR en las tres ventanas. Es una prueba de integración de datos, no una validación de resultados ni un porcentaje de precisión.
- Prueba Chromium con API simulada conserva seis activos, panel y comparador; verifica tarjetas/detalles, recopilación optativa del lector, entradas 0/2/5 s, interrupción, persistencia y CSV. La fixture direccional es sintética para comprobar el transporte y no acredita la estrategia en mercado.
- Sintaxis, YAML, `git diff --check` y ejecución completa se comprueban antes del único commit/push. Workflow ampliado para push a la rama nueva y PR contra `feature/duration-comparator`; estado remoto sujeto al acceso a la API GitHub, previamente Forbidden.

Pendiente: Chrome instalado autorizado, sesiones prospectivas reales prolongadas, frecuencia y resultados suficientes por regla y activo, costes/pagos/condiciones contractuales y validación externa independiente. No se ha demostrado mejora predictiva. Los pivotes y zonas son definiciones algorítmicas, no una interpretación visual infalible ni aprendizaje automático. No se ejecutan contratos ni se inspeccionan credenciales, botones o estado interno de cuentas.


## Simplificación del lector — feature/simple-chart-reader, base 5d25b05

Cambio de presentación y diagnóstico, no de reglas. `adaptive.js`, `adaptive-follow.js` e `indicators.js` se mantienen byte a byte idénticos a la base, comprobado por una prueba contra los blobs Git de `5d25b05`. No se relajan filtros, no se cambia v1.0.0, no se migran resultados históricos y no se ajustan umbrales a los resultados. Las reglas futuras deberán tener otra versión experimental.

### Una sola pantalla principal

«Mis N activos» respeta los seis iniciales, el máximo doce y la selección vacía intencionada. Una sola colección `article.room-card` contiene nombre, tendencia observada, señal del productor elegido, velas 1m y horizonte 5m, frase sencilla y acceso manual a Deriv. La emisión/vigencia solo existe en la tarjeta con señal vigente. La metainformación de emisión añadida al resultado original no participa en su cálculo ni seguimiento.

La tendencia es una lectura descriptiva de cuatro cierres completos de 5m (diferencia último/primero), separada de las confirmaciones. Puede ser ALCISTA aunque falten patrón, alineación, horario o reglas verificadas para confirmar. No se inventa LATERAL cuando faltan datos o reloj fiable. Las explicaciones traducen las causas en frases breves; los valores y motivos técnicos completos siguen accesibles.

Método principal predeterminado: lector adaptativo. Selección explícita del original en Avanzado, persistida en `deriv_analyzer_primary_method_v1`, sin cambiar qué fuentes recopilan prospectivos. No hay fallback ni mezcla de señales. Desacuerdo significa que los estados vigentes difieren, incluyendo que uno no confirme: se nombran ambos. Una preferencia restaurada tarde no sobrescribe una elección explícita del usuario. Alertas de pantalla y deduplicación identifican al productor visible; los registros anteriores conservan sus claves y resultados.

Sección secundaria de alternativas del original, etiquetada y con aprobación manual intacta. Avanzado plegado por defecto contiene lector detallado como lista (sin tarjetas duplicadas), comparador, selección del método principal, seguimiento original, logs, estadísticas y todos los CSV/controles anteriores. Pausar/activar monitoreo permanece accesible en la principal. No se amplían permisos, no se inspeccionan gráficos internos ni se ejecutan operaciones.

### Auditoría de la baja frecuencia

Nuevo módulo independiente `simple-reader.js`: modelos de presentación, tendencia descriptiva y contadores de diagnóstico. Se reutiliza exactamente el motor v1.0.0 sobre el mismo tramo reservado (último 30%, calentamiento 240, sin estado actual de mercado abierto/cerrado). Las oportunidades y frecuencias son cierres evaluados, no operaciones. El benchmark original y por reglas conserva sus resultados fuera del tramo inicial; este uso de histórico conocido no constituye validación externa independiente.

Se cuentan por activo y familia: oportunidades, señales lector/original y motivos presentes cuando no hay confirmación. Se incluyen contradicciones reales del motor y condiciones diagnósticas ausentes de sus candidatas. No son pruebas contrafactuales de que retirar un filtro mejore resultados, ni causas mutuamente excluyentes. Las sumas de motivos pueden superar el número de cierres. El cálculo es cooperativo, acotado y como máximo cada diez minutos por activo, sin solicitudes API adicionales. El diagnóstico no alimenta selección de métodos ni confirma señales.

Comprobación reproducida sobre la instantánea pública previamente consultada de 599 velas cerradas por activo, con 174 cierres de evaluación por activo:

| Activo / familia | Frecuencia lector | Frecuencia original | Resultados lector no solapados (aciertos/fallos/empates) | Resultados original no solapados |
| --- | --- | --- | --- | --- |
| 1HZ10V / VOLATILITY | 12/174 | 84/174 | n=9: 4/5/0 | n=21: 10/11/0 |
| RB100 / RANGE_BREAK | 1/174 | 58/174 | n=1: 1/0/0 | n=15: 3/11/1 |
| frxEURUSD / FOREX | 0/174 | 112/174 | n=0 | n=24: 11/12/1 |

Volatility: tres cuerpos no alineados en 127 observaciones no confirmadas; impulso inferior a ATR en 96; cuerpo menor a 50% del rango en 81; falta de alineación 5m/15m en 64. Range Break: faltan dos cierres fuera del canal en 165; precio alejado de niveles en 89; contradicción temporal en 45. FOREX: horario de estudio ausente en 169, ruptura previa no confirmada en 149, rechazo/envolvente ausente en 126, pivotes 5m direccionales insuficientes en 95. Esos conjuntos se solapan y describen solo esta ventana, no una distribución universal ni resultados futuros.

En particular, el caso favorable de una única muestra de Range Break no permite escogerlo como ganador. Todas las muestras del lector son insuficientes para afirmar utilidad; Wilson sigue disponible únicamente como estadística descriptiva por serie en Avanzado. Ni estos datos ni sus contadores cambian una regla de confirmación.

### Validación

125 pruebas aprobadas en Node.js 20.20.2, cero fallidas/omitidas: 112 previas y trece nuevas de modelo/estados, observación cerrada, no fallback, identificación del productor, desacuerdo, expiración, ausencia de reloj/datos, explicación sencilla, contadores no exclusivos, agregación por familia, ausencia de fuga de disponibilidad presente, invariancia de los archivos de reglas y restauración tardía de preferencias.

La prueba de navegador aprobada verifica Avanzado inicialmente cerrado, estadísticas/logs ocultos, seis tarjetas globales, tendencia alcista con SIN CONFIRMACIÓN, desacuerdo y elección explícita de productor, horas únicamente con señal, caducidad, restauración de preferencia, edición/importación/reemplazo, lector y comparador prospectivos, CSV y persistencia. Los estados visuales dirigidos usan una fixture de presentación, no nuevas reglas ni una estimación de precisión de mercado. No se usan compras, ventas, propuestas o autorización de cuenta.

Se comprueban sintaxis JS/CJS, YAML y `git diff --check` antes del único commit/push. Workflow ampliado para push a `feature/simple-chart-reader` y PR a `feature/adaptive-chart-reader`. El resultado remoto de Actions requiere acceso a la API GitHub, previamente Forbidden, y no se infiere del resultado local.

Limitaciones: los bloqueos medidos son diagnósticos retrospectivos no exclusivos; la familia se atribuye con metadatos actuales verificados, no catálogo histórico versionado. La tendencia no mide fuerza ni probabilidad, y pequeñas diferencias de cierres pueden dar un sesgo direccional sin señal. Continúan pendientes Chrome instalado y prospectivo real prolongado con reglas fijas y validación externa. Sin ventaja financiera demostrada, sin fusiones, releases ni despliegue.

## Candidata v2.0 — escáner multiactivo (2026-11-18)

Base comprobada: `feature/simple-chart-reader` / `3725728`. Rama exclusiva `feature/intelligent-market-scanner`. Una única actualización coherente, sin tocar `main`, fusionar, desplegar ni publicar releases. Los apartados anteriores describen evidencia histórica de otras ramas; este apartado registra la candidata actual.

### Cambios y decisiones

- Registro independiente de once métodos con versión, familia, requisitos, confirmación, abstención y explicación. Forex EMA20/50 15m + estructura 5m + rechazo 1m; rupturas confirmadas; Range Break canal/rechazo; tres candidatos Volatility separados. `adaptive.js`, `adaptive-follow.js` e `indicators.js` permanecen idénticos a la base. Los observadores Boom/Crash, Jump y Step siempre se abstienen de predecir. Nombres y números comerciales no sustituyen metadatos ni predicen el próximo evento.
- Cola de todo el catálogo compatible, dos trabajadores por defecto, presupuesto deslizante global de 36 solicitudes de datos/60 s y separación mínima 200 ms. Ajustes validados 12–120 y uno–tres trabajadores. Se reutiliza la paginación y caché incremental auditada; caché de velas limitada a 120 símbolos, sin excluir el resto de la cola. Reintentos de datos a 30/60/300 s, catálogo renovado cada cinco minutos, prioridad a favoritos/tarjetas y paso periódico a no favoritos para evitar inanición. Conexión, reloj, heartbeat y `forget` conservan su ruta auditada. El presupuesto no retrasa reloj/ping/catálogo/forget.
- Dos vistas con exclusión por Web Lock, comando/respuesta por BroadcastChannel y una conexión por sesión. Solo el propietario consulta Deriv o recopila. La vista espejo recibe catálogo, resultados y reloj; los detalles grandes se solicitan al abrir Avanzado. Exportaciones remotas se descargan en la vista solicitante; el comparador conserva activo/modalidad/duración solicitados. Una ventana existente se reutiliza y las aperturas se serializan. Cerrar el propietario detiene el transporte antes de liberar el control; el siguiente reconecta. Los flujos interrumpidos no se reconstruyen.
- Sala dinámica de hasta siete, con señales vigentes fijadas en su lugar, sin ranking por score o tasa histórica; evidencia contabilizada por el mismo productor/versión y retraso cero. Vencimiento o revocación en una vela impide reactivarla por reescaneo. Estados separados de cierre, conexión, errores, antigüedad, observación y familia desconocida. Tabla completa incluye también mercados pendientes, búsqueda/familia/vigencia y antigüedad. Vista compacta oculta inicialmente las tarjetas de favoritos, accesibles mediante botón.
- Favoritos manuales independientes, inicialmente seis, máximo siete, reordenables y guardados mediante Web Lock. Migración no destructiva a nueva clave: conserva lista completa anterior, notifica el excedente y no borra el almacenamiento anterior. Detección de URLs de Deriv no cambia selección ni afirma detectar gráficos internos. Los registros/CSV anteriores conservan sus fuentes y claves.
- Evaluación temporal cooperativa con desarrollo/validación/reservado (50/20/30), purgas de cinco barras y resultados no solapados por serie. Es retrospectivo con cierres de referencia, no ejecución. Seguimiento v2 separado y optativo, original pareado y retrasos observados 0/2/5 s, registros incompletos ante interrupción; CSV y estadísticas por activo, método, versión, fuente y retraso. Las tasas/Wilson no se usan como probabilidades ni como prueba suficiente de ventaja. No hay optimización automática.
- Economía separada: sin datos declarados como observados se muestra «Rentabilidad no evaluable». Con inversión/pago total/moneda solo calcula equilibrio teórico, sin atribuir ese pago a muestras pasadas ni verificarlo en una cuenta.

### Fallos encontrados durante la integración

La prueba DOM detectó `Illegal invocation` al usar temporizadores nativos como métodos del coordinador de vistas. Se sustituyeron por funciones que conservan el contexto correcto; se volvieron a probar comandos, CSV y relevo. Se corrigió también la persistencia de los casos incompletos al adquirir el control después de cerrar la otra vista: antes se interrumpían en memoria pero podían permanecer pendientes en disco. Las instantáneas guardadas no se presentan como conexión viva antes de recibir al propietario. El catálogo se deduplica por símbolo y retira resultados de mercados que ya no anuncia, conservando la selección manual. El presupuesto se cambió a ventana realmente deslizante, para evitar ráfagas dobles en un límite fijo. Se impide registrar una entrada del sistema original que llegue más de 90 s después del cierre analizado tras esperar presupuesto. Cancelar una tanda no deja su señal abortada ligada a las consultas manuales posteriores. En v2 tampoco se permite entrar con retraso tras caducar la señal ni iniciar otra cohorte mientras haya escenarios pendientes o dentro de un vencimiento real anterior. El ranking no puede reactivar una confirmación revocada en la misma vela. Las pruebas también corrigieron fixtures OHLC inválidos y símbolos de un carácter que no acepta la selección real.

### Evidencia y límites

- Suite offline en Node.js 20: **163 pruebas**, incluidas las 125 anteriores, sin fallos ni omitidas. Se añaden clasificación/once reglas, entradas positivas y abstenciones, causalidad por prefijos, velas incompletas/antiguas, purgas, ranking/siete/pins, caducidad/revocación, migración y separación de almacenamiento, presupuesto deslizante/cancelación, cola sin inanición, estadísticas separadas, dos vistas/relevo/comandos, ventana reutilizada, permisos MV3 y entrada original retrasada.
- Navegador Chromium con DOM real y APIs Chrome/Deriv simuladas: dos documentos de un mismo origen, máximo un WebSocket activo, relevo con reconexión, favoritos compartidos, tabla/búsqueda/filtros, exportación remota, lector y comparador anteriores, retrasos, desconexión, persistencia y recarga. La prueba usa explícitamente 120 solicitudes/min para abreviar el reloj real; la unidad prueba el presupuesto independientemente. **PASS**, sin errores de página.
- Consulta pública real mediante `tests/live-market-smoke.cjs`: **PASS**, catálogo 95; 13 Volatility, 25 Forex, 2 Range Break, 20 Boom/Crash, 5 Step, 5 Jump, 25 desconocidos. Se consultaron OHLC de `1HZ10V`, `RB100`, `frxEURUSD`, `BOOM1000`, `stpRNG`, `JD10`: entre 976 y 999 velas cerradas aceptadas por muestra, y 1.000 ticks reales de Step. Se descartaron abiertos/futuros respecto al reloj consultado. Los seis resultados fueron SIN CONFIRMACIÓN en esa instantánea: no se relajaron reglas ni se inventó rendimiento. Esta consulta demuestra compatibilidad del formato público, no fiabilidad prolongada ni beneficio.
- Sintaxis JS/CJS, manifiesto JSON, workflow YAML y `git diff --check`; verificación de identidad de módulos de reglas previos. Actions incorpora push de esta rama y PR hacia la base, con Node 20, sintaxis, espacios y suite offline. El estado remoto solo puede afirmarse si GitHub permite consultarlo.

Pendiente: carga instalada en Chrome autorizado (la política administrada bloquea extensiones descomprimidas), pruebas prolongadas con API real, suspensión/reinicio real, cuotas reales del servidor, disponibilidad contractual y evidencia prospectiva independiente. No se verifican noticias, pagos ni gráficos internos. La cola puede tardar varios minutos y no observa todas las velas de todos los mercados; frecuencia histórica y muestras prospectivas selectivas no equivalen a una tasa poblacional. Los flujos de los módulos optativos comparten conexión/presupuesto, pero añaden carga y pueden quedar incompletos al interrumpirse. Sin vistas abiertas no hay monitoreo. No se ha demostrado ventaja financiera.

Archivos: cuatro módulos `market-*`/`scanner-ui.js`; integración `panel.js`, `panel.html`, `room-ui.js`, `adaptive-ui.js`, `comparator-ui.js`, `background.js`, `style.css`, `manifest.json`; workflow; suite nueva `market-scanner.test.cjs`, navegador y prueba pública; `README.md`, `STRATEGIES.md`, `INSTALL.md` y este registro.

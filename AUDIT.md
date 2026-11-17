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

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

No se publican cambios del entorno, no se hace push y no se fusiona ninguna rama durante esta auditoría.

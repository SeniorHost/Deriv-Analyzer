# Informe completo AUTO DEMO v2.2

ZIP almacenado sin compresión, codificación UTF-8 y CRC32 estándar, creado localmente sin dependencias. Conserva estos nueve archivos y agrega los siete descritos abajo (16 en total):

| Archivo | Contenido |
|---|---|
| resumen_general.json | Sesión actual y configuraciones de todas las sesiones, métricas virtuales, grupos por activo/método/familia/hora UTC, errores/detención y declaración explícita de ausencia de cuenta/contratos DEMO |
| operaciones.csv | Todas las posiciones virtuales, método/version, inversión/pago de propuesta, emisión/entrada/vencimiento/salida, precios, neto/saldo posterior, fuente de salida e ID oficial nulo |
| senales_analizadas.csv | Lecturas recibidas: fuente temporal, método/version, dirección, vigencia, contexto de evidencia, estado y decisión |
| decisiones_no_operadas.csv | Lecturas que no terminaron en posición virtual; no se confunden con compras rechazadas reales |
| historial_saldos.csv | Libro virtual por sesión, marca UTC y origen declarado/resultado; nunca saldo de una cuenta |
| eventos_sistema.csv | IDs, UTC, estado, activo, método/version, motivo seguro, descripción y cambios de configuración antes/después |
| resultados_por_activo.csv | Conteos y neto virtual por activo sobre todas las sesiones |
| resultados_por_estrategia.csv | Conteos y neto virtual agrupados por identificador y versión, separados |
| informe_general.html | Informe autónomo sin scripts ni recursos remotos; gráfico SVG de saldo virtual, tablas de activos/métodos/familias/horas, operaciones e incidencias |

CSV usa comillas dobles, comillas internas duplicadas y separadores de línea CRLF; los campos de texto que pudieran iniciar fórmulas se prefijan con apóstrofo. Los importes son USD; los timestamps numéricos son segundos Unix UTC, y `utc` usa ISO 8601. Datos no disponibles se exportan vacíos o `null`, nunca como saldos/pagos inventados. Las configuraciones son JSON en las columnas correspondientes.

`source=SIMULACION_PROPUESTA_OBSERVADA` no equivale al retrospectivo del lector ni a un contrato DEMO. Un acierto usa pago observado menos inversión; fallo/empate estricto pierde la inversión virtual. `exitBasis` identifica ticks observados en flujo o consulta histórica posterior. No se acreditan resultados pendientes; mantienen exposición. El gráfico y resumen se refieren a la sesión actual; operaciones, eventos, CSV y configuraciones conservan el historial completo.

La referencia de equilibrio, cuando hay propuestas, es `suma(inversiones)/suma(pagos)` y se presenta descriptivamente, sin asumir que los pagos se mantienen o son independientes del resultado. Sin propuestas es **Rentabilidad no evaluable**. No calcula rentabilidad de una cuenta ni atribuye pagos reales al backtest. La comparación con DEMO ejecutado dice no disponible porque no hay esa evidencia.

No contiene tokens, OTP, contraseñas, respuestas privadas ni otros almacenes de la extensión. Los datos no son una certificación oficial. El ZIP permite conservar y analizar resultados, pero no reactivar una sesión ni importar operaciones automáticamente. El HTML se validó sin red en Chromium; abrir un archivo local en un navegador autorizado sigue pendiente por la política administrada de este entorno.

## Archivos adicionales v2.2

| Archivo | Contenido |
|---|---|
| diagnostico.json | Salud, incidentes saneados y evaluación prospectiva/sombra separadas |
| errores.csv | Incidentes críticos, UTC, fase, sesión, contexto, stack disponible y acción |
| conexiones.csv | WebSocket, pérdidas de conexión y reconexiones |
| rendimiento.csv | Timeouts, workers y pausas de heartbeat |
| sesiones_interrumpidas.csv | Aperturas y recuperaciones de vistas e interrupciones detectadas |
| posiciones_virtuales.csv | Instantáneas técnicas, retrasos y orden real de liquidación |
| evaluacion_estrategias.csv | Diez dimensiones, pendientes/incompletas, Wilson, ROI virtual, rachas y caída |

La sombra no cotiza propuestas: sus importes y ROI son no evaluables, no cero económico. La rentabilidad virtual de posiciones activas usa el pago público observado; no acredita compras ni liquidaciones oficiales. Wilson supone independencia y puede subestimar incertidumbre en señales correlacionadas. Los CSV mantienen escape de fórmulas.

Si falla el worker de informes se ofrece un JSON de emergencia con el libro en memoria y diagnóstico; no se afirma que sea el ZIP de 16 archivos. Si el libro no pudo validarse, la copia de emergencia se sanea y se marca como no validada; el almacenamiento original se conserva.

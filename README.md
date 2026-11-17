# Deriv Analyzer v1.9 — estabilidad de conexión y hora de Deriv

## Correcciones tras la prueba real de v1.8

- Las dos señales prospectivas observadas en la v1.8 (`1HZ10V` y `1HZ30V`) demostraron que el registro ya funciona; fueron almacenadas en `chrome.storage.local`. Esta versión usa la misma clave `deriv_analyzer_forward_v16`, por lo que se mantienen mientras se cargue como **actualización de la misma extensión** (no si se instala como extensión nueva o se elimina la anterior).
- Se envía `ping` cada 30 s para evitar cierres por inactividad (documentación oficial de Deriv).
- Si se corta la conexión estando el monitoreo activado, se reintenta conectar de manera controlada hasta 6 veces (2, 4, 8, 16, 30, 30 s), sin enviar órdenes.
- Se consulta `{time:1}` al conectar y cada 5 minutos para estimar la diferencia entre reloj local y servidor. Los filtros de velas recientes, cotización observada y vencimientos usan esta hora sincronizada. Si no está disponible, se permite una tolerancia máxima de 5 s para cotizaciones adelantadas en el reloj local, sin inventar precios.
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

Verificación local: sintaxis JS + tests simulados; falta prueba real con la API desde Chrome.

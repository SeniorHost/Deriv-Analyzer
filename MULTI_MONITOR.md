# Monitor virtual v2.2

Base: `fix/auto-demo-responsive` / `2a6381e`. Rama candidata: `feature/auto-demo-multi-monitor`. Sin autenticación ni compras; `panel.js` sigue rechazando solicitudes privadas, incluso si se invocan desde consola. No cambia ninguna fórmula o parámetro de estrategia.

## Uso

Abre la vista completa, conecta los datos públicos y comprueba los límites virtuales. La configuración inicial es 9.989 / 9.900 / 10.500 USD, inversión fija de hasta 2 USD, seis posiciones y exposición máxima de 12 USD. Puedes reducir capacidad/exposición; una capacidad superior a seis permanece bloqueada. Guarda cambios antes de confirmar e iniciar. Una sesión antigua conserva sus propios límites: ampliar su configuración requiere guardar explícitamente una nueva configuración, sin exposición pendiente.

Las seis tarjetas muestran posiciones pendientes primero y, en los espacios libres, los últimos resultados de la sesión. El resumen cuenta tanto posiciones como reservas previas a las consultas. Las posiciones incompletas conservan exposición. Detener bloquea nuevas entradas inmediatamente, cancela reservas/consultas sin posición y conserva la vigilancia de las posiciones existentes. No se pueden iniciar sesiones nuevas con exposición pendiente.

La lista de candidatos distingue rechazo por capacidad o activo ocupado. No vende/cierra posiciones para admitir otro candidato. Cada señal/vela/método/sesión se evalúa una vez; una actualización visual no vuelve a consultar. El radar mantiene su renderizado por símbolo y los siete favoritos manuales independientes.

## Flujo y reservas

`AUTO_MULTI.Engine` extiende el libro v2.1, que conserva sus defaults y pruebas originales. La cola agrupa lecturas del mismo turno visual y usa orden lexicográfico fijo: integridad, contradicciones, revocación, cierre más reciente, número de confirmaciones, disponibilidad del contexto, número de cohortes prospectivas (no su tasa), método y símbolo. La cola no espera a completar un escaneo. El orden entre tandas diferentes es el de llegada; no intenta predecir candidatos futuros ni desplazar posiciones abiertas.

La reserva ocurre sin `await`, antes de cotizar disponibilidad/propuesta. Se suman reservas, pendientes e incompletas para plazas, exposición y límite inferior. Una reserva se consume solo al observar un tick posterior a la emisión y compatible con la propuesta pública fresca. Se cancela ante detención, pérdida de conexión o rechazo; las respuestas tardías comprueban generación/sesión. No hay reintentos automáticos de una entrada ambigua ni entradas históricas. La cuota pública y el WebSocket del coordinador siguen compartidos. Agotar la cuota puede impedir cotizar antes de que caduque una señal: se registra, sin saltarse el presupuesto.

La falta de precio de una posición genera INCOMPLETA sin detener las otras. Una pérdida global de conexión/reloj o persistencia detiene nuevas entradas. El orden monotónico de liquidación permite validar saldos aunque seis vencimientos se resuelvan en orden distinto al de creación. Un empate de precio pierde la inversión en este modelo Rise/Fall estricto y queda contado como empate, separado de los fallos direccionales.

## Investigación

Cada posición nueva conserva indicadores calculados con velas cerradas, contexto descriptivo de 15m, estructura de 5m, forma de 1m, niveles previos, contradicciones, calidad y retraso de entrada. Los niveles son referencias observadas: no se afirma que todo método utilice los mismos niveles. La puntuación del radar procede del TA original; se etiqueta explícitamente como no probabilística y no califica el método adaptativo.

La evaluación continua separa resultados virtuales prospectivos de retrospectivos y agrupa por diez dimensiones. Los pendientes e incompletos no entran en la tasa observada ni en Wilson/ROI. El neto y ROI se basan en pagos de propuestas observados, no en ejecución. La caída de un grupo usa su propio neto acumulado en orden de liquidación. No se atribuyen causas a un indicador, no se elige un método por su rentabilidad y no se ajustan parámetros automáticamente.

La casilla de sombra está apagada al abrir la vista. Al habilitarla observa candidatos alternativos confirmados en los mismos activos/ticks de las posiciones admitidas. No añade consultas, reservas, decisiones activas ni pagos ficticios. Su cobertura está condicionada a esas entradas activas: no es una comparación independiente ni un recorrido completo de todos los métodos. Los importes/ROI de sombra permanecen no evaluables. En un reinicio sus pendientes quedan incompletos.

## Diagnóstico, persistencia y límites

SALUD DEL SISTEMA registra errores JS/promesas, solicitudes, workers, conexión, almacenamiento, comandos y restauraciones. Heartbeat independiente de `requestAnimationFrame`: una pausa superior a cinco segundos suspende nuevas entradas, conserva exposición y requiere revisión/inicio explícito. Un worker agotado se termina y puede recrearse; el escritor agrupa revisiones y falla cerrado. Los diagnósticos ordinarios se limitan a 300 y se informa el descarte; no se truncan incidentes críticos únicos. Los críticos repetidos consecutivos se agrupan con contador. La cuota local sigue siendo finita: exporta periódicamente.

El beacon y diagnóstico se guardan aproximadamente cada diez segundos, exclusivamente por el coordinador. Un cierre sin beacon de cierre confirmado se informa como interrupción posible, no como causa probada de un crash. Una congelación completa, suspensión de Chrome o falta de cuota puede impedir escribir el último incidente. Al recuperar una vista nunca se reanudan entradas automáticamente. Un diagnóstico antiguo inválido no se sobrescribe silenciosamente. Las cadenas se sanean y se excluyen credenciales/cookies/endpoints.

El libro mantiene la clave `deriv_auto_demo_v21` con schema 2. Antes de migrar schema 1 se conserva una copia inmutable en `deriv_auto_demo_v21_legacy_v21`; los IDs, sesiones, importes y resultados anteriores no se borran. La copia de respaldo requiere cuota adicional. No instalar una versión antigua encima de un libro schema 2 esperando que interprete el formato nuevo. La restauración valida registros; datos desconocidos bloquean entradas y pueden descargarse saneados como copia de emergencia.

No existe monitoreo al cerrar todas las vistas ni garantía de liquidar sin ticks públicos fiables. La reconciliación es una consulta histórica de salida, nunca un cambio de entrada. Chrome real debe probarse con la extensión instalada: las pruebas de esta auditoría ejecutan el DOM y workers en Chromium con APIs públicas y almacenamiento simulados, sin sortear la política administrada que impide cargar extensiones en este entorno.

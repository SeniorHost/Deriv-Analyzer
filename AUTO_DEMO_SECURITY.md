# Seguridad de AUTO DEMO v2.1

## Alcance entregado

Solo simulación automática optativa. No existe integración de autenticación operativa ni transporte privado. `AUTO_DEMO.buyEnabled` es `false` en código, `Engine.buy()` y `activateDemo()` siempre rechazan y la capa de envío solo acepta operaciones públicas expresamente enumeradas. No hay opción, token almacenado, ajuste local o botón que habilite compras. Cambiar esto exige otra implementación, autorización posterior y revisión independiente.

No se conectaron cuentas reales ni demo. No se solicitan contraseñas, tokens ni OTP. Los saldos de cuenta confirmados/disponibles y el patrimonio real permanecen **no disponibles**, no en cero. El saldo de US$9.989 es una declaración para un libro virtual independiente. `verifyDemo` es un contrato de validación puro probado con fixtures, no prueba de que exista una sesión autenticada.

## Investigación oficial y transporte

Se intentaron las referencias solicitadas el 18-11-2026:

- https://developers.deriv.com/docs/intro/authentication/
- https://developers.deriv.com/docs/trading/proposal/
- https://developers.deriv.com/docs/trading/buy/
- https://developers.deriv.com/docs/best-practices/

El proxy devolvió **403 Forbidden** para esas páginas; no se declara verificado un flujo OAuth, registro de aplicación, scopes o autenticación vigente. Por eso se aplica la alternativa expresamente permitida: entregar solo simulación y documentar requisitos pendientes.

Sí se comprobó por una conexión externa de solo lectura el endpoint público `wss://api.derivws.com/trading/v1/options/ws/public`: `time`, `contracts_for` y `proposal`. La API rechazó `currency` en `contracts_for` y el nombre antiguo `symbol` en propuestas; se comprobó la forma sin moneda en disponibilidad y `underlying_symbol` en propuesta. Una respuesta pública observada contenía CALL de cinco minutos, inversión 2 USD y pago 3,91 USD. Ese dato fue una instantánea de investigación; **no se fija como pago en el código ni se usa como rendimiento**.

La aplicación reutiliza exclusivamente el WebSocket del escáner y su presupuesto global, incluyendo disponibilidad, propuestas y suscripción de precios. No vuelve a descargar velas para analizar. Disponibilidad se cachea por símbolo hasta cinco minutos; se pide una propuesta nueva por candidato admitido. Las propuestas no ejecutan contratos. La lista de operaciones de envío es `ping`, `time`, `forget`, `active_symbols`, `ticks`, `ticks_history`, `contracts_for`, `proposal`; parámetros desconocidos o endpoints privados se rechazan antes de enviar. Se comprueba también el envío directo `requestNow`.

Las propuestas deben coincidir con activo, CALL/PUT, USD, inversión fija, cinco minutos, barrera en spot y pago mayor que inversión. Vigencia máxima diez segundos. Se admite una incertidumbre de dos segundos en timestamps públicos, coherente con la precisión de reloj/ticks, no una vela futura. La entrada virtual usa un tick recibido después de la emisión y después de la propuesta; el vencimiento es cinco minutos desde ese tick. El pago cotizado puede cambiar: la simulación no reproduce un contrato ejecutado ni garantiza ese precio de ejecución.

## Límites y estados

Instalación: APAGADO. Solo una acción explícita y confirmación del saldo/límites virtuales inicia SIMULACIÓN. PREPARADO y ACTIVO DEMO son estados reservados, sin ruta de activación. DETENIENDO bloquea inmediatamente entradas pero mantiene vigilancia; DETENIDO y ERROR nunca reanudan automáticamente.

Defaults: inicial 9.989 USD, inferior 9.900, superior 10.500; inversión fija y exposición máxima 2 USD, una posición, duración 300 s. Los límites solo se cambian sin sesión activa ni exposición pendiente; cada cambio conserva configuración anterior/nueva y cada sesión guarda una copia. No hay martingala ni aumentos por pérdida.

El libro conserva saldo realizado virtual sin descontar dos veces la inversión: reserva la inversión mientras está pendiente y calcula disponible = saldo − exposición. Solo permite una entrada si la pérdida máxima deja saldo ≥ límite inferior. Cuando disponible alcanza el límite, lo atraviesa una posible entrada o se alcanza el objetivo, detiene nuevas entradas. Esto no garantiza acabar exactamente en un límite. No cierra contratos oficiales, porque no existen.

Una cotización empatada se registra EMPATE de precio, pero pierde la inversión virtual bajo el modelo Rise/Fall **estricto**; no se inventa reembolso. Un acierto acredita pago observado menos inversión. Las pérdidas/ganancias se realizan solo después de un precio de salida observado ≤ vencimiento y a ≤15 s de antigüedad. No se calcula beneficio provisional ni patrimonio sin datos suficientes.

Los métodos sin evidencia siguen siendo observacionales. La simulación puede recopilarlos, señalando esa falta; ninguna cantidad de casos, score o tasa habilita compras. Se mantienen once estrategias sin ajustes y todos los registros históricos/prospectivos previos separados.

## Fallos, persistencia y varias vistas

Un solo propietario por Web Lock ejecuta el motor y persiste `deriv_auto_demo_v21`. Las vistas espejo reciben estado/precios y envían controles al propietario; pueden filtrar historial y descargar su informe. La vista de control se invalida inmediatamente al asumir un relevo, antes de cualquier espera de reconexión. Al cerrar/reiniciar/relevar se recupera DETENIDO/DETENIENDO y los pendientes quedan INCOMPLETA; no se reinician entradas. Las propuestas retenidas, caducadas o canceladas se vuelven a comprobar antes de crear una posición.

Un corte bloquea entradas inmediatamente, marca datos no actualizados y conserva la exposición. Para pendientes virtuales, la reconciliación puede leer ticks históricos al llegar al vencimiento, sin fabricar una nueva entrada y sin reactivar el motor. Fallar o no hallar salida fiable conserva el pendiente y reintenta solo la consulta de vigilancia tras 30 s. Un resultado de compra desconocido se modela como ERROR para una futura integración; no hay reintento de compra implementado.

Se valida esquema, campos, configuración, métodos y coherencia entre precios, resultados y saldo virtual al restaurar/exportar. Los datos anteriores del radar/lector/comparador no se migran ni se borran. No hay truncamiento automático de eventos o decisiones. El almacenamiento local tiene cuota y puede fallar: en ese caso se detiene el motor, se indica **solo en memoria**, no se inician entradas y debe descargarse el ZIP antes de cerrar. No se puede prometer durabilidad de un dato que Chrome rechazó. No existe importador automático del ZIP.

Los registros nuevos seleccionan campos permitidos; no copian respuestas de autenticación ni mensajes arbitrarios del servidor. CSV neutraliza fórmulas en texto; HTML escapa contenido, no ejecuta scripts y no descarga recursos. ZIP es local, sin librerías remotas. Los datos locales son editables por su propietario: estas validaciones no sustituyen una auditoría de cuenta oficial ni certifican criptográficamente el historial.

## Antes de una futura integración DEMO

Queda pendiente verificar documentación y aplicación oficial, mecanismo de autorización mínimo, cuenta DEMO probada por el servidor (no inferida de prefijos), USD y saldo fresco, confirmación explícita si difiere de 9.989, portfolio/movimientos, exposición oficial y reconciliación tras resultado incierto. Deben validarse esquema/correlación/idempotencia, scope de token, protección de secretos, balance/contract subscriptions y adquisición/renovación segura de credenciales en MV3. Nada de ello se suplanta con el libro virtual.

No se ha instalado la extensión en Chrome autorizado ni realizado una sesión prolongada real con propuestas. Chromium administrado bloquea extensiones y navegación `file://`; se prueba el DOM con APIs simuladas y el contenido del HTML sin conexión mediante `setContent`, sin alterar políticas. No hay monitoreo con todas las vistas cerradas ni garantía de temporización durante suspensión del equipo. No se demuestra ventaja financiera.

## Corrección de respuesta de interfaz sobre b738100

La detención aplica primero un bloqueo en memoria/generación de sesión, cancela consultas sin posición y comunica una intención urgente a las otras vistas y a una clave local pequeña. No espera al guardado completo ni a un comando normal pendiente. Las continuaciones viejas no pueden iniciar una entrada tras detener o reiniciar explícitamente otra sesión. Un corte/relevo tampoco reanuda el motor.

Cálculos del escáner/retrospectivos y validación/exportación usan dos trabajadores empaquetados de cómputo, solo en la vista propietaria. No tienen sockets ni almacenamiento. Las mismas funciones de indicadores y estrategias permanecen intactas y se contrastan con resultados directos. No son motores de operaciones ni conexiones adicionales. Si el trabajador no responde, se falla cerrado; no se vuelve a bloquear la interfaz calculando sincrónicamente.

La persistencia agrupa revisiones en un único escritor: no copia ni revalida todo el historial por cada señal duplicada. Cada espera se resuelve solo tras guardar su revisión, con plazo de diez segundos; un éxito tardío después de ese plazo no vuelve a habilitar el motor. No se elimina ningún registro para reducir carga. Un cierre forzado antes de que Chrome confirme un guardado puede perder datos todavía en memoria: la fecha y revisión guardadas se muestran separadas de la actividad de la vista.

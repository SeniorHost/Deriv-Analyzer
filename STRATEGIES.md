# Registro de hipótesis v2.0

Implementación: `market-strategies.js`, revisión experimental `2.0.0-exp1`. Se conserva byte a byte `adaptive.js` con `volatility-impulse@1.0.0`, además de los indicadores y el seguimiento anteriores. Las reglas nuevas son hipótesis propias de investigación construidas con herramientas técnicas habituales; no son estrategias oficiales de Deriv ni reproducen un estudio publicado que demuestre ventaja.

| Identificador | Versión | Familia | Historial mínimo | Condición fijada |
|---|---|---|---|---|
| volatility-impulse | 1.0.0 | Volatility | 240 cierres 1m | Regla adaptativa anterior intacta |
| volatility-mtf | 2.0.0-exp1 | Volatility | 240 | Diferencia entre cuatro cierres completos 5m/15m alineada; tres cuerpos 1m direccionales, último cuerpo ≥50% del rango, cierre sobre/bajo EMA20 |
| volatility-ema-atr | 2.0.0-exp1 | Volatility | 240 | EMA9/21, tres cuerpos del mismo signo, desplazamiento ≥1,5 ATR14; ATR actual/ATR de hace 14 barras entre 0,5 y 2; cuerpo ≥50% |
| volatility-bos | 2.0.0-exp1 | Volatility | 240 | Pivotes confirmados 5m HH/HL o LH/LL y ruptura con dos cierres |
| forex-ema-pullback | 2.0.0-exp1 | Forex | 900 y 50 bloques 15m completos contiguos | EMA20/50 de 15m, HH/HL o LH/LL 5m, retroceso a EMA20 1m dentro de 0,3 ATR y rechazo o envolvente cerrada |
| forex-break-confirm | 2.0.0-exp1 | Forex | 120 | Dos cierres fuera del nivel previo y desplazamiento confirmado |
| range-break-confirm | 2.0.0-exp1 | Range Break | 120 | Dos cierres fuera del canal previo y desplazamiento confirmado |
| range-limit-rejection | 2.0.0-exp1 | Range Break | 120 | Canal entre 2 y 8 ATR, mecha de rechazo en límite a ≤0,3 ATR, cierre dentro del canal |
| boom-crash-spike-observer | 2.0.0-exp1 | Boom/Crash | 60 | Describe TR ≥4 veces el promedio de los 14 TR anteriores; abstención durante diez velas posteriores |
| jump-shock-observer | 2.0.0-exp1 | Jump | 60 | Mismo detector de extremos; describe incertidumbre y se abstiene |
| step-distribution-observer | 2.0.0-exp1 | Step | 60 y ≥30 ticks reales | Histograma de diferencias absolutas entre ticks consecutivos; siempre sin confirmación predictiva |

Los tres observadores nunca generan RISE/FALL. El número comercial de Boom/Crash no interviene en ningún cálculo. Las distribuciones Step conservan eventos con el mismo segundo; no se reconstruyen ticks desde velas. Las variaciones de un sintético pueden producir patrones técnicos por coincidencia.

Para las rupturas, el nivel se calcula en las veinte velas anteriores a las dos velas de confirmación. El penúltimo cierre debe superar el nivel en 0,1 ATR y el último en 0,5 ATR; este último debe ser direccional y su cuerpo ocupar al menos el 50% del rango. Los rechazos requieren mecha al menos doble del cuerpo y cierre direccional. Se excluyen dojis (cuerpo ≤10%). Forex aplica lunes–viernes, 07:00–20:00 UTC y ATR/precio entre 0,000015 y 0,01. Es un filtro fijo; no se verifican noticias ni contratos disponibles.

Familias verificadas por mercado/submercado/tipo y, donde corresponde, códigos oficiales. Un nombre parecido no basta. Desconocidos: «Sin estrategia compatible o evidencia insuficiente». Se rechazan OHLC inválidos, abiertos, desordenados o antiguos, minutos recientes ausentes y bloques 5m/15m incompletos. Los pivotes solo existen tras dos velas completas posteriores. Los candidatos se evalúan por separado; coincidencias se resuelven por orden fijo del registro, nunca por tasa histórica. Direcciones opuestas causan abstención.

## Evaluación

El botón avanzado evalúa el historial disponible por reglas fijas: desarrollo hasta 50%, validación 50–70%, reservado 70–100%, con cinco barras de purga a ambos lados de los límites y resultados que terminan dentro de cada tramo. Los indicadores pueden usar el contexto anterior al tramo. No hay entrenamiento ni ajuste automático. El tramo reservado es fuera del desarrollo temporal, pero examinarlo repetidamente o seleccionar activos después de verlo invalida tratarlo como una prueba independiente intacta.

Cada método y tramo cuenta cierres elegibles, señales, frecuencia (`señales / cierres elegibles`) y casos no solapados. El retrospectivo usa cierres OHLC como referencias idealizadas, nunca precios ejecutables ni entradas prospectivas. Los observadores no tienen una hipótesis direccional que evaluar.

El seguimiento v2 es optativo y separado: entrada posterior a la emisión en un tick realmente recibido, escenarios de retraso 0/2/5 s y vencimiento cinco minutos desde cada entrada. Incluye original pareado, cuando confirma. No reconstruye una entrada perdida ni admite entradas retrasadas tras la vigencia. Las nuevas cohortes de un activo esperan a que terminen las anteriores y a que pase su último vencimiento real. Se retienen hasta 300 cohortes, retirando primero las terminadas. Tras corte, silencio o cierre de la vista de control, los casos sin flujo continuo quedan incompletos; los ya resueltos se conservan. Hasta tres flujos v2. Los tres módulos optativos pueden usar sus propios flujos sobre la misma conexión, sujetos al presupuesto global.

Estadísticas avanzadas/CSV separan activo, familia, método, versión, fuente y retraso: emitidas, pendientes, incompletas, sin señal, aciertos/fallos/empates, tasa observada y Wilson 95%. El denominador de la tasa excluye empates, que se informan aparte. La frecuencia histórica no estima la futura: el escáner no observa todos los cierres de todos los activos. La recopilación es selectiva y correlacionada; comparar muchos métodos, activos y retrasos aumenta el sesgo. Ni Wilson ni alcanzar 30/100 casos demuestra ventaja.

La clasificación usa vigencia, integridad y número de cohortes prospectivas resueltas del mismo método/versión con retraso cero, con desempate por cierre reciente y símbolo. Es un orden descriptivo, no una validación de eficacia. Mantiene las tarjetas confirmadas vigentes en su posición. Los favoritos se guardan exclusivamente por acciones manuales.

## Economía

Sin inversión, pago total y moneda declarados como observados: **Rentabilidad no evaluable**. Con esos datos solo se calcula `inversión / pago total si acierta`; el pago incluye la inversión. Es información manual no verificada y no se asigna a los resultados históricos. No se consultan cuentas ni propuestas de contratos y no se calculan beneficios supuestos.

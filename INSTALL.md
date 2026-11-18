# Instalación y revisión de la candidata v2.1

Rama: `feature/auto-demo-controlled`, base `feature/scanner-25-fast-navigation` (`abdfe29`). Chrome 116 o posterior, Manifest V3. No requiere Node para usar la extensión, credenciales de Deriv ni clave API.

1. Descarga o cambia a la rama candidata en una carpeta local de revisión.
2. En `chrome://extensions`, activa el modo de desarrollador y carga esa carpeta como extensión descomprimida. Si ya usas esa misma carpeta e ID, pulsa **Recargar** para conservar su almacenamiento. Copiar a otra carpeta puede generar otro ID y otro almacenamiento; exporta primero los CSV. No desinstales la extensión anterior para actualizarla.
3. Abre el panel desde el icono y pulsa **Conectar API**. El recorrido empieza progresivamente. Los primeros resultados no representan una revisión simultánea de todo el catálogo.
4. Usa **Abrir en ventana** para la vista completa. La ventana reutiliza una pestaña de la extensión ya identificada. Panel y ventana comparten una sola sesión; la vista espejo envía controles al propietario. Si lo cierras, otra vista adquiere el control y reconecta. Las suscripciones prospectivas interrumpidas no se recuperan inventando ticks.
5. Edita **Mi sala · favoritos** para añadir, quitar, reemplazar y reordenar hasta siete activos. La selección inicial sigue siendo de seis. Si había ocho a doce, se activan los primeros siete y se conserva toda la selección anterior, con aviso de los restantes. La clave anterior y los registros anteriores se mantienen.
6. **Ir a Deriv** activa una pestaña existente, sin cambiar sus gráficos. Solo se conoce un símbolo por URL cuando está presente. No se detectan ni controlan gráficos internos. Crear una pestaña de Deriv requiere una acción explícita independiente.

**Avanzado** incluye todos los CSV anteriores, el CSV prospectivo v2, comparador, selección del método original/adaptativo para favoritos, evaluación temporal y límites. El escáner dinámico identifica siempre su propio método. Los métodos y la recopilación anterior no cambian al alternar vistas.

Presupuesto predeterminado: 36 solicitudes de datos por cualquier ventana de 60 s, separación mínima 200 ms y dos trabajadores. Configurable entre 12–120 y uno–tres. Reloj, ping, catálogo y cancelación de suscripciones quedan fuera del presupuesto de datos; no hay un WebSocket por activo. Favoritos/señales se revisitan cuando son elegibles, con prioridad, desde 60 s; otros desde 180 s. La cola y el presupuesto pueden añadir demora. El radar muestra hasta 25 activos y actualiza cada lectura al terminar, sin esperar el recorrido completo. Verde/rojo indican RISE/FALL vigentes; amarillo, ausencia de confirmación; gris, pendiente/caducidad/datos no fiables. Una señal nueva ocupa primero un lugar amarillo, sin desplazar confirmaciones vigentes. Observa la antigüedad visible. Pausar/cancelar detiene nuevas tareas; no convierte en resueltos los seguimientos en curso.

El catálogo se renueva cada cinco minutos. No hay escaneo sin alguna vista abierta ni service worker mantenido artificialmente. Suspender el equipo puede interrumpir datos y reloj. Mantén una vista abierta para seguimiento; una instantánea guardada no equivale a un flujo vivo.

El monitor AUTO DEMO solo aparece en vista completa y comienza APAGADO. No solicita credenciales ni conecta cuentas. Antes de simular revisa y confirma saldo/límites virtuales. No existe habilitación de compras. Lee [uso del monitor](AUTO_DEMO_MONITOR.md) y [seguridad](AUTO_DEMO_SECURITY.md); una actualización/reinicio interrumpe el flujo virtual, conserva pendientes y no reanuda entradas.

## Verificación local

```sh
node --test tests/*.test.cjs
node tests/browser-smoke.cjs
node tests/radar-browser.cjs
node tests/auto-demo-browser.cjs
node tests/live-market-smoke.cjs
node tests/live-auto-demo.cjs
```

Node 20 o posterior. La suite unitaria es offline y no instala dependencias. La prueba DOM requiere Playwright y Chromium (`CHROMIUM_PATH` permite elegir el ejecutable). La prueba pública opcional requiere Python y `websockets`, acceso al endpoint oficial y no usa autenticación ni opera. GitHub Actions ejecuta sintaxis, espacios y la suite unitaria en Node 20; no presupone acceso a Deriv.

El Chromium administrado de este entorno bloquea extensiones descomprimidas por política. Se probó el DOM real con APIs Chrome/Deriv simuladas y la API pública por separado. Queda pendiente cargar esta candidata en Chrome autorizado y comprobar panel lateral, ventana, persistencia entre reinicios y sesiones prolongadas. No se modificaron políticas del navegador.

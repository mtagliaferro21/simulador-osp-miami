# Fiberlog OSP — Registro de respuestas en TalentLMS

## Configuración de esta versión

- Cuatro preguntas de inspección; interfaz en inglés técnico.
- Práctica con reintentos ilimitados. No hay mínimo de aprobación ni límite de tiempo.
- Un intento se cuenta al pulsar **Check Answer**. Cambiar una opción o pulsar **Try Again** no cuenta.
- La nota enviada a TalentLMS es el porcentaje de aciertos en la PRIMERA respuesta de cada pregunta. Las preguntas sin contestar cuentan como cero.
- La nota de las respuestas más recientes se muestra por separado en **View Results** y en el CSV. No sustituye la nota inicial.
- La actividad pasa a **completed** cuando las cuatro preguntas tienen al menos una respuesta, aunque haya errores. Completado no significa aprobado.
- **Review Route** conserva los registros. Volver a entrar en la misma actividad reanuda el progreso si TalentLMS conserva sus datos SCORM.
- Cada error y acierto se conserva. Un reintento no sustituye la respuesta anterior en el historial de interacciones.

## Instalación

1. Entra en el curso de TalentLMS con permisos para editar contenido.
2. Añade una unidad SCORM y carga **Fiberlog_OSP_SCORM12.zip** completo, sin descomprimir. La ruta habitual es **Add > SCORM | xAPI | cmi5**; la etiqueta puede variar con la interfaz.
3. Lanza la unidad desde el curso con un participante de prueba. No uses un enlace a GitHub ni a Figma para esta prueba.
4. En DR-01, envía dos respuestas incorrectas y luego la correcta usando **Try Again**. Comprueba: Attempts 3, Correct 1, Incorrect 2. La nota inicial sigue siendo 0 % si las otras preguntas siguen sin responder.
5. Sal normalmente y vuelve a entrar. Los contadores deben mantenerse. Contesta las otras preguntas y comprueba la finalización.
6. Comprueba los resultados con una cuenta que tenga permiso de reportes: **Reports > Learning activities > [unidad SCORM] > Users > View attempt**. **Analysis** permite revisar las interacciones.
7. Confirma que el reporte muestra los envíos individuales y los contadores de abajo antes de asignar la unidad a participantes reales.

El paquete se ha probado con un adaptador SCORM de prueba. La visualización final de las interacciones y el comportamiento al relanzar una actividad completada deben verificarse en tu portal. El permiso de acceso a los reportes depende del rol configurado en TalentLMS.

## Qué recibe el instructor

Las primeras doce interacciones son contadores numéricos, con resultado **neutral** y peso cero. Se actualizan conservando su posición. TalentLMS puede mostrar números de pregunta en lugar de nuestros identificadores:

| Número de interacción en pantalla | Identificador | Contenido |
| --- | --- | --- |
| 1 | DR-01__ATTEMPTS | Total de envíos — Storm Drain Inlet |
| 2 | DR-01__CORRECT | Aciertos — Storm Drain Inlet |
| 3 | DR-01__INCORRECT | Errores — Storm Drain Inlet |
| 4 | HH-01__ATTEMPTS | Total de envíos — Potential Handhole |
| 5 | HH-01__CORRECT | Aciertos — Potential Handhole |
| 6 | HH-01__INCORRECT | Errores — Potential Handhole |
| 7 | TR-01__ATTEMPTS | Total de envíos — Tree |
| 8 | TR-01__CORRECT | Aciertos — Tree |
| 9 | TR-01__INCORRECT | Errores — Tree |
| 10 | LT-01__ATTEMPTS | Total de envíos — Streetlight Pole |
| 11 | LT-01__CORRECT | Aciertos — Streetlight Pole |
| 12 | LT-01__INCORRECT | Errores — Streetlight Pole |

A partir de la interacción 13, cada envío crea una fila nueva con Question ID, número de reintento y fecha UTC en su identificador. Incluye opción elegida A/B/C, respuesta correcta, resultado correct/wrong y tiempo desde que se abrió la pregunta o se pulsó Try Again. Ese tiempo incluye pausas con la página abierta y no mide atención. El LMS puede agrupar estos registros de forma diferente en su interfaz; no se promete una tabla personalizada nativa con idéntico diseño al simulador.

No confundir **intento de lanzamiento de la unidad** (terminología del LMS) con **envío de una respuesta**. Esta versión cuenta los envíos por pregunta dentro del progreso conservado de la unidad.

## Clave de preguntas

| ID | Pregunta | A | B | C | Correcta |
| --- | --- | --- | --- | --- | --- |
| DR-01 | What information is needed to assess an underground crossing near this inlet? | The approximate location of the grate. | The pipe alignment, dimensions, and invert elevations. | The visible pavement width. | B |
| HH-01 | How should this structure be recorded in the preliminary asset inventory? | Telco handhole with available capacity. | Authorized OSP connection point. | Potential handhole. Verify the utility type, asset ID, and owner. | C |
| TR-01 | What should you verify before laying out an excavation next to the tree? | The tree protection zone and applicable requirements. | The visible trunk diameter alone. | The distance to the edge of the canopy’s shadow. | A |
| LT-01 | What evidence is needed before considering this pole for an OSP attachment? | A photograph of the luminaire. | The asset ID, owner, technical requirements, and attachment authorization. | The pole’s proximity to the preliminary route. | B |

## CSV y conservación

**View Results > Download Results CSV** descarga los totales del participante por pregunta: nombre/ID recibidos del LMS, envíos, aciertos, errores, primera y última respuesta, fechas UTC y ambas notas. Es un resumen acumulado, no el historial completo de cada envío. El historial individual se registra en SCORM.

En GitHub Pages solo existe práctica anónima, conservada en sessionStorage cuando el navegador lo permite. No se crea un reporte central para instructores. No se envían nombres ni respuestas a GitHub. En el paquete SCORM, los datos se guardan mediante la API del LMS; si no está disponible, se bloquea el envío para evitar presentar resultados como registrados.

Un error al guardar muestra **Retry Saving**. Mantén la actividad abierta hasta obtener confirmación. Los reenvíos de guardado reutilizan las mismas filas y no suman otro intento. Un cierre forzado durante un fallo de comunicación puede perder cambios no confirmados. Evita abrir simultáneamente la misma unidad en varias pestañas.

El modo review/browse del LMS permite consultar resultados, pero no añadir respuestas. Si el LMS crea un nuevo intento o un administrador borra el progreso SCORM, empieza otro registro; no se agregan automáticamente intentos de lanzamiento independientes. Cambiar las preguntas requiere gestionar una nueva versión de la actividad, sin mezclar respuestas de versiones diferentes.

El ZIP contiene las imágenes y scripts. No necesita claves, bases de datos externas ni acceso a Figma. Los cambios publicados en GitHub no reemplazan automáticamente un ZIP ya cargado en TalentLMS: habrá que generar y subir la nueva versión. Prueba una copia de la unidad antes de reemplazar contenido con resultados existentes.

## Fuentes de referencia

- https://help.talentlms.com/hc/en-us/articles/9652241996188-How-to-get-reports-on-individual-questions-in-SCORM-1-2-activities-in-TalentLMS
- https://help.talentlms.com/hc/en-us/articles/9652244276892-How-to-generate-reports-on-your-SCORM-xAPI-and-cmi5-content

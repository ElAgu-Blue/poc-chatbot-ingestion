# Panel de Looker Studio con CSV

## Archivos

Genere las fuentes con:

```powershell
npm run export:mart-csv
```

Se crean dos CSV:

- `exports\daily_chatbot_summary.csv`: una fila por día y motivo; recomendado
  para scorecards, tendencias, cumplimiento y volumen.
- `exports\daily_chatbot_cases.csv`: una fila por conversación; recomendado
  para distribuciones 1–7, detalle de encuestas y comentarios.

La carga CSV es manual. Looker Studio no recrea ni actualiza automáticamente
estos archivos. Para cada nueva extracción debe volver a cargar los datos o
usar BigQuery/Google Sheets como fuente persistente.

## 1. Crear el informe

1. Abra `https://lookerstudio.google.com/`.
2. Seleccione **Crear > Informe**.
3. En **Agregar datos al informe**, elija el conector **Carga de archivo**.
4. Suba `daily_chatbot_summary.csv`.
5. Nombre la fuente `Chatbot - Resumen diario`.
6. Habilite **Modificar dimensiones** y configure:
   - `motivo`: texto.
   - `participantEmails` y `participantCases`: texto.
   - Las columnas restantes: número.
7. Si Looker ofrece agregar los datos al informe, seleccione **Agregar al
   informe**.
8. Renombre la página a `Resumen ejecutivo`.

Repita el proceso con `daily_chatbot_cases.csv`:

1. Vaya a **Recurso > Administrar fuentes añadidas**.
2. Seleccione **Agregar una fuente de datos > Carga de archivo**.
3. Suba `daily_chatbot_cases.csv`.
4. Nombre la fuente `Chatbot - Casos`.
5. Deje `interactionDate` y `closedAt` como texto; configure los conteos y
   calificaciones como números, y conserve las demás columnas como texto.

No comparta el informe públicamente: ambas fuentes contienen correos y
comentarios, aunque la PoC usa correos ficticios.

## Fechas cuando Looker importa CSV como texto

En fuentes CSV, Looker puede bloquear `interactionDate` como texto. No cambie
el CSV ni intente convertir la columna original. Cree una dimensión:

1. Abra **Recurso > Administrar fuentes añadidas**.
2. Entre a `Chatbot - Resumen diario` y seleccione **Agregar un campo**.
3. Nombre: `interactionDate_parsed`.
4. Tipo: **Fecha**.
5. Fórmula:

```text
PARSE_DATE("%Y-%m-%d", interactionDate)
```

6. Guarde y cierre la edición de la fuente.
7. Repita el campo en `Chatbot - Casos`.

El CSV usa fechas ISO `YYYY-MM-DD`, por ejemplo `2026-11-23`; por eso el
formato de `PARSE_DATE` es `%Y-%m-%d`.

Si una fuente no guarda el tipo al crear el campo, primero seleccione el
resultado como **Fecha** en el selector de tipo del editor. Después reemplace
toda mención a `interactionDate` en controles, dimensiones y filtros por
`interactionDate_parsed`.

## 2. Filtros y encabezado

Repita esta cabecera en cada página.

### Rango de fechas

1. En la barra superior seleccione **Agregar un control > Selector de rango de
   fechas**.
2. Dibuje el control cerca de la esquina superior derecha.
3. Con el control seleccionado, abra el panel derecho **Datos**.
4. En **Fuente de datos**, elija la fuente de la página.
5. En **Dimensión de fecha**, seleccione `interactionDate_parsed`.
6. En **Intervalo predeterminado**, seleccione `Auto` o `Últimos 30 días`.

### Filtro por motivo

1. Seleccione **Agregar un control > Lista desplegable**.
2. Dibuje el control junto al selector de fechas.
3. En **Datos > Dimensión de control**, seleccione `motivo`.
4. Desactive **Seleccionar todo** sólo si necesita forzar un motivo inicial.
5. Renombre el control a `Motivo`.

### Filtro por estado

Sólo en páginas con `Chatbot - Casos`:

1. Seleccione **Agregar un control > Lista desplegable**.
2. En **Dimensión de control**, seleccione `status`.
3. Use los valores `OPEN`, `COMPLETED` y `ABANDONED`.

### Título

1. Seleccione **Insertar > Texto**.
2. Escriba `Análisis del chatbot`.
3. En **Estilo**, use la fuente corporativa, 24–28 px, negrita y color oscuro.
4. Inserte un segundo cuadro de texto debajo con la frase
   `Periodo y filtros activos` o el nombre de la audiencia.

## 3. Página «Resumen ejecutivo»

Esta página equivale a la primera captura.

### Crear la página

1. Abra **Página > Nueva página**.
2. Renómbrela `Resumen ejecutivo`.
3. Agregue primero la cabecera de la sección anterior.
4. Mantenga seleccionada la fuente `Chatbot - Resumen diario` en cada
   componente.

Cree los siguientes campos calculados en la fuente:

### Tasa de finalización

```text
SUM(completedConversations) / SUM(totalConversations)
```

Tipo: **Porcentaje**.

### Calidad promedio ponderada

```text
SUM(averageQuality * ratedConversations) / SUM(ratedConversations)
```

Tipo: **Número**, dos decimales.

### Cumplimiento de encuesta

```text
SUM(surveySubmittedConversations) / SUM(completedConversations)
```

Tipo: **Porcentaje**.

### Resolución promedio ponderada

```text
SUM(averageResolution * ratedConversations) / SUM(ratedConversations)
```

Tipo: **Número**, dos decimales.

### Crear scorecards

Para cada fila de la tabla siguiente:

1. Seleccione **Insertar > Tarjeta de puntaje**.
2. Dibuje una tarjeta debajo del encabezado.
3. En **Datos > Fuente de datos**, seleccione `Chatbot - Resumen diario`.
4. En **Métrica**, agregue la columna indicada y seleccione la agregación.
5. En **Estilo > Etiqueta**, escriba el nombre de la tarjeta.
6. En **Estilo > Diseño**, active el borde, la sombra y un color de acento.
7. Duplique la tarjeta con `Ctrl+D` y cambie sólo la métrica/etiqueta.

| Etiqueta | Métrica | Agregación |
| --- | --- | --- |
| Conversaciones | `totalConversations` | Suma |
| Encuestas respondidas | `surveySubmittedConversations` | Suma |
| Finalizadas | `completedConversations` | Suma |
| Abiertas | `openConversations` | Suma |
| Tasa de finalización | `Tasa de finalización` | Promedio / fórmula del campo |
| Calidad promedio | `Calidad promedio ponderada` | Promedio / fórmula del campo |
| Cumplimiento de encuesta | `Cumplimiento de encuesta` | Promedio / fórmula del campo |

Para la calidad, configure en **Estilo** dos decimales. Para tasas, seleccione
tipo **Porcentaje**.

### Evolución diaria

1. Seleccione **Agregar un gráfico > Serie temporal**.
2. Dibuje un gráfico ancho debajo de las tarjetas.
3. En **Datos > Dimensión**, agregue `interactionDate_parsed`.
4. En **Dimensión de desglose temporal**, mantenga `Día`.
5. Agregue como métricas, en este orden:
   - `totalConversations` con agregación `SUM`.
   - `completedConversations` con agregación `SUM`.
   - `surveySubmittedConversations` con agregación `SUM`.
6. En **Ordenar**, seleccione `interactionDate_parsed` ascendente.
7. En **Estilo**, active leyenda inferior, líneas de cuadrícula y etiquetas.

### Conversaciones por motivo

1. Seleccione **Agregar un gráfico > Gráfico de barras**.
2. Dibuje el gráfico al lado de la serie temporal.
3. Dimensión: `motivo`.
4. Métrica: `totalConversations`, agregación `SUM`.
5. Orden: `totalConversations`, descendente.
6. En **Estilo**, ordene barras descendentes y muestre etiquetas de datos.

## 4. Página «Encuestas CSAT»

Esta página equivale a la segunda captura.

1. Cree la página desde **Página > Nueva página**.
2. Nombre la página `Encuestas CSAT`.
3. Agregue la cabecera de filtros.
4. Use la fuente `Chatbot - Casos`.

### Crear tarjetas CSAT

Para crear cada tarjeta:

1. Seleccione **Insertar > Tarjeta de puntaje**.
2. En **Datos**, use `Chatbot - Casos`.
3. Agregue la métrica indicada.
4. Para tarjetas filtradas, seleccione **Agregar un filtro** dentro del
   gráfico.

| Etiqueta | Métrica | Agregación/Filtro |
| --- | --- | --- |
| Encuestas | `surveySubmitted` | Suma |
| Calidad promedio | `calidadAtencion` | Promedio |
| Resolución promedio | `resolucion` | Promedio |
| Casos críticos | `criticalCase` | Suma |
| Sin encuesta | `Record Count` | Filtro `surveySubmitted = 0` |

Para la **Tasa de respuesta**, cree un campo calculado:

```text
SUM(surveySubmitted) / COUNT_DISTINCT(conversationId)
```

Establezca su tipo como porcentaje y agréguelo como scorecard.

### Distribución de calidad

1. Seleccione **Agregar un gráfico > Gráfico de columnas**.
2. Dimensión: `calidadAtencion`.
3. Métrica: `Record Count`.
4. En **Filtro**, agregue `Include > calidadAtencion > No nulo`.
5. Orden: `calidadAtencion`, ascendente.
6. En **Estilo > Serie**, desactive colores automáticos. Defina rojo para 1–2,
   amarillo para 3–4 y verde para 5–7 si su versión admite colores por serie;
   como alternativa use `qualityBand`.

### Distribución de resolución

1. Duplique el gráfico anterior.
2. Cambie la dimensión a `resolucion`.
3. Mantenga la métrica `Record Count`.
4. Cambie el filtro a `resolucion IS NOT NULL`.
5. Renombre el título a `Distribución de resolución`.

### Tabla de conversaciones

1. Seleccione **Agregar un gráfico > Tabla**.
2. Agregue dimensiones en este orden:
   - `interactionDate_parsed`
   - `conversationId`
   - `motivo`
   - `status`
   - `calidadAtencion`
   - `resolucion`
   - `qualityBand`
   - `comentario`
   - `durationSeconds`
3. En **Ordenar**, elija `interactionDate_parsed`, descendente.
4. En **Paginación**, use 10 o 20 filas.
5. En **Estilo > Encabezado**, fije encabezado visible, filas alternadas y
   ajuste de columna.

Restrinja esta página a usuarios autorizados por contener correo/comentario en
la fuente, aunque la tabla no necesite mostrar el correo por defecto.

## 5. Página «Análisis de producto»

Esta página equivale a la tercera captura.

1. Cree `Página > Nueva página` con nombre `Análisis de producto`.
2. Use la fuente `Chatbot - Casos`.
3. Repita la cabecera y agregue `status` como filtro.

### Scorecards de estado

Cree cuatro tarjetas mediante **Insertar > Tarjeta de puntaje**:

- `Total`: `Record Count`.
- `Finalizadas`: `Record Count` + filtro `status = COMPLETED`.
- `Abiertas`: `Record Count` + filtro `status = OPEN`.
- `Encuestas`: `SUM(surveySubmitted)`.

### Conversaciones por motivo

1. Seleccione **Agregar un gráfico > Gráfico de barras**.
2. Dimensión: `motivo`.
3. Métrica: `Record Count`.
4. Dimensión de desglose opcional: `qualityBand`.
5. Orden: `Record Count`, descendente.
6. Active etiquetas y apilado porcentual sólo si usa `qualityBand`.

### Estado por motivo

1. Seleccione **Agregar un gráfico > Gráfico de columnas apiladas**.
2. Dimensión: `motivo`.
3. Dimensión de desglose: `status`.
4. Métrica: `Record Count`.
5. En **Estilo**, active apilado y leyenda inferior.

### Calidad por motivo

1. Duplique el gráfico anterior.
2. Desglose: `qualityBand`.
3. Excluya el valor `Sin encuesta` si desea analizar sólo respuestas.
4. Renombre la métrica visual a `Encuestas por resultado`.

### Evolución de estados

1. Seleccione **Agregar un gráfico > Serie temporal**.
2. Dimensión: `interactionDate_parsed`.
3. Dimensión de desglose: `status`.
4. Métrica: `Record Count`.
5. Granularidad: día.
6. En **Estilo**, asigne un color distinto a `COMPLETED`, `OPEN` y
   `ABANDONED`.

## Qué se puede replicar de las capturas

| Visual objetivo | Disponible | Fuente |
| --- | --- | --- |
| Conversaciones totales | Sí | Resumen |
| Conversaciones completadas/abiertas | Sí | Resumen o Casos |
| Encuestas enviadas | Sí | Resumen o Casos |
| Cumplimiento de encuesta | Sí | Resumen |
| Tasa de finalización | Sí | Resumen |
| Calidad y resolución promedio | Sí | Resumen o Casos |
| Evolución diaria | Sí | Resumen |
| Distribución de notas 1–7 | Sí | Casos |
| Resultado positivo/neutro/negativo | Sí, usando `qualityBand` | Casos |
| Resolución satisfecha/parcial/no resuelta | Sí, usando `resolutionBand` | Casos |
| Casos críticos | Sí | Resumen o Casos |
| Tabla de conversación/comentario | Sí | Casos |
| Desglose por motivo | Sí | Ambas |
| Desglose PyME/B2B | Sí, usando `agentId` | Casos |
| Sesiones únicas distintas de conversación | No: falta `sessionId` independiente | — |
| NPS | No: escala disponible 1–7, no recomendación 0–10 | — |
| Sentimiento NLP del comentario | No: no existe modelo ni etiqueta de sentimiento | — |
| Integraciones/errores técnicos por sistema | No: faltan esos eventos y correlaciones | — |
| Agente humano | No: sólo existe `agentId` del bot | — |

Puede usar `qualityBand` como sustituto de sentimiento visual, pero debe
etiquetarlo como **resultado de encuesta**, no como análisis sentimental.

## Actualización

Para refrescar manualmente:

```powershell
npm run export:mart-csv
```

Luego reemplace los dos CSV en sus fuentes. Looker puede conservar gráficos si
los nombres y orden de columnas no cambian.

## Alternativa con BigQuery

Cuando se otorguen permisos para tablas, conecte Looker al mart
`globalOnboardingB2cc2x.daily_chatbot_summary` para métricas agregadas y cree una
fuente protegida adicional para el detalle, nunca el RAW completo.

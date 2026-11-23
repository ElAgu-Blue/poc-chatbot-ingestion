# Configuración manual de Looker Studio

La creación del informe no es automatizable de forma reproducible con esta
PoC: requiere seleccionar fuentes y controles en la interfaz. La fuente debe
ser una vista o el mart `bx-b2cc2x-dev.chat_analytics.daily_chatbot_summary`.
No conecte directamente el RAW.

1. Abra Looker Studio y elija **Crear > Informe**.
2. Seleccione **BigQuery > bx-b2cc2x-dev > chat_analytics >
   daily_chatbot_summary**.
3. Conceda sólo al grupo de analistas aprobado acceso al dataset, tabla de
   casos y correo. El RAW, comentarios, historial y correos son PII.
4. Agregue un control de rango de fecha basado en `interactionDate`.
5. Agregue un control de filtro para `motivo`.
6. Agregue scorecards para `AVG(averageQuality)` (objetivo informativo inicial
   `>= 5.5 / 7`) y resolución satisfactoria (porcentaje).
7. Agregue una serie temporal de `completedConversations` por
   `interactionDate`.
8. Agregue un gráfico de columnas con las puntuaciones 1..7. Si se requiere
   granularidad individual, cree una vista restringida sobre RAW que sólo exponga
   `closedAt`, `calidadAtencion` y `resolucion`.
9. Agregue barras de `completedConversations` agrupadas por `motivo`.
10. Para casos críticos, cree una fuente/vista protegida con correo, comentario,
    calidad y resolución. Aplique
    `calidadAtencion <= 3 OR resolucion <= 3`.
11. Configure actualización manual/automática, zona horaria y muestreo sin
    exportación abierta.
12. Comparta mediante grupos, no con enlace público, y revise accesos
    trimestralmente.

Prueba final: refrescar la fuente, validar volumen diario contra el mart y
confirmar que el correo/comentario sólo aparece para el grupo autorizado.

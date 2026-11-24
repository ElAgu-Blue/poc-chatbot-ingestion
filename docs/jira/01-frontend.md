# Jira: Integración Frontend de conversaciones y encuestas

## Resumen

Normalizar los payloads PyME/B2B del widget, propagar todos los datos requeridos
al BFF y enviar encuestas tanto al flujo actual como al nuevo BFF, sin modificar
la experiencia visible del chatbot.

Repositorio: `bx-front-integration-ecommerce`.

## Alcance

Modificar:

- `src/pages/api/chat-proxy/dialogflow/index.ts`
- `src/pages/api/chat-proxy-b2b/dialogflow/index.ts`
- `src/pages/api/chat-proxy/index.ts`
- `src/pages/api/chat-proxy-b2b/index.ts`
- `src/server/chatbot-contracts.ts`
- tests unitarios de mappers/endpoints

Fuera de alcance:

- Dialogflow;
- persistencia MongoDB;
- publicación SNS/PubSub;
- diseño visual del widget.

## Requerimientos técnicos

### Mensajes al BFF

Los endpoints Dialogflow deben enviar:

```ts
type ChatMessageRequest = {
  conversationId: string;
  agentId: string;
  message: string;
  timestamp: string;
  userEmail: string;
  history: Array<{
    id?: string | number;
    role: string;
    message: string;
    timestamp?: string;
    attachments?: Record<string, unknown>[];
  }>;
  queueInfo?: {
    messagesInBatch: number;
    debounceDelay: number;
  };
};
```

Tareas:

1. Mapear `conversation_id` a `conversationId`.
2. Normalizar timestamp a ISO 8601.
3. Extraer correo desde `login_wall.email.input_value` o campos alternativos.
4. Mapear `historymsg`/`history_msg` a `history`.
5. Convertir `queue_info` a `queueInfo`.
6. Usar el agente PyME o B2B según endpoint.
7. Mantener headers SSO/API key.
8. No serializar body completo en logs.

### Encuestas

El contrato BFF es:

```ts
type SubmitChatSurveyRequest = {
  conversationId: string;
  action: 'survey';
  survey: {
    calidadAtencion: number;
    resolucion: number;
    comentario?: string;
    agenteId: string;
    submittedAt: string;
  };
  userEmail?: string;
  history?: ChatHistoryMessage[];
};
```

Tareas:

1. Aceptar `survey`, `survey_data` o `surveyData`.
2. Aceptar aliases snake_case.
3. Validar scores enteros 1–7.
4. Conservar el envío a Latenode.
5. Ejecutar el envío BFF si el feature flag está habilitado.
6. Evaluar ambos resultados; no ocultar un fallo.
7. Retornar 400 para payload inválido.

### Performance

- No loggear `history`, correo, comentario ni response completa.
- Configurar timeout de fetch.
- Cancelar con `AbortController`.
- No reintentar desde Frontend.
- Evaluar Latenode y BFF sin dejar promesas no observadas.

## Configuración

```dotenv
NEXT_PUBLIC_ONE_BLUE_API_URL_APIGTW=
NEXT_PUBLIC_ONE_BLUE_API_KEY_APIGTW=
NEXT_PUBLIC_PYME_DIALOGFLOW_AGENT_ID=
NEXT_PUBLIC_B2B_DIALOGFLOW_AGENT_ID=
CHATBOT_SURVEY_BFF_ENABLED=true
LATENODE_WEBHOOK_URL=
LATENODE_B2B_WEBHOOK_URL=
```

## Criterios Gherkin

```gherkin
Scenario: Mensaje PyME completo
  Given llega POST /api/chat-proxy/dialogflow con conversation_id, newmsg, historymsg, queue_info y login_wall
  When el payload es válido
  Then se envía al BFF conversationId, agentId, message, timestamp, userEmail, history y queueInfo
  And timestamps están en ISO 8601
  And la respuesta BFF conserva su shape

Scenario: Mensaje B2B completo
  Given llega POST /api/chat-proxy-b2b/dialogflow
  When contiene correo, historial y timestamp
  Then se usa exactamente el contrato normalizado de PyME

Scenario: Payload inválido
  Given falta userEmail o la fecha no es válida
  When se normaliza el mensaje
  Then responde 400
  And no llama al BFF

Scenario: Encuesta válida
  Given action es survey y el feature flag está habilitado
  When survey_data tiene scores válidos
  Then llama a Latenode
  And llama a /bfa/chatbot/survey
  And ambos destinos reciben sus contratos correspondientes

Scenario: Score inválido
  Given calidad_atencion es 8
  When llega la encuesta
  Then responde 400
  And no publica al BFF

Scenario: Falla un destino
  Given Latenode o BFF responde error
  When terminan ambos resultados
  Then el handler no retorna éxito
  And registra sólo IDs y status, no PII
```

## Definition of Done

- PyME y B2B cubiertos con tests.
- `survey`, `survey_data` y aliases cubiertos.
- Build aprobado.
- Sin logs de PII.
- Flag documentado.
- OAS no aplica; contratos documentados en tests/tipos.


# Jira: BFA sin persistencia ni publicación

## Resumen

Conservar en BFA sólo la integración con Dialogflow, validación de contrato y
acuse de encuesta. MongoDB, SNS y outbox deben retirarse hacia el servicio de
dominio.

Repositorio: `bx-app-bfa-account`.

## Cambios a conservar

- `ChatbotModule`.
- `ChatbotController`.
- `ChatbotMessageDto`.
- `SubmitChatSurveyDto`.
- `ChatHistoryMessageDto`.
- `ChatQueueInfoDto`.
- `ChatTurnUseCase`.
- `AgentProviderPort`.
- `DialogflowAdapter`.
- `ValidationPipe` sólo en `ChatbotController`.
- endpoint `/v1/chatbot`;
- endpoint `/v1/chatbot/survey`;
- pruebas de controller, use case y adapter.

## Cambios a retirar/mover

Mover al servicio de dominio:

- `MongoConversationRepository`;
- `ConversationRepositoryPort`;
- `InteractionEventPublisherPort`;
- `SnsInteractionPublisher`;
- lógica `eventPublishedAt`;
- `completionEventId`;
- outbox/retry SNS;
- cierre de conversaciones.

Retirar del BFA:

- `@aws-sdk/client-sns`;
- `DatabaseModule` en `ChatbotModule`;
- variables `CHAT_EVENTS_*`;
- variables Mongo exclusivas del chatbot.

Nota: Mongo puede seguir usándose por CallBot si esa capacidad lo requiere, pero
no debe crearse por el módulo chatbot.

## Caso de uso final

```text
ChatTurnUseCase
  1. recibe ChatbotMessageDto
  2. llama AgentProviderPort.sendMessage
  3. retorna exactamente el JSON de Dialogflow
```

```text
SubmitSurveyUseCase
  1. valida DTO
  2. no persiste
  3. no publica
  4. retorna acknowledgement
```

## Contrato de turno

```ts
type ChatbotMessageDto = {
  conversationId: string;
  agentId: string;
  message: string;
  timestamp: string;
  userEmail: string;
  history: ChatHistoryMessageDto[];
  queueInfo?: ChatQueueInfoDto;
};
```

## Contrato de encuesta

```ts
type SubmitChatSurveyDto = {
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
  history?: ChatHistoryMessageDto[];
};
```

## Validación

- `ValidationPipe({ transform: true, whitelist: true })` sólo en
  `ChatbotController`.
- Scores enteros 1–7.
- ISO 8601.
- Email válido.
- No aplicar el pipe globalmente.

## Performance

- No esperar MongoDB, SNS, Pub/Sub o BigQuery.
- Latencia limitada por Dialogflow.
- Timeout configurable a Dialogflow.
- No lanzar background jobs con PII.
- Reusar autenticación GCP/client cuando sea seguro.
- No loggear historial/correo.

## Configuración

```dotenv
PORT=3001
BX_LOG_LEVEL=info
ENVIRONMENT=development
GCP_PROJECT_ID=
GCP_REGION=us-central1
GCP_SA_INTGR_BFA=
ELEVENLABS_AUTH_TOKEN=
GCP_DIALOGFLOW_TIMEOUT_MS=8000
```

## OAS BFA

Agregar/confirmar:

- `POST /v1/chatbot`;
- `POST /v1/chatbot/survey`;
- DTOs;
- `400`, `502`, `504`;
- respuesta Dialogflow sin wrapper;
- respuesta survey `{ text, conversationId }`.

## Criterios Gherkin

```gherkin
Scenario: Consulta Dialogflow válida
  Given el DTO es válido
  When ChatTurnUseCase llama AgentProviderPort
  Then retorna exactamente la respuesta Dialogflow
  And no llama MongoDB
  And no publica SNS

Scenario: Encuesta válida
  Given scores están entre 1 y 7
  When se llama /v1/chatbot/survey
  Then retorna request accepted
  And no persiste ni publica

Scenario: Payload inválido
  Given un score está fuera de 1..7
  When ValidationPipe procesa el request
  Then responde 400
  And no llama Dialogflow
```

## Definition of Done

- BFA compila sin puertos/repositorios de persistencia.
- No depende de MongoDB ni AWS SNS para chatbot.
- Dialogflow conserva el shape actual.
- Tests y OAS aprobados.
- No se afectan capacidades CallBot.


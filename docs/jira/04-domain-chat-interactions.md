# Jira: Servicio de dominio de interacciones

## Resumen

Crear un servicio NestJS con arquitectura hexagonal que persista conversaciones,
aplique encuestas, garantice idempotencia y publique eventos mediante outbox.

Repositorio nuevo sugerido: `bx-srv-chat-interactions`.

## Alcance

- conversaciones operativas en MongoDB;
- idempotencia HTTP;
- encuesta y cierre;
- outbox;
- publicación SNS;
- OAS;
- observabilidad;
- scheduler/retry.

No consulta Dialogflow ni BFA.

## Arquitectura

```text
src/chat-interactions/
  domain/
    models/
    ports/inbound/
    ports/outbound/
  application/
    record-chat-turn.use-case.ts
    record-chat-survey.use-case.ts
    publish-outbox-events.use-case.ts
  infrastructure/
    adapters/inbound/
      chat-interactions.controller.ts
      dtos/
    persistence/mongodb/
      conversation.repository.ts
      operation.repository.ts
      outbox.repository.ts
    adapters/outbound/
      sns-event.publisher.ts
    schedulers/
      outbox-publisher.scheduler.ts
```

## API

### `POST /v1/chat-interactions/turns`

Input:

```ts
{
  operationId: string;
  conversationId: string;
  agentId: string;
  userEmail: string;
  timestamp: string;
  message: string;
  history: ChatHistoryMessage[];
  queueInfo?: ChatQueueInfo;
  bfaResponse: unknown;
}
```

### `POST /v1/chat-interactions/surveys`

Input:

```ts
{
  operationId: string;
  conversationId: string;
  action: 'survey';
  survey: ChatSurvey;
  userEmail?: string;
  history?: ChatHistoryMessage[];
  bfaAcknowledgement: {
    text: string;
    conversationId: string;
  };
}
```

Ambos requieren `Idempotency-Key`; deben responder `202`.

## MongoDB

Database: `oneblue_chat`.

Colecciones:

- `conversations`;
- `operations`;
- `outbox_events`.

Índices:

```js
conversations: unique({ conversationId: 1 })
conversations: { userEmail: 1, updatedAt: -1 }
conversations: { status: 1, updatedAt: 1 }
operations: unique({ operationId: 1 })
outbox_events: unique({ eventId: 1 })
outbox_events: { status: 1, availableAt: 1 }
```

Fechas BSON Date; scores Int 1–7; estados OPEN/IN_PROGRESS/COMPLETED/ABANDONED.

## Consistencia

Para encuesta:

1. actualizar conversación;
2. insertar operación;
3. crear outbox;
4. confirmar transacción;
5. responder 202;
6. worker publica SNS;
7. marcar outbox publicado.

Debe usar transacción MongoDB para conversación + outbox.

## SNS

- Topic: `topic-oneblue-chat-interactions`.
- Message attributes: `eventId`, `eventType`, `entityId`, `entityType`,
  `timestamp`, `datetime`, `domain`, `capability`, `version`.
- Payload: conversación/encuesta.
- `eventId` estable.
- PII sólo en body, no attributes.

## Worker outbox

- Batch 20.
- Poll 1 s.
- Máximo 8 intentos.
- Backoff exponencial con jitter.
- Estado PUBLISHED sólo después de confirmación SNS.
- Error terminal permanece visible como FAILED.

## Configuración

```dotenv
PORT=3002
BX_LOG_LEVEL=info
ENVIRONMENT=local
MONGODB_HOST=
MONGODB_DB_NAME=oneblue_chat
MONGODB_USER_NAME=
MONGODB_PASSWORD=
MONGODB_MAX_POOL_SIZE=20
MONGODB_SOCKET_TIMEOUT_MS=5000
CHAT_EVENTS_TOPIC_ARN=
CHAT_EVENTS_AWS_REGION=us-east-1
CHAT_EVENTS_PUBLISH_MAX_ATTEMPTS=3
OUTBOX_BATCH_SIZE=20
OUTBOX_POLL_INTERVAL_MS=1000
OUTBOX_MAX_ATTEMPTS=8
```

## OAS

- POST turns.
- POST surveys.
- GET conversación opcional para soporte.
- `Idempotency-Key`.
- `202`, `400`, `404`, `409`, `422`, `500`.
- `operationId`, `correlationId` y estado `accepted`.

## Gherkin

```gherkin
Scenario: Turno nuevo
  Given operationId no existe
  When llega un comando válido
  Then persiste turno y respuesta BFA
  And responde 202

Scenario: Operación duplicada
  Given operationId y requestHash ya existen
  When llega el mismo comando
  Then no duplica historia
  And responde 202 idempotente

Scenario: Conflicto de idempotencia
  Given operationId existe con otro requestHash
  When llega el segundo body
  Then responde 409

Scenario: Encuesta y outbox atómicos
  Given la conversación está OPEN
  When llega encuesta válida
  Then cierra la conversación
  And crea survey y outbox en una transacción

Scenario: SNS no disponible
  Given SNS falla
  When el worker reintenta
  Then la conversación permanece persistida
  And el outbox queda PENDING/FAILED recuperable
```

## Definition of Done

- Arquitectura hexagonal.
- Repositorios y puertos testeados.
- Mongo idempotente.
- Outbox transaccional.
- SNS desacoplado.
- OAS y pruebas de retry.
- Runbook operativo y métricas.


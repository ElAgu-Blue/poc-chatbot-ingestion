# Jira: Orquestación BFF BFA y servicio de dominio

## Resumen

Ampliar el BFF para recibir mensajes/encuestas, consultar BFA y usar la respuesta
BFA para registrar la interacción en el servicio de dominio sin acoplarse a
MongoDB o SNS.

Repositorio: `bx-bff-b2cc2x-oneblue`.

## Alcance

- `src/services/bfa/*`
- DTOs de BFA y dominio.
- `POST /bfa/chatbot`.
- `POST /bfa/chatbot/survey`.
- adaptador HTTP al servicio de dominio.
- OAS.
- Helm/env.
- tests.

## Flujo requerido

```text
BFF /bfa/chatbot
  -> BFA /v1/chatbot
  <- bfaResponse
  -> dominio /v1/chat-interactions/turns
  <- 202 accepted
  -> frontend bfaResponse original
```

```text
BFF /bfa/chatbot/survey
  -> BFA /v1/chatbot/survey
  <- acknowledgement
  -> dominio /v1/chat-interactions/surveys
  <- 202 accepted
  -> frontend acknowledgement original
```

El dominio sólo puede llamarse después de BFA porque necesita `bfaResponse`.

## DTO BFF entrada

Reusar:

- `ChatMessageRequestDto`;
- `ChatHistoryMessageDto`;
- `ChatQueueInfoDto`;
- `SubmitChatSurveyRequestDto`;
- `ChatSurveyDto`.

Scores 1–7, timestamp ISO, email válido, historia tipada.

## Comando al dominio

```ts
type RecordChatTurnCommand = {
  operationId: string;
  conversationId: string;
  agentId: string;
  userEmail: string;
  timestamp: string;
  message: string;
  history: ChatHistoryMessageDto[];
  queueInfo?: ChatQueueInfoDto;
  bfaResponse: unknown;
};
```

```ts
type RecordChatSurveyCommand = {
  operationId: string;
  conversationId: string;
  action: 'survey';
  survey: ChatSurveyDto;
  userEmail?: string;
  history?: ChatHistoryMessageDto[];
  bfaAcknowledgement: {
    text: string;
    conversationId: string;
  };
};
```

## Idempotencia

- Generar `operationId` UUID v4 por solicitud.
- Enviar `Idempotency-Key`.
- Reusar el mismo valor en todos los reintentos.
- Un `409` sólo se acepta si confirma el mismo `operationId`.

## Errores

1. BFA falla: no llamar dominio.
2. BFA supera timeout: `502/504`.
3. Dominio responde 202: devolver respuesta BFA original.
4. Dominio falla: no fabricar éxito.
5. Payload inválido: 400/422.
6. Logs sólo con operationId, conversationId, status y latencia.

## Performance y asincronismo

- BFA timeout configurable: 8 s.
- Dominio timeout configurable: 2 s.
- El dominio responde 202 después de durabilizar el comando/outbox; no esperar
  publicación SNS.
- Máximo 2 reintentos al dominio, sólo idempotentes.
- Backoff corto: 100/250 ms.
- Abort timeout con `AbortController` o cliente HTTP configurado.

## Puertos/adaptadores

```text
domain/ports/
  chatbot-agent.port.ts
  chat-interactions-domain.port.ts
infrastructure/adapters/
  bfa-http.adapter.ts
  chat-interactions-domain-http.adapter.ts
```

`BfaService` orquesta puertos y no conoce MongoDB, SNS, SQS o BigQuery.

## Configuración

```dotenv
PORT=3000
BFA_CHATBOT_URL=http://localhost:3001/v1
CHAT_INTERACTIONS_DOMAIN_URL=http://localhost:3002/v1
BFA_TIMEOUT_MS=8000
CHAT_INTERACTIONS_DOMAIN_TIMEOUT_MS=2000
CHAT_INTERACTIONS_RETRY_MAX=2
```

## OAS

Actualizar:

- `/bfa/chatbot`;
- `/bfa/chatbot/survey`;
- schemas de input/output;
- `400`, `401`, `403`, `422`, `502`, `504`;
- ejemplos PyME, B2B y survey;
- descripción explícita de propagación status/body.

## Criterios Gherkin

```gherkin
Scenario: BFA y dominio aceptan un turno
  Given el payload es válido
  When BFF recibe bfaResponse
  Then envía al dominio input + bfaResponse + operationId
  And espera 202 de dominio
  And retorna bfaResponse sin modificar

Scenario: BFA falla
  Given BFA responde 503 o timeout
  When BFF termina retries BFA
  Then no llama al dominio
  And retorna un error observable

Scenario: Dominio falla
  Given BFA respondió exitosamente
  And dominio responde 500 o timeout
  When BFF agota retries
  Then BFF no retorna éxito
  And registra operationId, status y latencia sin PII

Scenario: Encuesta duplicada
  Given un operationId ya existe
  When BFF reintenta el mismo comando
  Then dominio confirma idempotencia
  And Mongo/SNS no se duplican
```

## Definition of Done

- Controller/service tests.
- OAS validado.
- Build y lint aprobados.
- Adaptador al dominio cubierto.
- Retry idempotente cubierto.
- Sin dependencias de Mongo/SNS.


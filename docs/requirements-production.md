# Requerimientos técnicos de producción

## 1. Alcance y arquitectura objetivo

El documento separa los cambios realizados durante la PoC de la implementación
productiva.

### Decisión obligatoria de arquitectura

1. **Frontend** normaliza los payloads del widget y llama al BFF.
2. **BFF** orquesta el flujo.
3. **BFA** sólo consulta Dialogflow y devuelve la respuesta normalizada o el
   acuse de encuesta.
4. **Servicio de dominio de interacciones** recibe la entrada original, la
   respuesta BFA y los metadatos de trazabilidad; persiste en MongoDB y publica
   eventos.
5. El servicio de dominio es independiente y sigue arquitectura hexagonal con
   NestJS.
6. BFA no importa MongoDB, SNS/SQS ni puertos de persistencia/publicación.

```text
Frontend
  -> BFF /bfa/chatbot
       -> BFA /v1/chatbot
       <- respuesta Dialogflow
       -> Servicio dominio POST /v1/chat-interactions/turns
       <- 202 accepted + correlationId
  <- respuesta Dialogflow original

Frontend
  -> BFF /bfa/chatbot/survey
       -> BFA /v1/chatbot/survey
       <- acuse BFA
       -> Servicio dominio POST /v1/chat-interactions/surveys
       <- 202 accepted + correlationId
  <- respuesta de encuesta
```

El BFF llama al dominio **después** de recibir la respuesta BFA porque necesita
incluirla en el comando persistible. Las llamadas al dominio no deben incluir la
espera de inserción MongoDB o publicación SNS en el camino crítico: el dominio
debe confirmar un registro duradero del comando y procesarlo de forma
asíncrona.

---

## 2. Frontend: cambios requeridos

Repositorio: `bx-front-integration-ecommerce`.

### 2.1 Endpoints afectados

- `src/pages/api/chat-proxy/dialogflow/index.ts`
- `src/pages/api/chat-proxy-b2b/dialogflow/index.ts`
- `src/pages/api/chat-proxy/index.ts`
- `src/pages/api/chat-proxy-b2b/index.ts`
- `src/server/chatbot-contracts.ts`

### 2.2 Responsabilidad

Los endpoints Dialogflow:

1. Validan método POST, origen y configuración del agente.
2. Normalizan snake_case/camelCase del widget.
3. Propagan al BFF:
   - `conversationId`;
   - `agentId`;
   - `message`;
   - `timestamp`;
   - `userEmail`;
   - `history`;
   - `queueInfo`.
4. Mantienen los headers de autenticación existentes:
   - `Authorization`;
   - `x-api-key`;
   - `apikey`.
5. Eliminan logs de payload completo y correo.
6. Traducen errores de payload a `400`.
7. Propagan errores upstream como error observable; no retornan éxito
   artificial.

Los endpoints raíz:

1. Conservan el envío actual a Latenode.
2. Para `action: survey`, generan además el payload BFF y llaman
   `POST /bfa/chatbot/survey`.
3. El doble envío se habilita por defecto.
4. Se puede deshabilitar temporalmente con
   `CHATBOT_SURVEY_BFF_ENABLED=false`.
5. En Productivo, los destinos no deben ejecutarse de forma que un timeout de
   Latenode oculte el fallo BFA. Usar `Promise.allSettled` sólo si el handler
   evalúa ambos resultados de forma explícita.
6. Debe devolver `2xx` sólo si todos los destinos obligatorios aceptaron la
   solicitud.

### 2.3 Contrato normalizado: mensaje

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

### 2.4 Contrato normalizado: encuesta

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

Reglas:

- Acepta `survey`, `survey_data` o `surveyData`.
- Normaliza timestamps a ISO 8601.
- Convierte scores numéricos a enteros.
- Rechaza scores fuera de `1..7`.
- Acepta `historymsg`, `history_msg` o `history`.
- No conserva campos raw innecesarios.

### 2.5 `.env.example` Frontend

Agregar sin valores sensibles:

```dotenv
NEXT_PUBLIC_ONE_BLUE_API_URL_APIGTW=https://gateway.example.invalid/b2cc2x
NEXT_PUBLIC_ONE_BLUE_API_KEY_APIGTW=
NEXT_PUBLIC_PYME_DIALOGFLOW_AGENT_ID=
NEXT_PUBLIC_B2B_DIALOGFLOW_AGENT_ID=
CHATBOT_SURVEY_BFF_ENABLED=true
LATENODE_WEBHOOK_URL=
LATENODE_B2B_WEBHOOK_URL=
```

Usar valores locales sólo en `.env`, nunca en archivos versionados.

### 2.6 Performance

- Mantener los webhooks del widget en rutas relativas; no versionar
  `http://localhost:3000` como URL productiva.
- Ejecutar Latenode y BFF en paralelo sólo para encuesta y evaluar todos los
  resultados.
- No serializar/loggear `req.body` completo.
- Definir timeout para `fetch`: 5–8 segundos como máximo configurable.
- Propagar `AbortController.signal`.
- No reintentar automáticamente una encuesta desde Front; la idempotencia
  corresponde al dominio/BFF.

### 2.7 Gherkin Frontend

```gherkin
Feature: Propagación de conversación PyME al BFF
  Scenario: Normalización completa de un mensaje PyME
    Given llega un POST a /api/chat-proxy/dialogflow con conversation_id, newmsg, historymsg, queue_info y login_wall.email
    When el payload es válido
    Then el BFF recibe conversationId, agentId, message, timestamp, userEmail, history y queueInfo
    And los timestamps se envían en formato ISO 8601
    And la respuesta del BFF se devuelve al widget sin cambiar su shape

  Scenario: Payload PyME inválido
    Given llega un POST sin userEmail o con timestamp inválido
    When el mapper procesa el payload
    Then el endpoint responde 400
    And no llama al BFF

Feature: Propagación de conversación B2B al BFF
  Scenario: B2B incluye los mismos metadatos de PyME
    Given llega un POST a /api/chat-proxy-b2b/dialogflow
    When el payload contiene history, timestamp y email
    Then el BFF recibe el mismo contrato tipado que PyME

Feature: Doble envío de encuesta
  Scenario: Encuesta válida con doble escritura habilitada
    Given action es "survey"
    And CHATBOT_SURVEY_BFF_ENABLED no está deshabilitado
    When llega survey_data válido
    Then el endpoint llama a Latenode
    And llama al BFF /bfa/chatbot/survey
    And normaliza calidad_atencion, resolucion, agente_id y timestamp

  Scenario: Encuesta inválida
    Given calidad_atencion es 8
    When el endpoint normaliza survey_data
    Then responde 400
    And no publica al BFF

  Scenario: Un destino obligatorio falla
    Given Latenode o el BFF responde error
    When termina la evaluación del doble envío
    Then el endpoint no responde éxito
    And registra destino, status y conversationId sin registrar PII
```

---

## 3. BFF: cambios requeridos

Repositorio: `bx-bff-b2cc2x-oneblue`.

### 3.1 Cambios implementados

- DTO tipado de historia.
- DTO de mensaje normal.
- DTO de encuesta.
- `POST /bfa/chatbot`.
- `POST /bfa/chatbot/survey`.
- Servicio que conserva status y body upstream.
- OAS actualizado.
- Pruebas unitarias de controller/service.
- Eliminación de `any` en las rutas nuevas donde fue posible.

### 3.2 Orquestación productiva obligatoria

El BFF debe ampliar su responsabilidad:

```text
POST /bfa/chatbot
  1. validar DTO
  2. llamar BFA /v1/chatbot
  3. recibir agentResponse
  4. construir RecordChatTurnCommand
  5. llamar dominio /v1/chat-interactions/turns
  6. devolver agentResponse original
```

```text
POST /bfa/chatbot/survey
  1. validar DTO
  2. llamar BFA /v1/chatbot/survey
  3. recibir surveyAcknowledgement
  4. construir RecordChatSurveyCommand
  5. llamar dominio /v1/chat-interactions/surveys
  6. devolver acknowledgement original
```

### 3.3 DTO BFF → dominio: turno

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

### 3.4 DTO BFF → dominio: encuesta

```ts
type RecordChatSurveyCommand = {
  operationId: string;
  conversationId: string;
  action: 'survey';
  survey: ChatSurveyDto;
  history?: ChatHistoryMessageDto[];
  userEmail?: string;
  bfaAcknowledgement: {
    text: string;
    conversationId: string;
  };
};
```

`operationId`:

- UUID v4;
- se reusa en todo el flujo;
- se envía al dominio como `Idempotency-Key`;
- se relaciona con `correlationId` de observabilidad.

### 3.5 Puerto y adaptador requeridos en BFF

```text
src/services/bfa/
  domain/ports/
    chatbot-agent.port.ts
    chat-interaction-domain.port.ts
  infrastructure/adapters/
    bfa-http.adapter.ts
    chat-interaction-domain-http.adapter.ts
```

`BfaService` debe orquestar puertos, no conocer MongoDB, SNS ni detalles de
BigQuery.

### 3.6 Respuesta y errores

- BFA `2xx`: continuar al dominio.
- BFA error: retornar status upstream o `502`; no llamar dominio.
- Dominio `202`: retornar el response BFA original.
- Dominio `409` por duplicado idempotente: considerar aceptado sólo si el
  response confirma que corresponde al mismo `operationId`.
- Dominio `4xx`: retornar `502`/`422` según validación contratual.
- Dominio timeout/5xx: reintentar como máximo según política; si falla, no
  retornar éxito.
- El frontend puede mostrar el mensaje de agente sólo si BFA y dominio fueron
  aceptados, o se debe formalizar un feature flag de consistencia eventual.

### 3.7 Performance y asincronismo

- La única dependencia secuencial es BFA → dominio.
- El endpoint de dominio debe responder `202` después de persistir un comando
  durable/outbox, no después de publicar SNS o completar BigQuery.
- Timeout sugerido BFA: configurable, 8 s.
- Timeout sugerido dominio: configurable, 2 s.
- Reintentos sólo a idempotentes y con `Idempotency-Key`.
- Backoff corto: 100 ms, 250 ms; máximo 2 reintentos.
- No duplicar logs del body, correo o historial.
- Registrar `operationId`, `conversationId`, destinos, latencia y status.

### 3.8 `.env.example` BFF

```dotenv
PORT=3000
BFA_CHATBOT_URL=http://localhost:3001/v1
CHAT_INTERACTIONS_DOMAIN_URL=http://localhost:3002/v1
BFA_TIMEOUT_MS=8000
CHAT_INTERACTIONS_DOMAIN_TIMEOUT_MS=2000
CHAT_INTERACTIONS_RETRY_MAX=2
```

### 3.9 OAS BFF

Agregar/actualizar:

- `POST /bfa/chatbot`.
- `POST /bfa/chatbot/survey`.
- `ChatHistoryMessageDto`.
- `ChatQueueInfoDto`.
- `ChatMessageRequestDto`.
- `SubmitChatSurveyRequestDto`.
- `ChatSurveyDto`.
- respuestas `200/201/202`, `400`, `401`, `403`, `422`, `500/502/504`.
- ejemplos PyME, B2B y encuesta.
- indicar que la respuesta de agente conserva el JSON BFA.

### 3.10 Gherkin BFF

```gherkin
Feature: Orquestación de mensaje chatbot
  Scenario: BFA responde y dominio acepta el turno
    Given el payload del frontend es válido
    When el BFF llama a BFA
    Then recibe bfaResponse
    And envía al dominio la entrada original más bfaResponse y operationId
    And el dominio responde 202
    And el BFF retorna el bfaResponse sin modificarlo

  Scenario: BFA no responde
    Given BFA responde 503 o supera timeout
    When el BFF ejecuta la política de reintento
    Then no llama al dominio
    And responde error upstream observable

  Scenario: Dominio no acepta la persistencia
    Given BFA respondió exitosamente
    And el dominio responde 500 o timeout
    When se agotan los reintentos idempotentes
    Then el BFF no transforma el fallo en éxito
    And registra operationId sin PII

Feature: Orquestación de encuesta
  Scenario: Encuesta válida completa
    Given la encuesta tiene scores entre 1 y 7
    When BFA responde request accepted
    Then el BFF llama al dominio con encuesta, historial y acknowledgement
    And reutiliza el mismo operationId

  Scenario: Reintento de encuesta duplicada
    Given el dominio ya recibió el operationId
    When el BFF reintenta con la misma Idempotency-Key
    Then el dominio no duplica Mongo ni SNS
```

---

## 4. Nuevo servicio de dominio: persistencia y propagación

Repositorio nuevo sugerido: `bx-srv-chat-interactions`.

Este repositorio reemplaza las responsabilidades de MongoDB/SNS que estaban en
el prototipo BFA.

### 4.1 Responsabilidad única

- Recibir comandos de turno y encuesta.
- Validar contrato.
- Persistir/actualizar conversación.
- Cerrar encuesta de forma idempotente.
- Crear evento de dominio.
- Garantizar publicación con outbox.
- Exponer estado de procesamiento para soporte.

No consulta Dialogflow.

### 4.2 Arquitectura hexagonal

```text
src/chat-interactions/
  domain/
    models/
      conversation.ts
      chat-event.ts
      outbox-event.ts
    ports/inbound/
      record-chat-turn.port.ts
      record-chat-survey.port.ts
    ports/outbound/
      conversation.repository.port.ts
      outbox.repository.port.ts
      event.publisher.port.ts
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
      outbox.repository.ts
    adapters/outbound/
      sns-event.publisher.ts
    schedulers/
      outbox-publisher.scheduler.ts
```

### 4.3 Flujo de dominio

Al recibir `POST /v1/chat-interactions/turns`:

1. Validar `Idempotency-Key`.
2. Comprobar `operationId`.
3. Aplicar `saveUserTurn`.
4. Persistir la respuesta BFA como mensaje agent y metadatos
   `motivo`/`razonamiento`.
5. Crear un documento de operación procesado.
6. Retornar `202`.

Al recibir `POST /v1/chat-interactions/surveys`:

1. Buscar conversación.
2. Actualizar historia enviada.
3. Guardar survey.
4. Marcar `COMPLETED`.
5. Calcular `closedAt`, duración y eventos derivados.
6. Crear outbox con `eventId` estable en la misma transacción MongoDB.
7. Retornar `202`.

El dominio debe usar transacción MongoDB para conversación + outbox si el
entorno lo permite.

### 4.4 Colección `conversations`

Campos mínimos:

- `conversationId`;
- `agentId`;
- `userEmail`;
- `history[]` con `messageKey`;
- `queueInfo`;
- `motivo`;
- `razonamiento`;
- `survey`;
- `status`;
- `createdAt`;
- `updatedAt`;
- `closedAt`;
- `durationSeconds`;
- `lastOperationId`.

Índices:

- único `{ conversationId: 1 }`;
- `{ userEmail: 1, updatedAt: -1 }`;
- `{ status: 1, updatedAt: 1 }`.

No usar TTL hasta definir retención legal.

### 4.5 Colección `operations`

Evita reejecución:

- único `{ operationId: 1 }`;
- `endpoint`;
- `conversationId`;
- `status`;
- `requestHash`;
- `createdAt`;
- `processedAt`.

Un mismo `operationId` con body distinto debe devolver conflicto.

### 4.6 Colección `outbox_events`

- `eventId` único;
- `operationId`;
- `aggregateId`;
- `eventType`;
- `payload`;
- `status: PENDING | PUBLISHED | FAILED`;
- `attempts`;
- `lastError`;
- `availableAt`;
- `createdAt`;
- `publishedAt`.

### 4.7 Publicación

El scheduler:

1. toma eventos `PENDING`;
2. intenta SNS;
3. usa `eventId` estable;
4. marca `PUBLISHED` sólo después de confirmar SNS;
5. aplica backoff exponencial con jitter;
6. respeta `maxAttempts`;
7. deja un evento en `FAILED` observable sin eliminarlo.

Política sugerida:

- `OUTBOX_BATCH_SIZE=20`;
- `OUTBOX_POLL_INTERVAL_MS=1000`;
- `OUTBOX_MAX_ATTEMPTS=8`;
- backoff máximo 60 s;
- DLQ/SQS según infraestructura productiva.

### 4.8 `.env.example` dominio

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

No exponer MongoDB ni SNS al BFA.

### 4.9 OAS dominio

Agregar:

- `POST /v1/chat-interactions/turns`;
- `POST /v1/chat-interactions/surveys`;
- `GET /v1/chat-interactions/{conversationId}`;
- `Idempotency-Key` obligatorio;
- respuestas `202`, `400`, `404`, `409`, `422`, `500`;
- `operationId`, `correlationId`, estado `accepted`.

### 4.10 Gherkin dominio

```gherkin
Feature: Persistencia idempotente de interacción
  Scenario: Turno nuevo
    Given llega un comando de turno válido
    When operationId no existe
    Then se persiste el turno y la respuesta BFA
    And responde 202

  Scenario: Reintento con el mismo operationId
    Given el operationId ya fue procesado con el mismo hash
    When llega el mismo comando
    Then no se duplica la historia
    And responde 202 idempotente

  Scenario: Reintento con body distinto
    Given operationId existe
    And requestHash no coincide
    Then responde 409

Feature: Cierre de encuesta y outbox
  Scenario: Cierre nuevo
    Given la conversación está OPEN
    When llega una encuesta válida
    Then se guarda survey, CLOSED/COMPLETED y outbox en una transacción

  Scenario: Publicación fallida
    Given SNS no está disponible
    When el worker procesa el evento
    Then la conversación permanece cerrada
    And el outbox permanece recuperable
    And incrementa attempts
```

---

## 5. BFA: cambios sin persistencia ni propagación

Repositorio: `bx-app-bfa-account`.

### 5.1 Cambios que deben conservarse

Son válidos aunque se retire Mongo/SNS:

- DTO `ChatbotMessageDto`.
- DTO `SubmitChatSurveyDto`.
- `ChatHistoryMessageDto`.
- `ChatQueueInfoDto`.
- `ChatbotController` versionado.
- `POST /v1/chatbot`.
- `POST /v1/chatbot/survey`.
- `ValidationPipe({ transform: true, whitelist: true })` aplicado sólo al
  controlador chatbot.
- `DialogflowAdapter`.
- `ChatbotModule`.
- eliminación del `ChatbotUseCase` legado.
- parseo tolerante de respuesta Dialogflow JSON con/without markdown.
- casos de prueba de controller, adapter y validación.

### 5.2 Cambios que deben eliminarse o moverse

Mover al repositorio de dominio:

- `MongoConversationRepository`;
- `ConversationRepositoryPort`;
- `InteractionEventPublisherPort`;
- `SnsInteractionPublisher`;
- `SubmitSurveyUseCase` con cierre/publicación;
- dependencias `@aws-sdk/client-sns`;
- import de `DatabaseModule`;
- cualquier `MONGODB_*`;
- `CHAT_EVENTS_*`;
- lógica de outbox, retry SNS y `eventPublishedAt`.

El BFA no debe importar `callbot` DatabaseModule desde el módulo chatbot.

### 5.3 Caso de uso BFA final

```text
ChatTurnUseCase:
  1. recibe ChatbotMessageDto;
  2. llama AgentProviderPort.sendMessage;
  3. retorna exactamente la respuesta Dialogflow.
```

```text
SubmitSurveyUseCase:
  1. valida DTO mediante controller pipe;
  2. no persiste;
  3. no publica;
  4. retorna acknowledgement.
```

### 5.4 DTO BFA

No se elimina la validación:

- `conversationId`: requerido;
- `agentId`: requerido;
- `message`: string;
- `timestamp`: ISO 8601;
- `userEmail`: email;
- `history`: arreglo;
- `queueInfo`: enteros no negativos;
- scores: enteros `1..7`.

### 5.5 `.env.example` BFA final

```dotenv
PORT=3001
BX_LOG_LEVEL=info
ENVIRONMENT=development
GCP_PROJECT_ID=
GCP_REGION=us-central1
GCP_SA_INTGR_BFA=
ELEVENLABS_AUTH_TOKEN=
```

No incluir en BFA:

- `MONGODB_*` por la capacidad chatbot;
- `CHAT_EVENTS_*`;
- `AWS_ACCESS_KEY_ID` para eventos de chat.

Estas variables pueden seguir existiendo temporalmente para CallBot, pero no
deben formar parte del módulo chatbot ni crear conexión Mongo para esta
capacidad.

### 5.6 Performance

- No esperar MongoDB, SNS ni BigQuery.
- Latencia del endpoint queda dominada por Dialogflow.
- No ejecutar trabajo background que contenga contexto de conversación.
- Cancelar request a Dialogflow con timeout configurable.
- No loggear historial/correo.
- Reutilizar cliente/auth GCP cuando sea seguro.

### 5.7 OAS BFA

Documentar:

- `POST /v1/chatbot`;
- `POST /v1/chatbot/survey`;
- DTOs y ejemplos;
- `400` por validación;
- `401/403` si aplica;
- `502/504` por Dialogflow;
- respuesta de agente sin wrapper adicional.

---

## 6. Trazabilidad y no funcionales comunes

### Identificadores

- `correlationId`: trazabilidad HTTP global.
- `operationId`: idempotencia de negocio.
- `eventId`: evento publicado, estable.
- `conversationId`: agregado.

### Seguridad

- No loggear cuerpo completo, correos, comentarios ni claves.
- Limitar acceso a MongoDB, RAW y mart por IAM.
- No versionar `.env`, service-account JSON ni llaves.
- Mantener PII sólo donde exista aprobación y política de retención.

### Timeouts recomendados

- Front → BFF: 10 s.
- BFF → BFA: 8 s.
- BFF → dominio: 2 s para aceptación `202`.
- Dominio → Mongo: configurable.
- Dominio → SNS: SDK retry + outbox.

### Métricas

- latencia BFF→BFA;
- latencia aceptación dominio;
- errores BFA/dominio;
- operaciones duplicadas;
- tamaño/edad máxima de outbox;
- reintentos y eventos `FAILED`;
- ratio de encuestas aceptadas.

## 7. Matriz de cambios por repositorio

| Repositorio | Debe persistir | Debe publicar SNS | Consulta Dialogflow | Orquesta |
| --- | ---: | ---: | ---: | ---: |
| Frontend | No | No | No | No |
| BFF | No | No | No, llama BFA | Sí |
| BFA | No | No | Sí | No |
| Servicio dominio | Sí | Sí | No | No |

## 8. Orden sugerido de implementación

1. Publicar los contratos OpenAPI y DTOs.
2. Crear servicio de dominio con Mongo e idempotencia.
3. Implementar outbox/publicación.
4. Agregar adaptador BFF hacia dominio.
5. Orquestar BFA → dominio.
6. Retirar Mongo/SNS del BFA.
7. Activar doble envío Front/BFF con feature flag.
8. Pruebas de contrato y resiliencia.
9. Pruebas de carga.
10. Activar observabilidad e IAM productivos.

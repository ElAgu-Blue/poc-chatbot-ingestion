# Requerimientos tÃ©cnicos de datos y eventos

## 1. Alcance

Este documento define el diseÃ±o objetivo para:

```text
[ Servicio de dominio de interacciones ]
                    |
                    v
          [ AWS SNS Topic ]
                    |
          [ AWS SQS Queue ]
                    |
        [ Message Mover / MeMo ]
          Bridge Cross-Cloud
                    |
                    v
          [ GCP Pub/Sub Topic ]
                    |
          [ Pub/Sub Subscription ]
                    |
        [ DME Data Publisher ]
                    |
                    v
 [ BigQuery EVS ]  append-only, versionada
                    |
 [ Dataform RAW ]  deduplicaciÃ³n/Ãºltima foto
                    |
                    v
 [ BigQuery ACC / Mart ]
                    |
                    v
              [ Looker ]
```

El servicio de dominio es el Ãºnico componente que persiste la conversaciÃ³n
operativa y publica al evento gobernado.

La arquitectura corporativa de Data Mesh Blue es EVS â†’ RAW â†’ ACC. Looker Studio
se conecta Ãºnicamente a ACC/mart; queda prohibido consultar EVS directamente
por costo y gobernanza.

## 2. Convenciones generales

### 2.1 Identificadores

- `conversationId`: UUID o ID estable asignado al inicio de la conversaciÃ³n.
- `operationId`: UUID v4; idempotencia del comando HTTP.
- `eventId`: UUID v4; idempotencia del evento publicado.
- `correlationId`: ID de trazabilidad HTTP distribuida.

`conversationId`, `eventId` y timestamps se conservan sin regenerarse a travÃ©s
de SNS, SQS, Pub/Sub y BigQuery.

### 2.2 Nombres obligatorios: PoC actual

| Elemento | Nombre |
| --- | --- |
| MongoDB database | `oneblue_chat` |
| MongoDB collection operativa | `conversations` |
| MongoDB idempotency | `operations` |
| MongoDB outbox | `outbox_events` |
| AWS SNS topic | `topic-oneblue-chat-interactions` |
| AWS SQS mover | `queue-oneblue-chat-interactions-mover` |
| AWS SQS DLQ | `queue-oneblue-chat-interactions-mover-dlq` |
| GCP Pub/Sub topic | `topic-oneblue-chat-interactions` |
| GCP Pub/Sub subscription | `sub-oneblue-chat-interactions-data-publisher` |
| GCP Pub/Sub topic DLQ | `topic-oneblue-chat-interactions-dlq` |
| BigQuery dataset | `globalOnboardingB2cc2x` |
| BigQuery RAW/EVS | `evs_chat_conversations` |
| BigQuery mart | `daily_chatbot_summary` |

Para otros ambientes debe parametrizarse por configuraciÃ³n, conservando los
sufijos y el significado.

### 2.3 Nombres obligatorios: destino productivo DME

Los nombres de la PoC son alias locales. Productivo debe usar los siguientes
estÃ¡ndares:

| Artefacto | Nombre productivo |
| --- | --- |
| `businessDomain` | `clientes` |
| `businessCapability` | `b2cc2x` |
| Producto de dato | `bx-dme-b2cc2x-chat-interactions` |
| Repositorio DPO | `bx-dpo-b2cc2x-chat-interactions` |
| Repositorio DPC/Dataform | repositorio separado, por ejemplo `bx-dpc-b2cc2x-chat-interactions` |
| AWS SNS topic | `topic-b2cc2x-chat-interactions` |
| AWS SQS mover | `queue-b2cc2x-mover` |
| AWS SQS DLQ | `queue-b2cc2x-mover-dlq` |
| GCP Pub/Sub topic | `topic-b2cc2x-chat-interactions` |
| GCP subscription | `sb-b2cc2x-publisher-chat-interactions-{{environment}}` |
| GCP DLQ topic | `topic-b2cc2x-chat-interactions-dlq` |
| GCP project | `bx-b2cc2x-{{environment}}` |
| Dataset | `b2cc2x_chatInteractions` |
| Schema DME | `ChatInteractions` |
| Tabla EVS | `chatInteractions_v1_0_0` |
| ACC/mart | `daily_chatbot_summary` |

La decisiÃ³n `b2cc2x` vs. `b2cc2x` debe fijarse antes de solicitar el DPO. Si el
producto pertenece al onboarding, la alternativa permitida debe seguir el
mismo patrÃ³n: `bx-dpo-b2cc2x-chat-interactions`,
`bx-dme-b2cc2x-chat-interactions` y sus topics/queues equivalentes.

El DPO y el DPC/Dataform son repositorios separados:

- DPO: contrato AsyncAPI, `schema.json`, MeMo, Data Publisher y configuraciÃ³n
  DME.
- DPC: modelos Dataform de RAW/curaciÃ³n/ACC; no contiene secretos de ingesta.

---

## 3. MongoDB

### 3.1 ColecciÃ³n `conversations`

La colecciÃ³n representa el estado operativo consolidado.

#### Documento

```json
{
  "_id": "ObjectId",
  "conversationId": "4a335a3e-5bbe-4cad-947d-e3851f873a04",
  "agentId": "widget",
  "userEmail": "usuario@example.invalid",
  "motivo": "FAQS_GENERICAS",
  "razonamiento": "Cierre detectado por despedida del usuario.",
  "history": [
    {
      "id": "0",
      "messageKey": "Agent:0:2026-11-23T01:10:00.000Z",
      "role": "Agent",
      "message": "Hola, Â¿en quÃ© puedo ayudarte?",
      "timestamp": "ISODate",
      "attachments": []
    }
  ],
  "messagesCount": 4,
  "queueInfo": {
    "messagesInBatch": 1,
    "debounceDelay": 3000
  },
  "survey": {
    "calidadAtencion": 6,
    "resolucion": 7,
    "comentario": "Consulta resuelta.",
    "agenteId": "widget",
    "submittedAt": "ISODate"
  },
  "status": "COMPLETED",
  "createdAt": "ISODate",
  "updatedAt": "ISODate",
  "closedAt": "ISODate",
  "durationSeconds": 325,
  "lastOperationId": "UUID"
}
```

#### Tipos TypeScript

```ts
type ConversationStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'ABANDONED';

type ChatHistoryMessage = {
  id: string | number;
  messageKey: string;
  role: 'Agent' | 'user' | 'system';
  message: string;
  timestamp: Date;
  attachments?: Record<string, unknown>[];
};

type ChatSurvey = {
  calidadAtencion: number;
  resolucion: number;
  comentario?: string;
  agenteId: string;
  submittedAt: Date;
};

type ConversationDocument = {
  conversationId: string;
  agentId: string;
  userEmail: string;
  motivo?: string;
  razonamiento?: string;
  history: ChatHistoryMessage[];
  messagesCount: number;
  queueInfo?: {
    messagesInBatch: number;
    debounceDelay: number;
  };
  survey?: ChatSurvey;
  status: ConversationStatus;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
  durationSeconds?: number;
  lastOperationId: string;
};
```

#### Validaciones BSON

- Scores: BSON Int32, rango 1â€“7.
- `messageKey`: string estable para deduplicaciÃ³n.
- `createdAt`, `updatedAt`, `closedAt`, `submittedAt`: BSON Date.
- `durationSeconds`, `messagesCount`: entero no negativo.
- `history`: mÃ¡ximo definido por polÃ­tica de producto; no truncar
  silenciosamente.
- `conversationId` y `userEmail` no pueden estar vacÃ­os.
- `status = COMPLETED` requiere `closedAt`.
- Un documento `COMPLETED` con survey debe incluir `submittedAt`.

#### Ãndices

```js
db.conversations.createIndex(
  { conversationId: 1 },
  { unique: true, name: "conversationId_unique" },
)

db.conversations.createIndex(
  { userEmail: 1, updatedAt: -1 },
  { name: "userEmail_updatedAt" },
)

db.conversations.createIndex(
  { status: 1, updatedAt: 1 },
  { name: "status_updatedAt" },
)
```

No crear TTL hasta que DPO defina plazo de retenciÃ³n y mecanismo de borrado.

### 3.2 ColecciÃ³n `operations`

Evita reejecutar comandos HTTP.

```ts
type OperationDocument = {
  operationId: string;
  conversationId: string;
  operationType: 'CHAT_TURN' | 'CHAT_SURVEY';
  requestHash: string;
  status: 'ACCEPTED' | 'PROCESSED' | 'FAILED';
  createdAt: Date;
  processedAt?: Date;
  error?: string;
};
```

Ãndice obligatorio:

```js
db.operations.createIndex(
  { operationId: 1 },
  { unique: true, name: "operationId_unique" },
)
```

Un `operationId` repetido con `requestHash` distinto debe devolver conflicto,
no crear una segunda operaciÃ³n.

### 3.3 ColecciÃ³n `outbox_events`

```ts
type OutboxEventDocument = {
  eventId: string;
  operationId: string;
  aggregateId: string;
  eventType: string;
  status: 'PENDING' | 'PUBLISHED' | 'FAILED';
  payload: Record<string, unknown>;
  messageAttributes: Record<string, string>;
  attempts: number;
  availableAt: Date;
  createdAt: Date;
  publishedAt?: Date;
  lastError?: string;
};
```

Ãndices:

```js
db.outbox_events.createIndex(
  { eventId: 1 },
  { unique: true, name: "eventId_unique" },
)

db.outbox_events.createIndex(
  { status: 1, availableAt: 1 },
  { name: "pending_publish" },
)
```

La escritura de conversaciÃ³n + outbox debe ejecutarse en transacciÃ³n MongoDB
cuando el despliegue use replica set.

### 3.4 Gherkin MongoDB

```gherkin
Feature: Persistencia idempotente de conversaciones
  Scenario: Encuesta cierra una conversaciÃ³n nueva
    Given la conversaciÃ³n existe en estado OPEN
    When se persiste una encuesta vÃ¡lida con operationId nuevo
    Then status cambia a COMPLETED
    And se guarda closedAt, durationSeconds y survey
    And se crea exactamente un outbox_event

  Scenario: Reintento idempotente
    Given operationId y requestHash ya fueron procesados
    When llega el mismo comando
    Then no se agrega historia duplicada
    And no se crea un segundo outbox_event

  Scenario: ReutilizaciÃ³n peligrosa de operationId
    Given operationId existe con otro requestHash
    When llega una solicitud con el mismo operationId
    Then el servicio responde conflicto
    And no modifica MongoDB
```

---

## 4. Contrato del evento

### 4.0 Gobernanza obligatoria AsyncAPI 3.0

Antes de desplegar infraestructura debe existir y aprobarse un contrato
AsyncAPI 3.0.0.

Validaciones de release:

1. `asyncapi: 3.0.0`.
2. ValidaciÃ³n con la
   [Gema Validador de Contratos](https://gemini.google.com/gem/eedc57e0813b?usp=sharing).
3. Prueba del contrato contra Postman Mock Server.
4. `operationId` debe coincidir con `schemaName`.
5. Los nombres de `components.messages` y `components.schemas` deben coincidir
   con sus valores `x-dme-path-reference`.
6. `datetimeMetadata` debe existir y tener `format: date-time`.
7. `userEmail` y cualquier campo PII deben tener Policy Tag DME.

Extensiones obligatorias:

| ExtensiÃ³n | UbicaciÃ³n | Valor/regla |
| --- | --- | --- |
| `x-dme-path-reference` | message y schema | Coincide exactamente con el schema, por ejemplo `ChatInteractions` |
| `x-dme-fullpayload` | message | String `"true"` |
| `x-dme-operation` | message | `"C"` create, `"U"` update o `"D"` delete |
| `x-dme-version` | schema | VersiÃ³n semÃ¡ntica, por ejemplo `"1.0.0"` |
| `x-dme-securityPolicyTags` | campo PII | ID/taxonomÃ­a vigente de Google Cloud Data Catalog |
| `operationId` | operaciÃ³n AsyncAPI | Debe ser `ChatInteractions` si `schemaName=ChatInteractions` |

Ejemplo contractual:

```yaml
asyncapi: 3.0.0
info:
  title: Chat Interactions API
  version: 1.0.0
  description: Eventos de conversaciones y encuestas del chatbot
defaultContentType: application/json

channels:
  chatInteractionsChannel:
    address: topic-b2cc2x-chat-interactions
    messages:
      ChatInteractionCreatedMessage:
        $ref: '#/components/messages/ChatInteractionCreatedMessage'

operations:
  sendChatInteraction:
    action: send
    channel:
      $ref: '#/channels/chatInteractionsChannel'
    operationId: ChatInteractions
    messages:
      - $ref: '#/components/messages/ChatInteractionCreatedMessage'

components:
  messages:
    ChatInteractionCreatedMessage:
      x-dme-path-reference: "ChatInteractions"
      x-dme-fullpayload: "true"
      x-dme-operation: "C"
      headers:
        type: object
        required:
          - eventId
          - eventType
          - timestamp
          - domain
          - capability
          - version
        properties:
          eventId:
            type: string
            format: uuid
          eventType:
            type: string
          timestamp:
            type: integer
          domain:
            type: string
          capability:
            type: string
          version:
            type: string
      payload:
        $ref: '#/components/schemas/ChatInteractions'

  schemas:
    ChatInteractions:
      x-dme-path-reference: "ChatInteractions"
      x-dme-version: "1.0.0"
      type: object
      required:
        - conversationId
        - eventId
        - userEmail
        - status
        - datetimeMetadata
        - messagesCount
        - durationSeconds
      properties:
        conversationId:
          type: string
        eventId:
          type: string
          format: uuid
        userEmail:
          type: string
          format: email
          x-dme-securityPolicyTags: "projects/tecnogia-arqdat-governance-prd/locations/us/taxonomies/8649944501028248774/policyTags/8984512984767038865"
        motivo:
          type: string
        razonamiento:
          type: string
        survey:
          type: object
          properties:
            calidadAtencion:
              type: integer
              minimum: 1
              maximum: 7
            resolucion:
              type: integer
              minimum: 1
              maximum: 7
            comentario:
              type: string
              x-dme-securityPolicyTags: "POLICY_TAG_COMENTARIO_VIGENTE"
            agenteId:
              type: string
            submittedAt:
              type: string
              format: date-time
        messagesCount:
          type: integer
        durationSeconds:
          type: number
        firstUserMessage:
          type: string
        lastAgentMessage:
          type: string
        status:
          type: string
          enum:
            - OPEN
            - IN_PROGRESS
            - COMPLETED
            - ABANDONED
        closedAt:
          type: string
          format: date-time
        datetimeMetadata:
          type: string
          format: date-time
```

`x-dme-securityPolicyTags` debe apuntar a la taxonomÃ­a vigente al momento del
release; si cambia, se actualiza el contrato y se incrementa versiÃ³n segÃºn el
impacto.

### 4.1 Message attributes / headers

Todos los valores se transportan como strings.

| Atributo | Tipo lÃ³gico | Obligatorio | Ejemplo |
| --- | --- | ---: | --- |
| `eventId` | UUID string | SÃ­ | `dcb2cbb2-...` |
| `eventType` | STRING | SÃ­ | `chatSurveySubmitted` |
| `entityId` | UUID/string | SÃ­ | conversaciÃ³n |
| `entityType` | STRING | SÃ­ | `chatConversation` |
| `timestamp` | epoch ms string | SÃ­ | `1795447840989` |
| `datetime` | ISO 8601 UTC | SÃ­ | `2026-11-23T01:30:40.989Z` |
| `domain` | STRING | SÃ­ | `clientes` |
| `capability` | STRING | SÃ­ | `b2cc2x` |
| `version` | SemVer contract version | SÃ­ | `1.0` |
| `correlationId` | UUID/string | Opcional | ID HTTP |

No enviar correo, comentario, historial ni score como message attributes.

### 4.2 Event types permitidos

- `chatTurnRecorded`;
- `chatSurveySubmitted`;
- `chatConversationCompleted`;
- `chatConversationAbandoned`.

La PoC puede comenzar con `chatSurveySubmitted`, pero el estado abierto debe
tener un evento si el mart productivo medirÃ¡ `OPEN` o abandono.

### 4.3 Payload

```json
{
  "conversationId": "4a335a3e-5bbe-4cad-947d-e3851f873a04",
  "eventId": "dcb2cbb2-09ff-446e-b4e8-f33c5cdd77cb",
  "userEmail": "usuario@example.invalid",
  "motivo": "FAQS_GENERICAS",
  "razonamiento": "Cierre detectado por despedida.",
  "survey": {
    "calidadAtencion": 6,
    "resolucion": 7,
    "comentario": "Consulta resuelta.",
    "agenteId": "widget",
    "submittedAt": "2026-11-23T01:30:40.989Z"
  },
  "messagesCount": 4,
  "durationSeconds": 325,
  "firstUserMessage": "Quiero saber cÃ³mo emitir.",
  "lastAgentMessage": "Puedes hacerlo desde Emisiones.",
  "status": "COMPLETED",
  "closedAt": "2026-11-23T01:30:40.989Z",
  "datetimeMetadata": "2026-11-23"
}
```

### 4.4 Tipos TS del evento

```ts
type ChatInteractionEvent = {
  conversationId: string;
  eventId: string;
  userEmail: string;
  motivo?: string;
  razonamiento?: string;
  survey?: {
    calidadAtencion: number;
    resolucion: number;
    comentario?: string;
    agenteId: string;
    submittedAt: string;
  };
  messagesCount: number;
  durationSeconds: number;
  firstUserMessage?: string;
  lastAgentMessage?: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
  closedAt?: string;
  datetimeMetadata: string;
};

type ChatInteractionEnvelope = {
  eventId: string;
  eventType: string;
  entityId: string;
  entityType: string;
  timestamp: number;
  datetime: string;
  domain: string;
  capability: string;
  version: string;
  correlationId?: string;
  payload: ChatInteractionEvent;
};
```

### 4.5 CodificaciÃ³n de transporte

- SNS: body JSON UTF-8 con `payload`; atributos SNS como la tabla anterior.
- SNS â†’ SQS: suscripciÃ³n sin `RawMessageDelivery` si el consumidor espera
  sobre SNS; con raw delivery sÃ³lo si los atributos se conservan al menos en
  un wrapper alternativo.
- MeMo: reconstruye `ChatInteractionEnvelope` validÃ¡ndolo con schema.
- Pub/Sub: el body conserva el JSON del payload y los mismos metadatos se
  publican como atributos Pub/Sub string.
- DME Publisher: valida versiÃ³n y payload antes de insertar.

No incluir secretos, tokens de autenticaciÃ³n, API keys o credenciales dentro
del evento.

### 4.6 Gherkin contrato

```gherkin
Feature: Evento de interacciÃ³n gobernado
  Scenario: Contrato DME vÃ¡lido
    Given AsyncAPI 3.0.0 define components.messages y components.schemas
    When schemaName es ChatInteractions
    Then operationId coincide con schemaName
    And x-dme-path-reference coincide en message y schema
    And x-dme-fullpayload es "true"
    And x-dme-operation y x-dme-version estÃ¡n presentes
    And datetimeMetadata tiene format date-time

  Scenario: PII gobernada
    Given userEmail y comentario estÃ¡n en el schema
    When se ejecuta la validaciÃ³n DME
    Then cada campo PII tiene x-dme-securityPolicyTags vigente
    And los Policy Tags se aplican a BigQuery EVS

  Scenario: Evento vÃ¡lido
    Given existe una conversaciÃ³n cerrada
    When se construye chatSurveySubmitted
    Then eventId es UUID
    And eventId coincide en payload y atributos
    And datetime estÃ¡ en ISO UTC
    And los scores estÃ¡n entre 1 y 7
    And el evento no contiene credenciales

  Scenario: Evento invÃ¡lido
    Given falta eventId o version
    When MeMo valida el mensaje
    Then no publica a Pub/Sub
    And incrementa mÃ©trica de poison message

  Scenario: Reentrega
    Given SNS entrega el mismo eventId dos veces
    When el evento cruza MeMo y Data Publisher
    Then el RAW puede recibir duplicado por append
    And Dataform mantiene una fila lÃ³gica por conversationId
```

---

## 5. AWS SNS y SQS

### 5.1 SNS Topic

- Tipo: Standard.
- Nombre productivo: `topic-b2cc2x-chat-interactions`.
- Alias usado sÃ³lo por la PoC:
  `topic-oneblue-chat-interactions`.
- PolÃ­tica: sÃ³lo la identidad del servicio de dominio puede publicar.
- EncriptaciÃ³n KMS recomendada en productivo.
- No archivar payloads en CloudWatch Logs.

### 5.2 SQS para MeMo

- Nombre productivo: `queue-b2cc2x-mover`.
- Alias usado sÃ³lo por la PoC:
  `queue-oneblue-chat-interactions-mover`.
- Tipo: Standard.
- Long polling: 20 s.
- Batch: hasta 10 mensajes.
- Visibility timeout: superior al mÃ¡ximo esperado de MeMo; mÃ­nimo inicial 60 s.
- Retention: 4 dÃ­as mÃ­nimo, 14 dÃ­as recomendado.
- DLQ productiva: `queue-b2cc2x-mover-dlq`.
- Alias DLQ usado sÃ³lo por la PoC:
  `queue-oneblue-chat-interactions-mover-dlq`.
- Redrive: 3â€“5 recepciones mÃ¡ximas.
- PolÃ­tica: acepta `SendMessage` sÃ³lo desde el topic SNS.

### 5.3 Gherkin AWS

```gherkin
Feature: Entrega AWS
  Scenario: Fan-out vÃ¡lido
    Given SNS recibe un evento vÃ¡lido
    When la polÃ­tica de cola permite el topic
    Then SQS recibe un mensaje
    And conserva eventId en MessageAttributes

  Scenario: Procesamiento agotado
    Given MeMo no puede procesar un mensaje repetidamente
    When alcanza maxReceiveCount
    Then el mensaje se mueve a la DLQ
    And emite alerta
```

---

## 6. Message Mover / MeMo

### 6.1 Responsabilidad

MeMo es el bridge cross-cloud. No persiste el negocio.

1. Recibe batch SQS.
2. Valida atributos y payload.
3. Construye envelope canÃ³nico.
4. Publica a GCP Pub/Sub.
5. Espera acknowledgement GCP.
6. Elimina el mensaje SQS sÃ³lo despuÃ©s del ack.
7. Si falla, no elimina; permite retry/DLQ.

### 6.2 ConfiguraciÃ³n

```dotenv
AWS_REGION=us-east-1
AWS_SQS_QUEUE_URL=
GCP_PROJECT_ID=
GCP_PUBSUB_TOPIC=topic-b2cc2x-chat-interactions
MEMO_BATCH_SIZE=10
MEMO_WAIT_TIME_SECONDS=20
MEMO_VISIBILITY_TIMEOUT_SECONDS=60
MEMO_PUBLISH_TIMEOUT_MS=10000
MEMO_MAX_ATTEMPTS=5
```

### 6.3 Idempotencia y trazabilidad

- `eventId` se usa como clave de deduplicaciÃ³n.
- Atributos GCP conservan `eventId`, `eventType`, `entityId`, `version`.
- `correlationId` se conserva si existe.
- No reempaquetar el payload con campos no gobernados.
- Registrar sÃ³lo IDs, etapa, latencia y error class.

### 6.4 Gherkin MeMo

```gherkin
Feature: Bridge cross-cloud
  Scenario: Pub/Sub confirma publicaciÃ³n
    Given SQS contiene un evento vÃ¡lido
    When MeMo lo publica en Pub/Sub y recibe messageId
    Then elimina ReceiptHandle de SQS
    And conserva eventId en atributos Pub/Sub

  Scenario: Pub/Sub no estÃ¡ disponible
    Given la publicaciÃ³n GCP falla
    When MeMo agota el retry
    Then no elimina el mensaje SQS
    And permite que reaparezca para reintento
```

---

## 7. GCP Pub/Sub

### 7.1 Topic

- Nombre productivo: `topic-b2cc2x-chat-interactions`.
- Alias usado sÃ³lo por la PoC:
  `topic-oneblue-chat-interactions`.
- Encoding: JSON UTF-8.
- Attributes: copia de los atributos gobernados.
- Ordering key: `conversationId` sÃ³lo si se habilita ordering en topic/sub y
  existe una necesidad de orden estricta. En caso contrario, la deduplicaciÃ³n
  debe soportar desorden.

### 7.2 Subscription

- Nombre productivo:
  `sb-b2cc2x-publisher-chat-interactions-{{environment}}`.
- Alias usado sÃ³lo por la PoC:
  `sub-oneblue-chat-interactions-data-publisher`.
- Tipo: pull.
- Ack deadline inicial: 60 s.
- RetenciÃ³n: 7 dÃ­as.
- Dead-letter topic: `topic-b2cc2x-chat-interactions-dlq`.
- Alias usado sÃ³lo por la PoC:
  `topic-oneblue-chat-interactions-dlq`.
- Maximum delivery attempts: 5.
- Exactamente una vez puede habilitarse sÃ³lo despuÃ©s de validar compatibilidad
  con los consumidores.

### 7.3 Gherkin Pub/Sub

```gherkin
Feature: Ingreso GCP
  Scenario: Evento visible para Data Publisher
    Given MeMo publicÃ³ un mensaje vÃ¡lido
    When Pub/Sub acepta el mensaje
    Then la subscription puede leerlo
    And eventId estÃ¡ disponible como atributo

  Scenario: Poison message
    Given el mismo mensaje falla validaciÃ³n repetidamente
    When alcanza delivery attempts configurado
    Then Pub/Sub lo entrega al topic DLQ
```

---

## 8. DME Data Publisher

### 8.0 Repositorios y artefactos

Repositorio DPO:

```text
bx-dpo-b2cc2x-chat-interactions
```

Producto:

```text
bx-dme-b2cc2x-chat-interactions
```

Repositorio DPC/Dataform:

```text
repositorio separado, por ejemplo bx-dpc-b2cc2x-chat-interactions
```

No mezclar contratos/ingesta DME con los modelos SQLX de transformaciÃ³n.

El DPO debe contener `schema.json` con la configuraciÃ³n del motor:

```json
{
  "businessDomain": "clientes",
  "businessCapability": "b2cc2x",
  "apiName": "chat-interactions-api",
  "projectId": "bx-b2cc2x-{{environment}}",
  "datasetId": "b2cc2x_chatInteractions",
  "rawDatasetId": "b2cc2x_chatInteractions",
  "schemaName": "ChatInteractions",
  "endpointDatatypeMappingApi": "ASYNCAPI_3.0_TO_BIGQUERY_022025",
  "asyncApiContractUrls": [
    "https://raw.githubusercontent.com/Blue-Express/contracts/main/asyncapi/chat-interactions-3.0.0.json"
  ],
  "cudTopicProjectId": "bx-b2cc2x-{{environment}}",
  "cudTopicSubscriptionId": "sb-b2cc2x-publisher-chat-interactions-{{environment}}",
  "cudEventTypeFilter": [
    "chatSurveySubmitted",
    "chatConversationCompleted",
    "chatTurnRecorded"
  ],
  "evsTimePartitioning": {
    "type": "DAY",
    "field": "datetimeMetadata",
    "requirePartitionFilter": true
  },
  "evsClustering": {
    "fields": ["motivo", "status"]
  },
  "tenantPrefix": "dme_",
  "ackOnlyAcceptedEvents": true,
  "makeFieldsNullable": true
}
```

`asyncApiContractUrls` debe apuntar a una URL estable y accesible por el motor.
La URL de ejemplo debe confirmarse con Data Governance antes del release.

### 8.1 Responsabilidad

1. Consume Pub/Sub.
2. Valida schema y versiÃ³n.
3. Mapea payload a fila EVS.
4. Inserta en BigQuery.
5. Acknowledge sÃ³lo despuÃ©s de Ã©xito BigQuery.
6. Mueve a DLQ/nack los invÃ¡lidos segÃºn retry policy.

No debe ejecutar agregaciones de negocio; pertenecen a Dataform.

### 8.2 Mapeo a EVS

```ts
const row = {
  eventId: envelope.eventId,
  eventType: envelope.eventType,
  conversationId: payload.conversationId,
  userEmail: payload.userEmail,
  motivo: payload.motivo ?? null,
  razonamiento: payload.razonamiento ?? null,
  calidadAtencion: payload.survey?.calidadAtencion ?? null,
  resolucion: payload.survey?.resolucion ?? null,
  comentario: payload.survey?.comentario ?? null,
  agenteId: payload.survey?.agenteId ?? null,
  submittedAt: payload.survey?.submittedAt ?? null,
  messagesCount: payload.messagesCount,
  durationSeconds: payload.durationSeconds,
  firstUserMessage: payload.firstUserMessage ?? null,
  lastAgentMessage: payload.lastAgentMessage ?? null,
  status: payload.status,
  closedAt: payload.closedAt ?? null,
  occurredAt: envelope.datetime,
  ingestedAt: new Date().toISOString(),
  datetimeMetadata: payload.datetimeMetadata,
  rawPayload: payload,
};
```

### 8.3 Batch y retry

- Batches BigQuery de 100â€“500 filas, con respeto al lÃ­mite de tamaÃ±o.
- No confirmar Pub/Sub hasta tener insert result.
- Reintento en errores transitorios.
- No perder mensajes por error parcial: separar filas fallidas y reintentar.
- MÃ©tricas: inserted, invalid, retried, ack latency, partial failure.

### 8.4 Gherkin Data Publisher

```gherkin
Feature: Ingesta a BigQuery
  Scenario: InserciÃ³n exitosa
    Given Pub/Sub entrega un evento vÃ¡lido
    When BigQuery inserta la fila EVS
    Then Data Publisher confirma ack

  Scenario: BigQuery no disponible
    Given BigQuery responde error transitorio
    When se agotan reintentos del batch
    Then no se confirma el mensaje
    And la mÃ©trica de retry aumenta

  Scenario: Payload invÃ¡lido
    Given la versiÃ³n o el schema no son vÃ¡lidos
    When Data Publisher valida
    Then el mensaje no se inserta
    And se envÃ­a al flujo de DLQ/observabilidad
```

---

## 9. BigQuery EVS

### 9.1 Tabla

Productivo:

```text
bx-b2cc2x-{{environment}}.b2cc2x_chatInteractions.chatInteractions_v1_0_0
```

Alias local de la PoC:

```text
bx-b2cc2x-dev.globalOnboardingB2cc2x.evs_chat_conversations
```

La tabla productiva EVS no se crea manualmente: Data Publisher la genera desde
el AsyncAPI y `schema.json` bajo
`{schemaName}_v{versionMajor}_{versionMinor}_{versionPatch}`. El DDL siguiente es
una representaciÃ³n de referencia de la forma fÃ­sica.

Partition:

```sql
PARTITION BY DATE(datetimeMetadata)
```

Cluster:

```sql
CLUSTER BY motivo, status
```

### 9.2 DDL

```sql
CREATE TABLE IF NOT EXISTS
`PROJECT_ID.DATASET_ID.chatInteractions_v1_0_0` (
  eventId STRING NOT NULL,
  eventType STRING NOT NULL,
  conversationId STRING NOT NULL,
  userEmail STRING NOT NULL,
  motivo STRING,
  razonamiento STRING,
  calidadAtencion INT64,
  resolucion INT64,
  comentario STRING,
  agenteId STRING,
  submittedAt TIMESTAMP,
  messagesCount INT64,
  durationSeconds FLOAT64,
  firstUserMessage STRING,
  lastAgentMessage STRING,
  status STRING NOT NULL,
  closedAt TIMESTAMP,
  occurredAt TIMESTAMP NOT NULL,
  ingestedAt TIMESTAMP NOT NULL,
  datetimeMetadata TIMESTAMP NOT NULL,
  rawPayload JSON
)
PARTITION BY DATE(datetimeMetadata)
CLUSTER BY motivo, status
OPTIONS (
  description = 'Raw chatbot events. Contains PII; restrict access.'
);
```

`closedAt` es nullable para admitir eventos OPEN o ABANDONED.

### 9.3 Reglas EVS

- Append-only.
- Tabla versionada; un cambio incompatible del schema genera una nueva versiÃ³n.
- Debe usar filtro obligatorio de particiÃ³n.
- Las Policy Tags del contrato deben estar aplicadas por Data Publisher.
- No borrar duplicados fÃ­sicamente.
- `eventId` permite auditorÃ­a.
- `rawPayload` se conserva para reconstrucciÃ³n.
- IAM restringido por PII.
- No usar EVS como fuente directa del dashboard.

### 9.4 Gherkin EVS versionada

```gherkin
Feature: EVS generado por Data Publisher
  Scenario: Primera versiÃ³n
    Given AsyncAPI declara ChatInteractions versiÃ³n 1.0.0
    And schema.json estÃ¡ validado
    When Data Publisher despliega
    Then crea chatInteractions_v1_0_0
    And la tabla estÃ¡ particionada por datetimeMetadata
    And aplica las Policy Tags declaradas

  Scenario: Cambio de versiÃ³n
    Given se publica el contrato 1.1.0
    When Data Publisher despliega
    Then crea o configura la tabla versionada correspondiente
    And no destruye la tabla de la versiÃ³n anterior
```

---

## 10. Dataform Core: RAW â†’ ACC

### 10.1 Archivos

```text
repositorio DPC/
  workflow_settings.yaml
  definitions/
    sources.sqlx
    chat_interactions_raw.sqlx
    daily_chatbot_summary.sqlx
```

En la PoC local los mismos modelos viven de forma simplificada en:

```text
dataform/
  workflow_settings.yaml
  definitions/
    sources.sqlx
    daily_chatbot_summary.sqlx
```

### 10.2 ConfiguraciÃ³n

```yaml
dataformCoreVersion: 3.0.0
defaultProject: bx-b2cc2x-{{environment}}
defaultLocation: US
defaultDataset: b2cc2x_chatInteractions
```

La PoC puede seguir usando `globalOnboardingB2cc2x`, pero los modelos
productivos DPC deben usar los nombres aprobados por Data Governance.

No versionar cuentas, secretos ni credenciales.

### 10.3 TransformaciÃ³n

#### Capa RAW / staging

Objeto recomendado:

```text
b2cc2x_chatInteractions.chat_interactions_raw
```

Responsabilidad:

1. Declarar EVS versionada.
2. Convertir `datetimeMetadata` a fecha.
3. Ejecutar:

```sql
ROW_NUMBER() OVER (
  PARTITION BY conversationId
  ORDER BY closedAt DESC, occurredAt DESC, ingestedAt DESC
)
```

4. Seleccionar rango 1.
5. Conservar la Ãºltima foto vÃ¡lida por conversaciÃ³n.

Ejemplo:

```sql
WITH deduplicated_conversations AS (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY conversationId
      ORDER BY closedAt DESC, occurredAt DESC, ingestedAt DESC
    ) AS rankOrder
  FROM
    `bx-b2cc2x-dev.b2cc2x_chatInteractions.chatInteractions_v1_0_0`
  WHERE DATE(datetimeMetadata) >= DATE_SUB(
    CURRENT_DATE(),
    INTERVAL 7 DAY
  )
)
SELECT * EXCEPT(rankOrder)
FROM deduplicated_conversations
WHERE rankOrder = 1;
```

El intervalo de staging se ajusta segÃºn frecuencia, retrasos y volumen. El
backfill completo no debe depender de una ventana fija sin control.

#### Capa ACC / mart

6. Agrupar RAW por `interactionDate` y `motivo`.
7. Crear mÃ©tricas:
   - total;
   - completed/open/abandoned;
   - completion rate;
   - surveys y compliance;
   - CSAT/resoluciÃ³n;
   - casos crÃ­ticos;
   - duraciÃ³n;
   - participantes/casos.
8. Materializar `daily_chatbot_summary` como tabla o vista gobernada.
9. Prohibir Looker sobre EVS y RAW si ACC contiene las mÃ©tricas requeridas.

### 10.4 EjecuciÃ³n

```powershell
cd dataform
npx dataform compile
npx dataform run
```

ProgramaciÃ³n productiva: diaria o incremental, con alerta si falla y validaciÃ³n
de calidad.

### 10.5 Gherkin Dataform

```gherkin
Feature: CuraciÃ³n del mart diario
  Scenario: Duplicados
    Given EVS contiene varias entregas de una conversaciÃ³n
    When Dataform ordena por closedAt, occurredAt e ingestedAt
    Then el mart conserva una sola fila por conversationId

  Scenario: Encuesta y estado
    Given una fila COMPLETED tiene scores y survey
    When se construye el mart
    Then aumenta completedConversations
    And aumenta surveySubmittedConversations
    And actualiza los promedios

  Scenario: Sin denominador
    Given no hay encuestas calificadas
    When Dataform calcula tasas
    Then usa SAFE_DIVIDE y no falla por divisiÃ³n cero
```

---

## 11. BigQuery ACC / mart

### 11.1 Tabla

Productivo:

```text
bx-b2cc2x-{{environment}}.b2cc2x_chatInteractions.daily_chatbot_summary
```

Alias PoC:

```text
bx-b2cc2x-dev.globalOnboardingB2cc2x.daily_chatbot_summary
```

ParticiÃ³n: `interactionDate`.

Clustering: `motivo`.

### 11.2 Schema de negocio

| Campo | Tipo |
| --- | --- |
| `interactionDate` | DATE |
| `motivo` | STRING |
| `totalConversations` | INT64 |
| `completedConversations` | INT64 |
| `openConversations` | INT64 |
| `abandonedConversations` | INT64 |
| `completionRate` | FLOAT64 |
| `surveySubmittedConversations` | INT64 |
| `surveyComplianceRate` | FLOAT64 |
| `ratedConversations` | INT64 |
| `withComments` | INT64 |
| `withoutComments` | INT64 |
| `averageQuality` | FLOAT64 |
| `averageResolution` | FLOAT64 |
| `satisfactoryResolutionRate` | FLOAT64 |
| `criticalCases` | INT64 |
| `averageDurationSeconds` | FLOAT64 |
| `participantEmails` | ARRAY<STRING> |
| `participantCases` | ARRAY<STRUCT> |

Looker debe consumir el mart, no EVS.

---

## 12. Criterios mÃ­nimos de Looker Studio

### 12.1 PÃ¡gina Resumen ejecutivo

Scorecards:

- conversaciones totales;
- encuestas;
- finalizadas;
- abiertas;
- completion rate;
- CSAT.

GrÃ¡ficos:

- serie temporal de total/completed/survey;
- barras por motivo.

### 12.2 PÃ¡gina Encuestas CSAT

- calidad promedio;
- resoluciÃ³n promedio;
- tasa de respuesta;
- casos crÃ­ticos;
- distribuciÃ³n 1â€“7 de calidad;
- distribuciÃ³n 1â€“7 de resoluciÃ³n;
- tabla de conversaciÃ³n/comentario.

### 12.3 PÃ¡gina AnÃ¡lisis de producto

- conteos por motivo;
- COMPLETED/OPEN/ABANDONED;
- positivo/neutro/negativo basado en score;
- PyME/B2B por `agentId`;
- evoluciÃ³n temporal de estado.

### 12.4 Filtros

- rango `interactionDate`;
- motivo;
- estado;
- agente.

### 12.5 RestricciÃ³n

- `participantEmails` y `participantCases` sÃ³lo para grupo autorizado.
- No compartir el informe con enlace pÃºblico.
- No conectar el panel principal a RAW.
- Usar `qualityBand` como â€œresultado de encuestaâ€, no como sentimiento NLP.

---

## 13. DPO y privacidad

### 13.1 Datos personales

- `userEmail`;
- comentario;
- historial/mensajes;
- combinaciÃ³n conversaciÃ³n + motivo.

### 13.2 Controles requeridos

1. DPO valida finalidad analÃ­tica y base legal.
2. Definir retenciÃ³n para Mongo, SQS/PubSub, DLQ, EVS y mart.
3. Documentar acceso por rol.
4. Prohibir PII en:
   - nombres de topic/queue;
   - atributos de mensajerÃ­a;
   - mÃ©tricas/logs;
   - URLs.
5. Restringir BigQuery dataset y vistas.
6. Mantener bitÃ¡cora de acceso.
7. Definir mecanismo de borrado/supresiÃ³n del usuario.
8. Considerar pseudonimizaciÃ³n antes de EVS si DPO lo exige.
9. Revisar exportaciones CSV y Looker como artefactos con PII.
10. No conservar secretos ni tokens en rawPayload.

### 13.3 RetenciÃ³n inicial propuesta

Sujeta a aprobaciÃ³n DPO:

- SNS/SQS: sÃ³lo trÃ¡nsito; 4â€“14 dÃ­as.
- Pub/Sub: 7 dÃ­as.
- Mongo operativo: por definir segÃºn producto.
- DLQ: plazo corto + alertamiento.
- BigQuery EVS/mart: polÃ­tica corporativa de retenciÃ³n.
- CSV/exports locales: eliminar despuÃ©s de la validaciÃ³n de la PoC.

---

## 14. Aprovisionamiento DevEx y CI/CD

### 14.1 Secuencia obligatoria

1. Data Governance valida AsyncAPI 3.0.0 con la Gema Validador de Contratos.
2. Se prueba el contrato con Postman Mock Server.
3. DevEx/Solicitud de Recursos AWS aprovisiona:
   - `topic-b2cc2x-chat-interactions`;
   - `queue-b2cc2x-mover`;
   - `queue-b2cc2x-mover-dlq`;
   - policy de suscripciÃ³n SNS â†’ SQS.
4. Se crea la ticketera de repositorio DPO.
5. DevEx crea `bx-dpo-b2cc2x-chat-interactions`.
6. El DPO incorpora contrato, `schema.json` y manifiestos de Pub/Sub.
7. MeMo se despliega mediante ArgoCD.
8. DME Data Publisher se despliega mediante ArgoCD.
9. Se valida la creaciÃ³n de
   `chatInteractions_v1_0_0` y Policy Tags.
10. Se crea/despliega el DPC/Dataform separado.
11. Se valida EVS â†’ RAW â†’ ACC.
12. Looker se conecta sÃ³lo a ACC.

No se despliega Data Publisher con AsyncAPI o `schema.json` pendiente.

### 14.2 GitHub Actions / ArgoCD

Workflows requeridos:

```text
init-setup-argocd-mover.yaml
init-setup-argocd-publisher.yaml
```

Cada workflow debe:

- validar sintaxis/manifiestos;
- publicar imagen versionada;
- configurar variables/secretos desde gestores corporativos;
- sincronizar ArgoCD;
- comprobar rollout/health;
- dejar release y artefacto trazables.

### 14.3 Definition of Done de habilitaciÃ³n

- [ ] Contrato AsyncAPI 3.0 aprobado.
- [ ] Policy Tags confirmadas.
- [ ] SNS y SQS creados/asociados.
- [ ] Repositorio DPO creado por DevEx.
- [ ] `schema.json` aprobado.
- [ ] DPC/Dataform separado y compilando.
- [ ] MeMo desplegado por ArgoCD.
- [ ] Data Publisher desplegado por ArgoCD.
- [ ] Tabla EVS versionada creada.
- [ ] RAW deduplica.
- [ ] ACC alimenta Looker.
- [ ] Datadog recibe mÃ©tricas/alertas.

### 14.4 Gherkin DevEx

```gherkin
Feature: HabilitaciÃ³n corporativa DME
  Scenario: Contrato aprobado
    Given AsyncAPI 3.0 y schema.json estÃ¡n validados
    When se solicita el despliegue
    Then los workflows pueden inicializar MeMo y Publisher

  Scenario: Falta asociaciÃ³n AWS
    Given la cola no estÃ¡ asociada al topic SNS
    When se intenta ejecutar el despliegue
    Then el rollout se bloquea
    And queda registrada la dependencia DevEx pendiente

  Scenario: Producto activo
    Given MeMo, Publisher, EVS, RAW y ACC estÃ¡n saludables
    When termina el workflow
    Then la tabla EVS versionada existe
    And el mart actualiza
    And Looker consume sÃ³lo ACC
```

## 15. Variables de entorno de la cadena

```dotenv
# AWS
AWS_REGION=us-east-1
AWS_SNS_TOPIC_ARN= # topic-b2cc2x-chat-interactions
AWS_SQS_QUEUE_URL=

# GCP
GCP_PROJECT_ID=
GCP_PUBSUB_TOPIC=topic-b2cc2x-chat-interactions
GCP_PUBSUB_SUBSCRIPTION=sb-b2cc2x-publisher-chat-interactions-{{environment}}
BIGQUERY_DATASET=b2cc2x_chatInteractions
BIGQUERY_EVS_TABLE=chatInteractions_v1_0_0
BIGQUERY_MART_TABLE=daily_chatbot_summary

# Workers
MEMO_BATCH_SIZE=10
OUTBOX_BATCH_SIZE=20
OUTBOX_POLL_INTERVAL_MS=1000
OUTBOX_MAX_ATTEMPTS=8
```

---

## 16. Referencias de gobernanza

- [Gema Validador de Contratos](https://gemini.google.com/gem/eedc57e0813b?usp=sharing)
- [AsyncAPI 3.0 Specification](https://www.asyncapi.com/docs/reference/specification/v3.0.0)
- [Google Dataform](https://cloud.google.com/dataform/docs/overview)
- [Google Cloud Pub/Sub](https://cloud.google.com/pubsub/docs/overview)
- [BigQuery Datasets and Tables](https://cloud.google.com/bigquery/docs/datasets-intro)
- [Argo CD Sync](https://argo-cd.readthedocs.io/en/stable/user-guide/sync_waves/)

Los enlaces internos de DevEx, DPO, Data Mesh, esquema DME y ticketera deben
confirmarse con Arquitectura/Gobernanza y agregarse al README del DPO; no se
deben inventar URLs corporativas.

## 17. Criterios de aceptaciÃ³n extremos

```gherkin
Feature: Flujo completo EVS
  Scenario: ConversaciÃ³n completada con encuesta
    Given dominio persiste conversaciÃ³n y outbox
    When outbox publica SNS, MeMo publica Pub/Sub y Data Publisher inserta BQ
    Then EVS contiene el evento con eventId
    And Dataform conserva una fila lÃ³gica en el mart
    And Looker refleja total, completed y survey

  Scenario: Redelivery extremo
    Given el mismo evento se entrega mÃ¡s de una vez
    When cada componente reintenta
    Then no se pierde el evento
    And eventId se conserva
    And el mart no duplica mÃ©tricas por conversationId

  Scenario: PII restringida
    Given el mart contiene participantEmails y participantCases
    When un usuario no autorizado consulta Looker
    Then no puede acceder a esos campos o al informe

  Scenario: Fallo entre capas
    Given BigQuery estÃ¡ no disponible
    When Data Publisher falla
    Then Pub/Sub no es confirmado
    And el evento queda recuperable

  Scenario: Cumplimiento de producto
    Given existe una conversaciÃ³n abierta y otra completada
    When el mart se actualiza
    Then totalConversations, completedConversations y openConversations son coherentes
    And completionRate equivale a completed/total
```


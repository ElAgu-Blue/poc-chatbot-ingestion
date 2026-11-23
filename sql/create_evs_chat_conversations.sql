CREATE SCHEMA IF NOT EXISTS `bx-b2cc2x-dev.chat_analytics`
OPTIONS (location = 'US');

CREATE TABLE IF NOT EXISTS `bx-b2cc2x-dev.chat_analytics.evs_chat_conversations` (
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
  closedAt TIMESTAMP NOT NULL,
  occurredAt TIMESTAMP NOT NULL,
  ingestedAt TIMESTAMP NOT NULL,
  datetimeMetadata TIMESTAMP NOT NULL,
  rawPayload JSON
)
PARTITION BY DATE(datetimeMetadata)
CLUSTER BY motivo, calidadAtencion, resolucion
OPTIONS (
  description = 'Raw chatbot interaction events. Contains PII; restrict access.'
);

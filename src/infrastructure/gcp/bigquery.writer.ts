import { BigQuery } from "@google-cloud/bigquery";
import type { ChatEventEnvelope } from "../../contracts/chat-event.js";

export class BigQueryChatEventWriter {
  private readonly table;

  constructor(
    client: BigQuery,
    projectId: string,
    dataset: string,
    table: string,
  ) {
    this.table = client.dataset(dataset, { projectId }).table(table);
  }

  async insert(event: ChatEventEnvelope, ingestedAt = new Date()): Promise<void> {
    const payload = event.payload;
    await this.table.insert(
      [
        {
          eventId: event.eventId,
          eventType: event.eventType,
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
          closedAt: payload.closedAt,
          occurredAt: event.datetime,
          ingestedAt: ingestedAt.toISOString(),
          datetimeMetadata: payload.datetimeMetadata,
          rawPayload: payload,
        },
      ],
      { ignoreUnknownValues: false, raw: false },
    );
  }
}

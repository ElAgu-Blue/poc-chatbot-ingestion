import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { CompleteConversation } from "../application/complete-conversation.js";
import { SaveChatTurn } from "../application/save-chat-turn.js";
import { decodeSnsNotification } from "../infrastructure/aws/sqs.consumer.js";
import {
  MemoryConversationRepository,
  RecordingPublisher,
  messageInput,
  surveyInput,
} from "./test-support.js";

describe("chat ingestion flow", () => {
  it("runs Mongo-shaped use cases through SNS notification decoding", async () => {
    const repository = new MemoryConversationRepository();
    const publisher = new RecordingPublisher();
    await new SaveChatTurn(repository).execute(messageInput);
    await new CompleteConversation(repository, publisher).execute(surveyInput);

    const event = publisher.events[0];
    expect(event).toBeDefined();
    const notification = {
      Message: JSON.stringify(event!.payload),
      MessageAttributes: Object.fromEntries(
        [
          ["eventId", event!.eventId],
          ["eventType", event!.eventType],
          ["entityId", event!.entityId],
          ["entityType", event!.entityType],
          ["timestamp", String(event!.timestamp)],
          ["datetime", event!.datetime],
          ["domain", event!.domain],
          ["capability", event!.capability],
          ["version", event!.version],
        ].map(([name, value]) => [name, { Type: "String", Value: value }]),
      ),
    };
    const decoded = decodeSnsNotification(JSON.stringify(notification));
    expect(decoded.eventId).toBe(event!.eventId);
    expect(decoded.payload.survey?.resolucion).toBe(7);
    expect(decoded.payload.conversationId).toBe(messageInput.conversationId);
    expect(decoded.eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});

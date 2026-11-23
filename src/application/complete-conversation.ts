import { randomUUID } from "node:crypto";
import type { ChatEventEnvelope } from "../contracts/chat-event.js";
import { submitChatSurveyRequestSchema } from "../contracts/survey.js";
import type { Conversation } from "../domain/conversation.js";
import type { ConversationRepository } from "../domain/ports/conversation.repository.js";
import type { EventPublisher } from "../domain/ports/event.publisher.js";

export class CompleteConversation {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly publisher: EventPublisher,
  ) {}

  async execute(input: unknown): Promise<Conversation> {
    const request = submitChatSurveyRequestSchema.parse(input);
    const result = await this.conversations.complete(request);
    if (result.closedNow) {
      await this.publisher.publish(this.createEvent(result.conversation));
    }
    return result.conversation;
  }

  private createEvent(conversation: Conversation): ChatEventEnvelope {
    const closedAt = conversation.closedAt ?? conversation.updatedAt;
    const timestamps = conversation.history
      .map((message) => Date.parse(message.timestamp))
      .filter(Number.isFinite);
    const firstAt = timestamps.length
      ? new Date(Math.min(...timestamps))
      : conversation.createdAt;
    const lastAt = timestamps.length
      ? new Date(Math.max(...timestamps))
      : closedAt;
    const durationSeconds = Math.max(
      0,
      Math.round((lastAt.getTime() - firstAt.getTime()) / 1000),
    );
    const firstUserMessage = conversation.history.find(
      (message) => message.role === "user",
    );
    const agentMessages = conversation.history.filter(
      (message) => message.role === "agent",
    );
    const lastAgentMessage = agentMessages.at(-1);
    const eventId = randomUUID();
    const datetime = closedAt.toISOString();

    return {
      eventId,
      eventType: "chatSurveySubmitted",
      entityId: conversation.conversationId,
      entityType: "chatConversation",
      timestamp: closedAt.getTime(),
      datetime,
      domain: "clientes",
      capability: "cclie",
      version: "1.0",
      payload: {
        conversationId: conversation.conversationId,
        eventId,
        userEmail: conversation.userEmail,
        ...(conversation.motivo
          ? { motivo: conversation.motivo }
          : undefined),
        ...(conversation.razonamiento
          ? { razonamiento: conversation.razonamiento }
          : undefined),
        ...(conversation.survey ? { survey: conversation.survey } : undefined),
        messagesCount: conversation.history.length,
        durationSeconds,
        ...(firstUserMessage
          ? { firstUserMessage: firstUserMessage.content }
          : undefined),
        ...(lastAgentMessage
          ? { lastAgentMessage: lastAgentMessage.content }
          : undefined),
        status: "COMPLETED",
        closedAt: datetime,
        datetimeMetadata: datetime,
      },
    };
  }
}

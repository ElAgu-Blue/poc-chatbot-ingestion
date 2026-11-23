import type { ChatMessageRequest } from "../contracts/conversation.js";
import type { SubmitChatSurveyRequest } from "../contracts/survey.js";
import type { Conversation } from "../domain/conversation.js";
import type {
  CompletionResult,
  ConversationRepository,
} from "../domain/ports/conversation.repository.js";
import type { ChatEventEnvelope } from "../contracts/chat-event.js";
import type { EventPublisher } from "../domain/ports/event.publisher.js";

export class MemoryConversationRepository implements ConversationRepository {
  readonly records = new Map<string, Conversation>();
  appendCalls = 0;
  completeCalls = 0;

  async ensureIndexes(): Promise<void> {}

  async appendTurn(request: ChatMessageRequest): Promise<Conversation> {
    this.appendCalls += 1;
    const previous = this.records.get(request.conversationId);
    const now = new Date();
    const historyById = new Map(
      [...(previous?.history ?? []), ...request.history].map((item) => [
        item.id ?? `${item.role}:${item.timestamp}:${item.content}`,
        item,
      ]),
    );
    const currentId = `${request.timestamp}:${request.message}`;
    historyById.set(currentId, {
      id: currentId,
      role: "user",
      content: request.message,
      timestamp: request.timestamp,
    });
    const record: Conversation = {
      conversationId: request.conversationId,
      agentId: request.agentId,
      userEmail: request.userEmail,
      history: [...historyById.values()],
      status: "OPEN",
      ...(request.queueInfo ? { queueInfo: request.queueInfo } : {}),
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
    this.records.set(request.conversationId, record);
    return record;
  }

  async complete(
    request: SubmitChatSurveyRequest,
  ): Promise<CompletionResult> {
    this.completeCalls += 1;
    const previous = this.records.get(request.conversationId);
    const closedNow = previous?.status !== "COMPLETED";
    const now = new Date();
    const conversation: Conversation = {
      conversationId: request.conversationId,
      agentId: previous?.agentId ?? request.survey.agenteId,
      userEmail: previous?.userEmail ?? request.userEmail ?? "unknown@example.invalid",
      history: previous?.history ?? request.history ?? [],
      status: "COMPLETED",
      survey: request.survey,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      closedAt: new Date(request.survey.submittedAt),
    };
    this.records.set(request.conversationId, conversation);
    return { conversation, closedNow };
  }
}

export class RecordingPublisher implements EventPublisher {
  readonly events: ChatEventEnvelope[] = [];
  shouldFail = false;

  async publish(event: ChatEventEnvelope): Promise<void> {
    if (this.shouldFail) throw new Error("SNS unavailable");
    this.events.push(event);
  }
}

export const messageInput = {
  conversationId: "conv-test-001",
  agentId: "agent-test",
  message: "Quiero consultar un pedido",
  timestamp: "2026-11-23T01:00:00.000Z",
  userEmail: "user@example.invalid",
  history: [],
  queueInfo: { messagesInBatch: 1, debounceDelay: 100 },
};

export const surveyInput = {
  conversationId: "conv-test-001",
  action: "survey",
  survey: {
    calidadAtencion: 6,
    resolucion: 7,
    agenteId: "agent-test",
    submittedAt: "2026-11-23T01:05:00.000Z",
  },
};

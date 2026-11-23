import { createHash } from "node:crypto";
import {
  type Collection,
  type Db,
  type MongoClient,
} from "mongodb";
import type { ChatHistoryMessage, ChatMessageRequest } from "../../contracts/conversation.js";
import type { SubmitChatSurveyRequest } from "../../contracts/survey.js";
import type { Conversation } from "../../domain/conversation.js";
import type {
  CompletionResult,
  ConversationRepository,
} from "../../domain/ports/conversation.repository.js";

export class MongoConversationRepository implements ConversationRepository {
  private readonly collection: Collection<Conversation>;

  constructor(client: MongoClient, database: string, collection: string) {
    const db: Db = client.db(database);
    this.collection = db.collection<Conversation>(collection);
  }

  async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.collection.createIndex(
        { conversationId: 1 },
        { unique: true, name: "conversationId_unique" },
      ),
      this.collection.createIndex(
        { userEmail: 1, updatedAt: -1 },
        { name: "email_updated" },
      ),
      this.collection.createIndex(
        { status: 1, updatedAt: 1 },
        { name: "status_updated" },
      ),
    ]);
  }

  async appendTurn(request: ChatMessageRequest): Promise<Conversation> {
    const now = new Date();
    const currentMessage: ChatHistoryMessage = {
      id: stableMessageId(
        request.conversationId,
        "user",
        request.timestamp,
        request.message,
      ),
      role: "user",
      content: request.message,
      timestamp: request.timestamp,
    };
    const history = deduplicateHistory([...request.history, currentMessage]);
    const setFields: Record<string, unknown> = {
      agentId: request.agentId,
      userEmail: request.userEmail,
      updatedAt: now,
      status: "OPEN",
    };
    if (request.queueInfo) {
      setFields.queueInfo = request.queueInfo;
    }

    await this.collection.updateOne(
      { conversationId: request.conversationId },
      {
        $set: setFields,
        $setOnInsert: {
          conversationId: request.conversationId,
          createdAt: new Date(request.timestamp),
        },
        $addToSet: { history: { $each: history } },
      },
      { upsert: true },
    );
    return this.requireConversation(request.conversationId);
  }

  async complete(
    request: SubmitChatSurveyRequest,
  ): Promise<CompletionResult> {
    let existing = await this.collection.findOne({
      conversationId: request.conversationId,
    });
    if (!existing) {
      if (!request.userEmail) {
        throw new Error(
          `Conversation ${request.conversationId} does not exist and userEmail is required`,
        );
      }
      const now = new Date();
      const initial: Conversation = {
        conversationId: request.conversationId,
        agentId: request.survey.agenteId,
        userEmail: request.userEmail,
        history: deduplicateHistory(request.history ?? []),
        status: "OPEN",
        createdAt: new Date(request.survey.submittedAt),
        updatedAt: now,
      };
      try {
        await this.collection.insertOne(initial);
      } catch (error) {
        if (!isDuplicateKey(error)) throw error;
      }
      existing = await this.collection.findOne({
        conversationId: request.conversationId,
      });
    }
    if (!existing) {
      throw new Error(`Conversation ${request.conversationId} was not created`);
    }

    const setFields: Record<string, unknown> = {
      survey: request.survey,
      status: "COMPLETED",
      closedAt: new Date(request.survey.submittedAt),
      updatedAt: new Date(),
    };
    if (request.userEmail) setFields.userEmail = request.userEmail;
    if (request.history?.length) {
      setFields.history = deduplicateHistory([
        ...existing.history,
        ...request.history,
      ]);
    }
    const update = await this.collection.updateOne(
      {
        conversationId: request.conversationId,
        status: { $ne: "COMPLETED" },
      },
      { $set: setFields },
    );

    return {
      conversation: await this.requireConversation(request.conversationId),
      closedNow: update.modifiedCount === 1,
    };
  }

  private async requireConversation(id: string): Promise<Conversation> {
    const conversation = await this.collection.findOne({ conversationId: id });
    if (!conversation) throw new Error(`Conversation ${id} was not found`);
    return conversation;
  }
}

function stableMessageId(
  conversationId: string,
  role: string,
  timestamp: string,
  content: string,
): string {
  return createHash("sha256")
    .update(`${conversationId}\u0000${role}\u0000${timestamp}\u0000${content}`)
    .digest("hex");
}

function deduplicateHistory(
  messages: ChatHistoryMessage[],
): ChatHistoryMessage[] {
  const seen = new Set<string>();
  return messages.filter((message) => {
    const key =
      message.id ??
      stableMessageId(
        "history",
        message.role,
        message.timestamp,
        message.content,
      );
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

import type { ChatMessageRequest } from "../../contracts/conversation.js";
import type { SubmitChatSurveyRequest } from "../../contracts/survey.js";
import type { Conversation } from "../conversation.js";

export interface CompletionResult {
  conversation: Conversation;
  closedNow: boolean;
}

export interface ConversationRepository {
  ensureIndexes(): Promise<void>;
  appendTurn(request: ChatMessageRequest): Promise<Conversation>;
  complete(request: SubmitChatSurveyRequest): Promise<CompletionResult>;
}

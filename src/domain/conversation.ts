import type { ChatHistoryMessage } from "../contracts/conversation.js";
import type { SubmitChatSurveyRequest } from "../contracts/survey.js";

export const CONVERSATION_STATUS = {
  OPEN: "OPEN",
  COMPLETED: "COMPLETED",
  ABANDONED: "ABANDONED",
} as const;

export type ConversationStatus =
  (typeof CONVERSATION_STATUS)[keyof typeof CONVERSATION_STATUS];

export interface Conversation {
  conversationId: string;
  agentId: string;
  userEmail: string;
  history: ChatHistoryMessage[];
  status: ConversationStatus;
  queueInfo?: {
    messagesInBatch: number;
    debounceDelay: number;
  };
  survey?: SubmitChatSurveyRequest["survey"];
  motivo?: string;
  razonamiento?: string;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
}

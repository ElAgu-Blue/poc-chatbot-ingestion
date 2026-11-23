import { chatMessageRequestSchema } from "../contracts/conversation.js";
import type { ConversationRepository } from "../domain/ports/conversation.repository.js";
import type { Conversation } from "../domain/conversation.js";

export class SaveChatTurn {
  constructor(private readonly conversations: ConversationRepository) {}

  async execute(input: unknown): Promise<Conversation> {
    const request = chatMessageRequestSchema.parse(input);
    return this.conversations.appendTurn(request);
  }
}

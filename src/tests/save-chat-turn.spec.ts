import { describe, expect, it } from "vitest";
import { SaveChatTurn } from "../application/save-chat-turn.js";
import { MemoryConversationRepository, messageInput } from "./test-support.js";

describe("SaveChatTurn", () => {
  it("persists a valid turn with queue metadata", async () => {
    const repository = new MemoryConversationRepository();
    const conversation = await new SaveChatTurn(repository).execute(messageInput);
    expect(conversation.conversationId).toBe(messageInput.conversationId);
    expect(conversation.queueInfo).toEqual(messageInput.queueInfo);
    expect(conversation.history).toHaveLength(1);
  });

  it("does not persist invalid dates", async () => {
    const repository = new MemoryConversationRepository();
    await expect(
      new SaveChatTurn(repository).execute({
        ...messageInput,
        timestamp: "yesterday",
      }),
    ).rejects.toThrow();
    expect(repository.appendCalls).toBe(0);
  });
});

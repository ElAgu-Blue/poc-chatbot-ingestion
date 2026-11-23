import { describe, expect, it } from "vitest";
import { CompleteConversation } from "../application/complete-conversation.js";
import {
  MemoryConversationRepository,
  RecordingPublisher,
  messageInput,
  surveyInput,
} from "./test-support.js";

describe("CompleteConversation", () => {
  it("closes and publishes exactly once", async () => {
    const repository = new MemoryConversationRepository();
    const publisher = new RecordingPublisher();
    await repository.appendTurn(messageInput);
    const useCase = new CompleteConversation(repository, publisher);
    await useCase.execute(surveyInput);
    await useCase.execute(surveyInput);
    expect(publisher.events).toHaveLength(1);
    expect(publisher.events[0]?.payload).toMatchObject({
      conversationId: messageInput.conversationId,
      status: "COMPLETED",
      messagesCount: 1,
    });
  });

  it("rejects invalid scores before persistence or publication", async () => {
    const repository = new MemoryConversationRepository();
    const publisher = new RecordingPublisher();
    await expect(
      new CompleteConversation(repository, publisher).execute({
        ...surveyInput,
        survey: { ...surveyInput.survey, calidadAtencion: 8 },
      }),
    ).rejects.toThrow();
    expect(repository.completeCalls).toBe(0);
    expect(publisher.events).toHaveLength(0);
  });

  it("keeps SNS failures observable", async () => {
    const repository = new MemoryConversationRepository();
    const publisher = new RecordingPublisher();
    publisher.shouldFail = true;
    await repository.appendTurn(messageInput);
    await expect(
      new CompleteConversation(repository, publisher).execute(surveyInput),
    ).rejects.toThrow("SNS unavailable");
  });
});

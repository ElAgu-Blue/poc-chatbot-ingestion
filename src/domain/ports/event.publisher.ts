import type { ChatEventEnvelope } from "../../contracts/chat-event.js";

export interface EventPublisher {
  publish(event: ChatEventEnvelope): Promise<void>;
}

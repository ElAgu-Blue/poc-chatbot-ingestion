import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import { chatEventEnvelopeSchema } from "../../contracts/chat-event.js";
import type { EventPublisher } from "../../domain/ports/event.publisher.js";

export class SnsEventPublisher implements EventPublisher {
  constructor(
    private readonly client: SNSClient,
    private readonly topicArn: string,
  ) {}

  async publish(input: Parameters<EventPublisher["publish"]>[0]): Promise<void> {
    const event = chatEventEnvelopeSchema.parse(input);
    await this.client.send(
      new PublishCommand({
        TopicArn: this.topicArn,
        Subject: event.eventType,
        Message: JSON.stringify(event.payload),
        MessageAttributes: {
          eventId: stringAttribute(event.eventId),
          eventType: stringAttribute(event.eventType),
          entityId: stringAttribute(event.entityId),
          entityType: stringAttribute(event.entityType),
          timestamp: numberAttribute(event.timestamp),
          datetime: stringAttribute(event.datetime),
          domain: stringAttribute(event.domain),
          capability: stringAttribute(event.capability),
          version: stringAttribute(event.version),
        },
      }),
    );
  }
}

function stringAttribute(value: string) {
  return { DataType: "String", StringValue: value };
}

function numberAttribute(value: number) {
  return { DataType: "Number", StringValue: String(value) };
}

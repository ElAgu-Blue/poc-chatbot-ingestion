import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  type SQSClient,
} from "@aws-sdk/client-sqs";
import { z } from "zod";
import {
  chatEventEnvelopeSchema,
  type ChatEventEnvelope,
} from "../../contracts/chat-event.js";

const snsNotificationSchema = z.object({
  Message: z.string(),
  MessageAttributes: z.record(
    z.string(),
    z.object({
      Type: z.string(),
      Value: z.string(),
    }),
  ),
});

export interface ReceivedChatEvent {
  event: ChatEventEnvelope;
  receiptHandle: string;
}

export class SqsEventConsumer {
  constructor(
    private readonly client: SQSClient,
    private readonly queueUrl: string,
  ) {}

  async receive(maxMessages = 10, waitSeconds = 10): Promise<ReceivedChatEvent[]> {
    const output = await this.client.send(
      new ReceiveMessageCommand({
        QueueUrl: this.queueUrl,
        MaxNumberOfMessages: Math.min(maxMessages, 10),
        WaitTimeSeconds: waitSeconds,
        MessageAttributeNames: ["All"],
        AttributeNames: ["All"],
      }),
    );
    return (output.Messages ?? []).flatMap((message) => {
      if (!message.Body || !message.ReceiptHandle) return [];
      return [
        {
          event: decodeSnsNotification(message.Body),
          receiptHandle: message.ReceiptHandle,
        },
      ];
    });
  }

  async acknowledge(receiptHandle: string): Promise<void> {
    await this.client.send(
      new DeleteMessageCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle,
      }),
    );
  }
}

export function decodeSnsNotification(body: string): ChatEventEnvelope {
  const notification = snsNotificationSchema.parse(JSON.parse(body));
  const attributes = notification.MessageAttributes;
  const value = (name: string) => {
    const attribute = attributes[name];
    if (!attribute) throw new Error(`SNS attribute ${name} is missing`);
    return attribute.Value;
  };
  const payload = JSON.parse(notification.Message);
  return chatEventEnvelopeSchema.parse({
    eventId: value("eventId"),
    eventType: value("eventType"),
    entityId: value("entityId"),
    entityType: value("entityType"),
    timestamp: Number(value("timestamp")),
    datetime: value("datetime"),
    domain: value("domain"),
    capability: value("capability"),
    version: value("version"),
    payload,
  });
}

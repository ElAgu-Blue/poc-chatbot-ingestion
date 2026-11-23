import { existsSync } from "node:fs";
import { SQSClient } from "@aws-sdk/client-sqs";
import { loadEnv } from "../config/env.js";
import { SqsEventConsumer } from "../infrastructure/aws/sqs.consumer.js";
import { BigQueryChatEventWriter } from "../infrastructure/gcp/bigquery.writer.js";
import { createBigQueryClient } from "../infrastructure/gcp/bigquery.client.js";

if (existsSync(".env")) process.loadEnvFile(".env");
const env = loadEnv();
const sqs = new SQSClient({
  region: env.AWS_REGION,
  ...(env.AWS_ENDPOINT ? { endpoint: env.AWS_ENDPOINT } : {}),
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});
const consumer = new SqsEventConsumer(sqs, env.SQS_QUEUE_URL);
const writer = new BigQueryChatEventWriter(
  createBigQueryClient(env),
  env.GCP_PROJECT_ID,
  env.BIGQUERY_DATASET,
  env.BIGQUERY_TABLE,
);
let processed = 0;
for (let batch = 0; batch < 10; batch += 1) {
  const messages = await consumer.receive(10, 2);
  if (messages.length === 0) break;
  for (const message of messages) {
    await writer.insert(message.event);
    await consumer.acknowledge(message.receiptHandle);
    processed += 1;
    console.log(
      JSON.stringify({
        inserted: true,
        eventId: message.event.eventId,
        conversationId: message.event.entityId,
      }),
    );
  }
}
console.log(JSON.stringify({ processed }));

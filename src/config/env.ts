import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  MONGODB_URI: z.string().default("mongodb://127.0.0.1:27017"),
  MONGODB_DATABASE: z.string().default("oneblue_chat"),
  MONGODB_COLLECTION: z.string().default("conversations"),
  AWS_REGION: z.string().default("us-east-1"),
  AWS_ENDPOINT: z.string().url().optional(),
  AWS_ACCESS_KEY_ID: z.string().default("test"),
  AWS_SECRET_ACCESS_KEY: z.string().default("test"),
  SNS_TOPIC_ARN: z.string().min(1),
  SQS_QUEUE_URL: z.string().url(),
  GCP_PROJECT_ID: z.string().min(1),
  GCP_SA_INTGR_BFA: z.string().optional(),
  BIGQUERY_DATASET: z.string().default("chat_analytics"),
  BIGQUERY_TABLE: z.string().default("evs_chat_conversations"),
});

export type Environment = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Environment {
  const values = { ...source };
  if (!values.SNS_TOPIC_ARN) {
    values.SNS_TOPIC_ARN =
      "arn:aws:sns:us-east-1:000000000000:topic-oneblue-chat-interactions";
  }
  if (!values.SQS_QUEUE_URL) {
    values.SQS_QUEUE_URL =
      "http://127.0.0.1:4566/000000000000/queue-oneblue-chat-interactions-mover";
  }
  return envSchema.parse(values);
}

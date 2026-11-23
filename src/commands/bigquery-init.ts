import { existsSync } from "node:fs";
import type { TableField } from "@google-cloud/bigquery";
import { loadEnv } from "../config/env.js";
import { createBigQueryClient } from "../infrastructure/gcp/bigquery.client.js";

if (existsSync(".env")) process.loadEnvFile(".env");

const schema: TableField[] = [
  { name: "eventId", type: "STRING", mode: "REQUIRED" },
  { name: "eventType", type: "STRING", mode: "REQUIRED" },
  { name: "conversationId", type: "STRING", mode: "REQUIRED" },
  { name: "userEmail", type: "STRING", mode: "REQUIRED" },
  { name: "motivo", type: "STRING" },
  { name: "razonamiento", type: "STRING" },
  { name: "calidadAtencion", type: "INTEGER" },
  { name: "resolucion", type: "INTEGER" },
  { name: "comentario", type: "STRING" },
  { name: "agenteId", type: "STRING" },
  { name: "submittedAt", type: "TIMESTAMP" },
  { name: "messagesCount", type: "INTEGER" },
  { name: "durationSeconds", type: "FLOAT" },
  { name: "firstUserMessage", type: "STRING" },
  { name: "lastAgentMessage", type: "STRING" },
  { name: "status", type: "STRING", mode: "REQUIRED" },
  { name: "closedAt", type: "TIMESTAMP", mode: "REQUIRED" },
  { name: "occurredAt", type: "TIMESTAMP", mode: "REQUIRED" },
  { name: "ingestedAt", type: "TIMESTAMP", mode: "REQUIRED" },
  { name: "datetimeMetadata", type: "TIMESTAMP", mode: "REQUIRED" },
  { name: "rawPayload", type: "JSON" },
];

const env = loadEnv();
const client = createBigQueryClient(env);
const dataset = client.dataset(env.BIGQUERY_DATASET, {
  projectId: env.GCP_PROJECT_ID,
});

try {
  const [datasetExists] = await dataset.exists();
  if (!datasetExists) {
    await client.createDataset(env.BIGQUERY_DATASET, { location: "US" });
    console.log(
      JSON.stringify({
        created: "dataset",
        dataset: `${env.GCP_PROJECT_ID}.${env.BIGQUERY_DATASET}`,
        location: "US",
      }),
    );
  }

  const tableDataset = client.dataset(env.BIGQUERY_DATASET, {
    projectId: env.GCP_PROJECT_ID,
  });
  const table = tableDataset.table(env.BIGQUERY_TABLE);
  const [tableExists] = await table.exists();
  if (!tableExists) {
    await tableDataset.createTable(env.BIGQUERY_TABLE, {
      schema,
      description: "Raw chatbot interaction events. Contains PII; restrict access.",
      timePartitioning: {
        type: "DAY",
        field: "datetimeMetadata",
      },
      clustering: {
        fields: ["motivo", "calidadAtencion", "resolucion"],
      },
    });
    console.log(
      JSON.stringify({
        created: "table",
        table: `${env.GCP_PROJECT_ID}.${env.BIGQUERY_DATASET}.${env.BIGQUERY_TABLE}`,
      }),
    );
  }

  console.log(
    JSON.stringify({
      ready: true,
      dataset: `${env.GCP_PROJECT_ID}.${env.BIGQUERY_DATASET}`,
      table: `${env.GCP_PROJECT_ID}.${env.BIGQUERY_DATASET}.${env.BIGQUERY_TABLE}`,
    }),
  );
} catch (error) {
  console.error("Error initializing BigQuery:", error);
  process.exitCode = 1;
}

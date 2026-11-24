import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { MongoClient } from "mongodb";
import {
  buildDailyCaseRows,
  buildDailyMartRows,
  toCasesCsv,
  toCsv,
} from "../application/daily-mart-export.js";
import { loadEnv } from "../config/env.js";
import type { Conversation } from "../domain/conversation.js";

if (existsSync(".env")) process.loadEnvFile(".env");

const env = loadEnv();
const outputDirectory = resolve(process.cwd(), "exports");
const outputPath = resolve(outputDirectory, "daily_chatbot_summary.csv");
const casesOutputPath = resolve(outputDirectory, "daily_chatbot_cases.csv");
const client = new MongoClient(env.MONGODB_URI);

try {
  await client.connect();
  const conversations = await client
    .db(env.MONGODB_DATABASE)
    .collection<Conversation>(env.MONGODB_COLLECTION)
    .find({})
    .toArray();
  const rows = buildDailyMartRows(conversations);
  const caseRows = buildDailyCaseRows(conversations);
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, toCsv(rows), "utf8");
  await writeFile(casesOutputPath, toCasesCsv(caseRows), "utf8");
  console.log(
    JSON.stringify({
      exported: true,
      outputPath,
      casesOutputPath,
      rows: rows.length,
      caseRows: caseRows.length,
      sourceConversations: conversations.length,
      dataset: env.BIGQUERY_DATASET,
    }),
  );
} catch (error) {
  console.error("Error exporting daily mart CSV:", error);
  process.exitCode = 1;
} finally {
  await client.close();
}

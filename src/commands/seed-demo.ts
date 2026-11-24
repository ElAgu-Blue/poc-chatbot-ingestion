import { existsSync } from "node:fs";
import { SNSClient } from "@aws-sdk/client-sns";
import { MongoClient } from "mongodb";
import { CompleteConversation } from "../application/complete-conversation.js";
import { SaveChatTurn } from "../application/save-chat-turn.js";
import { loadEnv } from "../config/env.js";
import { generateDemoConversations } from "../fixtures/demo-generator.js";
import { SnsEventPublisher } from "../infrastructure/aws/sns.publisher.js";
import { MongoConversationRepository } from "../infrastructure/mongodb/conversation.repository.js";

if (existsSync(".env")) process.loadEnvFile(".env");

const env = loadEnv();
const count = Number(readArgument("--count") ?? 84);
const days = Number(readArgument("--days") ?? 21);
const endDate = readArgument("--end-date") ?? "2026-11-23";
const client = new MongoClient(env.MONGODB_URI);

try {
  await client.connect();
  if (process.argv.includes("--reset")) {
    const result = await client
      .db(env.MONGODB_DATABASE)
      .collection(env.MONGODB_COLLECTION)
      .deleteMany({ conversationId: /^demo-chat-/ });
    console.log(JSON.stringify({ reset: true, deleted: result.deletedCount }));
  }

  const repository = new MongoConversationRepository(
    client,
    env.MONGODB_DATABASE,
    env.MONGODB_COLLECTION,
  );
  await repository.ensureIndexes();
  const publisher = new SnsEventPublisher(
    new SNSClient({
      region: env.AWS_REGION,
      ...(env.AWS_ENDPOINT ? { endpoint: env.AWS_ENDPOINT } : {}),
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    }),
    env.SNS_TOPIC_ARN,
  );
  const saveTurn = new SaveChatTurn(repository);
  const complete = new CompleteConversation(repository, publisher);
  const conversations = generateDemoConversations(count, days, endDate);
  let completed = 0;
  let open = 0;

  for (const item of conversations) {
    await saveTurn.execute(item.message);
    if (item.survey) {
      await complete.execute(item.survey);
      completed += 1;
    } else {
      open += 1;
    }
  }

  console.log(
    JSON.stringify({
      generated: conversations.length,
      completed,
      open,
      days,
      endDate,
      scoreRange: "1-7",
      eventsPublished: completed,
    }),
  );
} catch (error) {
  console.error("Error seeding demo conversations:", error);
  process.exitCode = 1;
} finally {
  await client.close();
}

function readArgument(name: string): string | undefined {
  const exact = `${name}=`;
  const inline = process.argv.find((value) => value.startsWith(exact));
  if (inline) return inline.slice(exact.length);

  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

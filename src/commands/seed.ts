import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SNSClient } from "@aws-sdk/client-sns";
import { MongoClient } from "mongodb";
import { SaveChatTurn } from "../application/save-chat-turn.js";
import { CompleteConversation } from "../application/complete-conversation.js";
import { loadEnv } from "../config/env.js";
import { SnsEventPublisher } from "../infrastructure/aws/sns.publisher.js";
import { MongoConversationRepository } from "../infrastructure/mongodb/conversation.repository.js";

if (existsSync(".env")) process.loadEnvFile(".env");
const env = loadEnv();
const client = new MongoClient(env.MONGODB_URI);
try {
  await client.connect();
  const resetFixtures = process.argv.includes("--reset");
  if (resetFixtures) {
    const result = await client
      .db(env.MONGODB_DATABASE)
      .collection(env.MONGODB_COLLECTION)
      .deleteMany({
        conversationId: { $in: ["conv-pyme-001", "conv-b2b-001"] },
      });
    console.log(
      JSON.stringify({
        reset: true,
        deletedConversations: result.deletedCount,
      }),
    );
  }
  const repository = new MongoConversationRepository(
    client,
    env.MONGODB_DATABASE,
    env.MONGODB_COLLECTION,
  );
  await repository.ensureIndexes();
  const sns = new SNSClient({
    region: env.AWS_REGION,
    ...(env.AWS_ENDPOINT ? { endpoint: env.AWS_ENDPOINT } : {}),
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  });
  const turn = new SaveChatTurn(repository);
  const complete = new CompleteConversation(
    repository,
    new SnsEventPublisher(sns, env.SNS_TOPIC_ARN),
  );
  const pyme = readFixture("pyme-conversation.json");
  const b2b = readFixture("b2b-survey.json");
  await turn.execute(pyme);
  await turn.execute(pyme);
  await complete.execute(b2b);
  console.log(
    JSON.stringify({
      seeded: [pyme.conversationId, b2b.conversationId],
      note: resetFixtures
        ? "Fixtures reset and completion event republished"
        : "Completed conversations are not republished; use npm run seed:reset",
    }),
  );
} catch (error) {
  console.error("Error seeding data:", error);
  process.exitCode = 1;
} finally {
  await client.close();
}

function readFixture(name: string): Record<string, any> {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "src", "fixtures", name), "utf8"),
  );
}

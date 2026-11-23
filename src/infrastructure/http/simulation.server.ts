import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { SNSClient } from "@aws-sdk/client-sns";
import { MongoClient } from "mongodb";
import { CompleteConversation } from "../../application/complete-conversation.js";
import { SaveChatTurn } from "../../application/save-chat-turn.js";
import { loadEnv } from "../../config/env.js";
import { MongoConversationRepository } from "../mongodb/conversation.repository.js";
import { SnsEventPublisher } from "../aws/sns.publisher.js";

if (existsSync(".env")) process.loadEnvFile(".env");
const env = loadEnv();
const mongo = new MongoClient(env.MONGODB_URI);
await mongo.connect();
const conversations = new MongoConversationRepository(
  mongo,
  env.MONGODB_DATABASE,
  env.MONGODB_COLLECTION,
);
await conversations.ensureIndexes();
const sns = new SNSClient(awsClientConfig(env));
const publisher = new SnsEventPublisher(sns, env.SNS_TOPIC_ARN);
const saveTurn = new SaveChatTurn(conversations);
const completeConversation = new CompleteConversation(conversations, publisher);

const server = createServer(async (request, response) => {
  try {
    if (request.method !== "POST") {
      respond(response, 405, { error: "method not allowed" });
      return;
    }
    const body = await readJson(request);
    if (request.url === "/v1/chatbot") {
      await saveTurn.execute(body);
      respond(response, 200, {
        text: "Respuesta simulada del agente",
        conversationId: body.conversationId,
      });
      return;
    }
    if (request.url === "/v1/chatbot/survey") {
      await completeConversation.execute(body);
      respond(response, 202, {
        text: "request accepted",
        conversationId: body.conversationId,
      });
      return;
    }
    respond(response, 404, { error: "not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    respond(response, 400, { error: message });
  }
});

server.listen(env.PORT, "127.0.0.1", () => {
  console.log(`Chatbot simulator listening on http://127.0.0.1:${env.PORT}`);
});

async function readJson(request: NodeJS.ReadableStream): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function respond(
  response: import("node:http").ServerResponse,
  status: number,
  body: unknown,
): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function awsClientConfig(env: ReturnType<typeof loadEnv>) {
  return {
    region: env.AWS_REGION,
    ...(env.AWS_ENDPOINT ? { endpoint: env.AWS_ENDPOINT } : {}),
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  };
}

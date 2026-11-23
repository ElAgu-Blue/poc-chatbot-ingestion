import { z } from "zod";
import { surveySchema } from "./survey.js";
import { isoDateTimeSchema } from "./conversation.js";

const eventPayloadSchema = z.object({
  conversationId: z.string().min(1),
  eventId: z.uuid(),
  userEmail: z.email(),
  motivo: z.string().optional(),
  razonamiento: z.string().optional(),
  survey: surveySchema.optional(),
  messagesCount: z.number().int().nonnegative(),
  durationSeconds: z.number().nonnegative(),
  firstUserMessage: z.string().optional(),
  lastAgentMessage: z.string().optional(),
  status: z.enum(["COMPLETED", "ABANDONED"]),
  closedAt: isoDateTimeSchema,
  datetimeMetadata: isoDateTimeSchema,
});

const eventEnvelopeSchema = z.object({
  eventId: z.uuid(),
  eventType: z.enum([
    "chatSurveySubmitted",
    "chatConversationCompleted",
  ]),
  entityId: z.string().min(1),
  entityType: z.literal("chatConversation"),
  timestamp: z.number().int().positive(),
  datetime: isoDateTimeSchema,
  domain: z.literal("clientes"),
  capability: z.literal("cclie"),
  version: z.literal("1.0"),
  payload: eventPayloadSchema,
});

export type ChatInteractionEvent = z.infer<typeof eventPayloadSchema>;
export type ChatEventEnvelope = z.infer<typeof eventEnvelopeSchema>;
export const chatEventEnvelopeSchema = eventEnvelopeSchema;

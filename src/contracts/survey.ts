import { z } from "zod";
import { chatHistoryMessageSchema, isoDateTimeSchema } from "./conversation.js";

export const surveySchema = z.object({
  calidadAtencion: z.number().int().min(1).max(7),
  resolucion: z.number().int().min(1).max(7),
  comentario: z.string().max(4000).optional(),
  agenteId: z.string().min(1),
  submittedAt: isoDateTimeSchema,
});

export const submitChatSurveyRequestSchema = z.object({
  conversationId: z.string().min(1),
  action: z.literal("survey"),
  motivo: z.string().min(1).optional(),
  razonamiento: z.string().min(1).optional(),
  survey: surveySchema,
  userEmail: z.email().optional(),
  history: z.array(chatHistoryMessageSchema).optional(),
});

export type SubmitChatSurveyRequest = z.infer<
  typeof submitChatSurveyRequestSchema
>;

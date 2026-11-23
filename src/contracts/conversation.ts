import { z } from "zod";

export const isoDateTimeSchema = z.iso.datetime({ offset: true });

export const chatHistoryMessageSchema = z.object({
  id: z.string().min(1).optional(),
  role: z.enum(["user", "agent", "system"]),
  content: z.string().min(1),
  timestamp: isoDateTimeSchema,
});

export const chatMessageRequestSchema = z.object({
  conversationId: z.string().min(1),
  agentId: z.string().min(1),
  message: z.string().min(1),
  timestamp: isoDateTimeSchema,
  userEmail: z.email(),
  history: z.array(chatHistoryMessageSchema),
  queueInfo: z
    .object({
      messagesInBatch: z.number().int().nonnegative(),
      debounceDelay: z.number().int().nonnegative(),
    })
    .optional(),
});

export type ChatHistoryMessage = z.infer<typeof chatHistoryMessageSchema>;
export type ChatMessageRequest = z.infer<typeof chatMessageRequestSchema>;

import type { ChatMessageRequest } from "../contracts/conversation.js";
import type { SubmitChatSurveyRequest } from "../contracts/survey.js";

const motives = [
  "FAQS_GENERICAS",
  "EMISIONES",
  "SEGUIMIENTO_ENVIO",
  "FACTURACION",
  "RECLAMOS",
  "CUENTA",
] as const;

const topics = [
  "Necesito saber el estado de mi entrega",
  "Quiero realizar una emisión manual",
  "Dónde puedo descargar mis facturas",
  "La entrega presenta una incidencia",
  "Necesito actualizar los datos de mi cuenta",
  "Tengo dudas sobre el tiempo de entrega",
] as const;

const lowComments = [
  "La respuesta no resolvió mi problema.",
  "Tuve que esperar demasiado.",
  "La información no coincidía con mi caso.",
] as const;

const highComments = [
  "La atención fue clara y rápida.",
  "Pude resolver mi consulta en minutos.",
  "El agente entregó la información que necesitaba.",
] as const;

export type DemoConversation = {
  message: ChatMessageRequest;
  survey?: SubmitChatSurveyRequest;
};

export function generateDemoConversations(
  count = 84,
  days = 21,
  endDate = "2026-11-23",
): DemoConversation[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("Demo conversation count must be a positive integer");
  }
  if (!Number.isInteger(days) || days < 1) {
    throw new Error("Demo conversation days must be a positive integer");
  }

  const end = parseDate(endDate);
  return Array.from({ length: count }, (_, index) =>
    buildConversation(index, days, end),
  );
}

function buildConversation(
  index: number,
  days: number,
  endDate: Date,
): DemoConversation {
  const dayOffset = index % days;
  const date = new Date(endDate);
  date.setUTCDate(date.getUTCDate() - dayOffset);
  date.setUTCHours(8 + (index % 10), (index * 7) % 60, 0, 0);

  const conversationId = `demo-chat-${String(index + 1).padStart(4, "0")}`;
  const motive = motives[index % motives.length]!;
  const topic = topics[index % topics.length]!;
  const agentKind = index % 2 === 0 ? "pyme-agent" : "b2b-agent";
  const agentResponse =
    index % 3 === 0
      ? "Puedo ayudarte con esa consulta."
      : "Encontré la información para resolver tu solicitud.";
  const startedAt = date.toISOString();
  const agentAt = addMinutes(date, 1).toISOString();
  const followUpAt = addMinutes(date, 2).toISOString();
  const message: ChatMessageRequest = {
    conversationId,
    agentId: agentKind,
    message: topic,
    timestamp: startedAt,
    userEmail: `demo.${String(index + 1).padStart(4, "0")}@example.invalid`,
    motivo: motive,
    razonamiento: `Consulta clasificada como ${motive}.`,
    history: [
      {
        id: `${conversationId}-agent-1`,
        role: "agent",
        content: "Hola, ¿en qué puedo ayudarte?",
        timestamp: startedAt,
      },
      {
        id: `${conversationId}-user-1`,
        role: "user",
        content: topic,
        timestamp: startedAt,
      },
      {
        id: `${conversationId}-agent-2`,
        role: "agent",
        content: agentResponse,
        timestamp: agentAt,
      },
      ...(index % 3 !== 0
        ? [
            {
              id: `${conversationId}-user-2`,
              role: "user" as const,
              content: "Gracias, con eso queda resuelto.",
              timestamp: followUpAt,
            },
          ]
        : []),
    ],
    queueInfo: {
      messagesInBatch: 1 + (index % 3),
      debounceDelay: 250 + (index % 4) * 100,
    },
  };

  if (index % 6 === 5) {
    return { message };
  }

  const quality = (index % 7) + 1;
  const resolution =
    quality <= 3 ? Math.max(1, quality - (index % 2)) : Math.min(7, quality + 1);
  const hasComment = index % 4 !== 0;
  const comment =
    quality <= 3
      ? lowComments[index % lowComments.length]
      : highComments[index % highComments.length];
  const submittedAt = addMinutes(date, 5 + (index % 11)).toISOString();

  return {
    message,
    survey: {
      conversationId,
      action: "survey",
      motivo: motive,
      razonamiento: `Cierre clasificado como ${motive}.`,
      userEmail: message.userEmail,
      history: message.history,
      survey: {
        calidadAtencion: quality,
        resolucion: resolution,
        ...(hasComment ? { comentario: comment } : {}),
        agenteId: agentKind,
        submittedAt,
      },
    },
  };
}

function parseDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid demo end date: ${value}`);
  }
  return date;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

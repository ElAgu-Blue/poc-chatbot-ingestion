import { describe, expect, it } from "vitest";
import {
  buildDailyCaseRows,
  buildDailyMartRows,
  toCasesCsv,
  toCsv,
} from "../application/daily-mart-export.js";
import type { Conversation } from "../domain/conversation.js";

describe("daily mart CSV export", () => {
  it("groups completed conversations using Dataform mart metrics", () => {
    const completedWithSurvey = createConversation("3", 5, 5);
    const {
      survey: _survey,
      closedAt: _closedAt,
      ...openConversation
    } = completedWithSurvey;
    const conversations: Conversation[] = [
      createConversation("1", 2, 7),
      createConversation("2", 6, 6),
      {
        ...openConversation,
        status: "OPEN",
      },
    ];
    const rows = buildDailyMartRows(conversations);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      interactionDate: "2026-11-23",
      motivo: "EMISIONES",
      totalConversations: 3,
      completedConversations: 2,
      openConversations: 1,
      abandonedConversations: 0,
      completionRate: 2 / 3,
      surveySubmittedConversations: 2,
      surveyComplianceRate: 1,
      ratedConversations: 2,
      averageQuality: 4,
      averageResolution: 6.5,
      satisfactoryResolutionRate: 1,
      criticalCases: 1,
      participantEmails: [
        "demo.1@example.invalid",
        "demo.2@example.invalid",
        "demo.3@example.invalid",
      ],
    });
    expect(toCsv(rows)).toContain(
      "interactionDate,motivo,totalConversations,completedConversations,openConversations",
    );
  });

  it("exports normalized case rows for rating distributions", () => {
    const rows = buildDailyCaseRows([
      createConversation("1", 2, 3),
      createConversation("2", 6, 7),
    ]);

    expect(rows[0]).toMatchObject({
      surveySubmitted: 1,
      qualityBand: "Negativa",
      resolutionBand: "Parcial",
      criticalCase: 1,
    });
    expect(rows[1]).toMatchObject({
      qualityBand: "Positiva",
      resolutionBand: "Satisfactoria",
      criticalCase: 0,
    });
    expect(toCasesCsv(rows)).toContain(
      "interactionDate,conversationId,userEmail",
    );
  });
});

function createConversation(
  id: string,
  quality: number,
  resolution: number,
): Conversation {
  return {
    conversationId: `demo-chat-${id}`,
    agentId: "pyme-agent",
    userEmail: `demo.${id}@example.invalid`,
    status: "COMPLETED",
    motivo: "EMISIONES",
    history: [
      {
        id: `message-${id}`,
        role: "user",
        content: "Necesito ayuda",
        timestamp: "2026-11-23T10:00:00.000Z",
      },
    ],
    survey: {
      calidadAtencion: quality,
      resolucion: resolution,
      agenteId: "pyme-agent",
      submittedAt: "2026-11-23T10:10:00.000Z",
    },
    createdAt: new Date("2026-11-23T10:00:00.000Z"),
    updatedAt: new Date("2026-11-23T10:10:00.000Z"),
    closedAt: new Date("2026-11-23T10:10:00.000Z"),
  };
}

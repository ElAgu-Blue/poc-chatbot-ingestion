import type { Conversation } from "../domain/conversation.js";

export type DailyMartRow = {
  interactionDate: string;
  motivo: string;
  totalConversations: number;
  completedConversations: number;
  openConversations: number;
  abandonedConversations: number;
  completionRate: number;
  surveySubmittedConversations: number;
  surveyComplianceRate: number | null;
  ratedConversations: number;
  withComments: number;
  withoutComments: number;
  averageQuality: number | null;
  averageResolution: number | null;
  satisfactoryResolutionRate: number | null;
  criticalCases: number;
  averageDurationSeconds: number | null;
  participantEmails: string[];
  participantCases: Array<{
    userEmail: string;
    status: Conversation["status"];
    comentario: string | null;
    calidadAtencion: number | null;
    resolucion: number | null;
    closedAt: string;
  }>;
};

export type DailyCaseRow = {
  interactionDate: string;
  conversationId: string;
  userEmail: string;
  motivo: string;
  agentId: string;
  status: Conversation["status"];
  surveySubmitted: number;
  calidadAtencion: number | null;
  resolucion: number | null;
  qualityBand: string;
  resolutionBand: string;
  criticalCase: number;
  comentario: string | null;
  durationSeconds: number;
  closedAt: string;
};

export function buildDailyCaseRows(
  conversations: Conversation[],
): DailyCaseRow[] {
  return deduplicateLatest(conversations)
    .map((conversation) => {
      const quality = conversation.survey?.calidadAtencion ?? null;
      const resolution = conversation.survey?.resolucion ?? null;
      const interactionAt = conversation.closedAt ?? conversation.createdAt;
      return {
        interactionDate: interactionAt.toISOString().slice(0, 10),
        conversationId: conversation.conversationId,
        userEmail: conversation.userEmail,
        motivo: conversation.motivo ?? "",
        agentId: conversation.agentId,
        status: conversation.status,
        surveySubmitted: conversation.survey ? 1 : 0,
        calidadAtencion: quality,
        resolucion: resolution,
        qualityBand: qualityBand(quality),
        resolutionBand: resolutionBand(resolution),
        criticalCase:
          quality !== null &&
          resolution !== null &&
          (quality <= 3 || resolution <= 3)
            ? 1
            : 0,
        comentario: conversation.survey?.comentario ?? null,
        durationSeconds: durationSeconds(conversation),
        closedAt: conversation.closedAt?.toISOString() ?? "",
      };
    })
    .sort((left, right) =>
      left.conversationId.localeCompare(right.conversationId),
    );
}

export function toCasesCsv(rows: DailyCaseRow[]): string {
  const headers = [
    "interactionDate",
    "conversationId",
    "userEmail",
    "motivo",
    "agentId",
    "status",
    "surveySubmitted",
    "calidadAtencion",
    "resolucion",
    "qualityBand",
    "resolutionBand",
    "criticalCase",
    "comentario",
    "durationSeconds",
    "closedAt",
  ] as const;
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.interactionDate,
        row.conversationId,
        row.userEmail,
        row.motivo,
        row.agentId,
        row.status,
        row.surveySubmitted,
        row.calidadAtencion,
        row.resolucion,
        row.qualityBand,
        row.resolutionBand,
        row.criticalCase,
        row.comentario,
        row.durationSeconds,
        row.closedAt,
      ]
        .map(csvValue)
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

export function buildDailyMartRows(
  conversations: Conversation[],
): DailyMartRow[] {
  const latest = deduplicateLatest(conversations);
  const groups = new Map<string, Conversation[]>();

  for (const conversation of latest) {
    const interactionAt = conversation.closedAt ?? conversation.createdAt;
    const key = `${interactionAt.toISOString().slice(0, 10)}\0${conversation.motivo ?? ""}`;
    const group = groups.get(key) ?? [];
    group.push(conversation);
    groups.set(key, group);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, group]) => buildRow(key, group));
}

export function toCsv(rows: DailyMartRow[]): string {
  const headers = [
    "interactionDate",
    "motivo",
    "totalConversations",
    "completedConversations",
    "openConversations",
    "abandonedConversations",
    "completionRate",
    "surveySubmittedConversations",
    "surveyComplianceRate",
    "ratedConversations",
    "withComments",
    "withoutComments",
    "averageQuality",
    "averageResolution",
    "satisfactoryResolutionRate",
    "criticalCases",
    "averageDurationSeconds",
    "participantEmails",
    "participantCases",
  ] as const;
  const lines = [headers.join(",")];

  for (const row of rows) {
    lines.push(
      [
        row.interactionDate,
        row.motivo,
        row.totalConversations,
        row.completedConversations,
        row.openConversations,
        row.abandonedConversations,
        row.completionRate,
        row.surveySubmittedConversations,
        row.surveyComplianceRate,
        row.ratedConversations,
        row.withComments,
        row.withoutComments,
        row.averageQuality,
        row.averageResolution,
        row.satisfactoryResolutionRate,
        row.criticalCases,
        row.averageDurationSeconds,
        JSON.stringify(row.participantEmails),
        JSON.stringify(row.participantCases),
      ]
        .map(csvValue)
        .join(","),
    );
  }

  return `${lines.join("\n")}\n`;
}

function deduplicateLatest(
  conversations: Conversation[],
): Conversation[] {
  const latest = new Map<string, Conversation>();
  for (const conversation of conversations) {
    const current = latest.get(conversation.conversationId);
    const currentUpdatedAt = current?.updatedAt.getTime() ?? 0;
    if (!current || conversation.updatedAt.getTime() >= currentUpdatedAt) {
      latest.set(conversation.conversationId, conversation);
    }
  }
  return [...latest.values()];
}

function buildRow(key: string, conversations: Conversation[]): DailyMartRow {
  const separator = key.indexOf("\0");
  const interactionDate = key.slice(0, separator);
  const motivo = key.slice(separator + 1);
  const surveys = conversations.flatMap((conversation) =>
    conversation.survey ? [conversation.survey] : [],
  );
  const qualities = surveys.flatMap((survey) =>
    Number.isFinite(survey.calidadAtencion) ? [survey.calidadAtencion] : [],
  );
  const resolutions = surveys.flatMap((survey) =>
    Number.isFinite(survey.resolucion) ? [survey.resolucion] : [],
  );
  const durations = conversations.map((conversation) =>
    durationSeconds(conversation),
  );
  const completed = conversations.filter(
    (conversation) => conversation.status === "COMPLETED",
  );
  const surveySubmitted = completed.filter(
    (conversation) => conversation.survey,
  );

  return {
    interactionDate,
    motivo,
    totalConversations: conversations.length,
    completedConversations: completed.length,
    openConversations: conversations.filter(
      (conversation) => conversation.status === "OPEN",
    ).length,
    abandonedConversations: conversations.filter(
      (conversation) => conversation.status === "ABANDONED",
    ).length,
    completionRate: completed.length / conversations.length,
    surveySubmittedConversations: surveySubmitted.length,
    surveyComplianceRate:
      completed.length === 0 ? null : surveySubmitted.length / completed.length,
    ratedConversations: qualities.length,
    withComments: surveys.filter((survey) => survey.comentario).length,
    withoutComments: surveys.filter((survey) => !survey.comentario).length,
    averageQuality: average(qualities),
    averageResolution: average(resolutions),
    satisfactoryResolutionRate:
      resolutions.length === 0
        ? null
        : resolutions.filter((score) => score >= 5).length / resolutions.length,
    criticalCases: surveys.filter(
      (survey) => survey.calidadAtencion <= 3 || survey.resolucion <= 3,
    ).length,
    averageDurationSeconds: average(durations),
    participantEmails: [
      ...new Set(
        conversations.map((conversation) => conversation.userEmail).sort(),
      ),
    ],
    participantCases: [...conversations]
      .sort((left, right) =>
        left.conversationId.localeCompare(right.conversationId),
      )
      .map((conversation) => ({
        userEmail: conversation.userEmail,
        status: conversation.status,
        comentario: conversation.survey?.comentario ?? null,
        calidadAtencion: conversation.survey?.calidadAtencion ?? null,
        resolucion: conversation.survey?.resolucion ?? null,
        closedAt: conversation.closedAt?.toISOString() ?? "",
      })),
  };
}

function durationSeconds(conversation: Conversation): number {
  const timestamps = conversation.history
    .map((message) => Date.parse(message.timestamp))
    .filter(Number.isFinite);
  const closedAt = conversation.closedAt?.getTime() ?? conversation.updatedAt.getTime();
  const firstAt = timestamps.length
    ? Math.min(...timestamps)
    : conversation.createdAt.getTime();
  return Math.max(0, Math.round((closedAt - firstAt) / 1000));
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Number(
    (values.reduce((total, value) => total + value, 0) / values.length).toFixed(
      6,
    ),
  );
}

function csvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text)
    ? `"${text.replaceAll('"', '""')}"`
    : text;
}

function qualityBand(score: number | null): string {
  if (score === null) return "Sin encuesta";
  if (score <= 2) return "Negativa";
  if (score <= 4) return "Neutra";
  return "Positiva";
}

function resolutionBand(score: number | null): string {
  if (score === null) return "Sin encuesta";
  if (score <= 2) return "No resuelta";
  if (score <= 4) return "Parcial";
  return "Satisfactoria";
}

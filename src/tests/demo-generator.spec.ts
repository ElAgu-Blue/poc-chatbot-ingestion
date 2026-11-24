import { describe, expect, it } from "vitest";
import { generateDemoConversations } from "../fixtures/demo-generator.js";

describe("demo conversation generator", () => {
  const generated = generateDemoConversations();

  it("creates varied completed and open conversations", () => {
    expect(generated).toHaveLength(84);
    expect(generated.filter((item) => item.survey)).toHaveLength(70);
    expect(generated.filter((item) => !item.survey)).toHaveLength(14);
  });

  it("covers every rating and optional comment shape", () => {
    const surveys = generated.flatMap((item) =>
      item.survey ? [item.survey.survey] : [],
    );
    expect(
      new Set(surveys.map((survey) => survey.calidadAtencion)),
    ).toEqual(new Set([1, 2, 3, 4, 5, 6, 7]));
    expect(surveys.some((survey) => survey.comentario)).toBe(true);
    expect(surveys.some((survey) => !survey.comentario)).toBe(true);
    expect(surveys.every((survey) => survey.resolucion >= 1)).toBe(true);
    expect(surveys.every((survey) => survey.resolucion <= 7)).toBe(true);
  });

  it("distributes records over 21 days and all analysis dimensions", () => {
    const dates = generated.map(
      (item) => item.message.timestamp.split("T")[0],
    );
    expect(new Set(dates)).toHaveLength(21);
    expect(new Set(generated.map((item) => item.message.motivo))).toHaveLength(
      6,
    );
    expect(new Set(generated.map((item) => item.message.agentId))).toEqual(
      new Set(["pyme-agent", "b2b-agent"]),
    );
  });
});

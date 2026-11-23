import { describe, expect, it } from "vitest";
import { parseServiceAccount } from "../infrastructure/gcp/service-account.js";

describe("parseServiceAccount", () => {
  const credentials = {
    client_email: "poc@example.invalid",
    private_key: String.raw`line-1\nline-2`,
  };

  it("parses JSON credentials and restores private key newlines", () => {
    expect(parseServiceAccount(JSON.stringify(credentials))).toEqual({
      client_email: credentials.client_email,
      private_key: "line-1\nline-2",
    });
  });

  it("parses base64 credentials using the BFA environment format", () => {
    const encoded = Buffer.from(JSON.stringify(credentials)).toString("base64");
    expect(parseServiceAccount(encoded).client_email).toBe(
      credentials.client_email,
    );
  });

  it("rejects missing service account fields", () => {
    expect(() => parseServiceAccount('{"client_email":"only-email"}')).toThrow(
      "must include client_email and private_key",
    );
  });
});

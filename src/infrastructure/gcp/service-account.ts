import { existsSync, readFileSync } from "node:fs";

const ESCAPED_NEWLINE = String.raw`\n`;

export type ServiceAccountCredentials = {
  client_email: string;
  private_key: string;
};

type ServiceAccountCandidate = {
  client_email?: unknown;
  private_key?: unknown;
  clientEmail?: unknown;
  privateKey?: unknown;
};

export function parseServiceAccount(
  rawValue: string | undefined,
  envVarName = "GCP_SA_INTGR_BFA",
): ServiceAccountCredentials {
  if (!rawValue?.trim()) {
    throw new Error(
      `${envVarName} is required to authenticate GCP with service account`,
    );
  }

  const parsed =
    tryParseJson(rawValue.trim()) ??
    tryParseJson(Buffer.from(rawValue.trim(), "base64").toString("utf8")) ??
    tryParseJson(readServiceAccountFile(rawValue.trim()));
  const candidate = parsed as ServiceAccountCandidate | null;
  const clientEmail =
    toNonEmptyString(candidate?.client_email) ??
    toNonEmptyString(candidate?.clientEmail);
  const privateKey =
    toNonEmptyString(candidate?.private_key) ??
    toNonEmptyString(candidate?.privateKey);

  if (!clientEmail || !privateKey) {
    throw new Error(
      `${envVarName} must include client_email and private_key`,
    );
  }

  return {
    client_email: clientEmail,
    private_key: privateKey.replaceAll(ESCAPED_NEWLINE, "\n"),
  };
}

function readServiceAccountFile(value: string): string | null {
  const filePath = value.startsWith("file://") ? value.slice(7) : value;
  if (!filePath || !existsSync(filePath)) return null;

  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function tryParseJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

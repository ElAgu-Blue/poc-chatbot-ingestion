import { BigQuery } from "@google-cloud/bigquery";
import type { Environment } from "../../config/env.js";
import { parseServiceAccount } from "./service-account.js";

export function createBigQueryClient(env: Environment): BigQuery {
  const credentials = env.GCP_SA_INTGR_BFA
    ? parseServiceAccount(env.GCP_SA_INTGR_BFA)
    : undefined;

  return new BigQuery({
    projectId: env.GCP_PROJECT_ID,
    ...(credentials ? { credentials } : {}),
  });
}

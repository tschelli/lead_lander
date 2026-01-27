import { AdapterResult, CrmAdapter } from "./types";

function getValueByPath(value: unknown, path: string) {
  if (!value || typeof value !== "object") return undefined;
  const segments = path.split(".").filter(Boolean);
  let current: any = value;
  for (const segment of segments) {
    if (current == null || typeof current !== "object" || !(segment in current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

export const webhookAdapter: CrmAdapter = async (payload, connectionConfig) => {
  const endpoint = connectionConfig.endpoint as string | undefined;
  if (!endpoint) {
    return { success: false, error: "Missing webhook endpoint" };
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (connectionConfig.authHeaderName) {
    const headerName = String(connectionConfig.authHeaderName);
    const envKey = connectionConfig.authHeaderEnv ? String(connectionConfig.authHeaderEnv) : null;
    const headerValue = envKey ? process.env[envKey] : connectionConfig.authHeaderValue;

    if (headerValue) {
      headers[headerName] = String(headerValue);
    }
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    const responseBody = await response.text();

    if (!response.ok) {
      return { success: false, statusCode: response.status, responseBody };
    }

    let crmLeadId: string | undefined;
    const leadIdField = connectionConfig.leadIdField
      ? String(connectionConfig.leadIdField)
      : "id";

    try {
      const parsed = JSON.parse(responseBody);
      const candidate = getValueByPath(parsed, leadIdField);
      if (candidate !== undefined && candidate !== null) {
        crmLeadId = String(candidate);
      }
    } catch {
      crmLeadId = undefined;
    }

    return { success: true, statusCode: response.status, responseBody, crmLeadId };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
};

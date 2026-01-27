import { AdapterResult, CrmAdapter } from "./types";

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

    return { success: true, statusCode: response.status, responseBody };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
};

export type DeliveryPayload = {
  submissionId: string;
  idempotencyKey: string;
  action: "create" | "update";
  crmLeadId?: string | null;
  stepIndex?: number | null;
  // Account-based fields (new architecture)
  accountId?: string;
  locationId?: string | null;
  // School-based fields (legacy)
  schoolId?: string;
  campusId?: string | null;
  // Common fields
  programId?: string | null;
  contact: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
  };
  answers: Record<string, unknown>;
  metadata: Record<string, unknown>;
  consent: {
    consented: boolean;
    textVersion: string;
    timestamp: string;
  };
  routingTags: string[];
};

export type AdapterResult = {
  success: boolean;
  statusCode?: number;
  responseBody?: string;
  crmLeadId?: string;
  error?: string;
};

export type CrmAdapter = (payload: DeliveryPayload, connectionConfig: Record<string, any>) => Promise<AdapterResult>;

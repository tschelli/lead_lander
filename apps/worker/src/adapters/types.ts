export type DeliveryPayload = {
  submissionId: string;
  idempotencyKey: string;
  action: "create" | "update";
  crmLeadId?: string | null;
  stepIndex?: number | null;
  schoolId: string;
  campusId: string;
  programId: string;
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

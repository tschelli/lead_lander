import { AdapterResult, CrmAdapter } from "./types";

export const genericAdapter: CrmAdapter = async () => {
  const result: AdapterResult = {
    success: false,
    error: "Generic CRM adapter not implemented"
  };

  return result;
};

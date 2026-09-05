import "server-only";
import { createInternalApiClient } from "./transport";

export const requestInternalApi = createInternalApiClient(() => ({
  baseUrl: process.env.HITNOTICE_ECS_API_BASE_URL,
  secret: process.env.HITNOTICE_INTERNAL_API_SECRET
}));

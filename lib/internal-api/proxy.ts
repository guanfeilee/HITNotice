import { requestInternalApi } from "./client";
import { handleInternalApiPost } from "./proxy-handler";

export function proxyInternalApiPost(request: Request, path: string) {
  return handleInternalApiPost(request, path, requestInternalApi);
}

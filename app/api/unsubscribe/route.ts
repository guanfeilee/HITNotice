import { proxyInternalApiPost } from "@/lib/internal-api/proxy";

export async function POST(request: Request) {
  return proxyInternalApiPost(request, "/internal/unsubscribe");
}

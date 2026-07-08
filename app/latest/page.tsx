import { LatestClient } from "./LatestClient";
import { fetchNotices } from "@/lib/notices";

export const dynamic = "force-dynamic";

export default async function LatestPage() {
  const result = await fetchNotices();

  return (
    <div className="page">
      <div className="container">
        <p className="eyebrow">公开信息渠道标题更新</p>
        <h1 className="section-title">最近更新</h1>
        <p className="lead">这里展示 Supabase notices 表中的公开信息标题、发布时间与原文链接。</p>
        <LatestClient error={result.ok ? undefined : result.error} notices={result.notices} />
      </div>
    </div>
  );
}

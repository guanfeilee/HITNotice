import { LatestClient } from "./LatestClient";
import { getLatestUpdatesFromJson } from "@/lib/latest-updates";

export default function LatestPage() {
  const updates = getLatestUpdatesFromJson();

  return (
    <div className="page">
      <div className="container">
        <p className="eyebrow">公开信息渠道标题更新</p>
        <h1 className="section-title">最近更新</h1>
        <p className="lead">这里展示抓取脚本生成的公开列表页标题、发布时间与原文链接。</p>
        <LatestClient updates={updates} />
      </div>
    </div>
  );
}

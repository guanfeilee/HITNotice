import Link from "next/link";
import "./home.css";

const features = [
  "支持分学院 / 学部信息渠道订阅",
  "支持高频、每日、每周邮件摘要"
];

export default function Home() {
  return (
    <div className="page home-page">
      <section className="container hero">
        <div className="hero-copy">
          <p className="eyebrow">非官方校园公开信息渠道提醒工具</p>
          <h1 className="page-title">HITNotice</h1>
          <p className="lead">选择你关注的校园公开信息渠道，按你的频率接收邮件更新。</p>
          <div className="hero-notes" aria-label="功能说明">
            {features.map((feature) => (
              <p key={feature}>
                <span aria-hidden="true">✓</span>
                {feature}
              </p>
            ))}
          </div>
        </div>
        <div className="hero-side" aria-label="订阅操作">
          <div className="hero-actions">
            <Link className="button primary" href="/subscribe">
              开始订阅
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

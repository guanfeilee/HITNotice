import Link from "next/link";
import "./home.css";

export default function Home() {
  return (
    <div className="page home-page">
      <section className="container hero">
        <h1 className="page-title">HITnotice</h1>
        <p className="hero-subtitle">哈工大公开通知提醒服务</p>
        <p className="hero-schedule">每个工作日晚八时，最新通知摘要将发送至你的邮箱。</p>
        <Link className="button primary hero-button" href="/subscribe">
          开始订阅
        </Link>
      </section>
    </div>
  );
}

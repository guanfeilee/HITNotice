import Link from "next/link";
import "./home.css";

export default function Home() {
  return (
    <div className="page home-page">
      <section className="container hero">
        <h1 className="page-title">HITnotice</h1>
        <p className="hero-subtitle">哈工大公开通知提醒服务</p>
        <p className="hero-description">
          订阅你关注的信息渠道，
          <br />
          我们会在工作日晚间整理最新通知并发送到邮箱。
        </p>
        <p className="hero-schedule">工作日晚上 20:00，我们会将最新通知摘要发送至你的邮箱。</p>
        <Link className="button primary hero-button" href="/subscribe">
          开始订阅
        </Link>
      </section>
    </div>
  );
}

import "./about.css";

const privacy = [
  "HITnotice 仅保存邮箱地址和你的订阅设置，用于发送通知摘要。",
  "我们不会收集姓名、学号、手机号等个人信息。",
  "我们只聚合公开信息渠道，不访问需要登录或身份认证的内容。"
];

function InfoList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="about-card card">
      <h2>{title}</h2>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export default function AboutPage() {
  return (
    <div className="page">
      <div className="container">
        <p className="eyebrow">关于 HITnotice</p>
        <h1 className="section-title">隐私说明与联系方式</h1>
        <p className="lead">HITnotice 是面向公开信息渠道标题更新的提醒工具，不替代任何官网信息。</p>
        <div className="about-grid section">
          <InfoList title="隐私说明" items={privacy} />
          <section className="about-card card">
            <h2>联系方式</h2>
            <p>如需反馈问题或提出建议，可以通过邮箱联系：</p>
            <a className="contact-link" href="mailto:guanfeilee7@gmail.com">
              guanfeilee7@gmail.com
            </a>
          </section>
        </div>
      </div>
    </div>
  );
}

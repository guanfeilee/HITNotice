import "./about.css";

const privacy = [
  "本项目仅保存邮箱地址和你的订阅设置，用于发送通知摘要。",
  "本项目不会收集姓名、学号、手机号等个人信息。",
  "本项目只聚合公开信息渠道，不访问需要登录或身份认证的内容。"
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
    <div className="page about-page">
      <div className="container">
        <h1 className="about-title">关于 HITnotice</h1>
        <div className="about-grid section">
          <InfoList title="隐私说明" items={privacy} />
          <section className="about-card author-card card">
            <h2>项目作者</h2>
            <div className="author-details">
              <p>李冠霏</p>
              <p>哈尔滨工业大学</p>
              <p>生命科学和医学学部</p>
            </div>
          </section>
          <section className="about-card contact-card card">
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

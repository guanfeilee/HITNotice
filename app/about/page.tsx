import "./about.css";

const privacy = [
  "仅保存邮箱、订阅信息渠道和推送频率",
  "不收集姓名、学号、手机号、身份证、校园卡号或统一身份认证信息",
  "不访问需要统一身份认证的内容"
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
        <p className="eyebrow">关于 HITNotice</p>
        <h1 className="section-title">隐私原则与联系方式</h1>
        <p className="lead">HITNotice 是面向公开信息渠道标题更新的提醒工具，不替代任何官网信息。</p>
        <div className="about-grid section">
          <InfoList title="隐私原则" items={privacy} />
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

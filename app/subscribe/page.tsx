import { SubscribeForm } from "./SubscribeForm";
import "./subscribe.css";

const privacyNotes = [
  "HITnotice 仅保存邮箱地址和你的订阅设置，用于发送通知摘要。",
  "我们不会收集姓名、学号、手机号等个人信息。",
  "我们只聚合公开信息渠道，不访问需要登录或身份认证的内容。"
];

export default function SubscribePage() {
  return (
    <div className="page">
      <div className="container subscribe-layout">
        <SubscribeForm />
        <section className="subscribe-privacy card">
          <h2>隐私说明</h2>
          <ul>
            {privacyNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

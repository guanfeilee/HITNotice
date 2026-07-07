import { UnsubscribeForm } from "./UnsubscribeForm";

export default function UnsubscribePage() {
  return (
    <div className="page">
      <div className="container">
        <p className="eyebrow">退订</p>
        <h1 className="section-title">取消邮件提醒</h1>
        <p className="lead">正式版本中，每封邮件都会包含一键退订链接。</p>
        <UnsubscribeForm />
      </div>
    </div>
  );
}

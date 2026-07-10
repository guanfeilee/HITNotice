import Link from "next/link";
import "./Footer.css";

export const unofficialStatement =
  "HITnotice 是由李冠霏独立开发并维护的校园公开通知提醒服务，非哈尔滨工业大学官方平台。所有正式信息以官网为准。";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <p>{unofficialStatement}</p>
        <div className="footer-links">
          <Link href="/about">关于</Link>
        </div>
      </div>
    </footer>
  );
}

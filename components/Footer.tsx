import Link from "next/link";
import "./Footer.css";

export const unofficialStatement =
  "HITNotice 是学生个人开发的校园公开信息渠道标题更新提醒工具，非哈尔滨工业大学官方平台。所有正式信息以官网为准。";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <p>{unofficialStatement}</p>
        <div className="footer-links">
          <Link href="/about">关于</Link>
          <Link href="/unsubscribe">退订</Link>
        </div>
      </div>
    </footer>
  );
}

import Link from "next/link";
import "./Header.css";

const navItems = [
  { href: "/", label: "首页" },
  { href: "/subscribe", label: "订阅" },
  { href: "/sources", label: "信息渠道" },
  { href: "/about", label: "关于" }
];

export function Header() {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link href="/" className="brand" aria-label="HITNotice 首页">
          <strong>HITNotice</strong>
        </Link>
        <nav className="nav" aria-label="主导航">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

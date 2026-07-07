"use client";

import { FormEvent, useState } from "react";
import "./unsubscribe.css";

export function UnsubscribeForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || !email.includes("@")) {
      setMessage("请输入有效的邮箱地址。");
      return;
    }
    setMessage("退订请求已模拟提交。正式版本会停止向该邮箱发送摘要。");
  };

  return (
    <form className="unsubscribe-form card section" onSubmit={submit}>
      <div className="field">
        <label htmlFor="unsubscribe-email">邮箱</label>
        <input
          id="unsubscribe-email"
          className="input"
          type="email"
          placeholder="name@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      {message ? <div className={message.startsWith("退订") ? "success" : "notice"}>{message}</div> : null}
      <button className="button primary" type="submit">
        退订
      </button>
    </form>
  );
}

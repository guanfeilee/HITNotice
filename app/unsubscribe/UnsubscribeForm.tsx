"use client";

import { FormEvent, useState } from "react";
import "./unsubscribe.css";

type UnsubscribeFormProps = {
  token: string;
};

type SubmitStatus = "idle" | "submitting" | "success" | "error";

export function UnsubscribeForm({ token }: UnsubscribeFormProps) {
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [message, setMessage] = useState(token ? "" : "无效的取消订阅链接。");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) {
      setStatus("error");
      setMessage("无效的取消订阅链接。");
      return;
    }

    setStatus("submitting");
    setMessage("");

    try {
      const response = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ token })
      });
      const result = (await response.json()) as { ok?: unknown; error?: unknown };

      if (!response.ok || result.ok !== true) {
        setStatus("error");
        setMessage(typeof result.error === "string" ? result.error : "取消订阅失败，请稍后重试。");
        return;
      }

      setStatus("success");
      setMessage("已成功取消邮件摘要订阅。");
    } catch {
      setStatus("error");
      setMessage("取消订阅失败，请稍后重试。");
    }
  };

  return (
    <form className="unsubscribe-form card section" onSubmit={submit}>
      <p className="unsubscribe-copy">
        {token ? "确认后，你将不再收到 HITnotice 邮件摘要。" : "邮件中的取消订阅链接缺少有效凭证。"}
      </p>
      {message ? <div className={status === "success" ? "success" : "notice"}>{message}</div> : null}
      <button className="button primary" type="submit" disabled={!token || status === "submitting" || status === "success"}>
        {status === "submitting" ? "正在取消..." : "确认取消订阅"}
      </button>
    </form>
  );
}

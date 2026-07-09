"use client";

import { FormEvent, useState } from "react";
import { FrequencySelector } from "@/components/FrequencySelector";
import { SourceSelector } from "@/components/SourceSelector";
import type { SubscriptionDraft } from "@/lib/types";

const initialDraft: SubscriptionDraft = {
  email: "",
  sourceIds: [],
  frequency: "daily_digest"
};

export function SubscribeForm() {
  const [draft, setDraft] = useState<SubscriptionDraft>(initialDraft);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaved(false);

    if (!draft.email.trim()) {
      setError("请先填写邮箱。");
      return;
    }

    if (!draft.email.includes("@")) {
      setError("请输入有效的邮箱地址。");
      return;
    }

    if (draft.sourceIds.length === 0) {
      setError("请至少选择一个信息渠道。");
      return;
    }

    if (!draft.frequency) {
      setError("请选择邮件推送频率。");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: draft.email,
          frequency: draft.frequency,
          sourceIds: draft.sourceIds
        })
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        setError(result.error ?? "订阅保存失败，请稍后再试。");
        return;
      }

      setSaved(true);
    } catch {
      setError("网络请求失败，请稍后再试。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="subscribe-form card" onSubmit={submit}>
      <div className="field">
        <label htmlFor="email">邮箱</label>
        <input
          id="email"
          className="input"
          type="email"
          placeholder="name@example.com"
          value={draft.email}
          onChange={(event) => setDraft({ ...draft, email: event.target.value })}
        />
      </div>

      <div className="field">
        <SourceSelector
          selectedIds={draft.sourceIds}
          onChange={(sourceIds) => setDraft({ ...draft, sourceIds })}
        />
      </div>

      <div className="field">
        <span className="field-label">推送频率</span>
        <FrequencySelector
          value={draft.frequency}
          onChange={(frequency) => setDraft({ ...draft, frequency })}
        />
      </div>

      {error ? <div className="notice" role="alert">{error}</div> : null}
      {saved ? (
        <div className="success" role="status">
          订阅成功。我们会在工作日晚上 20:00 发送通知摘要。
        </div>
      ) : null}

      <button className="button primary" type="submit" disabled={loading}>
        {loading ? "保存中..." : "保存订阅设置"}
      </button>
    </form>
  );
}

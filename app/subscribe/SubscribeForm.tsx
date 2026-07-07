"use client";

import { FormEvent, useState } from "react";
import { FrequencySelector } from "@/components/FrequencySelector";
import { SourceSelector } from "@/components/SourceSelector";
import { scheduleSummary } from "@/lib/schedule";
import type { SubscriptionDraft } from "@/lib/types";

const initialDraft: SubscriptionDraft = {
  email: "",
  sourceIds: [],
  frequency: ""
};

export function SubscribeForm() {
  const [draft, setDraft] = useState<SubscriptionDraft>(initialDraft);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const submit = (event: FormEvent<HTMLFormElement>) => {
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
    setSaved(true);
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

      <p className="schedule-note">{scheduleSummary}</p>

      {error ? <div className="notice" role="alert">{error}</div> : null}
      {saved ? (
        <div className="success" role="status">
          订阅设置已保存。后续接入后，你将按所选频率收到邮件摘要。
        </div>
      ) : null}

      <button className="button primary" type="submit">
        保存订阅设置
      </button>
    </form>
  );
}

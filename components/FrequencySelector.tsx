"use client";

import { frequencyOptions } from "@/lib/frequencies";
import type { Frequency } from "@/lib/types";
import "./FrequencySelector.css";

type FrequencySelectorProps = {
  value: Frequency | "";
  onChange: (value: Frequency) => void;
};

export function FrequencySelector({ value, onChange }: FrequencySelectorProps) {
  return (
    <div className="frequency-grid" role="radiogroup" aria-label="邮件推送频率">
      {frequencyOptions.map((option) => {
        const selected = value === option.value;
        return (
          <label className={`frequency-option ${selected ? "selected" : ""}`} key={option.value}>
            <input
              type="radio"
              name="frequency"
              checked={selected}
              onChange={() => onChange(option.value)}
            />
            <span className="frequency-label">{option.label}</span>
            <span className="frequency-description">{option.description}</span>
          </label>
        );
      })}
    </div>
  );
}

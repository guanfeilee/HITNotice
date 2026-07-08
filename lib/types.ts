export type SourceGroup = "public" | "academic";
export type SourceCategory = "public" | "school";
export type SourceStatus = "pending" | "active";
export type SourceParserType = "today-hit" | "generic";

export type Source = {
  id: string;
  name: string;
  group: SourceGroup;
  category: SourceCategory;
  status: SourceStatus;
  url: string;
  enabled: boolean;
  parserType: SourceParserType;
};

export type Frequency = "high_frequency" | "daily_digest" | "weekly_digest";

export type SubscriptionDraft = {
  email: string;
  sourceIds: string[];
  frequency: Frequency | "";
};

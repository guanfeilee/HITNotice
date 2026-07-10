export type DigestType = "daily_digest";

export type DigestSubscription = {
  id: string;
  email: string;
  frequency: DigestType;
  unsubscribeToken: string;
};

export type DigestSource = {
  id: string;
  name: string;
};

export type DigestNotice = {
  id: string;
  title: string;
  url: string;
  sourceId: string;
  sourceName: string;
  publishedAt: string | null;
  firstSeenAt: string;
};

export type DigestGroup = {
  sourceId: string;
  sourceName: string;
  notices: DigestNotice[];
  hasUpdates: boolean;
};

export type DigestWindow = {
  start: Date;
  end: Date;
};

export type DailyDigest = {
  digestType: DigestType;
  date: string;
  periodStart: string;
  periodEnd: string;
  total: number;
  sources: DigestSource[];
  groups: DigestGroup[];
};

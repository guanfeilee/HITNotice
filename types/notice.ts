export type NoticeSourceGroup = "public" | "academic" | "unknown";

export type Notice = {
  id: string;
  sourceId?: string;
  sourceName: string;
  sourceGroup: NoticeSourceGroup;
  title: string;
  url: string;
  category?: string;
  publishedAt?: string;
  firstSeenAt?: string;
  createdAt?: string;
};

export type NoticeFetchResult =
  | {
      ok: true;
      notices: Notice[];
    }
  | {
      ok: false;
      notices: Notice[];
      error: string;
    };

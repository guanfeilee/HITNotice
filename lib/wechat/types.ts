export type WechatApiErrorResponse = {
  errcode: number;
  errmsg?: string;
};

export type WechatTokenResponse = {
  access_token: string;
  expires_in: number;
};

export type WechatDraftInput = {
  title: string;
  content: string;
  author: string;
  digest: string;
};

export type WechatDraftResponse = {
  media_id: string;
};

export type WechatDraftRequest = {
  articles: Array<{
    title: string;
    content: string;
    author: string;
    digest: string;
  }>;
};

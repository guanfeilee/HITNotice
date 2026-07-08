import { UnsubscribeForm } from "./UnsubscribeForm";

type UnsubscribePageProps = {
  searchParams?: Promise<{
    token?: string | string[];
  }>;
};

export default async function UnsubscribePage({ searchParams }: UnsubscribePageProps) {
  const params = searchParams ? await searchParams : {};
  const token = Array.isArray(params.token) ? params.token[0] : params.token;

  return (
    <div className="page">
      <div className="container">
        <p className="eyebrow">退订</p>
        <h1 className="section-title">取消邮件提醒</h1>
        <p className="lead">你可以在这里取消 HITnotice 邮件摘要订阅。</p>
        <UnsubscribeForm token={token ?? ""} />
      </div>
    </div>
  );
}

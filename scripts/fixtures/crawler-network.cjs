// Offline-only subprocess fixture. Never permits a request to leave the process.
if (process.env.NODE_ENV !== 'test') throw Error('TEST_ONLY');
const url = new URL(process.env.DATABASE_URL);
if (url.hostname !== '127.0.0.1' || url.port !== '55439' || url.pathname !== '/hitnotice_test_workflow') throw Error('ISOLATED_DATABASE_REQUIRED');
global.fetch = async input => {
  if (process.env.CRAWLER_FIXTURE_CRASH === '1') process.kill(process.pid, 'SIGKILL');
  if (process.env.CRAWLER_FIXTURE_FAIL === 'all' || (process.env.CRAWLER_FIXTURE_FAIL === 'one' && String(input).includes('hituc.hit.edu.cn'))) throw new TypeError('synthetic fetch failed');
  return new Response('<html><body><li><a class="news_title" href="/article/2026/123456.htm">Synthetic reliability notice</a>2026-09-10</li></body></html>', {status:200, headers:{'content-type':'text/html;charset=utf-8'}});
};

export async function onRequestGet() {
  return new Response('', {
    status: 302,
    headers: {
      Location: '/mission-control.html',
      'Cache-Control': 'no-store'
    }
  });
}

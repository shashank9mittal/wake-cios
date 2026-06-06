const BASE = 'http://localhost:8000'

export const api = {
  get: (url: string) =>
    fetch(`${BASE}${url}`).then(r => r.json()),

  post: (url: string, body?: unknown) =>
    fetch(`${BASE}${url}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }).then(r => r.json()),
}

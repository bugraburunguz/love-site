export class ApiError extends Error {
  status: number
  /** machine-readable reason from the backend, e.g. QUOTA_EXCEEDED */
  code?: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

function xsrfToken(): string | undefined {
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith('XSRF-TOKEN='))
    ?.slice('XSRF-TOKEN='.length)
}

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = options.method ?? 'GET'
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (method !== 'GET') {
    const token = xsrfToken()
    if (token) headers['X-XSRF-TOKEN'] = decodeURIComponent(token)
  }

  const res = await fetch(path, {
    method,
    headers,
    credentials: 'same-origin',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  if (!res.ok) {
    // Errors are RFC 9457 problem details; `detail` is a user-facing Turkish message.
    let message = `İstek başarısız (${res.status})`
    let code: string | undefined
    try {
      const problem = await res.json()
      if (typeof problem.detail === 'string' && problem.detail) message = problem.detail
      if (typeof problem.code === 'string') code = problem.code
    } catch {
      /* empty or non-JSON error body (e.g. a bare 401) */
    }
    throw new ApiError(res.status, message, code)
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
}

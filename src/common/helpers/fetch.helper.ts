import { userAgents, type Endpoints } from '#common/constants'
import { ApiContextEnum } from '#common/enums'
import { HTTPException } from 'hono/http-exception'

type EndpointValue = (typeof Endpoints)[keyof typeof Endpoints]

interface FetchParams {
  endpoint: EndpointValue
  params: Record<string, string | number>
  context?: ApiContextEnum
}

interface FetchResponse<T> {
  data: T
  ok: Response['ok']
}

export const useFetch = async <T>({ endpoint, params, context }: FetchParams): Promise<FetchResponse<T>> => {
  const url = new URL('https://www.jiosaavn.com/api.php')

  url.searchParams.append('__call', endpoint.toString())
  url.searchParams.append('_format', 'json')
  url.searchParams.append('_marker', '0')
  url.searchParams.append('api_version', '4')
  url.searchParams.append('ctx', context || 'web6dot0')

  Object.keys(params).forEach((key) => url.searchParams.append(key, String(params[key])))

  let selectedUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)]
  if (context === ApiContextEnum.ANDROID) {
    const androidUserAgents = [
      'okhttp/4.10.0',
      'okhttp/4.9.0',
      'okhttp/3.12.12',
      'JioSaavn/6.11.1 (Android; 10; Mobile)',
      'JioSaavn/6.8.2 (Android; 9; Mobile)'
    ]
    selectedUserAgent = androidUserAgents[Math.floor(Math.random() * androidUserAgents.length)]
  }

  const response = await fetch(url.toString(), {
    headers: { 'Content-Type': 'application/json', 'User-Agent': selectedUserAgent }
  })

  if (!response.ok) {
    throw new HTTPException(response.status as any, {
      message: `upstream request failed with status ${response.status}`
    })
  }

  let data: T
  try {
    const text = await response.text()
    data = JSON.parse(text) as T
  } catch (err) {
    throw new HTTPException(500, {
      message: 'failed to parse upstream response: invalid JSON'
    })
  }

  return { data, ok: response.ok }
}

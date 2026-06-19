export interface BrowserSurfaceRequest {
  url: string;
  title?: string;
}

export interface BrowserSurface {
  id: string;
  url: string;
  title: string;
}

const allowedProtocols = new Set(["http:", "https:"]);

export function normalizeBrowserUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Browser URL is required");
  const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);
  if (!allowedProtocols.has(url.protocol)) {
    throw new Error(`Unsupported browser URL protocol: ${url.protocol}`);
  }
  url.username = "";
  url.password = "";
  return url.toString();
}

export function createBrowserSurface(id: string, request: BrowserSurfaceRequest): BrowserSurface {
  const url = normalizeBrowserUrl(request.url);
  return {
    id,
    url,
    title: request.title?.trim() || new URL(url).hostname,
  };
}

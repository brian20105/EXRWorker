interface WorkerEnv {
  ASSETS: Fetcher;
  BACKEND_ORIGIN?: string;
}

function normalizeBackendOrigin(raw?: string): string | null {
  const value = (raw || "").trim();
  if (!value) return null;
  return value.replace(/\/+$/, "");
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const backendOrigin = normalizeBackendOrigin(env.BACKEND_ORIGIN);

    if (backendOrigin && url.pathname.startsWith("/api/")) {
      const proxyUrl = `${backendOrigin}${url.pathname}${url.search}`;
      const headers = new Headers(request.headers);
      headers.set("x-forwarded-host", url.host);
      headers.set("x-forwarded-proto", url.protocol.replace(":", ""));
      headers.set("x-forwarded-for", headers.get("cf-connecting-ip") || "");

      return fetch(proxyUrl, {
        method: request.method,
        headers,
        body: request.body,
        redirect: "manual",
      });
    }

    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) return assetResponse;

    if (!url.pathname.includes(".")) {
      const spaUrl = new URL(request.url);
      spaUrl.pathname = "/index.html";
      return env.ASSETS.fetch(new Request(spaUrl.toString(), request));
    }

    return assetResponse;
  },
};

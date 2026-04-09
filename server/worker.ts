type AssetFetcher = {
  fetch: (request: Request) => Promise<Response>;
};

interface WorkerEnv {
  ASSETS?: AssetFetcher;
  BACKEND_ORIGIN?: string;
}

function normalizeBackendOrigin(raw?: string): string | null {
  const value = (raw || "").trim();
  if (!value) return null;
  return value.replace(/\/+$/, "");
}

function buildProxyInit(request: Request, url: URL): RequestInit {
  const headers = new Headers(request.headers);
  headers.set("x-forwarded-host", url.host);
  headers.set("x-forwarded-proto", url.protocol.replace(":", ""));

  const forwardedFor = headers.get("cf-connecting-ip");
  if (forwardedFor) {
    headers.set("x-forwarded-for", forwardedFor);
  }

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }

  return init;
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const backendOrigin = normalizeBackendOrigin(env.BACKEND_ORIGIN);
    const assets = env?.ASSETS && typeof env.ASSETS.fetch === "function" ? env.ASSETS : null;

    const proxyToBackend = async (): Promise<Response> => {
      if (!backendOrigin) {
        return new Response("Worker is missing both static assets and BACKEND_ORIGIN.", { status: 500 });
      }

      const proxyUrl = `${backendOrigin}${url.pathname}${url.search}`;
      return fetch(proxyUrl, buildProxyInit(request, url));
    };

    if (backendOrigin) {
      try {
        return await proxyToBackend();
      } catch (error) {
        if (!assets) {
          throw error;
        }
      }
    }

    if (!assets) {
      return new Response("Worker has no static assets or backend origin configured.", { status: 500 });
    }

    const assetResponse = await assets.fetch(request);
    if (assetResponse.status !== 404) return assetResponse;

    if (!url.pathname.includes(".")) {
      const spaUrl = new URL(request.url);
      spaUrl.pathname = "/index.html";
      return assets.fetch(new Request(spaUrl.toString(), request));
    }

    return assetResponse;
  },
};

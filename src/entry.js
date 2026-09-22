import gateway from "./gateway.js";

function withHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET" && (url.pathname === "/login" || url.pathname === "/login.html")) {
      return withHeaders(Response.redirect(new URL("/login/", request.url), 302));
    }

    if (request.method === "GET" && url.pathname === "/login/") {
      return withHeaders(await env.ASSETS.fetch(request));
    }

    if (request.method === "GET" && url.pathname === "/login-map") {
      const object = await env.PROOFS.get("branding/layout-cendrawasih-rt01.jpg");
      if (!object) return new Response(null, { status: 404 });
      const headers = new Headers();
      headers.set("content-type", object.httpMetadata?.contentType || "image/jpeg");
      headers.set("cache-control", "public, max-age=86400");
      headers.set("x-content-type-options", "nosniff");
      return new Response(object.body, { headers });
    }

    return gateway.fetch(request, env, ctx);
  },
};

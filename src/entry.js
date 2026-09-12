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

    return gateway.fetch(request, env, ctx);
  },
};

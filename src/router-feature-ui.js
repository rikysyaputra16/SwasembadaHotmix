import base from "./router-feature-complete.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/app-16.js" && request.method === "GET") {
      url.pathname = "/app-16-prod.js";
      return base.fetch(new Request(url, request), env, ctx);
    }
    return base.fetch(request, env, ctx);
  },
};

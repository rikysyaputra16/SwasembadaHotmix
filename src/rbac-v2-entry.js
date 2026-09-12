import app from "./rbac-v2-router.js";
export default{async fetch(request,env,ctx){const url=new URL(request.url);if(request.method==="GET"&&url.pathname==="/app-16.js"){url.pathname="/app-16-dev4.js";return app.fetch(new Request(url,request),env,ctx)}return app.fetch(request,env,ctx)}};

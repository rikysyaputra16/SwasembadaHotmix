import app from './rbac-router.js';
export default{async fetch(request,env,ctx){const u=new URL(request.url);if(request.method==='GET'&&u.pathname==='/app-16.js'){u.pathname='/app-16-dev3.js';return app.fetch(new Request(u,request),env,ctx)}return app.fetch(request,env,ctx)}};

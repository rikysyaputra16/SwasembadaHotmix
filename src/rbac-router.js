import base from "./router-feature-ui.js";

const COOKIE_NAME="__Host-hotmix_session";
const ENCODER=new TextEncoder();
const PERMISSIONS=[
  ["dashboard.reminder","Ringkasan","Kirim pengingat"],
  ["dashboard.collect","Ringkasan","Catat bayar"],
  ["members.write","Data Anggota","Tambah / Ubah"],
  ["members.delete","Data Anggota","Hapus"],
  ["plans.write","Rencana Angsuran","Tambah / Ubah"],
  ["plans.delete","Rencana Angsuran","Hapus"],
  ["payments.write","Pembayaran","Tambah / Ubah"],
  ["payments.delete","Pembayaran","Hapus"],
  ["payments.proof_view","Pembayaran","Lihat bukti"],
  ["payments.receipt","Pembayaran","Kirim kwitansi"],
  ["guide.update_pdf","Petunjuk Teknis","Ganti PDF"],
  ["users_roles.manage","Users & Roles","Kelola users & roles"]
];
const PERMISSION_KEYS=new Set(PERMISSIONS.map(item=>item[0]));

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}})}
function cookies(request){const out={};for(const part of String(request.headers.get("cookie")||"").split(";")){const i=part.indexOf("=");if(i>0)out[part.slice(0,i).trim()]=decodeURIComponent(part.slice(i+1).trim())}return out}
function b64(bytes){let s="";for(const byte of bytes)s+=String.fromCharCode(byte);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}
async function hash(value){return b64(new Uint8Array(await crypto.subtle.digest("SHA-256",ENCODER.encode(String(value||"")))))}
function equal(a,b){return a.byteLength===b.byteLength&&crypto.subtle.timingSafeEqual(a,b)}
function csrfValid(request,current){const a=ENCODER.encode(String(request.headers.get("X-CSRF-Token")||"")),b=ENCODER.encode(String(current?.csrf||""));return a.byteLength>0&&equal(a,b)}

async function currentSession(request,env){
  const token=cookies(request)[COOKIE_NAME];if(!token)return null;
  const row=await env.DB.prepare(`SELECT s.csrf_token,s.user_id,u.username,u.display_name,u.role_key,u.active FROM auth_sessions s JOIN app_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1 LIMIT 1`).bind(await hash(token),Date.now()).first();
  if(!row)return null;
  return{csrf:row.csrf_token,user:{id:row.user_id,username:row.username,displayName:row.display_name,roleKey:String(row.role_key||"viewer")}};
}
async function permissionsFor(env,roleKey){
  const result=await env.DB.prepare("SELECT permission_key,allowed FROM app_role_permissions WHERE role_key=?").bind(roleKey).all();
  const map=Object.fromEntries(PERMISSIONS.map(([key])=>[key,false]));
  for(const row of result.results||[])if(PERMISSION_KEYS.has(row.permission_key))map[row.permission_key]=Boolean(row.allowed);
  return map;
}
async function allowed(env,roleKey,key){const row=await env.DB.prepare("SELECT allowed FROM app_role_permissions WHERE role_key=? AND permission_key=? LIMIT 1").bind(roleKey,key).first();return Boolean(row?.allowed)}
async function requirePermission(request,env,key){
  const current=await currentSession(request,env);if(!current)return{response:json({ok:false,error:"Sesi login diperlukan."},401)};
  if(!(await allowed(env,current.user.roleKey,key)))return{response:json({ok:false,error:"Akses tidak diizinkan untuk role ini."},403)};
  return{current};
}
async function roleName(env,roleKey){const row=await env.DB.prepare("SELECT display_name FROM app_roles WHERE role_key=? LIMIT 1").bind(roleKey).first();return row?.display_name||(roleKey==="admin"?"Admin":roleKey==="panitia01"?"Panitia":"Viewer")}

async function currentPermissions(request,env){
  const current=await currentSession(request,env);if(!current)return json({ok:false,error:"Sesi login diperlukan."},401);
  return json({ok:true,user:{...current.user,role:await roleName(env,current.user.roleKey)},permissions:await permissionsFor(env,current.user.roleKey),catalog:PERMISSIONS.map(([key,menu,label])=>({key,menu,label}))});
}
async function profileGet(request,env){
  const current=await currentSession(request,env);if(!current)return json({ok:false,error:"Sesi login diperlukan."},401);
  const row=await env.DB.prepare("SELECT id,username,display_name,role_key,active,last_login_at,created_at,updated_at FROM app_users WHERE id=? LIMIT 1").bind(current.user.id).first();
  if(!row)return json({ok:false,error:"Profile tidak ditemukan."},404);
  return json({ok:true,profile:{id:row.id,username:row.username,displayName:row.display_name,roleKey:row.role_key,role:await roleName(env,row.role_key),active:Boolean(row.active),lastLoginAt:row.last_login_at,createdAt:row.created_at,updatedAt:row.updated_at},permissions:await permissionsFor(env,row.role_key)});
}
async function rolesGet(request,env){
  const gate=await requirePermission(request,env,"users_roles.manage");if(gate.response)return gate.response;
  const roles=await env.DB.prepare("SELECT role_key,display_name,description,sort_order,active FROM app_roles WHERE active=1 ORDER BY sort_order,display_name").all();
  const output=[];for(const role of roles.results||[])output.push({key:role.role_key,name:role.display_name,description:role.description,active:Boolean(role.active),permissions:await permissionsFor(env,role.role_key)});
  return json({ok:true,roles:output,catalog:PERMISSIONS.map(([key,menu,label])=>({key,menu,label}))});
}
async function rolesPut(request,env,roleKey){
  const gate=await requirePermission(request,env,"users_roles.manage");if(gate.response)return gate.response;
  if(!csrfValid(request,gate.current))return json({ok:false,error:"Validasi sesi gagal."},403);
  const role=await env.DB.prepare("SELECT role_key FROM app_roles WHERE role_key=? AND active=1 LIMIT 1").bind(roleKey).first();if(!role)return json({ok:false,error:"Role tidak ditemukan."},404);
  const body=await request.json().catch(()=>null);if(!body||typeof body.permissions!=="object")return json({ok:false,error:"Payload permission tidak valid."},400);
  const statements=[];
  for(const [key] of PERMISSIONS){let value=body.permissions[key]===true?1:0;if(key==="users_roles.manage")value=roleKey==="admin"?1:0;statements.push(env.DB.prepare(`INSERT INTO app_role_permissions(role_key,permission_key,allowed,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(role_key,permission_key) DO UPDATE SET allowed=excluded.allowed,updated_at=CURRENT_TIMESTAMP`).bind(roleKey,key,value));}
  await env.DB.batch(statements);
  await env.DB.prepare("INSERT INTO auth_audit(id,user_id,event,detail,created_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)").bind(crypto.randomUUID(),gate.current.user.id,"role_permissions_updated",roleKey).run().catch(()=>{});
  return json({ok:true,roleKey,permissions:await permissionsFor(env,roleKey)});
}

async function enforceOperational(request,env,path,method){
  if(!path.startsWith("/api/")||["GET","HEAD","OPTIONS"].includes(method))return null;
  if(path==="/api/auth/login"||path==="/api/auth/logout"||path==="/api/profile")return null;
  let key="";
  if(path==="/api/mutate"&&method==="POST"){
    const body=await request.clone().json().catch(()=>null),type=body?.type;
    if(type==="member-upsert")key="members.write";else if(type==="member-delete")key="members.delete";
    else if(["plan-upsert","plans-replace"].includes(type))key="plans.write";else if(type==="plan-delete")key="plans.delete";
    else if(type==="payment-upsert")key="payments.write";else if(type==="payment-delete")key="payments.delete";
  }else if(path==="/api/settings"&&method==="PUT")key="members.write";
  else if(path.startsWith("/api/proofs/upload/")&&method==="POST")key="payments.write";
  else if(path.startsWith("/api/proofs/object/")&&method==="DELETE")key="payments.delete";
  else if(path==="/api/admin/documents/petunjuk-teknis"&&method==="PUT")key="guide.update_pdf";
  else if(path.startsWith("/api/admin/users")||path==="/api/account/update")key="users_roles.manage";
  if(!key){const current=await currentSession(request,env);if(!current)return json({ok:false,error:"Sesi login diperlukan."},401);if(current.user.roleKey==="viewer")return json({ok:false,error:"Viewer hanya memiliki akses baca."},403);return null;}
  const gate=await requirePermission(request,env,key);return gate.response||null;
}

export default{async fetch(request,env,ctx){
  const url=new URL(request.url),path=url.pathname,method=request.method.toUpperCase();
  if(path==="/api/permissions/current"&&method==="GET")return currentPermissions(request,env);
  if(path==="/api/profile"&&method==="GET")return profileGet(request,env);
  if(path==="/api/admin/roles"&&method==="GET")return rolesGet(request,env);
  const roleMatch=path.match(/^\/api\/admin\/roles\/([A-Za-z0-9._-]+)$/);if(roleMatch&&method==="PUT")return rolesPut(request,env,roleMatch[1]);
  if(path.startsWith("/api/proofs/object/")&&method==="GET"){const gate=await requirePermission(request,env,"payments.proof_view");if(gate.response)return gate.response;}
  const denied=await enforceOperational(request,env,path,method);if(denied)return denied;
  return base.fetch(request,env,ctx);
}};

import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const wrangler=join(root,"node_modules","wrangler","bin","wrangler.js");
const iterations=100000;
const roles={admin:"Admin",panitia01:"Admin",viewer:"Viewer"};
const quote=value=>`'${String(value).replaceAll("'","''")}'`;

function runSql(sql){const dir=mkdtempSync(join(tmpdir(),"hotmix-dev-")),file=join(dir,"user.sql");writeFileSync(file,sql,{mode:0o600});const result=spawnSync(process.execPath,[wrangler,"d1","execute","swasembada-hotmix","--local","--config","wrangler.mobile-users-dev.jsonc","--file",file],{cwd:root,stdio:"inherit",windowsHide:true});rmSync(dir,{recursive:true,force:true});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1)}

const [usernameArg,roleArg="admin",...nameParts]=process.argv.slice(2);
const username=String(usernameArg||"").trim(),roleKey=String(roleArg||"").toLowerCase(),displayName=nameParts.join(" ").trim()||username,password=process.env.HOTMIX_DEV_PASSWORD||"";
if(!/^[A-Za-z0-9._-]{3,64}$/.test(username)||!roles[roleKey])throw new Error("Usage: node scripts/dev-user-mobile.mjs <username> <admin|panitia01|viewer> <display name>");
if(password.length<12||!/[a-z]/.test(password)||!/[A-Z]/.test(password)||!/[0-9]/.test(password)||!(/[^A-Za-z0-9]/.test(password)))throw new Error("Set HOTMIX_DEV_PASSWORD minimal 12 karakter dengan huruf besar/kecil, angka, dan simbol.");
const salt=randomBytes(16),hash=pbkdf2Sync(password,salt,iterations,32,"sha256");
runSql(`INSERT INTO app_users (id,username,display_name,role,role_key,password_salt,password_hash,password_iterations,active,failed_attempts) VALUES (${quote(randomUUID())},${quote(username)},${quote(displayName)},${quote(roles[roleKey])},${quote(roleKey)},${quote(salt.toString("base64url"))},${quote(hash.toString("base64url"))},${iterations},1,0) ON CONFLICT(username) DO UPDATE SET display_name=excluded.display_name,role=excluded.role,role_key=excluded.role_key,password_salt=excluded.password_salt,password_hash=excluded.password_hash,password_iterations=excluded.password_iterations,active=1,failed_attempts=0,locked_until=NULL,updated_at=CURRENT_TIMESTAMP;`);
console.log(`DEV user ${username} (${roleKey}) siap digunakan.`);

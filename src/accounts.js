const COOKIE_NAME = "__Host-hotmix_session";
const PBKDF2_ITERATIONS = 100000;
const ENCODER = new TextEncoder();
const ROLE_KEYS = new Set(["admin", "panitia01", "viewer"]);

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

function parseCookies(request) {
  const result = {};
  for (const part of String(request.headers.get("cookie") || "").split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    result[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return result;
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function sha256Text(value) {
  const digest = await crypto.subtle.digest("SHA-256", ENCODER.encode(String(value || "")));
  return base64Url(new Uint8Array(digest));
}

async function derivePassword(password, salt, iterations = PBKDF2_ITERATIONS) {
  const key = await crypto.subtle.importKey(
    "raw",
    ENCODER.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

function timingSafeEqual(a, b) {
  if (a.byteLength !== b.byteLength) return false;
  return crypto.subtle.timingSafeEqual(a, b);
}

function validUsername(value) {
  const username = String(value || "").trim();
  return /^[A-Za-z0-9._-]{3,64}$/.test(username) ? username : "";
}

function validDisplayName(value) {
  const displayName = String(value || "").trim().replace(/\s+/g, " ");
  return displayName.length >= 2 && displayName.length <= 120 ? displayName : "";
}

function validatePassword(password, username) {
  const value = String(password || "");
  const missing = [];
  if (value.length < 12) missing.push("minimal 12 karakter");
  if (!/[a-z]/.test(value)) missing.push("huruf kecil");
  if (!/[A-Z]/.test(value)) missing.push("huruf besar");
  if (!/\d/.test(value)) missing.push("angka");
  if (!/[^A-Za-z0-9]/.test(value)) missing.push("simbol");
  if (username && value.toLowerCase().includes(String(username).toLowerCase())) missing.push("tidak mengandung username");
  if (missing.length) throw new Error(`Password harus memiliki: ${missing.join(", ")}.`);
}

function publicRoleName(roleKey) {
  return roleKey === "admin" ? "Admin" : roleKey === "panitia01" ? "Panitia01" : "Viewer";
}

function legacyRole(roleKey) {
  return roleKey === "viewer" ? "Viewer" : "Admin";
}

async function getSession(request, env) {
  const token = parseCookies(request)[COOKIE_NAME];
  if (!token) return null;
  const tokenHash = await sha256Text(token);
  const now = Date.now();
  const row = await env.DB.prepare(`
    SELECT
      s.token_hash, s.csrf_token, s.expires_at, s.user_id,
      u.username, u.display_name, u.role, u.role_key, u.active
    FROM auth_sessions s
    JOIN app_users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1
    LIMIT 1
  `).bind(tokenHash, now).first();
  if (!row) return null;
  const roleKey = ROLE_KEYS.has(String(row.role_key || ""))
    ? String(row.role_key)
    : row.role === "Admin" ? "admin" : row.role === "Panitia" ? "panitia01" : "viewer";
  return {
    tokenHash,
    csrfToken: row.csrf_token,
    expiresAt: Number(row.expires_at),
    user: {
      id: row.user_id,
      username: row.username,
      displayName: row.display_name,
      roleKey,
      role: publicRoleName(roleKey),
    },
  };
}

function csrfValid(request, session) {
  const supplied = ENCODER.encode(String(request.headers.get("X-CSRF-Token") || ""));
  const expected = ENCODER.encode(String(session?.csrfToken || ""));
  return supplied.byteLength > 0 && supplied.byteLength === expected.byteLength && timingSafeEqual(supplied, expected);
}

async function audit(env, userId, event, detail = "") {
  try {
    await env.DB.prepare(`
      INSERT INTO auth_audit (id, user_id, event, detail, created_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(crypto.randomUUID(), userId || null, event, String(detail || "").slice(0, 500)).run();
  } catch (error) {
    console.error("account_audit_error", error);
  }
}

async function requireSession(request, env, { admin = false, write = false } = {}) {
  const session = await getSession(request, env);
  if (!session) return { response: json({ ok: false, error: "Sesi login diperlukan." }, 401) };
  if (write && !csrfValid(request, session)) {
    return { response: json({ ok: false, error: "Validasi sesi gagal. Muat ulang halaman dan coba lagi." }, 403) };
  }
  if (admin && session.user.roleKey !== "admin") {
    return { response: json({ ok: false, error: "Akses Admin diperlukan." }, 403) };
  }
  return { session };
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new Error("Payload JSON tidak valid.");
  }
}

async function roleExists(env, roleKey) {
  if (!ROLE_KEYS.has(roleKey)) return false;
  const row = await env.DB.prepare("SELECT role_key FROM app_roles WHERE role_key=? AND active=1 LIMIT 1").bind(roleKey).first();
  return Boolean(row);
}

async function passwordMaterial(password, username) {
  validatePassword(password, username);
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hash = await derivePassword(password, salt, PBKDF2_ITERATIONS);
  return { salt: base64Url(salt), hash: base64Url(hash), iterations: PBKDF2_ITERATIONS };
}

async function verifyPassword(password, user) {
  const candidate = await derivePassword(password, fromBase64Url(user.password_salt), Number(user.password_iterations || PBKDF2_ITERATIONS));
  return timingSafeEqual(candidate, fromBase64Url(user.password_hash));
}

async function authMe(request, env) {
  const { session, response } = await requireSession(request, env);
  if (response) return response;
  return json({ ok: true, user: session.user, csrfToken: session.csrfToken, expiresAt: session.expiresAt });
}

async function profileGet(request, env) {
  const { session, response } = await requireSession(request, env);
  if (response) return response;
  const row = await env.DB.prepare(`
    SELECT id, username, display_name, role_key, active, last_login_at, created_at, updated_at
    FROM app_users WHERE id=? LIMIT 1
  `).bind(session.user.id).first();
  if (!row) return json({ ok: false, error: "Profile tidak ditemukan." }, 404);
  return json({
    ok: true,
    profile: {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      roleKey: row.role_key,
      role: publicRoleName(row.role_key),
      active: Boolean(row.active),
      lastLoginAt: row.last_login_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  });
}

async function profilePut(request, env) {
  const { session, response } = await requireSession(request, env, { write: true });
  if (response) return response;
  let body;
  try { body = await readJson(request); } catch (error) { return json({ ok: false, error: error.message }, 400); }

  const displayName = validDisplayName(body.displayName);
  if (!displayName) return json({ ok: false, error: "Nama tampilan harus 2-120 karakter." }, 400);

  const currentPassword = String(body.currentPassword || "");
  const newPassword = String(body.newPassword || "");
  const changingPassword = Boolean(newPassword);

  if (changingPassword) {
    const user = await env.DB.prepare(`
      SELECT id, username, password_salt, password_hash, password_iterations
      FROM app_users WHERE id=? LIMIT 1
    `).bind(session.user.id).first();
    if (!user || !currentPassword || !(await verifyPassword(currentPassword, user))) {
      await audit(env, session.user.id, "profile_password_failed");
      return json({ ok: false, error: "Password saat ini salah." }, 403);
    }
    let material;
    try { material = await passwordMaterial(newPassword, user.username); }
    catch (error) { return json({ ok: false, error: error.message }, 400); }
    await env.DB.prepare(`
      UPDATE app_users
      SET display_name=?, password_salt=?, password_hash=?, password_iterations=?,
          failed_attempts=0, locked_until=NULL, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(displayName, material.salt, material.hash, material.iterations, session.user.id).run();
    await env.DB.prepare("DELETE FROM auth_sessions WHERE user_id=?").bind(session.user.id).run();
    await audit(env, session.user.id, "profile_password_changed");
    return json({ ok: true, reauthenticate: true });
  }

  await env.DB.prepare("UPDATE app_users SET display_name=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .bind(displayName, session.user.id).run();
  await audit(env, session.user.id, "profile_updated");
  return json({ ok: true, profile: { ...session.user, displayName } });
}

async function listRoles(request, env) {
  const { response } = await requireSession(request, env, { admin: true });
  if (response) return response;
  const result = await env.DB.prepare(`
    SELECT role_key, display_name, description, sort_order, active
    FROM app_roles
    WHERE active=1
    ORDER BY sort_order, display_name
  `).all();
  return json({ ok: true, roles: (result.results || []).map((row) => ({
    key: row.role_key,
    name: row.display_name,
    description: row.description,
    active: Boolean(row.active),
  })) });
}

async function listUsers(request, env) {
  const { response } = await requireSession(request, env, { admin: true });
  if (response) return response;
  const result = await env.DB.prepare(`
    SELECT id, username, display_name, role_key, active, failed_attempts,
           locked_until, last_login_at, created_at, updated_at
    FROM app_users
    ORDER BY username COLLATE NOCASE
  `).all();
  const now = Date.now();
  return json({ ok: true, users: (result.results || []).map((row) => ({
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    roleKey: row.role_key,
    role: publicRoleName(row.role_key),
    active: Boolean(row.active),
    failedAttempts: Number(row.failed_attempts || 0),
    locked: Boolean(row.locked_until && Number(row.locked_until) > now),
    lockedUntil: row.locked_until ? Number(row.locked_until) : null,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })) });
}

async function createUser(request, env) {
  const { session, response } = await requireSession(request, env, { admin: true, write: true });
  if (response) return response;
  let body;
  try { body = await readJson(request); } catch (error) { return json({ ok: false, error: error.message }, 400); }

  const username = validUsername(body.username);
  const displayName = validDisplayName(body.displayName);
  const roleKey = String(body.roleKey || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!username) return json({ ok: false, error: "Username harus 3-64 karakter dan hanya boleh huruf, angka, titik, garis bawah, atau tanda minus." }, 400);
  if (!displayName) return json({ ok: false, error: "Nama tampilan harus 2-120 karakter." }, 400);
  if (!(await roleExists(env, roleKey))) return json({ ok: false, error: "Group role tidak valid." }, 400);

  let material;
  try { material = await passwordMaterial(password, username); }
  catch (error) { return json({ ok: false, error: error.message }, 400); }

  try {
    const id = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO app_users (
        id, username, display_name, role, role_key, password_salt, password_hash,
        password_iterations, active, failed_attempts, locked_until, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(
      id, username, displayName, legacyRole(roleKey), roleKey,
      material.salt, material.hash, material.iterations,
    ).run();
    await audit(env, session.user.id, "user_created", `${username}:${roleKey}`);
    return json({ ok: true, user: { id, username, displayName, roleKey, role: publicRoleName(roleKey), active: true } }, 201);
  } catch (error) {
    if (String(error?.message || "").toLowerCase().includes("unique")) {
      return json({ ok: false, error: "Username sudah digunakan." }, 409);
    }
    console.error("create_user_error", error);
    return json({ ok: false, error: "User gagal dibuat." }, 500);
  }
}

async function updateUser(request, env, userId) {
  const { session, response } = await requireSession(request, env, { admin: true, write: true });
  if (response) return response;
  let body;
  try { body = await readJson(request); } catch (error) { return json({ ok: false, error: error.message }, 400); }
  const target = await env.DB.prepare("SELECT id, username, role_key, active FROM app_users WHERE id=? LIMIT 1").bind(userId).first();
  if (!target) return json({ ok: false, error: "User tidak ditemukan." }, 404);

  const displayName = validDisplayName(body.displayName);
  const roleKey = String(body.roleKey || "").trim().toLowerCase();
  const active = body.active === false || body.active === 0 ? 0 : 1;
  if (!displayName) return json({ ok: false, error: "Nama tampilan harus 2-120 karakter." }, 400);
  if (!(await roleExists(env, roleKey))) return json({ ok: false, error: "Group role tidak valid." }, 400);
  if (target.id === session.user.id && (roleKey !== "admin" || !active)) {
    return json({ ok: false, error: "Admin yang sedang login tidak dapat menonaktifkan atau menurunkan role dirinya sendiri." }, 400);
  }

  await env.DB.prepare(`
    UPDATE app_users
    SET display_name=?, role=?, role_key=?, active=?, failed_attempts=0, locked_until=NULL, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).bind(displayName, legacyRole(roleKey), roleKey, active, userId).run();

  if (target.role_key !== roleKey || Number(target.active) !== active) {
    await env.DB.prepare("DELETE FROM auth_sessions WHERE user_id=? AND user_id<>?").bind(userId, session.user.id).run().catch(async () => {
      if (userId !== session.user.id) await env.DB.prepare("DELETE FROM auth_sessions WHERE user_id=?").bind(userId).run();
    });
    if (userId !== session.user.id) await env.DB.prepare("DELETE FROM auth_sessions WHERE user_id=?").bind(userId).run();
  }
  await audit(env, session.user.id, "user_updated", `${target.username}:${roleKey}:${active}`);
  return json({ ok: true });
}

async function resetUserPassword(request, env, userId) {
  const { session, response } = await requireSession(request, env, { admin: true, write: true });
  if (response) return response;
  let body;
  try { body = await readJson(request); } catch (error) { return json({ ok: false, error: error.message }, 400); }
  const user = await env.DB.prepare("SELECT id, username FROM app_users WHERE id=? LIMIT 1").bind(userId).first();
  if (!user) return json({ ok: false, error: "User tidak ditemukan." }, 404);
  let material;
  try { material = await passwordMaterial(String(body.password || ""), user.username); }
  catch (error) { return json({ ok: false, error: error.message }, 400); }

  await env.DB.prepare(`
    UPDATE app_users
    SET password_salt=?, password_hash=?, password_iterations=?, failed_attempts=0,
        locked_until=NULL, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).bind(material.salt, material.hash, material.iterations, userId).run();
  await env.DB.prepare("DELETE FROM auth_sessions WHERE user_id=?").bind(userId).run();
  await audit(env, session.user.id, "user_password_reset", user.username);
  return json({ ok: true, selfReset: userId === session.user.id });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    if (path === "/api/auth/me" && method === "GET") return authMe(request, env);
    if (path === "/api/profile" && method === "GET") return profileGet(request, env);
    if (path === "/api/profile" && method === "PUT") return profilePut(request, env);
    if (path === "/api/admin/roles" && method === "GET") return listRoles(request, env);
    if (path === "/api/admin/users" && method === "GET") return listUsers(request, env);
    if (path === "/api/admin/users" && method === "POST") return createUser(request, env);

    const passwordMatch = path.match(/^\/api\/admin\/users\/([A-Za-z0-9._-]+)\/password$/);
    if (passwordMatch && method === "POST") return resetUserPassword(request, env, passwordMatch[1]);
    const userMatch = path.match(/^\/api\/admin\/users\/([A-Za-z0-9._-]+)$/);
    if (userMatch && method === "PUT") return updateUser(request, env, userMatch[1]);

    return json({ ok: false, error: "Endpoint account tidak ditemukan." }, 404);
  },
};

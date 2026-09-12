import app from "./index.js";

const COOKIE_NAME = "__Host-hotmix_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_IP_LIMIT = 20;
const ACCOUNT_LOCK_THRESHOLD = 8;
const ACCOUNT_LOCK_MS = 15 * 60 * 1000;
const PBKDF2_ITERATIONS = 600000;
const ENCODER = new TextEncoder();

function json(data, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extraHeaders,
  });
  return new Response(JSON.stringify(data), { status, headers });
}

function redirect(location, status = 302) {
  return new Response(null, {
    status,
    headers: {
      location,
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    },
  });
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

function randomToken(bytes = 32) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return base64Url(value);
}

async function sha256Text(value) {
  const digest = await crypto.subtle.digest("SHA-256", ENCODER.encode(String(value || "")));
  return base64Url(new Uint8Array(digest));
}

async function derivePassword(password, salt, iterations) {
  const key = await crypto.subtle.importKey(
    "raw",
    ENCODER.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations,
    },
    key,
    256,
  );
  return new Uint8Array(bits);
}

function timingSafeEqual(a, b) {
  if (a.byteLength !== b.byteLength) {
    crypto.subtle.timingSafeEqual(a, a);
    return false;
  }
  return crypto.subtle.timingSafeEqual(a, b);
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

function sessionCookie(token, maxAgeSeconds) {
  const value = token ? encodeURIComponent(token) : "";
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

function clientIp(request) {
  return String(request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for") || "unknown")
    .split(",")[0]
    .trim();
}

function validUsername(value) {
  const username = String(value || "").trim();
  return /^[A-Za-z0-9._-]{3,64}$/.test(username) ? username : "";
}

async function getSession(request, env) {
  const token = parseCookies(request)[COOKIE_NAME];
  if (!token) return null;
  const tokenHash = await sha256Text(token);
  const now = Date.now();
  const row = await env.DB.prepare(`
    SELECT
      s.token_hash, s.csrf_token, s.expires_at, s.user_id,
      u.username, u.display_name, u.role, u.active
    FROM auth_sessions s
    JOIN app_users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1
    LIMIT 1
  `).bind(tokenHash, now).first();
  if (!row) return null;
  return {
    tokenHash,
    csrfToken: row.csrf_token,
    expiresAt: Number(row.expires_at),
    user: {
      id: row.user_id,
      username: row.username,
      displayName: row.display_name,
      role: row.role,
    },
  };
}

async function recordThrottle(request, env, success = false) {
  const key = await sha256Text(`login:${clientIp(request)}`);
  const now = Date.now();
  if (success) {
    await env.DB.prepare("DELETE FROM auth_login_throttle WHERE throttle_key = ?").bind(key).run();
    return;
  }
  const row = await env.DB.prepare(
    "SELECT window_started_at, attempts FROM auth_login_throttle WHERE throttle_key = ?"
  ).bind(key).first();
  if (!row || now - Number(row.window_started_at) > LOGIN_WINDOW_MS) {
    await env.DB.prepare(`
      INSERT INTO auth_login_throttle (throttle_key, window_started_at, attempts, updated_at)
      VALUES (?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(throttle_key) DO UPDATE SET
        window_started_at=excluded.window_started_at,
        attempts=1,
        updated_at=CURRENT_TIMESTAMP
    `).bind(key, now).run();
  } else {
    await env.DB.prepare(`
      UPDATE auth_login_throttle
      SET attempts = attempts + 1, updated_at=CURRENT_TIMESTAMP
      WHERE throttle_key = ?
    `).bind(key).run();
  }
}

async function throttleExceeded(request, env) {
  const key = await sha256Text(`login:${clientIp(request)}`);
  const now = Date.now();
  const row = await env.DB.prepare(
    "SELECT window_started_at, attempts FROM auth_login_throttle WHERE throttle_key = ?"
  ).bind(key).first();
  if (!row) return false;
  if (now - Number(row.window_started_at) > LOGIN_WINDOW_MS) {
    await env.DB.prepare("DELETE FROM auth_login_throttle WHERE throttle_key = ?").bind(key).run();
    return false;
  }
  return Number(row.attempts) >= LOGIN_IP_LIMIT;
}

async function audit(env, userId, event, detail = "") {
  try {
    await env.DB.prepare(`
      INSERT INTO auth_audit (id, user_id, event, detail, created_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(crypto.randomUUID(), userId || null, event, String(detail || "").slice(0, 500)).run();
  } catch (error) {
    console.error("auth_audit_error", error);
  }
}

async function login(request, env) {
  if (await throttleExceeded(request, env)) {
    await audit(env, null, "login_throttled");
    return json({ ok: false, error: "Terlalu banyak percobaan login. Coba lagi beberapa menit." }, 429);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Permintaan login tidak valid." }, 400);
  }

  const username = validUsername(body?.username);
  const password = String(body?.password || "");
  if (!username || password.length < 1 || password.length > 256) {
    await recordThrottle(request, env, false);
    return json({ ok: false, error: "Username atau password salah." }, 401);
  }

  const user = await env.DB.prepare(`
    SELECT id, username, display_name, role, password_salt, password_hash,
           password_iterations, active, failed_attempts, locked_until
    FROM app_users
    WHERE username = ? COLLATE NOCASE
    LIMIT 1
  `).bind(username).first();

  const now = Date.now();
  const dummySalt = ENCODER.encode("hotmix-login-dummy-salt-v1");
  const salt = user ? fromBase64Url(user.password_salt) : dummySalt;
  const iterations = user ? Number(user.password_iterations || PBKDF2_ITERATIONS) : PBKDF2_ITERATIONS;
  const candidate = await derivePassword(password, salt, iterations);
  const expected = user ? fromBase64Url(user.password_hash) : new Uint8Array(32);
  const passwordOk = timingSafeEqual(candidate, expected);

  const locked = user?.locked_until && Number(user.locked_until) > now;
  if (!user || !user.active || locked || !passwordOk) {
    await recordThrottle(request, env, false);
    if (user && user.active && !locked) {
      const failures = Number(user.failed_attempts || 0) + 1;
      const lockedUntil = failures >= ACCOUNT_LOCK_THRESHOLD ? now + ACCOUNT_LOCK_MS : null;
      await env.DB.prepare(`
        UPDATE app_users
        SET failed_attempts = ?, locked_until = ?, updated_at=CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(failures, lockedUntil, user.id).run();
    }
    await audit(env, user?.id || null, locked ? "login_locked" : "login_failed");
    return json({ ok: false, error: "Username atau password salah." }, 401);
  }

  await recordThrottle(request, env, true);
  await env.DB.prepare(`
    UPDATE app_users
    SET failed_attempts=0, locked_until=NULL, last_login_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).bind(user.id).run();
  await env.DB.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").bind(now).run();

  const token = randomToken(32);
  const tokenHash = await sha256Text(token);
  const csrfToken = randomToken(24);
  const expiresAt = now + SESSION_TTL_MS;
  await env.DB.prepare(`
    INSERT INTO auth_sessions (token_hash, user_id, csrf_token, expires_at, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).bind(tokenHash, user.id, csrfToken, expiresAt).run();

  await audit(env, user.id, "login_success");
  return json(
    {
      ok: true,
      user: { id: user.id, username: user.username, displayName: user.display_name, role: user.role },
      csrfToken,
    },
    200,
    { "set-cookie": sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000)) },
  );
}

async function logout(request, env, session) {
  if (session) {
    await env.DB.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(session.tokenHash).run();
    await audit(env, session.user.id, "logout");
  }
  return json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) });
}

function csrfValid(request, session) {
  const supplied = String(request.headers.get("X-CSRF-Token") || "");
  const expected = String(session?.csrfToken || "");
  if (!supplied || !expected) return false;
  return timingSafeEqual(ENCODER.encode(supplied), ENCODER.encode(expected));
}

function roleLevel(role) {
  return { Viewer: 1, Panitia: 2, Admin: 3 }[role] || 0;
}

async function authorizeApi(request, env, session, path) {
  if (!session) return json({ ok: false, error: "Sesi login diperlukan." }, 401);

  const method = request.method.toUpperCase();
  const isWrite = !["GET", "HEAD", "OPTIONS"].includes(method);
  if (isWrite && !csrfValid(request, session)) {
    return json({ ok: false, error: "Validasi sesi gagal. Muat ulang halaman dan coba lagi." }, 403);
  }

  if (session.user.role === "Viewer" && isWrite) {
    return json({ ok: false, error: "Akun Viewer hanya memiliki akses baca." }, 403);
  }

  if (session.user.role === "Panitia") {
    if (path.startsWith("/api/admin/")) {
      return json({ ok: false, error: "Akses Admin diperlukan." }, 403);
    }
    if (path.startsWith("/api/proofs/object/") && method === "DELETE") {
      return json({ ok: false, error: "Penghapusan bukti hanya dapat dilakukan Admin." }, 403);
    }
    if (path === "/api/mutate" && method === "POST") {
      const clone = request.clone();
      const body = await clone.json().catch(() => null);
      if (["member-delete", "plan-delete", "payment-delete"].includes(body?.type)) {
        return json({ ok: false, error: "Penghapusan data hanya dapat dilakukan Admin." }, 403);
      }
    }
  }

  return null;
}

async function getGuidePdf(env) {
  const object = await env.PROOFS.get("documents/petunjuk-teknis.pdf");
  if (!object) return json({ ok: false, error: "Dokumen Petunjuk Teknis belum tersedia." }, 404);
  const headers = new Headers();
  headers.set("content-type", object.httpMetadata?.contentType || "application/pdf");
  headers.set("content-disposition", 'inline; filename="Petunjuk Teknis.pdf"');
  headers.set("cache-control", "private, no-store");
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}

async function uploadGuidePdf(request, env, session) {
  if (!session || roleLevel(session.user.role) < roleLevel("Admin")) {
    return json({ ok: false, error: "Akses Admin diperlukan." }, 403);
  }
  if (!csrfValid(request, session)) {
    return json({ ok: false, error: "Validasi sesi gagal." }, 403);
  }
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return json({ ok: false, error: "File PDF belum dipilih." }, 400);
  if (file.type !== "application/pdf") return json({ ok: false, error: "Dokumen harus berformat PDF." }, 400);
  if (file.size <= 0 || file.size > 20 * 1024 * 1024) {
    return json({ ok: false, error: "Ukuran PDF maksimal 20 MB." }, 400);
  }
  await env.PROOFS.put("documents/petunjuk-teknis.pdf", file.stream(), {
    httpMetadata: { contentType: "application/pdf" },
    customMetadata: { uploadedBy: session.user.username, originalName: file.name },
  });
  await audit(env, session.user.id, "guide_pdf_uploaded", file.name);
  return json({ ok: true });
}

function harden(response) {
  const headers = new Headers(response.headers);
  headers.set("strict-transport-security", "max-age=31536000");
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "no-referrer");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function isHtmlNavigation(request) {
  return request.method === "GET" && String(request.headers.get("accept") || "").includes("text/html");
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/api/auth/login" && request.method === "POST") {
        return harden(await login(request, env));
      }

      if (path === "/login.html" && request.method === "GET") {
        return harden(redirect("/login"));
      }

      if (path === "/login" && request.method === "GET") {
        return harden(await app.fetch(request, env, ctx));
      }

      const session = await getSession(request, env);

      if (path === "/api/auth/me" && request.method === "GET") {
        if (!session) return harden(json({ ok: false, error: "Sesi login diperlukan." }, 401));
        return harden(json({ ok: true, user: session.user, csrfToken: session.csrfToken, expiresAt: session.expiresAt }));
      }

      if (path === "/api/auth/logout" && request.method === "POST") {
        if (session && !csrfValid(request, session)) {
          return harden(json({ ok: false, error: "Validasi sesi gagal." }, 403));
        }
        return harden(await logout(request, env, session));
      }

      if (!session) {
        if (path.startsWith("/api/")) return harden(json({ ok: false, error: "Sesi login diperlukan." }, 401));
        if (isHtmlNavigation(request)) return harden(redirect("/login"));
        return harden(new Response("Unauthorized", { status: 401 }));
      }

      if (path === "/login" || path === "/login.html") return harden(redirect("/"));

      if (path === "/api/documents/petunjuk-teknis" && request.method === "GET") {
        return harden(await getGuidePdf(env));
      }
      if (path === "/api/admin/documents/petunjuk-teknis" && request.method === "PUT") {
        return harden(await uploadGuidePdf(request, env, session));
      }

      if (path.startsWith("/api/")) {
        const denied = await authorizeApi(request, env, session, path);
        if (denied) return harden(denied);
      }

      return harden(await app.fetch(request, env, ctx));
    } catch (error) {
      console.error("gateway_error", error);
      if (path.startsWith("/api/")) return harden(json({ ok: false, error: "Terjadi kesalahan pada layanan." }, 500));
      return harden(new Response("Internal Server Error", { status: 500 }));
    }
  },
};

import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { Pool } from "pg";
import { z } from "zod";

const app = express();
const currentDir = path.dirname(fileURLToPath(import.meta.url));

const config = {
  port: Number(process.env.PORT || 4000),
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:8081",
  accessTokenSecret: process.env.ACCESS_TOKEN_SECRET || "dev-access-secret",
  refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET || "dev-refresh-secret",
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL || "15m",
  refreshTokenTtl: process.env.REFRESH_TOKEN_TTL || "7d",
  resetTokenTtlMinutes: Number(process.env.RESET_TOKEN_TTL_MINUTES || 15),
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 12),
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpSecure: String(process.env.SMTP_SECURE || "false") === "true",
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  emailFrom: process.env.EMAIL_FROM || "SecPass <no-reply@secpass.app>",
  passwordResetUrlBase:
    process.env.PASSWORD_RESET_URL_BASE || "https://secpass.app/reset-password",
  exposeResetToken:
    String(process.env.EXPOSE_RESET_TOKEN || "false") === "true",
  databaseUrl: process.env.DATABASE_URL || process.env.POSTGRES_URL || "",
  authStoreTable: process.env.AUTH_STORE_TABLE || "auth_state",
  authStorePath:
    process.env.AUTH_STORE_PATH ||
    path.resolve(currentDir, "../data/auth-store.json"),
};

const usersByEmail = new Map();
const vaultItemsByUserId = new Map();
const refreshTokenStore = new Map();
const passwordResetTokenStore = new Map();
const securityEvents = [];
let smtpTransporter = null;
let persistQueue = Promise.resolve();
let postgresPool = null;
let initPromise = null;

function getStorageBackend() {
  return isPostgresEnabled() ? "postgres" : "file";
}

function getSafeAuthStoreTableName() {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(config.authStoreTable)) {
    throw new Error(
      "AUTH_STORE_TABLE invalida. Use apenas letras, numeros e underscore.",
    );
  }

  return config.authStoreTable;
}

function isPostgresEnabled() {
  return Boolean(config.databaseUrl);
}

function isProd() {
  return process.env.NODE_ENV === "production";
}

function sanitizeDatabaseUrl(rawUrl) {
  if (!rawUrl) {
    return rawUrl;
  }

  try {
    const parsed = new URL(rawUrl);
    // Evita conflito entre sslmode da URL e ssl do node-postgres.
    parsed.searchParams.delete("sslmode");
    parsed.searchParams.delete("ssl");
    parsed.searchParams.delete("sslcert");
    parsed.searchParams.delete("sslkey");
    parsed.searchParams.delete("sslrootcert");
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

function assertProductionSecurityConfig() {
  if (!isProd()) {
    return;
  }

  if (config.accessTokenSecret === "dev-access-secret") {
    throw new Error("ACCESS_TOKEN_SECRET invalido para producao.");
  }

  if (config.refreshTokenSecret === "dev-refresh-secret") {
    throw new Error("REFRESH_TOKEN_SECRET invalido para producao.");
  }

  if (config.corsOrigin.includes("localhost")) {
    throw new Error("CORS_ORIGIN invalido para producao.");
  }
}

function serializeState() {
  return {
    usersByEmail: Object.fromEntries(usersByEmail.entries()),
    vaultItemsByUserId: Object.fromEntries(vaultItemsByUserId.entries()),
    refreshTokenStore: Object.fromEntries(refreshTokenStore.entries()),
    passwordResetTokenStore: Object.fromEntries(
      passwordResetTokenStore.entries(),
    ),
    securityEvents,
  };
}

function hydrateState(snapshot) {
  usersByEmail.clear();
  vaultItemsByUserId.clear();
  refreshTokenStore.clear();
  passwordResetTokenStore.clear();
  securityEvents.length = 0;

  for (const [email, user] of Object.entries(snapshot?.usersByEmail || {})) {
    usersByEmail.set(email, user);
  }

  for (const [userId, items] of Object.entries(
    snapshot?.vaultItemsByUserId || {},
  )) {
    if (Array.isArray(items)) {
      vaultItemsByUserId.set(userId, items);
      continue;
    }

    if (items?.encryptedVault) {
      vaultItemsByUserId.set(userId, {
        encryptedVault: items.encryptedVault,
      });
      continue;
    }

    vaultItemsByUserId.set(userId, []);
  }

  for (const [token, record] of Object.entries(
    snapshot?.refreshTokenStore || {},
  )) {
    refreshTokenStore.set(token, record);
  }

  for (const [token, record] of Object.entries(
    snapshot?.passwordResetTokenStore || {},
  )) {
    passwordResetTokenStore.set(token, record);
  }

  for (const event of snapshot?.securityEvents || []) {
    securityEvents.push(event);
  }
}

async function persistState() {
  if (isPostgresEnabled()) {
    if (!postgresPool) {
      throw new Error("Postgres pool nao inicializado.");
    }

    const tableName = getSafeAuthStoreTableName();
    const payload = JSON.stringify(serializeState());
    await postgresPool.query(
      `INSERT INTO ${tableName} (id, payload, updated_at)
       VALUES (1, $1::jsonb, NOW())
       ON CONFLICT (id)
       DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
      [payload],
    );
    return;
  }

  const directory = path.dirname(config.authStorePath);
  await fs.mkdir(directory, { recursive: true });

  const payload = JSON.stringify(serializeState());
  const tempPath = `${config.authStorePath}.tmp`;

  await fs.writeFile(tempPath, payload, "utf8");
  await fs.rename(tempPath, config.authStorePath);
}

function persistStateSoon() {
  persistQueue = persistQueue
    .then(() => persistState())
    .catch((error) => {
      console.error("persist_state_failed", error);
    });
}

async function loadState() {
  if (isPostgresEnabled()) {
    if (!postgresPool) {
      throw new Error("Postgres pool nao inicializado.");
    }

    const tableName = getSafeAuthStoreTableName();
    const result = await postgresPool.query(
      `SELECT payload FROM ${tableName} WHERE id = 1 LIMIT 1`,
    );

    if (result.rows.length === 0) {
      await persistState();
      return;
    }

    const payload = result.rows[0].payload;
    hydrateState(typeof payload === "string" ? JSON.parse(payload) : payload);
    return;
  }

  try {
    const raw = await fs.readFile(config.authStorePath, "utf8");
    hydrateState(JSON.parse(raw));
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }

    await persistState();
  }
}

async function initPostgres() {
  if (!isPostgresEnabled()) {
    return;
  }

  const tableName = getSafeAuthStoreTableName();
  const databaseUrl = sanitizeDatabaseUrl(config.databaseUrl);

  postgresPool = new Pool({
    connectionString: databaseUrl,
    ssl: isProd() ? { rejectUnauthorized: false } : false,
    max: 10,
  });

  await postgresPool.query(
    `CREATE TABLE IF NOT EXISTS ${tableName} (
      id INTEGER PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
  );
}

app.use(helmet());
app.set("trust proxy", 1);
app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
  }),
);
app.use(express.json({ limit: "128kb" }));

app.use(async (_req, res, next) => {
  if (!isPostgresEnabled()) {
    return next();
  }

  try {
    await loadState();
    return next();
  } catch (error) {
    console.error("state_sync_failed", error);
    return res.status(500).json({ error: "Erro interno." });
  }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas tentativas. Tente novamente mais tarde." },
});

const loginBodySchema = z.object({
  email: z
    .string()
    .email()
    .transform((value) => value.trim().toLowerCase()),
  password: z.string().min(10),
});

const refreshBodySchema = z.object({
  refreshToken: z.string().min(20),
});

const forgotPasswordBodySchema = z.object({
  email: z
    .string()
    .email()
    .transform((value) => value.trim().toLowerCase()),
});

const resetPasswordBodySchema = z.object({
  token: z.string().min(20),
  password: z.string().min(10),
});

const vaultItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
});

const encryptedVaultSchema = z.object({
  type: z.literal("encrypted_vault"),
  version: z.number().int().min(1),
  alg: z.string().min(3),
  kdf: z.object({
    name: z.string().min(3),
    iterations: z.number().int().min(1),
    salt: z.string().min(8),
  }),
  iv: z.string().min(8),
  ciphertext: z.string().min(8),
  mac: z.string().min(8),
});

const upsertVaultSchema = z.union([
  z.object({
    items: z.array(vaultItemSchema).max(5000),
  }),
  z.object({
    encryptedVault: encryptedVaultSchema,
  }),
]);

function addSecurityEvent(type, status, details = {}) {
  securityEvents.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    status,
    details,
    createdAt: new Date().toISOString(),
  });

  if (securityEvents.length > 500) {
    securityEvents.length = 500;
  }

  persistStateSoon();
}

function issueAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, scope: ["vault:read", "vault:write"] },
    config.accessTokenSecret,
    { expiresIn: config.accessTokenTtl },
  );
}

function issueRefreshToken(user) {
  const token = jwt.sign(
    { sub: user.id, email: user.email, type: "refresh" },
    config.refreshTokenSecret,
    { expiresIn: config.refreshTokenTtl },
  );

  refreshTokenStore.set(token, {
    userId: user.id,
    email: user.email,
    createdAt: Date.now(),
    revokedAt: null,
  });

  persistStateSoon();

  return token;
}

function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt,
  };
}

function authenticateAccessToken(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  if (!token) {
    return res.status(401).json({ error: "Token de acesso ausente." });
  }

  try {
    const payload = jwt.verify(token, config.accessTokenSecret);
    const user = usersByEmail.get(payload?.email || "");

    if (!user || payload?.sub !== user.id) {
      return res.status(401).json({ error: "Token de acesso invalido." });
    }

    req.authUser = user;
    return next();
  } catch {
    return res.status(401).json({ error: "Token de acesso invalido." });
  }
}

function revokeRefreshTokensByEmail(email) {
  for (const [token, record] of refreshTokenStore.entries()) {
    if (record.email !== email) {
      continue;
    }

    record.revokedAt = Date.now();
    refreshTokenStore.set(token, record);
  }

  persistStateSoon();
}

function createPasswordResetToken(email) {
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const expiresAt =
    Date.now() + Math.max(1, config.resetTokenTtlMinutes) * 60 * 1000;

  passwordResetTokenStore.set(token, {
    email,
    createdAt: Date.now(),
    expiresAt,
    usedAt: null,
  });

  persistStateSoon();

  return {
    token,
    expiresAt,
  };
}

function createPublicResetTokenPreview() {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`;
}

function cleanExpiredPasswordResetTokens() {
  const now = Date.now();

  for (const [token, record] of passwordResetTokenStore.entries()) {
    if (record.usedAt || record.expiresAt <= now) {
      passwordResetTokenStore.delete(token);
    }
  }

  persistStateSoon();
}

function isSmtpConfigured() {
  return Boolean(
    config.smtpHost && config.smtpUser && config.smtpPass && config.emailFrom,
  );
}

function getSmtpTransporter() {
  if (smtpTransporter) {
    return smtpTransporter;
  }

  smtpTransporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass,
    },
  });

  return smtpTransporter;
}

async function sendPasswordResetEmail({ email, token, expiresAt }) {
  if (!isSmtpConfigured()) {
    return {
      delivered: false,
      reason: "smtp_not_configured",
    };
  }

  const resetUrl = `${config.passwordResetUrlBase}?token=${encodeURIComponent(token)}`;
  const expiryIso = new Date(expiresAt).toISOString();

  try {
    const transport = getSmtpTransporter();
    const info = await transport.sendMail({
      from: config.emailFrom,
      to: email,
      subject: "SecPass - Recuperacao de senha",
      text: [
        "Recebemos um pedido para redefinir sua senha no SecPass.",
        "",
        `Abra este link para continuar: ${resetUrl}`,
        `Validade do token: ${expiryIso}`,
        "",
        "Se voce nao solicitou essa acao, ignore este email.",
      ].join("\n"),
      html: `<p>Recebemos um pedido para redefinir sua senha no <strong>SecPass</strong>.</p><p><a href="${resetUrl}">Clique aqui para redefinir sua senha</a></p><p>Validade do token: ${expiryIso}</p><p>Se voce nao solicitou essa acao, ignore este email.</p>`,
    });

    return {
      delivered: true,
      messageId: info.messageId,
    };
  } catch {
    return {
      delivered: false,
      reason: "smtp_send_failed",
    };
  }
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "secpass-backend",
    nodeEnv: process.env.NODE_ENV || "development",
    storageBackend: getStorageBackend(),
  });
});

app.get("/health/ready", async (_req, res) => {
  try {
    if (isPostgresEnabled() && postgresPool) {
      await postgresPool.query("SELECT 1");
    }

    return res.status(200).json({
      ready: true,
      storageBackend: getStorageBackend(),
    });
  } catch {
    return res.status(503).json({
      ready: false,
      storageBackend: getStorageBackend(),
    });
  }
});

app.post("/auth/register", authLimiter, async (req, res) => {
  const parsedBody = loginBodySchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({ error: "Payload invalido." });
  }

  const { email, password } = parsedBody.data;
  if (usersByEmail.has(email)) {
    addSecurityEvent("register", "warning", {
      email,
      reason: "already_exists",
    });
    return res.status(409).json({ error: "Conta ja existe para este email." });
  }

  const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
  const user = {
    id: crypto.randomUUID(),
    email,
    passwordHash,
    createdAt: new Date().toISOString(),
  };

  usersByEmail.set(email, user);
  vaultItemsByUserId.set(user.id, []);
  await persistState();
  addSecurityEvent("register", "success", { email });

  const accessToken = issueAccessToken(user);
  const refreshToken = issueRefreshToken(user);
  await persistState();

  return res.status(201).json({
    user: sanitizeUser(user),
    accessToken,
    refreshToken,
  });
});

app.post("/auth/login", authLimiter, async (req, res) => {
  const parsedBody = loginBodySchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({ error: "Payload invalido." });
  }

  const { email, password } = parsedBody.data;
  const user = usersByEmail.get(email);

  if (!user) {
    addSecurityEvent("login", "warning", { email, reason: "user_not_found" });
    return res.status(401).json({ error: "Email ou senha invalidos." });
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    addSecurityEvent("login", "warning", { email, reason: "invalid_password" });
    return res.status(401).json({ error: "Email ou senha invalidos." });
  }

  const accessToken = issueAccessToken(user);
  const refreshToken = issueRefreshToken(user);
  await persistState();
  addSecurityEvent("login", "success", { email });

  return res.status(200).json({
    user: sanitizeUser(user),
    accessToken,
    refreshToken,
  });
});

app.post("/auth/refresh", authLimiter, async (req, res) => {
  const parsedBody = refreshBodySchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({ error: "Payload invalido." });
  }

  const { refreshToken } = parsedBody.data;
  const storedToken = refreshTokenStore.get(refreshToken);

  if (!storedToken || storedToken.revokedAt) {
    return res.status(401).json({ error: "Refresh token invalido." });
  }

  let payload;

  try {
    payload = jwt.verify(refreshToken, config.refreshTokenSecret);
  } catch {
    refreshTokenStore.delete(refreshToken);
    await persistState();
    return res
      .status(401)
      .json({ error: "Refresh token expirado ou invalido." });
  }

  if (
    payload?.type !== "refresh" ||
    payload?.sub !== storedToken.userId ||
    payload?.email !== storedToken.email
  ) {
    refreshTokenStore.delete(refreshToken);
    await persistState();
    return res.status(401).json({ error: "Refresh token invalido." });
  }

  const user = usersByEmail.get(storedToken.email);
  if (!user) {
    return res.status(401).json({ error: "Usuario nao encontrado." });
  }

  refreshTokenStore.delete(refreshToken);
  await persistState();

  const nextAccessToken = issueAccessToken(user);
  const nextRefreshToken = issueRefreshToken(user);
  await persistState();

  addSecurityEvent("refresh", "success", { email: user.email });

  return res.status(200).json({
    accessToken: nextAccessToken,
    refreshToken: nextRefreshToken,
  });
});

app.post("/auth/logout", authLimiter, async (req, res) => {
  const parsedBody = refreshBodySchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({ error: "Payload invalido." });
  }

  const { refreshToken } = parsedBody.data;
  const storedToken = refreshTokenStore.get(refreshToken);
  if (storedToken) {
    storedToken.revokedAt = Date.now();
    refreshTokenStore.set(refreshToken, storedToken);
    await persistState();
  }

  addSecurityEvent("logout", "success", {
    email: storedToken?.email || "unknown",
  });

  return res.status(204).send();
});

app.post("/auth/forgot-password", authLimiter, async (req, res) => {
  const parsedBody = forgotPasswordBodySchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({ error: "Payload invalido." });
  }

  cleanExpiredPasswordResetTokens();

  const { email } = parsedBody.data;
  const user = usersByEmail.get(email);

  if (!user) {
    addSecurityEvent("password_forgot", "warning", {
      email,
      reason: "user_not_found",
    });

    return res.status(200).json({
      message:
        "Se o email existir, enviaremos as instrucoes de recuperacao em instantes.",
      ...(config.exposeResetToken
        ? {
            devResetToken: createPublicResetTokenPreview(),
            expiresAt: new Date(
              Date.now() + Math.max(1, config.resetTokenTtlMinutes) * 60 * 1000,
            ).toISOString(),
          }
        : {}),
    });
  }

  const resetToken = createPasswordResetToken(email);
  const emailResult = await sendPasswordResetEmail({
    email,
    token: resetToken.token,
    expiresAt: resetToken.expiresAt,
  });

  addSecurityEvent(
    "password_forgot",
    emailResult.delivered ? "success" : "warning",
    {
      email,
      expiresAt: new Date(resetToken.expiresAt).toISOString(),
      emailDelivery: emailResult.delivered ? "sent" : emailResult.reason,
    },
  );

  const shouldReturnResetToken =
    config.exposeResetToken || process.env.NODE_ENV !== "production";

  return res.status(200).json({
    message:
      "Se o email existir, enviaremos as instrucoes de recuperacao em instantes.",
    ...((!emailResult.delivered || shouldReturnResetToken) &&
    shouldReturnResetToken
      ? {
          devResetToken: resetToken.token,
          expiresAt: new Date(resetToken.expiresAt).toISOString(),
        }
      : {}),
  });
});

app.post("/auth/reset-password", authLimiter, async (req, res) => {
  const parsedBody = resetPasswordBodySchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({ error: "Payload invalido." });
  }

  cleanExpiredPasswordResetTokens();

  const { token, password } = parsedBody.data;
  const tokenRecord = passwordResetTokenStore.get(token);

  if (
    !tokenRecord ||
    tokenRecord.usedAt ||
    tokenRecord.expiresAt <= Date.now()
  ) {
    return res
      .status(400)
      .json({ error: "Token de recuperacao invalido ou expirado." });
  }

  const user = usersByEmail.get(tokenRecord.email);
  if (!user) {
    return res
      .status(400)
      .json({ error: "Token de recuperacao invalido ou expirado." });
  }

  user.passwordHash = await bcrypt.hash(password, config.bcryptRounds);
  usersByEmail.set(user.email, user);

  tokenRecord.usedAt = Date.now();
  passwordResetTokenStore.set(token, tokenRecord);
  revokeRefreshTokensByEmail(user.email);
  await persistState();

  addSecurityEvent("password_reset", "success", {
    email: user.email,
  });

  return res.status(200).json({
    message: "Senha redefinida com sucesso.",
  });
});

app.get("/security/audit", (_req, res) => {
  return res.status(200).json({
    events: securityEvents.slice(0, 100),
  });
});

app.get("/vault/items", authenticateAccessToken, async (req, res) => {
  const userId = req.authUser.id;
  const storedVault = vaultItemsByUserId.get(userId);

  if (storedVault?.encryptedVault) {
    return res.status(200).json({
      encryptedVault: storedVault.encryptedVault,
    });
  }

  const items = Array.isArray(storedVault) ? storedVault : [];

  return res.status(200).json({
    items,
  });
});

app.put("/vault/items", authenticateAccessToken, async (req, res) => {
  const parsedBody = upsertVaultSchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({ error: "Payload invalido." });
  }

  const userId = req.authUser.id;
  const payload =
    "encryptedVault" in parsedBody.data
      ? {
          encryptedVault: parsedBody.data.encryptedVault,
        }
      : parsedBody.data.items;

  const totalItems = Array.isArray(payload) ? payload.length : null;

  vaultItemsByUserId.set(userId, payload);
  await persistState();

  addSecurityEvent("vault_sync", "success", {
    email: req.authUser.email,
    totalItems,
    encrypted: !Array.isArray(payload),
  });

  return res.status(200).json({
    ok: true,
    totalItems,
    encrypted: !Array.isArray(payload),
  });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  return res.status(500).json({ error: "Erro interno." });
});

async function bootstrap() {
  await ensureInitialized();

  app.listen(config.port, () => {
    console.log(`secpass-backend listening on port ${config.port}`);
  });
}

export async function ensureInitialized() {
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    assertProductionSecurityConfig();
    await initPostgres();
    await loadState();
  })();

  try {
    await initPromise;
  } catch (error) {
    initPromise = null;
    throw error;
  }
}

async function shutdown() {
  try {
    await persistQueue;

    if (postgresPool) {
      await postgresPool.end();
    }
  } catch (error) {
    console.error("backend_shutdown_failed", error);
  }
}

export default app;

const shouldRunStandalone = !process.env.VERCEL;

if (shouldRunStandalone) {
  process.on("SIGTERM", async () => {
    await shutdown();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    await shutdown();
    process.exit(0);
  });

  bootstrap().catch((error) => {
    console.error("backend_bootstrap_failed", error);
    process.exit(1);
  });
}

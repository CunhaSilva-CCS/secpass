const base =
  process.env.SMOKE_BASE_URL || "https://password-manager-gules-one.vercel.app";
const headers = { "content-type": "application/json" };

async function req(path, opts = {}) {
  const res = await fetch(base + path, opts);
  const text = await res.text();
  let body = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  return {
    status: res.status,
    ok: res.ok,
    body,
  };
}

const suffix = Date.now();
const emailA = `sa${suffix}@test.com`;
const emailB = `sb${suffix}@test.com`;
const password = "Abc!1234567";

const health = await req("/api/health");
const regA = await req("/api/auth/register", {
  method: "POST",
  headers,
  body: JSON.stringify({ email: emailA, password }),
});
const regB = await req("/api/auth/register", {
  method: "POST",
  headers,
  body: JSON.stringify({ email: emailB, password }),
});

const loginA = await req("/api/auth/login", {
  method: "POST",
  headers,
  body: JSON.stringify({ email: emailA, password }),
});
const loginB = await req("/api/auth/login", {
  method: "POST",
  headers,
  body: JSON.stringify({ email: emailB, password }),
});

const tokenA = loginA.body?.accessToken || regA.body?.accessToken;
const tokenB = loginB.body?.accessToken || regB.body?.accessToken;

const saveA = tokenA
  ? await req("/api/vault/items", {
      method: "PUT",
      headers: { ...headers, authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        items: [{ id: "1", title: "A", username: "ua", password: "pa" }],
      }),
    })
  : null;

const saveB = tokenB
  ? await req("/api/vault/items", {
      method: "PUT",
      headers: { ...headers, authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({
        items: [{ id: "1", title: "B", username: "ub", password: "pb" }],
      }),
    })
  : null;

const loadA = tokenA
  ? await req("/api/vault/items", {
      headers: { authorization: `Bearer ${tokenA}` },
    })
  : null;

const loadB = tokenB
  ? await req("/api/vault/items", {
      headers: { authorization: `Bearer ${tokenB}` },
    })
  : null;

const isolated =
  loadA?.body?.items?.[0]?.title === "A" &&
  loadB?.body?.items?.[0]?.title === "B";

const summary = {
  base,
  health,
  regA: regA ? { status: regA.status, ok: regA.ok } : null,
  regB: regB ? { status: regB.status, ok: regB.ok } : null,
  loginA: loginA ? { status: loginA.status, ok: loginA.ok } : null,
  loginB: loginB ? { status: loginB.status, ok: loginB.ok } : null,
  saveA: saveA ? { status: saveA.status, ok: saveA.ok } : null,
  saveB: saveB ? { status: saveB.status, ok: saveB.ok } : null,
  loadATitle: loadA?.body?.items?.[0]?.title || null,
  loadBTitle: loadB?.body?.items?.[0]?.title || null,
  isolated,
};

console.log(JSON.stringify(summary, null, 2));

if (!health.ok || !isolated) {
  process.exit(1);
}

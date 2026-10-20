import { describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { api, refreshAccessToken } from "./client";
import { ApiError } from "./errors";
import { getAccessToken, onSessionEnd, setAccessToken, type SessionEnd } from "../auth/session";

const API = "*/api/v1";

function tokenResponse(token: string) {
  return {
    access_token: token,
    token_type: "bearer",
    user: { id: "u1", email: "a@b.test", name: null, role: "user", is_active: true },
  };
}

describe("api client", () => {
  it("sends the in-memory access token as a Bearer header", async () => {
    setAccessToken("tok-1");
    let seen = "";
    server.use(
      http.get(`${API}/ping`, ({ request }) => {
        seen = request.headers.get("authorization") ?? "";
        return HttpResponse.json({ ok: true });
      }),
    );
    await expect(api.get("/ping")).resolves.toEqual({ ok: true });
    expect(seen).toBe("Bearer tok-1");
  });

  it("never writes the token to web storage", async () => {
    server.use(http.post(`${API}/auth/refresh`, () => HttpResponse.json(tokenResponse("fresh"))));
    await refreshAccessToken();
    expect(getAccessToken()).toBe("fresh");
    const stored = JSON.stringify({ ...window.localStorage, ...window.sessionStorage });
    expect(stored).not.toContain("fresh");
  });

  it("on 401 refreshes once, then retries with the new token", async () => {
    setAccessToken("expired");
    const refresh = vi.fn(() => HttpResponse.json(tokenResponse("renewed")));
    server.use(
      http.post(`${API}/auth/refresh`, refresh),
      http.get(`${API}/thing`, ({ request }) =>
        request.headers.get("authorization") === "Bearer renewed"
          ? HttpResponse.json({ value: 42 })
          : HttpResponse.json({ detail: "expired" }, { status: 401 }),
      ),
    );
    await expect(api.get("/thing")).resolves.toEqual({ value: 42 });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBe("renewed");
  });

  it("shares one refresh between parallel 401s (rotating refresh token)", async () => {
    setAccessToken("expired");
    const refresh = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return HttpResponse.json(tokenResponse("renewed"));
    });
    server.use(
      http.post(`${API}/auth/refresh`, refresh),
      http.get(`${API}/n/:i`, ({ request, params }) =>
        request.headers.get("authorization") === "Bearer renewed"
          ? HttpResponse.json({ i: params.i })
          : HttpResponse.json({ detail: "expired" }, { status: 401 }),
      ),
    );
    const results = await Promise.all([api.get("/n/1"), api.get("/n/2"), api.get("/n/3")]);
    expect(results).toEqual([{ i: "1" }, { i: "2" }, { i: "3" }]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("sends the refresh request with cookies", async () => {
    let credentialsMode: RequestCredentials | undefined;
    server.use(
      http.post(`${API}/auth/refresh`, ({ request }) => {
        credentialsMode = request.credentials;
        return HttpResponse.json(tokenResponse("x"));
      }),
    );
    await refreshAccessToken();
    expect(credentialsMode).toBe("include");
  });

  it("holds a cross-tab Web Lock while refreshing", async () => {
    const names: string[] = [];
    vi.stubGlobal("navigator", {
      ...navigator,
      locks: {
        request: (name: string, fn: () => Promise<unknown>) => {
          names.push(name);
          return fn();
        },
      },
    });
    server.use(http.post(`${API}/auth/refresh`, () => HttpResponse.json(tokenResponse("locked"))));
    try {
      await refreshAccessToken();
    } finally {
      vi.unstubAllGlobals();
    }
    expect(names).toEqual(["jf-auth-refresh"]);
    expect(getAccessToken()).toBe("locked");
  });

  it("ends the session as expired when refresh fails", async () => {
    setAccessToken("expired");
    const ended: SessionEnd[] = [];
    const off = onSessionEnd((e) => ended.push(e));
    server.use(
      http.post(`${API}/auth/refresh`, () =>
        HttpResponse.json({ detail: "nope" }, { status: 401 }),
      ),
      http.get(`${API}/thing`, () => HttpResponse.json({ detail: "expired" }, { status: 401 })),
    );
    await expect(api.get("/thing")).rejects.toMatchObject({ status: 401 });
    expect(ended).toEqual([expect.objectContaining({ reason: "expired" })]);
    expect(getAccessToken()).toBeNull();
    off();
  });

  it("does not refresh for a wrong password on /auth/login", async () => {
    const refresh = vi.fn(() => HttpResponse.json(tokenResponse("x")));
    server.use(
      http.post(`${API}/auth/refresh`, refresh),
      http.post(`${API}/auth/login`, () =>
        HttpResponse.json({ detail: "Incorrect email or password." }, { status: 401 }),
      ),
    );
    await expect(api.post("/auth/login", { email: "a", password: "b" })).rejects.toThrow(
      "Incorrect email or password.",
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("signs the user out with the backend message on 403 account_disabled", async () => {
    setAccessToken("tok");
    const ended: SessionEnd[] = [];
    const off = onSessionEnd((e) => ended.push(e));
    server.use(
      http.get(`${API}/thing`, () =>
        HttpResponse.json(
          {
            detail: {
              code: "account_disabled",
              message: "This account has been disabled. Contact your admin.",
            },
          },
          { status: 403 },
        ),
      ),
    );
    const err = await api.get("/thing").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("account_disabled");
    expect(ended).toEqual([
      { reason: "disabled", message: "This account has been disabled. Contact your admin." },
    ]);
    expect(getAccessToken()).toBeNull();
    off();
  });

  it("keeps the session for an ordinary 403", async () => {
    setAccessToken("tok");
    const listener = vi.fn();
    const off = onSessionEnd(listener);
    server.use(
      http.get(`${API}/admin/users`, () =>
        HttpResponse.json({ detail: "You do not have permission to do this." }, { status: 403 }),
      ),
    );
    await expect(api.get("/admin/users")).rejects.toMatchObject({ status: 403, code: "forbidden" });
    expect(listener).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe("tok");
    off();
  });

  it("exposes Retry-After on 429", async () => {
    server.use(
      http.post(`${API}/auth/otp/request`, () =>
        HttpResponse.json(
          { detail: "Please wait before requesting another code." },
          { status: 429, headers: { "Retry-After": "42" } },
        ),
      ),
    );
    const err = (await api
      .post("/auth/otp/request", { email: "a@b.test" })
      .catch((e) => e)) as ApiError;
    expect(err.status).toBe(429);
    expect(err.retryAfterSeconds).toBe(42);
    expect(err.message).toBe("Please wait before requesting another code.");
  });

  it("turns a network failure into a readable ApiError", async () => {
    server.use(http.get(`${API}/thing`, () => HttpResponse.error()));
    await expect(api.get("/thing")).rejects.toMatchObject({ status: 0, code: "network_error" });
  });

  it("returns undefined for 204 and serializes query params", async () => {
    let url = "";
    server.use(
      http.delete(`${API}/things/1`, ({ request }) => {
        url = request.url;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await expect(
      api.delete("/things/1", { params: { a: 1, b: undefined } }),
    ).resolves.toBeUndefined();
    expect(new URL(url).search).toBe("?a=1");
  });
});

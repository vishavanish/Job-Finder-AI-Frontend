/**
 * MSW handlers for Settings › Browser extension (backend P8a E1, routes/extension.py): a pairing code,
 * the list of connected browsers with saved-job counts, and disconnect. In mock mode the code "connects"
 * a browser after a few seconds, so the page shows the new connection the way it would for real.
 */
import { http, HttpResponse } from "msw";
import { extensionDb } from "./extensionState";
import { API, authenticate, newId } from "./handlers";

export { extensionDb, resetExtensionMock } from "./extensionState";

export const extensionHandlers = [
  http.post(`${API}/extension/pair`, ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const userId = auth.user.id;
    setTimeout(() => {
      const now = new Date().toISOString();
      (extensionDb.connections[userId] ??= []).unshift({
        id: newId("ext"),
        name: "Chrome extension",
        created_at: now,
        last_used_at: now,
      });
      extensionDb.saved[userId] = { total: 18, today: 18 };
    }, 4000);
    return HttpResponse.json({ code: "482913", expires_in: 600 });
  }),
  http.get(`${API}/extension/connections`, ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const saved = extensionDb.saved[auth.user.id] ?? { total: 0, today: 0 };
    return HttpResponse.json({
      connections: extensionDb.connections[auth.user.id] ?? [],
      saved_total: saved.total,
      saved_today: saved.today,
    });
  }),
  http.delete(`${API}/extension/connections/:id`, ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const list = extensionDb.connections[auth.user.id] ?? [];
    extensionDb.connections[auth.user.id] = list.filter((c) => c.id !== params.id);
    return new HttpResponse(null, { status: 204 });
  }),
];

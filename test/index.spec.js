import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

describe("Fluore Notes worker", () => {
  describe("static assets", () => {
    it("serves index.html at /", async () => {
      const res = await SELF.fetch(new Request("http://example.com/"));
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("Fluore Notes");
    });
  });

  describe("public health check", () => {
    it("responds 200 at /api/health", async () => {
      const res = await SELF.fetch(new Request("http://example.com/api/health"));
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ status: "ok" });
    });
  });

  describe("notes API authentication", () => {
    it("rejects an unauthenticated GET /api/notes with 401", async () => {
      const res = await SELF.fetch(new Request("http://example.com/api/notes"));
      expect(res.status).toBe(401);
    });

    it("rejects a malformed Authorization header with 401", async () => {
      const res = await SELF.fetch(
        new Request("http://example.com/api/notes", {
          headers: { Authorization: "Token abc.def" },
        })
      );
      expect(res.status).toBe(401);
    });
  });
});

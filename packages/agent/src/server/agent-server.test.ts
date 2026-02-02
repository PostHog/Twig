import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestRepo, type TestRepo } from "../test/fixtures/api.js";
import { createJwt } from "./jwt.js";
import { AgentServer } from "./agent-server.js";

describe("AgentServer HTTP Mode", () => {
  let repo: TestRepo;
  let server: AgentServer;
  const jwtSecret = "test-secret";
  const port = 3099;

  beforeEach(async () => {
    repo = await createTestRepo("agent-server-http");
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
    await repo.cleanup();
  });

  const createServer = () => {
    server = new AgentServer({
      port,
      jwtSecret,
      repositoryPath: repo.path,
      apiUrl: "http://localhost:8000",
      apiKey: "test-api-key",
      projectId: 1,
    });
    return server;
  };

  const createToken = (overrides = {}) => {
    return createJwt(
      {
        run_id: "test-run-id",
        task_id: "test-task-id",
        team_id: 1,
        user_id: 1,
        distinct_id: "test-distinct-id",
        ...overrides,
      },
      jwtSecret,
    );
  };

  describe("GET /health", () => {
    it("returns ok status", async () => {
      await createServer().start();

      const response = await fetch(`http://localhost:${port}/health`);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ status: "ok", hasSession: false });
    });
  });

  describe("GET /events", () => {
    it("returns 401 without authorization header", async () => {
      await createServer().start();

      const response = await fetch(`http://localhost:${port}/events`);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toBe("Missing authorization header");
    });

    it("returns 401 with invalid token", async () => {
      await createServer().start();

      const response = await fetch(`http://localhost:${port}/events`, {
        headers: { Authorization: "Bearer invalid-token" },
      });
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.code).toBe("invalid_signature");
    });

    it("accepts valid JWT and returns SSE stream", async () => {
      await createServer().start();
      const token = createToken();

      const response = await fetch(`http://localhost:${port}/events`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/event-stream");
    });

    it("accepts Modal X-Verified-User-Data header", async () => {
      await createServer().start();
      const userData = JSON.stringify({
        run_id: "test-run-id",
        task_id: "test-task-id",
        team_id: 1,
        user_id: 1,
        distinct_id: "test-distinct-id",
      });

      const response = await fetch(`http://localhost:${port}/events`, {
        headers: { "X-Verified-User-Data": userData },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/event-stream");
    });
  });

  describe("POST /command", () => {
    it("returns 401 without authorization", async () => {
      await createServer().start();

      const response = await fetch(`http://localhost:${port}/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "user_message", params: { content: "test" } }),
      });

      expect(response.status).toBe(401);
    });

    it("returns 400 when no session exists", async () => {
      await createServer().start();
      const token = createToken();

      const response = await fetch(`http://localhost:${port}/command`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ jsonrpc: "2.0", method: "user_message", params: { content: "test" } }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("No active session for this run");
    });
  });

  describe("404 handling", () => {
    it("returns 404 for unknown routes", async () => {
      await createServer().start();

      const response = await fetch(`http://localhost:${port}/unknown`);
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.error).toBe("Not found");
    });
  });
});

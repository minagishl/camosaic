import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:5173", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    { command: "node e2e/peer-server.mjs", port: 9000, reuseExistingServer: true },
    {
      command: "pnpm dev",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: true,
      timeout: 120_000,
      env: { VITE_PEER_HOST: "127.0.0.1", VITE_PEER_PORT: "9000", VITE_PEER_PATH: "/camosaic" },
    },
  ],
});

import { expect, test } from "@playwright/test";

test("routes between the working interfaces", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/host$/);
  await expect(page.getByRole("button", { name: /start|stop/i })).toBeVisible();
  await page.getByRole("link", { name: /lab/i }).click();
  await expect(page.getByText(/devices · 2\/5/i)).toBeVisible();
  await page.getByRole("link", { name: /child/i }).click();
  await expect(page.getByRole("heading", { name: "Child screen" })).toBeVisible();
  await expect(page.getByRole("button", { name: /enter fullscreen/i })).toBeVisible();
});

test("host and child tabs discover each other over BroadcastChannel", async ({ browser }) => {
  const context = await browser.newContext();
  const host = await context.newPage();
  const child = await context.newPage();
  await host.goto("/host");
  await child.goto("/child");
  await expect(host.getByText(/devices · 1\/5/i)).toBeVisible({ timeout: 8000 });
  await expect(child.getByText(/connected · 1/i)).toBeVisible({ timeout: 8000 });
  await context.close();
});

test("test lab self-test uses the real detector and meets its acceptance criteria", async ({ page }) => {
  await page.goto("/lab");
  await expect(page.getByText(/devices · 2\/5/i)).toBeVisible();
  await expect.poll(() => page.getByLabel("Virtual camera scene").evaluate((canvas: HTMLCanvasElement) => [canvas.width, canvas.height]))
    .toEqual([1280, 720]);
  await expect(page.getByLabel("Tracking errors")).toContainText("Tracking");
  await page.getByRole("button", { name: /run self-test/i }).click();
  await expect(page.getByLabel("Self-test result")).toContainText("Result: PASS", { timeout: 30_000 });
});

test("a child joins a host from another browser with the host code", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const childContext = await browser.newContext();
  const host = await hostContext.newPage();
  const child = await childContext.newPage();
  await host.goto("/host");
  await expect(host.getByText("Online")).toBeVisible({ timeout: 15_000 });
  const code = (await host.getByTestId("host-code").textContent())!.trim();
  expect(code).toMatch(/^[A-Z2-9]{6}$/);
  await child.goto(`/child?code=${code}`);
  await expect(child.getByText(/connected · 1/i)).toBeVisible({ timeout: 15_000 });
  await expect(host.getByText(/devices · 1\/5/i)).toBeVisible({ timeout: 15_000 });
  await hostContext.close();
  await childContext.close();
});

test("a child can type the host code instead of opening a link", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const childContext = await browser.newContext();
  const host = await hostContext.newPage();
  const child = await childContext.newPage();
  await host.goto("/host");
  await expect(host.getByText("Online")).toBeVisible({ timeout: 15_000 });
  const code = (await host.getByTestId("host-code").textContent())!.trim();
  await child.goto("/child");
  await child.getByLabel("Host code").fill(code.toLowerCase());
  await child.getByRole("button", { name: "Connect" }).click();
  await expect(child.getByText(/connected · 1/i)).toBeVisible({ timeout: 15_000 });
  await hostContext.close();
  await childContext.close();
});

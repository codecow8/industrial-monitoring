import { expect, test } from "../auth-fixtures";

test.use({ storageState: { cookies: [], origins: [] } });

test("真实登录、图标切换、刷新、退出和运行态登录保护", async ({ page, account, browser }) => {
  const pageId = `login-${Date.now()}`;
  await page.goto(`/editor/${pageId}`);
  await expect(page).toHaveURL(/\/login\?redirect=/);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("请输入账号和密码");
  await page.getByLabel("账号", { exact: true }).fill(account.username);
  await page.getByLabel("密码", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("账号或密码错误");
  await page.getByLabel("密码", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "显示密码", exact: true }).click();
  await expect(page.getByLabel("密码", { exact: true })).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "隐藏密码", exact: true }).click();
  await page.getByLabel("密码", { exact: true }).press("Enter");
  await expect(page).toHaveURL(`/editor/${pageId}`);
  await page.reload();
  await expect(page.getByRole("button", { name: "保存草稿" })).toBeVisible();
  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page).toHaveURL(/\/login/);
  expect((await page.request.get(`/api/pages/${pageId}/draft`)).status()).toBe(401);
  const anonymous = await browser.newContext();
  try {
    const publicPage = await anonymous.newPage();
    await publicPage.goto(`http://127.0.0.1:4174/runtime/${pageId}`);
    await expect(publicPage).toHaveURL(/\/login\?redirect=/);
    await expect(publicPage.getByRole("status")).toContainText("运行态需要登录");
    await publicPage.getByLabel("账号", { exact: true }).fill(account.username);
    await publicPage.getByLabel("密码", { exact: true }).fill(account.password);
    await publicPage.getByRole("button", { name: "登录", exact: true }).click();
    await expect(publicPage).toHaveURL(`/runtime/${pageId}`);
    await expect(publicPage.getByText("页面尚未发布")).toBeVisible();
    await expect(publicPage.getByRole("button", { name: "退出登录" })).toHaveCount(0);
  } finally { await anonymous.close(); }
});

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";

const fixtures = {
  malformed: path.join(process.cwd(), "tests/fixtures/malformed-rooming-list.csv"),
  review: path.join(process.cwd(), "tests/fixtures/review-rooming-list.csv"),
  valid: path.join(process.cwd(), "tests/fixtures/valid-rooming-list.csv"),
};

test("runs the local packet workflow with responsive, privacy, and download proof", async ({
  page,
}, testInfo) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const externalRequests: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
      externalRequests.push(request.url());
    }
  });

  await page.clock.setFixedTime(new Date("2026-07-28T00:00:00.000Z"));
  await page.goto("/");
  await expect(page).toHaveTitle("Key Packet Press");
  await expect(
    page.getByRole("heading", {
      name: "Turn a final rooming list into ready-to-fold key packets.",
    }),
  ).toBeVisible();
  await expect(page.getByText("Your CSV stays in this browser.")).toBeVisible();

  const fileInput = page.getByLabel("Drop or choose your final rooming-list CSV");
  await expect(fileInput).toBeAttached();
  const startedAt = Date.now();
  await fileInput.setInputFiles(fixtures.valid);
  await expect(page.getByRole("status")).toContainText("3 packets ready");
  expect(Date.now() - startedAt).toBeLessThan(10_000);

  const downloadAction = page.getByRole("button", {
    name: "Download packet PDF",
  });
  await expect(downloadAction).toBeVisible();
  if (testInfo.project.name.startsWith("phone-")) {
    const actionBox = await downloadAction.boundingBox();
    const viewport = page.viewportSize();
    expect(actionBox).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect((actionBox?.y ?? 0) + (actionBox?.height ?? 0)).toBeLessThanOrEqual(
      viewport?.height ?? 0,
    );
  }
  await expect(page.getByText("Acme, North")).toBeVisible();
  await expect(page.getByText("Zoë d’Ávila")).toBeVisible();
  await expect(page.locator(".packet-preview")).not.toContainText("Atrium-7");
  await expect(page.locator(".packet-preview")).not.toContainText("Cedar-12");
  await expect(page.locator(".packet-preview")).not.toContainText("North-3");

  for (const redundantLabel of ["Run", "Continue", "Next", "View results", "Log in", "Sign up"]) {
    await expect(page.getByRole("button", { name: redundantLabel, exact: true })).toHaveCount(0);
  }
  await expect(page.locator("select, nav, dialog, input[type='password']")).toHaveCount(0);

  const accessibility = await new AxeBuilder({ page }).disableRules(["color-contrast"]).analyze();
  expect(
    accessibility.violations.filter((violation) =>
      ["critical", "serious"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);

  const colorContrast = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  expect(colorContrast.violations).toEqual([]);

  expect(
    await page.evaluate(() => ({
      cookies: document.cookie,
      horizontalOverflow:
        document.documentElement.scrollWidth > document.documentElement.clientWidth,
      localStorage: localStorage.length,
      sessionStorage: sessionStorage.length,
    })),
  ).toEqual({
    cookies: "",
    horizontalOverflow: false,
    localStorage: 0,
    sessionStorage: 0,
  });

  await page.screenshot({
    animations: "disabled",
    fullPage: true,
    path: path.join("proof", "browser", `${testInfo.project.name}.png`),
  });

  const downloadPromise = page.waitForEvent("download");
  await downloadAction.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("key-packets-2026-07-28.pdf");
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const pdfBytes = await readFile(downloadPath ?? "");
  expect(pdfBytes.subarray(0, 5).toString()).toBe("%PDF-");
  const pdf = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  expect(pdf.getPageCount()).toBe(2);
  expect(pdf.getTitle()).toBe("Key Packet Press — Internal packet materials");
  expect(pdf.getSubject()).toBe("Fold-in key-packet inserts and staff-only assembly index");
  await expect(page.getByRole("status")).toContainText("download started");

  if (testInfo.project.name === "desktop-light") {
    await page.screenshot({
      animations: "disabled",
      fullPage: true,
      path: path.join("proof", "browser", "downloaded-desktop-light.png"),
    });

    await fileInput.setInputFiles(fixtures.review);
    await expect(page.getByRole("status")).toHaveText(
      "This CSV needs review before packets can be made.",
    );
    await expect(page.locator(".review-list")).toContainText("Row 2");
    await expect(page.locator(".review-list")).toContainText("Row 3");
    await expect(page.locator(".review-list")).toContainText("Row 4");
    await expect(page.getByRole("button", { name: "Download packet PDF" })).toHaveCount(0);
    await page.screenshot({
      animations: "disabled",
      fullPage: true,
      path: path.join("proof", "browser", "review-blocked-desktop-light.png"),
    });

    await fileInput.setInputFiles(fixtures.malformed);
    await expect(page.getByRole("status")).toHaveText(
      "This CSV could not be read; export it again as UTF-8 CSV, then choose it here.",
    );
    await expect(page.getByRole("button", { name: "Download packet PDF" })).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      animations: "disabled",
      fullPage: true,
      path: path.join("proof", "browser", "file-error-desktop-light.png"),
    });

    const validCsv = await readFile(fixtures.valid, "utf8");
    await page.evaluate((contents) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([contents], "dragged-rooming-list.csv", { type: "text/csv" }));
      document.querySelector("#drop-zone")?.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
        }),
      );
    }, validCsv);
    await expect(page.getByRole("status")).toContainText("3 packets ready");

    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (await fileInput.evaluate((input) => input === document.activeElement)) {
        break;
      }
      await page.keyboard.press("Tab");
    }
    await expect(fileInput).toBeFocused();
    expect(await fileInput.evaluate((input) => input.matches(":focus-visible"))).toBe(true);
    await page.screenshot({
      animations: "disabled",
      fullPage: true,
      path: path.join("proof", "browser", "focus-visible-desktop-light.png"),
    });

    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Download packet PDF" })).toBeFocused();
    expect(
      await page
        .getByRole("button", { name: "Download packet PDF" })
        .evaluate((button) => button.matches(":focus-visible")),
    ).toBe(true);
    await page.screenshot({
      animations: "disabled",
      fullPage: true,
      path: path.join("proof", "browser", "download-focus-visible-desktop-light.png"),
    });
  }

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(externalRequests).toEqual([]);
});

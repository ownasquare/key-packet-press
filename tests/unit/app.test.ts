// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PacketPdfResult } from "../../src/core/packet-pdf";
import { mountKeyPacketPress, type KeyPacketPressDependencies } from "../../src/app";

function installMarkup(): void {
  document.body.innerHTML = `
    <div id="drop-zone" class="drop-zone">
      <input id="rooming-list" type="file" accept=".csv,text/csv" />
      <span id="drop-title">Drop or choose your final CSV</span>
    </div>
    <p id="status" role="status" aria-live="polite">Ready for a finalized rooming list.</p>
    <section id="result"></section>
  `;
}

function csvFile(contents: string, name = "final-rooming-list.csv", type = "text/csv"): File {
  return new File([contents], name, { type });
}

function pdfResult(filename = "key-packets-2026-07-28.pdf"): PacketPdfResult {
  return Object.freeze({
    bytes: new Uint8Array([37, 80, 68, 70, 45]),
    filename,
    insertPageCount: 1,
    totalPageCount: 2,
  });
}

function dependencies(
  overrides: Partial<KeyPacketPressDependencies> = {},
): KeyPacketPressDependencies {
  return {
    createObjectUrl: vi.fn(() => "blob:key-packets"),
    downloadFile: vi.fn(),
    generatePdf: vi.fn(async () => pdfResult()),
    now: () => new Date("2026-07-28T00:00:00.000Z"),
    readFile: async (file) => new Uint8Array(await file.arrayBuffer()),
    revokeObjectUrl: vi.fn(),
    yieldToPaint: async () => undefined,
    ...overrides,
  };
}

const cleanCsv = "guest,room\nMaya Ortiz,0102\nNorth Team,205B\n";

describe("mountKeyPacketPress", () => {
  beforeEach(() => {
    installMarkup();
  });

  it("starts the safe local transformation as soon as the file input changes", async () => {
    const deps = dependencies();
    const controller = mountKeyPacketPress(document, deps);
    const input = document.querySelector<HTMLInputElement>("#rooming-list");
    const file = csvFile(cleanCsv);
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file],
    });

    input?.dispatchEvent(new Event("change"));

    await vi.waitFor(() => {
      expect(deps.generatePdf).toHaveBeenCalledOnce();
    });
    expect(document.querySelector(".download-action")?.textContent).toBe("Download packet PDF");
    expect(document.querySelector("#status")?.textContent).toContain("2 packets ready");
    expect(document.body.textContent).not.toContain("Run");
    expect(document.body.textContent).not.toContain("View results");
    controller.destroy();
  });

  it("renders a clean closed-face preview without room identifiers", async () => {
    const controller = mountKeyPacketPress(document, dependencies());

    await controller.processFiles([csvFile(cleanCsv)]);

    const preview = document.querySelector(".packet-preview")?.textContent ?? "";
    expect(preview).toContain("Maya Ortiz");
    expect(preview).toContain("North Team");
    expect(preview).not.toContain("0102");
    expect(preview).not.toContain("205B");
    controller.destroy();
  });

  it("fails closed on exact duplicates and offers replacement without a PDF", async () => {
    const deps = dependencies();
    const controller = mountKeyPacketPress(document, deps);

    await controller.processFiles([csvFile("guest,room\nMaya Ortiz,0102\nMaya Ortiz,0102\n")]);

    expect(document.querySelector("#status")?.textContent).toBe(
      "This CSV needs review before packets can be made.",
    );
    expect(document.querySelector(".review-list")?.textContent).toContain("Row 2");
    expect(document.querySelector(".review-list")?.textContent).toContain("Row 3");
    expect(document.querySelector(".download-action")).toBeNull();
    expect(deps.generatePdf).not.toHaveBeenCalled();
    expect(document.querySelector("#drop-title")?.textContent).toBe("Replace CSV");
    controller.destroy();
  });

  it("fails closed when one exterior guest label points to different rooms", async () => {
    const deps = dependencies();
    const controller = mountKeyPacketPress(document, deps);

    await controller.processFiles([csvFile("guest,room\nNorth Team,0102\nNorth Team,0204\n")]);

    expect(document.querySelector(".review-list")?.textContent).toContain("Row 2");
    expect(document.querySelector(".review-list")?.textContent).toContain("Row 3");
    expect(document.querySelector(".download-action")).toBeNull();
    expect(deps.generatePdf).not.toHaveBeenCalled();
    controller.destroy();
  });

  it("allows different guest labels to share a supplied room", async () => {
    const deps = dependencies();
    const controller = mountKeyPacketPress(document, deps);

    await controller.processFiles([csvFile("guest,room\nMaya Ortiz,0102\nNoah Ortiz,0102\n")]);

    expect(deps.generatePdf).toHaveBeenCalledOnce();
    expect(document.querySelector(".download-action")).not.toBeNull();
    controller.destroy();
  });

  it("checks the file type before reading bytes", async () => {
    const readFile = vi.fn(async () => new Uint8Array());
    const controller = mountKeyPacketPress(document, dependencies({ readFile }));

    await controller.processFiles([csvFile(cleanCsv, "notes.txt", "text/plain")]);

    expect(readFile).not.toHaveBeenCalled();
    expect(document.querySelector("#status")?.textContent).toBe(
      "Choose a CSV file to make the packet set.",
    );
    controller.destroy();
  });

  it("checks the file size before reading bytes", async () => {
    const readFile = vi.fn(async () => new Uint8Array());
    const oversized = csvFile(cleanCsv);
    Object.defineProperty(oversized, "size", { value: 2 * 1024 * 1024 + 1 });
    const controller = mountKeyPacketPress(document, dependencies({ readFile }));

    await controller.processFiles([oversized]);

    expect(readFile).not.toHaveBeenCalled();
    expect(document.querySelector("#status")?.textContent).toBe("Choose a CSV smaller than 2 MiB.");
    controller.destroy();
  });

  it("revokes a stale object URL when a replacement succeeds", async () => {
    const revokeObjectUrl = vi.fn();
    const createObjectUrl = vi
      .fn()
      .mockReturnValueOnce("blob:first")
      .mockReturnValueOnce("blob:second");
    const controller = mountKeyPacketPress(
      document,
      dependencies({ createObjectUrl, revokeObjectUrl }),
    );

    await controller.processFiles([csvFile(cleanCsv)]);
    await controller.processFiles([csvFile("guest,room\nAvery Chen,0301\n", "replacement.csv")]);

    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:first");
    expect(createObjectUrl).toHaveBeenCalledTimes(2);
    controller.destroy();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:second");
  });

  it("prevents a slower prior file from overwriting a newer result", async () => {
    let resolveFirst: ((value: PacketPdfResult) => void) | undefined;
    const first = new Promise<PacketPdfResult>((resolve) => {
      resolveFirst = resolve;
    });
    const generatePdf = vi
      .fn()
      .mockImplementationOnce(async () => first)
      .mockImplementationOnce(async () => pdfResult("newer.pdf"));
    const createObjectUrl = vi.fn(() => "blob:newer");
    const controller = mountKeyPacketPress(
      document,
      dependencies({ createObjectUrl, generatePdf }),
    );

    const oldWork = controller.processFiles([csvFile(cleanCsv, "older.csv")]);
    await vi.waitFor(() => {
      expect(generatePdf).toHaveBeenCalledTimes(1);
    });
    await controller.processFiles([csvFile("guest,room\nAvery Chen,0301\n", "newer.csv")]);
    resolveFirst?.(pdfResult("older.pdf"));
    await oldWork;

    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(document.querySelector<HTMLButtonElement>(".download-action")?.dataset.filename).toBe(
      "newer.pdf",
    );
    controller.destroy();
  });

  it("retains the ready PDF when the browser download action fails", async () => {
    const downloadFile = vi.fn(() => {
      throw new Error("synthetic failure");
    });
    const controller = mountKeyPacketPress(document, dependencies({ downloadFile }));
    await controller.processFiles([csvFile(cleanCsv)]);

    document
      .querySelector<HTMLButtonElement>(".download-action")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(document.querySelector("#status")?.textContent).toBe(
      "Try the download again; the packet PDF is still ready.",
    );
    expect(document.querySelector(".download-action")).not.toBeNull();
    controller.destroy();
  });

  it("does not create a URL or download control when PDF generation fails", async () => {
    const createObjectUrl = vi.fn(() => "blob:should-not-exist");
    const generatePdf = vi.fn(async () => {
      throw new Error("synthetic generation failure");
    });
    const controller = mountKeyPacketPress(
      document,
      dependencies({ createObjectUrl, generatePdf }),
    );

    await controller.processFiles([csvFile(cleanCsv)]);

    expect(createObjectUrl).not.toHaveBeenCalled();
    expect(document.querySelector(".download-action")).toBeNull();
    expect(document.querySelector("#status")?.textContent).toBe(
      "Replace the CSV because the packet PDF could not be made.",
    );
    controller.destroy();
  });
});

import { createPacketDocumentModel, PacketModelError } from "./core/packet-model";
import type { PacketPdfResult } from "./core/packet-pdf";
import {
  decodeRoomingList,
  parseRoomingList,
  RoomingListError,
  type RoomingListResult,
} from "./core/rooming-list";

const MAX_FILE_BYTES = 2 * 1024 * 1024;

export type KeyPacketPressDependencies = {
  createObjectUrl: (blob: Blob) => string;
  downloadFile: (url: string, filename: string) => void;
  generatePdf: (model: ReturnType<typeof createPacketDocumentModel>) => Promise<PacketPdfResult>;
  now: () => Date;
  readFile: (file: File) => Promise<Uint8Array>;
  revokeObjectUrl: (url: string) => void;
  yieldToPaint: () => Promise<void>;
};

export type KeyPacketPressController = {
  destroy: () => void;
  processFiles: (files: ReadonlyArray<File>) => Promise<void>;
};

function defaultDependencies(): KeyPacketPressDependencies {
  return {
    createObjectUrl: (blob) => URL.createObjectURL(blob),
    downloadFile: (url, filename) => {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.hidden = true;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
    },
    generatePdf: async (model) => {
      const { generatePacketPdf } = await import("./core/packet-pdf");
      return generatePacketPdf(model);
    },
    now: () => new Date(),
    readFile: async (file) => new Uint8Array(await file.arrayBuffer()),
    revokeObjectUrl: (url) => URL.revokeObjectURL(url),
    yieldToPaint: () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => resolve());
      }),
  };
}

function isCsvFile(file: File): boolean {
  const type = file.type.toLowerCase();
  return (
    file.name.toLowerCase().endsWith(".csv") || type === "text/csv" || type === "application/csv"
  );
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const created = document.createElement(tag);
  if (className) {
    created.className = className;
  }
  if (text !== undefined) {
    created.textContent = text;
  }
  return created;
}

function formatGeneratedTime(iso: string): string {
  const timestamp = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

function renderReview(resultRoot: HTMLElement, result: RoomingListResult): void {
  const panel = element("article", "result-panel review-panel");
  const label = element("p", "result-kicker", "REVIEW BEFORE PRINTING");
  const rows = new Set(result.notices.map((notice) => notice.sourceRow));
  const heading = element(
    "h3",
    "result-heading",
    `${rows.size} source ${rows.size === 1 ? "row needs" : "rows need"} attention`,
  );
  const recovery = element("p", "recovery-line", "Correct those rows, then replace the CSV.");
  const list = element("ul", "review-list");
  const messagesByRow = new Map<number, string[]>();
  for (const notice of result.notices) {
    const messages = messagesByRow.get(notice.sourceRow) ?? [];
    messages.push(notice.message.replace(/^Row \d+\s+/u, "").replace(/\.$/u, ""));
    messagesByRow.set(notice.sourceRow, messages);
  }
  for (const [sourceRow, messages] of messagesByRow) {
    list.append(element("li", undefined, `Row ${sourceRow}: ${messages.join("; ")}.`));
  }
  panel.append(label, heading, recovery, list);
  resultRoot.replaceChildren(panel);
}

function renderSuccess(
  resultRoot: HTMLElement,
  model: ReturnType<typeof createPacketDocumentModel>,
  pdf: PacketPdfResult,
  url: string,
  status: HTMLElement,
  dependencies: KeyPacketPressDependencies,
): void {
  const panel = element("article", "result-panel success-panel");
  const label = element("p", "result-kicker", "PACKETS READY");
  const heading = element(
    "h3",
    "result-heading",
    `${model.inserts.length} fold-in ${model.inserts.length === 1 ? "packet" : "packets"}`,
  );
  const summary = element(
    "p",
    "result-summary",
    `Generated locally ${formatGeneratedTime(model.generatedAtIso)} · Staff index included`,
  );
  const preview = element("div", "packet-preview");
  preview.setAttribute("aria-label", "Closed packet-face preview");

  for (const insert of model.inserts.slice(0, 4)) {
    const card = element("div", "preview-card");
    card.append(
      element("span", "preview-id", `KP-${String(insert.sequence).padStart(3, "0")}`),
      element("strong", "preview-name", insert.guestLabel),
      element("span", "preview-boundary", "Room prints inside fold"),
    );
    preview.append(card);
  }

  if (model.inserts.length > 4) {
    preview.append(element("p", "preview-more", `+ ${model.inserts.length - 4} more in the PDF`));
  }

  const warning = element("p", "stale-warning", "Reprint after any room move.");
  const download = element("button", "download-action", "Download packet PDF");
  download.type = "button";
  download.dataset.filename = pdf.filename;
  download.addEventListener("click", () => {
    try {
      dependencies.downloadFile(url, pdf.filename);
      status.classList.remove("visually-hidden");
      status.textContent = "Your packet PDF download started; reprint after any room move.";
    } catch {
      status.classList.remove("visually-hidden");
      status.textContent = "Try the download again; the packet PDF is still ready.";
    }
  });

  panel.append(label, heading, summary, warning, download, preview);
  resultRoot.replaceChildren(panel);
}

export function mountKeyPacketPress(
  documentRoot: Document,
  suppliedDependencies: KeyPacketPressDependencies = defaultDependencies(),
): KeyPacketPressController {
  const fileInput = documentRoot.querySelector<HTMLInputElement>("#rooming-list");
  const dropZone = documentRoot.querySelector<HTMLElement>("#drop-zone");
  const dropTitle = documentRoot.querySelector<HTMLElement>("#drop-title");
  const status = documentRoot.querySelector<HTMLElement>("#status");
  const resultRoot = documentRoot.querySelector<HTMLElement>("#result");

  if (!(fileInput && dropZone && dropTitle && status && resultRoot)) {
    throw new Error("The local file surface could not start.");
  }

  let currentUrl: string | null = null;
  let destroyed = false;
  let processingToken = 0;

  const revokeCurrentUrl = () => {
    if (currentUrl) {
      suppliedDependencies.revokeObjectUrl(currentUrl);
      currentUrl = null;
    }
  };

  const showFileError = (message: string) => {
    status.classList.remove("visually-hidden");
    status.textContent = message;
    resultRoot.replaceChildren();
    dropTitle.textContent = "Choose another CSV";
    dropZone.dataset.state = "error";
  };

  const processFiles = async (files: ReadonlyArray<File>): Promise<void> => {
    const token = ++processingToken;
    revokeCurrentUrl();
    resultRoot.replaceChildren();
    dropTitle.textContent = "Replace CSV";
    dropZone.dataset.state = "processing";
    status.classList.remove("visually-hidden");

    if (files.length !== 1) {
      showFileError("Choose one CSV at a time.");
      return;
    }

    const file = files[0];
    if (!file || !isCsvFile(file)) {
      showFileError("Choose a CSV file to make the packet set.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      showFileError("Choose a CSV smaller than 2 MiB.");
      return;
    }

    status.textContent = "Checking your CSV locally…";
    await suppliedDependencies.yieldToPaint();

    try {
      const bytes = await suppliedDependencies.readFile(file);
      if (destroyed || token !== processingToken) {
        return;
      }
      const parsed = parseRoomingList(decodeRoomingList(bytes));
      if (parsed.notices.length > 0) {
        status.textContent = "This CSV needs review before packets can be made.";
        dropZone.dataset.state = "review";
        renderReview(resultRoot, parsed);
        return;
      }

      const model = createPacketDocumentModel(parsed, suppliedDependencies.now());
      const pdf = await suppliedDependencies.generatePdf(model);
      if (destroyed || token !== processingToken) {
        return;
      }

      const buffer = Uint8Array.from(pdf.bytes).buffer;
      const url = suppliedDependencies.createObjectUrl(
        new Blob([buffer], { type: "application/pdf" }),
      );
      if (destroyed || token !== processingToken) {
        suppliedDependencies.revokeObjectUrl(url);
        return;
      }

      currentUrl = url;
      dropZone.dataset.state = "ready";
      status.textContent = `${model.inserts.length} ${
        model.inserts.length === 1 ? "packet" : "packets"
      } ready to download.`;
      status.classList.add("visually-hidden");
      renderSuccess(resultRoot, model, pdf, url, status, suppliedDependencies);
    } catch (error) {
      if (destroyed || token !== processingToken) {
        return;
      }
      if (error instanceof RoomingListError || error instanceof PacketModelError) {
        showFileError(error.userMessage);
        return;
      }
      showFileError("Replace the CSV because the packet PDF could not be made.");
    }
  };

  const onChange = () => {
    const files = Array.from(fileInput.files ?? []);
    fileInput.value = "";
    void processFiles(files);
  };
  const onDragOver = (event: DragEvent) => {
    event.preventDefault();
    dropZone.dataset.dragging = "true";
  };
  const onDragLeave = () => {
    delete dropZone.dataset.dragging;
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    delete dropZone.dataset.dragging;
    void processFiles(Array.from(event.dataTransfer?.files ?? []));
  };
  const onUnload = () => revokeCurrentUrl();

  fileInput.addEventListener("change", onChange);
  dropZone.addEventListener("dragover", onDragOver);
  dropZone.addEventListener("dragleave", onDragLeave);
  dropZone.addEventListener("drop", onDrop);
  documentRoot.defaultView?.addEventListener("beforeunload", onUnload);

  return {
    destroy: () => {
      destroyed = true;
      processingToken += 1;
      revokeCurrentUrl();
      fileInput.removeEventListener("change", onChange);
      dropZone.removeEventListener("dragover", onDragOver);
      dropZone.removeEventListener("dragleave", onDragLeave);
      dropZone.removeEventListener("drop", onDrop);
      documentRoot.defaultView?.removeEventListener("beforeunload", onUnload);
    },
    processFiles,
  };
}

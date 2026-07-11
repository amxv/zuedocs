import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import * as pagefind from "pagefind";
import type {
  NewIndexResponse,
  PagefindIndex,
  PagefindServiceConfig
} from "pagefind";

const PAGEFIND_GLOB = "docs/**/*.html";
const PAGEFIND_OPTIONS = {
  rootSelector: "[data-pagefind-body]",
  includeCharacters: "._",
  keepIndexUrl: false,
  writePlayground: false,
  verbose: false
} satisfies PagefindServiceConfig;

export interface PagefindLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface PagefindApi {
  createIndex(config?: PagefindServiceConfig): Promise<NewIndexResponse>;
  close(): Promise<null>;
}

export interface IndexPagefindSiteOptions {
  dir: URL;
  logger: PagefindLogger;
  pagefindApi?: PagefindApi;
}

export interface IndexPagefindSiteResult {
  outputPath: string;
  pageCount: number;
}

function formatErrors(errors: readonly string[]): string {
  return errors.join("; ");
}

function pagefindError(stage: string, details: string): Error {
  return new Error(`[zuedocs] Pagefind ${stage} failed: ${details}`);
}

function reportAndThrow(logger: PagefindLogger, stage: string, errors: readonly string[]): never {
  const error = pagefindError(stage, formatErrors(errors));
  logger.error(error.message);
  throw error;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readSearchablePageCount(outputPath: string): Promise<number> {
  const metadataPath = join(outputPath, "pagefind-entry.json");
  let metadata: unknown;

  try {
    metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  } catch (error) {
    throw new Error(`could not read ${metadataPath}: ${describeError(error)}`);
  }

  if (!isRecord(metadata) || !isRecord(metadata.languages)) {
    throw new Error(`${metadataPath} has no valid languages object`);
  }

  let pageCount = 0;
  for (const [language, languageMetadata] of Object.entries(metadata.languages)) {
    if (
      !isRecord(languageMetadata) ||
      typeof languageMetadata.page_count !== "number" ||
      !Number.isSafeInteger(languageMetadata.page_count) ||
      languageMetadata.page_count < 0
    ) {
      throw new Error(`${metadataPath} has an invalid page_count for language ${JSON.stringify(language)}`);
    }
    pageCount += languageMetadata.page_count;
    if (!Number.isSafeInteger(pageCount)) {
      throw new Error(`${metadataPath} has an invalid total page_count`);
    }
  }

  return pageCount;
}

export async function indexPagefindSite({
  dir,
  logger,
  pagefindApi = pagefind
}: IndexPagefindSiteOptions): Promise<IndexPagefindSiteResult> {
  const outDir = fileURLToPath(dir);
  const outputPath = join(outDir, "pagefind");
  let index: PagefindIndex | undefined;
  let operationError: unknown;

  try {
    const created = await pagefindApi.createIndex(PAGEFIND_OPTIONS);
    if (created.errors.length > 0) {
      reportAndThrow(logger, "index creation", created.errors);
    }
    if (!created.index) {
      reportAndThrow(logger, "index creation", ["the Pagefind service returned no index"]);
    }
    index = created.index;

    const added = await index.addDirectory({ path: outDir, glob: PAGEFIND_GLOB });
    if (added.errors.length > 0) {
      reportAndThrow(logger, "HTML indexing", added.errors);
    }
    if (added.page_count === 0) {
      reportAndThrow(logger, "HTML indexing", ["zero generated HTML pages were indexed"]);
    }

    const written = await index.writeFiles({ outputPath });
    if (written.errors.length > 0) {
      reportAndThrow(logger, "bundle write", written.errors);
    }

    let pageCount: number;
    try {
      pageCount = await readSearchablePageCount(outputPath);
    } catch (error) {
      reportAndThrow(logger, "bundle metadata", [describeError(error)]);
    }
    if (pageCount === 0) {
      reportAndThrow(logger, "HTML indexing", ["zero searchable documentation pages were emitted"]);
    }

    logger.info(`[zuedocs] Indexed ${pageCount} page${pageCount === 1 ? "" : "s"} to ${outputPath}`);
    return { outputPath, pageCount };
  } catch (error) {
    operationError = error;
    if (error instanceof Error && error.message.startsWith("[zuedocs]")) {
      throw error;
    }
    const wrapped = pagefindError("indexing", describeError(error));
    logger.error(wrapped.message);
    throw wrapped;
  } finally {
    const cleanupErrors: string[] = [];

    if (index) {
      try {
        await index.deleteIndex();
      } catch (error) {
        cleanupErrors.push(`index cleanup: ${describeError(error)}`);
      }
    }

    try {
      await pagefindApi.close();
    } catch (error) {
      cleanupErrors.push(`service cleanup: ${describeError(error)}`);
    }

    if (cleanupErrors.length > 0) {
      const cleanupError = pagefindError("cleanup", cleanupErrors.join("; "));
      if (operationError === undefined) {
        logger.error(cleanupError.message);
        throw cleanupError;
      }
      logger.warn(cleanupError.message);
    }
  }
}

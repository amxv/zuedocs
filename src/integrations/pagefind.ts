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

    logger.info(`[zuedocs] Indexed ${added.page_count} page${added.page_count === 1 ? "" : "s"} to ${outputPath}`);
    return { outputPath, pageCount: added.page_count };
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

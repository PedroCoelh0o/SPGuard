import { createServerFn } from "@tanstack/react-start";
import type { QueryDescriptor, QueryResult } from "@/server/local-db";

type LocalRequest<T> = T & { _localToken?: string };

function assertLocalToken(data: { _localToken?: string }) {
  const expected = process.env.LOCAL_RPC_TOKEN;
  if (expected && data._localToken !== expected) throw new Error("Solicitação local não autorizada");
}

// Cada handler faz um import() dinâmico do módulo server-only. Isso garante
// que o código do better-sqlite3 e do acesso a disco nunca entra no bundle
// do navegador — só é carregado quando o handler roda no processo Node.

export const dbQuery = createServerFn({ method: "POST" })
  .validator((d: LocalRequest<QueryDescriptor>) => d)
  .handler(async ({ data }): Promise<QueryResult> => {
    assertLocalToken(data);
    const { executeQuery } = await import("@/server/local-db");
    return executeQuery(data);
  });

export const storageUploadFn = createServerFn({ method: "POST" })
  .validator((d: LocalRequest<{ bucket: string; path: string; base64: string }>) => d)
  .handler(async ({ data }) => {
    assertLocalToken(data);
    const { storageWrite } = await import("@/server/local-db");
    try {
      return { data: storageWrite(data.bucket, data.path, data.base64), error: null as { message: string } | null };
    } catch (e) {
      return { data: null, error: { message: (e as Error).message } };
    }
  });

export const storageReadFn = createServerFn({ method: "POST" })
  .validator((d: LocalRequest<{ bucket: string; path: string }>) => d)
  .handler(async ({ data }) => {
    assertLocalToken(data);
    const { storageRead } = await import("@/server/local-db");
    const result = storageRead(data.bucket, data.path);
    if (!result) return { data: null, error: { message: "Arquivo não encontrado" } };
    return { data: result, error: null as { message: string } | null };
  });

export const storageRemoveFn = createServerFn({ method: "POST" })
  .validator((d: LocalRequest<{ bucket: string; paths: string[] }>) => d)
  .handler(async ({ data }) => {
    assertLocalToken(data);
    const { storageRemove } = await import("@/server/local-db");
    try {
      storageRemove(data.bucket, data.paths);
      return { data: null, error: null as { message: string } | null };
    } catch (e) {
      return { data: null, error: { message: (e as Error).message } };
    }
  });

// Cliente de dados local. Implementa um subconjunto da API do supabase-js
// (from().select()/.insert()/.update()/.upsert()/.delete()/.eq()/.in()/.order()/.range(),
// além de storage.from().upload()/.remove()/.createSignedUrl()) para que o
// resto do app (rotas e componentes) não precise ser reescrito — só troca o
// import de "@/integrations/supabase/client" para "@/integrations/local-db/client".
//
// Por baixo dos panos, cada chamada vira uma RPC para o servidor Node local
// (rodando dentro do próprio app Electron), que executa a consulta num banco
// SQLite gravado no disco do usuário. Nada trafega pela internet.
import { dbQuery, storageUploadFn, storageReadFn, storageRemoveFn } from "@/integrations/local-db/server-fns";
import type { Filter, QueryDescriptor } from "@/server/local-db";

type PgError = { message: string } | null;
type PgResult<T> = { data: T | null; error: PgError };

declare global {
  interface Window { spguardRuntime?: { getRpcToken: () => Promise<string> }; }
}

let localTokenPromise: Promise<string | undefined> | undefined;
function getLocalToken() {
  if (!localTokenPromise) {
    localTokenPromise = typeof window !== "undefined" && window.spguardRuntime
      ? window.spguardRuntime.getRpcToken()
      : Promise.resolve(undefined);
  }
  return localTokenPromise;
}

class QueryBuilder<T = unknown> implements PromiseLike<PgResult<T>> {
  private descriptor: QueryDescriptor;

  constructor(table: string) {
    this.descriptor = { table, op: "select" };
  }

  select(columns = "*") {
    if (this.descriptor.op === "select") this.descriptor.columns = columns;
    return this;
  }

  insert(values: Record<string, unknown> | Record<string, unknown>[]) {
    this.descriptor.op = "insert";
    this.descriptor.values = values;
    return this;
  }

  update(values: Record<string, unknown>) {
    this.descriptor.op = "update";
    this.descriptor.values = values;
    return this;
  }

  upsert(values: Record<string, unknown>[], opts?: { onConflict?: string }) {
    this.descriptor.op = "upsert";
    this.descriptor.values = values;
    this.descriptor.onConflict = opts?.onConflict;
    return this;
  }

  delete() {
    this.descriptor.op = "delete";
    return this;
  }

  eq(col: string, val: unknown) {
    const filters: Filter[] = this.descriptor.filters ?? [];
    filters.push({ type: "eq", col, val });
    this.descriptor.filters = filters;
    return this;
  }

  in(col: string, vals: unknown[]) {
    const filters: Filter[] = this.descriptor.filters ?? [];
    filters.push({ type: "in", col, vals });
    this.descriptor.filters = filters;
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }) {
    this.descriptor.order = { col, ascending: opts?.ascending !== false };
    return this;
  }

  range(from: number, to: number) {
    this.descriptor.range = { from, to };
    return this;
  }

  // Registros removidos ficam em uma lixeira temporária. Estas opções são
  // usadas apenas pelas telas de histórico/lixeira, sem expor itens removidos
  // nas consultas normais do aplicativo.
  onlyDeleted() {
    this.descriptor.trashMode = "only";
    return this;
  }

  includeDeleted() {
    this.descriptor.trashMode = "all";
    return this;
  }

  // Torna o builder "awaitable", igual ao supabase-js: `await db.from(x).select()`.
  then<TResult1 = PgResult<T>, TResult2 = never>(
    onfulfilled?: ((value: PgResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return getLocalToken().then((token) => dbQuery({ data: { ...this.descriptor, _localToken: token } }).then(
      (res) => (onfulfilled ? onfulfilled(res as PgResult<T>) : (res as unknown as TResult1)),
      onrejected,
    ));
  }
}

function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function base64ToBlob(base64: string, contentType: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: contentType || "application/octet-stream" });
}

function storageBucket(bucket: string) {
  return {
    async upload(path: string, file: File, opts?: { upsert?: boolean; contentType?: string }) {
      void opts;
      try {
        if (file.size > 50 * 1024 * 1024) throw new Error("Arquivo excede o limite de 50 MB");
        const base64 = await fileToBase64(file);
        const _localToken = await getLocalToken();
        const res = await storageUploadFn({ data: { bucket, path, base64, _localToken } });
        return { data: res.data, error: res.error };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message } };
      }
    },
    async remove(paths: string[]) {
      const _localToken = await getLocalToken();
      const res = await storageRemoveFn({ data: { bucket, paths, _localToken } });
      return { data: res.data, error: res.error };
    },
    async createSignedUrl(path: string, _expiresIn: number, opts?: { download?: string }) {
      void _expiresIn;
      const _localToken = await getLocalToken();
      const res = await storageReadFn({ data: { bucket, path, _localToken } });
      if (res.error || !res.data) return { data: null, error: res.error ?? { message: "Arquivo não encontrado" } };
      const contentType = guessContentType(path);
      const blob = base64ToBlob(res.data.base64, contentType);
      const url = URL.createObjectURL(blob);
      if (opts?.download) {
        // Gatilha um download "de verdade" com o nome de arquivo correto,
        // já que blob: URLs abertas em nova aba não preservam o nome.
        const a = document.createElement("a");
        a.href = url;
        a.download = opts.download;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      return { data: { signedUrl: url }, error: null };
    },
  };
}

function guessContentType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
    pdf: "application/pdf", txt: "text/plain", csv: "text/csv",
    doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return (ext && map[ext]) || "application/octet-stream";
}

export const supabase = {
  from<T = unknown>(table: string) {
    return new QueryBuilder<T>(table);
  },
  storage: {
    from: storageBucket,
  },
};

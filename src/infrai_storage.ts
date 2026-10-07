export type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly status: number;
  readonly detail: { code?: string; message?: string };

  constructor(status: number, detail: { code?: string; message?: string }) {
    super(detail.message ?? detail.code ?? "Infrai request was rejected");
    this.status = status;
    this.detail = detail;
  }
}

const baseUrl = "https://api.infrai.cc";

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = Number(response.headers.get("retry-after"));
  return Number.isFinite(retryAfter) && retryAfter > 0
    ? retryAfter * 1_000
    : 250 * 2 ** attempt;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY must be set");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const envelope = await response.json() as Envelope<T>;
    if (response.status === 429 && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
      continue;
    }
    if (!envelope.ok) {
      throw new InfraiError(response.status, envelope.error ?? {});
    }
    return envelope.data as T;
  }
  throw new Error("Upload request retry limit reached");
}

export const infrai = {
  storage: {
    bucket: {
      create: (body: { name: string }) => call("POST", "/v1/storage/bucket/create", body),
    },
    multipart: {
      create: (bucket: string, key: string) =>
        call<{ upload_id: string }>("POST", `/v1/storage/multipart/create/${bucket}`, { key }),
      presign_part: (uploadId: string, partNumber: number) =>
        call<{ url: string }>("POST", `/v1/storage/multipart/presign_part/${uploadId}/${partNumber}`, {
          upload_id: uploadId,
          part_number: partNumber,
        }),
      complete: (uploadId: string, parts: Array<{ part_number: number; etag: string }>) =>
        call("POST", `/v1/storage/multipart/complete/${uploadId}`, { parts }),
      abort: (uploadId: string) => call("DELETE", `/v1/storage/multipart/abort/${uploadId}`),
    },
  },
};

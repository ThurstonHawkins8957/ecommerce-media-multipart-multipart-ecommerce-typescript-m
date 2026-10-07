import { z } from "zod";
import { infrai, InfraiError } from "./infrai_storage.js";

export const orderMediaRequest = z.object({
  order_id: z.string().min(1),
  receipt_id: z.string().min(1),
  media_key: z.string().min(1),
  size_bytes: z.number().int().positive(),
  content_type: z.string().min(1),
});

export type OrderMediaRequest = z.infer<typeof orderMediaRequest>;
export type IntakeDecision = "accept" | "reject";

export function decideMediaIntake(input: OrderMediaRequest): IntakeDecision {
  return input.size_bytes > 5 * 1024 * 1024 ? "accept" : "reject";
}

export type UploadPlan = {
  order_id: string;
  receipt_id: string;
  media_key: string;
  upload_id: string;
  part_url: string;
  state: "awaiting_media";
};

export class OrderMediaIntake {
  private readonly started = new Set<string>();
  private readonly bucket: string;

  constructor(bucket: string) {
    this.bucket = bucket;
  }

  async prepare(raw: unknown): Promise<UploadPlan> {
    const input = orderMediaRequest.parse(raw);
    if (decideMediaIntake(input) === "reject") {
      throw new Error("Use the regular media path for files at or below 5 MiB");
    }
    const requestId = `${input.order_id}:${input.receipt_id}:${input.media_key}`;
    if (this.started.has(requestId)) {
      throw new Error("This order media intake is already active");
    }
    this.started.add(requestId);
    try {
      const created = await infrai.storage.multipart.create(this.bucket, input.media_key);
      const signed = await infrai.storage.multipart.presign_part(created.upload_id, 1);
      return {
        order_id: input.order_id,
        receipt_id: input.receipt_id,
        media_key: input.media_key,
        upload_id: created.upload_id,
        part_url: signed.url,
        state: "awaiting_media",
      };
    } catch (error) {
      this.started.delete(requestId);
      throw error;
    }
  }

  async finish(
    uploadId: string,
    parts: Array<{ part_number: number; etag: string }>,
  ): Promise<{ upload_id: string; state: "attached_to_order" }> {
    await infrai.storage.multipart.complete(uploadId, parts);
    return { upload_id: uploadId, state: "attached_to_order" };
  }

  async cancel(uploadId: string): Promise<{ upload_id: string; state: "cancelled" }> {
    await infrai.storage.multipart.abort(uploadId);
    return { upload_id: uploadId, state: "cancelled" };
  }
}

export function clientError(error: unknown): { status: number; body: object } {
  if (error instanceof z.ZodError) return { status: 400, body: { error: error.flatten() } };
  if (error instanceof InfraiError) return { status: error.status, body: { error: error.detail } };
  return { status: 409, body: { error: error instanceof Error ? error.message : "request rejected" } };
}

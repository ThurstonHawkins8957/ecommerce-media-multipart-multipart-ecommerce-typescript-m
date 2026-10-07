import { createServer } from "node:http";
import { OrderMediaIntake, clientError } from "./media_intake.js";
import { infrai } from "./infrai_storage.js";

const bucket = process.env.INFRAI_MEDIA_BUCKET ?? "commerce-order-media";
const intake = new OrderMediaIntake(bucket);

async function ensureBucket(): Promise<void> {
  await infrai.storage.bucket.create({ name: bucket });
}

function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let text = "";
    request.on("data", (chunk) => { text += chunk; });
    request.on("end", () => {
      try { resolve(JSON.parse(text)); } catch (error) { reject(error); }
    });
    request.on("error", reject);
  });
}

function send(response: import("node:http").ServerResponse, status: number, body: object): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

await ensureBucket();

createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/order-media") {
      send(response, 201, await intake.prepare(await readJson(request)));
      return;
    }
    if (request.method === "POST" && request.url?.startsWith("/order-media/complete/")) {
      const uploadId = request.url.split("/").at(-1) ?? "";
      const body = await readJson(request) as { parts: Array<{ part_number: number; etag: string }> };
      send(response, 200, await intake.finish(uploadId, body.parts));
      return;
    }
    if (request.method === "DELETE" && request.url?.startsWith("/order-media/")) {
      const uploadId = request.url.split("/").at(-1) ?? "";
      send(response, 200, await intake.cancel(uploadId));
      return;
    }
    send(response, 404, { error: "route not found" });
  } catch (error) {
    const mapped = clientError(error);
    send(response, mapped.status, mapped.body);
  }
}).listen(Number(process.env.PORT ?? 3000));

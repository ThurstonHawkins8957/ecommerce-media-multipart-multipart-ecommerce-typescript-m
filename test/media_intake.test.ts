import assert from "node:assert/strict";
import test from "node:test";
import { decideMediaIntake, orderMediaRequest } from "../src/media_intake.js";

test("large receipt media is routed to multipart intake", () => {
  const request = orderMediaRequest.parse({
    order_id: "ord_2048",
    receipt_id: "rcpt_2048",
    media_key: "orders/ord_2048/receipt.mov",
    size_bytes: 8 * 1024 * 1024,
    content_type: "video/quicktime",
  });
  assert.equal(decideMediaIntake(request), "accept");
});

test("small customer update media stays out of multipart intake", () => {
  const request = orderMediaRequest.parse({
    order_id: "ord_2049",
    receipt_id: "rcpt_2049",
    media_key: "orders/ord_2049/update.jpg",
    size_bytes: 2 * 1024 * 1024,
    content_type: "image/jpeg",
  });
  assert.equal(decideMediaIntake(request), "reject");
});

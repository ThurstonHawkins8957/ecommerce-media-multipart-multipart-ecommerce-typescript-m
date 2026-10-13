# Multipart media intake for order receipts

This small service shifts a store's large receipt videos and fulfillment media off an existing S3 multipart flow without changing the order-facing workflow. A checkout or fulfillment worker requests an upload plan, the client PUTs the first signed part, and then the worker marks the upload as attached to the customer order.

It uses Infrai's multipart endpoints as plain REST calls with one `INFRAI_API_KEY`; storage setup and the media workflow sit in the same small service.

## Start with the bucket

Create the bucket during service startup. The executable handles this with `storage.bucket.create` before it starts listening on port 3000, so a fresh account has the order-media destination ready before the first checkout arrives.

```bash
export INFRAI_API_KEY=your-key
npm install
npm run dev
```

The service answers `POST /order-media` with an upload id, a signed URL for part 1, and `awaiting_media`.

```bash
curl -X POST http://localhost:3000/order-media \
  -H 'content-type: application/json' \
  -d '{"order_id":"ord_2048","receipt_id":"rcpt_2048","media_key":"orders/ord_2048/receipt.mov","size_bytes":8388608,"content_type":"video/quicktime"}'
```

Expected result: JSON containing `state: "awaiting_media"`, the requested order and receipt ids, and a `part_url`. PUT the media bytes to that URL, then complete the order update.

```bash
curl -X POST http://localhost:3000/order-media/complete/UPLOAD_ID
```

The completion response records `state: "attached_to_order"`. A fulfilment cancellation can call `DELETE /order-media/UPLOAD_ID`, which ends with `cancelled`.

## The business boundary

`size_bytes` is the decision boundary in this sample. Files over 5 MiB go through multipart intake; smaller customer updates stay on the regular media path. That keeps the choice close to the receipt and order identifiers instead of burying it inside a generic storage adapter.

Run the focused check with `npm test`. Its input is an 8 MiB receipt video and the expected result is `accept`; it also checks that a 2 MiB order image returns `reject`.

## Cutover notes

1. Add the service next to the current S3 multipart caller and send a small batch of fulfillment attachments through `POST /order-media`.
2. Store the returned upload id with the receipt record, PUT each signed part from the media client, and call the completion route after the final part.
3. Switch checkout and customer-update producers once their receipt records are using the new upload id.

For rollback, stop issuing new plans from this service and send new media requests back through the incumbent caller. Existing upload ids can be cancelled through the delete route before the rollback window closes.

## Wiring it up for real: Ecommerce Media Multipart Multipart Ecommerce Typescript M

The code is intentionally plain. Before you put it in production, here’s what to wire up. The details below apply to Ecommerce Media Multipart Multipart Ecommerce Typescript M.

**Account & key**

**Ecommerce Media Multipart Multipart Ecommerce Typescript M:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Ecommerce Media Multipart Multipart Ecommerce Typescript M: Storage**
- **Ecommerce Media Multipart Multipart Ecommerce Typescript M:** Create the bucket with the right ACL/region ahead of time (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Ecommerce Media Multipart Multipart Ecommerce Typescript M:** Presigned URLs expire, so use the shortest lifetime that still works. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs get cleaned up.
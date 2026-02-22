/**
 * R2 storage abstraction — replaces @aws-sdk/client-s3 with native R2 bindings.
 * Every function takes the R2 bucket binding as first param (no module-level singleton).
 */

export async function downloadFile(bucket: R2Bucket, key: string): Promise<Uint8Array> {
  const obj = await bucket.get(key);
  if (!obj) throw new Error(`Not found: ${key}`);
  return new Uint8Array(await obj.arrayBuffer());
}

export async function downloadFileWithEtag(
  bucket: R2Bucket,
  key: string
): Promise<{ body: Uint8Array | null; etag: string | null }> {
  const obj = await bucket.get(key);
  if (!obj) return { body: null, etag: null };
  return { body: new Uint8Array(await obj.arrayBuffer()), etag: obj.etag };
}

export async function uploadFile(bucket: R2Bucket, key: string, body: Uint8Array): Promise<void> {
  await bucket.put(key, body);
}

export async function uploadFileConditional(
  bucket: R2Bucket,
  key: string,
  body: Uint8Array,
  etag: string
): Promise<void> {
  const result = await bucket.put(key, body, { onlyIf: { etagMatches: etag } });
  if (result === null) {
    const err = new Error(`Precondition failed: ${key}`) as Error & { status: number };
    err.status = 412;
    throw err;
  }
}

export async function listFiles(
  bucket: R2Bucket,
  prefix: string,
  maxKeys: number = 1000
): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;

  do {
    const listed = await bucket.list({
      prefix,
      limit: Math.min(maxKeys - keys.length, 1000),
      cursor,
    });
    for (const obj of listed.objects) {
      keys.push(obj.key);
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor && keys.length < maxKeys);

  return keys;
}

export async function deleteFile(bucket: R2Bucket, key: string): Promise<void> {
  await bucket.delete(key);
}

export async function deleteFiles(bucket: R2Bucket, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  // R2 delete accepts up to 1000 keys at once
  for (let i = 0; i < keys.length; i += 1000) {
    await bucket.delete(keys.slice(i, i + 1000));
  }
}

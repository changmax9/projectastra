import { createHash, createHmac, randomUUID } from "node:crypto";

const SOURCE_BUCKET = process.env.R2_SOURCE_BUCKET || "astra-pdf-sources";
const EVIDENCE_BUCKET = process.env.R2_EVIDENCE_BUCKET || "astra-pdf-evidence";
const MAX_PDF_BYTES = 500 * 1024 * 1024;
export const R2_MULTIPART_PART_SIZE = 10 * 1024 * 1024;
export const R2_MAX_PDF_BYTES = MAX_PDF_BYTES;

function config() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) throw new Error("Cloudflare R2 credentials are not configured.");
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    endpoint: process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`,
    evidencePublicUrl: (process.env.R2_EVIDENCE_PUBLIC_URL || "").replace(/\/+$/, "")
  };
}

function encodePath(value: string) {
  return value.split("/").map(encodeURIComponent).join("/");
}

function hash(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: string | Buffer, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function awsDate(date = new Date()) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

export function r2ObjectKey(prefix: string, fileName: string) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120);
  return `${prefix}/${randomUUID()}/${safeName}`;
}

export function r2PublicEvidenceUrl(objectKey: string) {
  const { evidencePublicUrl } = config();
  if (!evidencePublicUrl) throw new Error("R2_EVIDENCE_PUBLIC_URL is not configured.");
  return `${evidencePublicUrl}/${encodePath(objectKey)}`;
}

export function r2SignedUrl(input: {
  bucket: string;
  objectKey: string;
  method: "GET" | "PUT" | "POST" | "DELETE";
  expiresSeconds?: number;
  query?: Record<string, string>;
}) {
  const { accessKeyId, secretAccessKey, endpoint } = config();
  const now = new Date();
  const amzDate = awsDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const credential = `${accessKeyId}/${scope}`;
  const query = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": credential,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(input.expiresSeconds || 900),
    "X-Amz-SignedHeaders": "host",
    ...(input.query || {})
  });
  query.sort();
  const endpointUrl = new URL(endpoint);
  const canonicalUri = `/${encodeURIComponent(input.bucket)}/${encodePath(input.objectKey)}`;
  const canonicalRequest = [
    input.method,
    canonicalUri,
    query.toString(),
    `host:${endpointUrl.host}\n`,
    "host",
    "UNSIGNED-PAYLOAD"
  ].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, hash(canonicalRequest)].join("\n");
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, "auto");
  const serviceKey = hmac(regionKey, "s3");
  const signingKey = hmac(serviceKey, "aws4_request");
  query.set("X-Amz-Signature", createHmac("sha256", signingKey).update(stringToSign).digest("hex"));
  return `${endpointUrl.origin}${canonicalUri}?${query.toString()}`;
}

export async function r2Request(input: Parameters<typeof r2SignedUrl>[0] & { body?: BodyInit; headers?: HeadersInit }) {
  const response = await fetch(r2SignedUrl(input), { method: input.method, body: input.body, headers: input.headers });
  if (!response.ok) throw new Error(`R2 ${input.method} failed: ${response.status} ${await response.text()}`);
  return response;
}

export async function uploadEvidence(objectKey: string, bytes: Uint8Array, contentType = "image/png") {
  await r2Request({ bucket: EVIDENCE_BUCKET, objectKey, method: "PUT", body: bytes, headers: { "Content-Type": contentType } });
  return r2PublicEvidenceUrl(objectKey);
}

export async function deleteR2Object(bucket: string, objectKey: string) {
  await r2Request({ bucket, objectKey, method: "DELETE" });
}

export async function deleteR2Prefix(bucket: string, prefix: string) {
  let continuationToken = "";
  do {
    const response = await r2Request({
      bucket,
      objectKey: "",
      method: "GET",
      query: { "list-type": "2", prefix, ...(continuationToken ? { "continuation-token": continuationToken } : {}) }
    });
    const xml = await response.text();
    const decodeXml = (value: string) => value.replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">");
    const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((match) => decodeXml(match[1] || "")).filter(Boolean);
    await Promise.all(keys.map((key) => deleteR2Object(bucket, key)));
    continuationToken = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1] || "";
    if (continuationToken) continuationToken = decodeXml(continuationToken);
  } while (continuationToken);
}

export const r2Buckets = { source: SOURCE_BUCKET, evidence: EVIDENCE_BUCKET };

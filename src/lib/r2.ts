/**
 * Cloudflare R2 Bucket Wrapper Utility
 * Based on the official Workers API reference.
 * 
 * To use this in an Edge API Route, pass the bound R2 bucket to these functions.
 * Example: `const bucket = process.env.R2_BUCKET;` or `const bucket = getRequestContext().env.R2_BUCKET;`
 */

// Define the shape of the Cloudflare R2 bucket binding
export interface R2Bucket {
  head(key: string): Promise<R2Object | null>;
  get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | R2Object | null>;
  put(
    key: string,
    value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob,
    options?: R2PutOptions
  ): Promise<R2Object | null>;
  delete(key: string | string[]): Promise<void>;
  list(options?: R2ListOptions): Promise<R2Objects>;
  createMultipartUpload(key: string, options?: R2MultipartOptions): Promise<R2MultipartUpload>;
  resumeMultipartUpload(key: string, uploadId: string): R2MultipartUpload;
}

export interface R2Object {
  key: string;
  version: string;
  size: number;
  etag: string;
  httpEtag: string;
  uploaded: Date;
  httpMetadata?: Record<string, string>;
  customMetadata?: Record<string, string>;
  writeHttpMetadata?: (headers: Headers) => void;
  storageClass?: 'Standard' | 'InfrequentAccess';
  ssecKeyMd5?: string;
}

export interface R2ObjectBody extends R2Object {
  body: ReadableStream;
  bodyUsed: boolean;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  json<T>(): Promise<T>;
  blob(): Promise<Blob>;
}

export interface R2GetOptions {
  onlyIf?: any; // R2Conditional | Headers
  range?: any; // R2Range
  ssecKey?: ArrayBuffer | string;
}

export interface R2PutOptions {
  onlyIf?: any; // R2Conditional | Headers
  httpMetadata?: any; // R2HTTPMetadata | Headers
  customMetadata?: Record<string, string>;
  md5?: ArrayBuffer | string;
  sha1?: ArrayBuffer | string;
  sha256?: ArrayBuffer | string;
  sha384?: ArrayBuffer | string;
  sha512?: ArrayBuffer | string;
  storageClass?: 'Standard' | 'InfrequentAccess';
  ssecKey?: ArrayBuffer | string;
}

export interface R2ListOptions {
  limit?: number;
  prefix?: string;
  cursor?: string;
  delimiter?: string;
  include?: string[]; // e.g. ['httpMetadata', 'customMetadata']
}

export interface R2Objects {
  objects: R2Object[];
  truncated: boolean;
  cursor?: string;
  delimitedPrefixes: string[];
}

export interface R2MultipartOptions {
  httpMetadata?: any;
  customMetadata?: Record<string, string>;
  storageClass?: string;
  ssecKey?: ArrayBuffer | string;
}

export interface R2MultipartUpload {
  key: string;
  uploadId: string;
  uploadPart(partNumber: number, value: any, options?: R2MultipartOptions): Promise<any>;
  abort(): Promise<void>;
  complete(uploadedParts: any[]): Promise<R2Object>;
}

/**
 * Uploads a string, buffer, or stream to the specified R2 bucket.
 */
export async function uploadToR2(bucket: R2Bucket, key: string, data: string | ArrayBuffer | ReadableStream, options?: R2PutOptions): Promise<R2Object | null> {
  if (!bucket) throw new Error("R2_BUCKET binding is missing or not provided.");
  return await bucket.put(key, data, options);
}

/**
 * Fetches an object from the specified R2 bucket and returns it as a string.
 */
export async function fetchFromR2Text(bucket: R2Bucket, key: string): Promise<string | null> {
  if (!bucket) throw new Error("R2_BUCKET binding is missing or not provided.");
  const obj = await bucket.get(key);
  if (!obj) return null;
  // If the body exists (R2ObjectBody), return text. Otherwise return null.
  if ('text' in obj && typeof obj.text === 'function') {
    return await obj.text();
  }
  return null;
}

/**
 * Fetches an object from the specified R2 bucket and returns it as JSON.
 */
export async function fetchFromR2Json<T>(bucket: R2Bucket, key: string): Promise<T | null> {
  if (!bucket) throw new Error("R2_BUCKET binding is missing or not provided.");
  const obj = await bucket.get(key);
  if (!obj) return null;
  if ('json' in obj && typeof obj.json === 'function') {
    return await obj.json<T>();
  }
  return null;
}

/**
 * Lists objects in the specified R2 bucket with automatic pagination support.
 * Useful for grabbing all keys under a specific prefix.
 */
export async function listAllR2Objects(bucket: R2Bucket, options: R2ListOptions = {}): Promise<R2Object[]> {
  if (!bucket) throw new Error("R2_BUCKET binding is missing or not provided.");
  
  const allObjects: R2Object[] = [];
  let truncated = true;
  let cursor: string | undefined = options.cursor;

  while (truncated) {
    const nextList = await bucket.list({ ...options, cursor });
    allObjects.push(...nextList.objects);
    
    truncated = nextList.truncated;
    cursor = nextList.cursor;
  }

  return allObjects;
}

/**
 * Deletes one or multiple objects from the R2 bucket.
 */
export async function deleteFromR2(bucket: R2Bucket, key: string | string[]): Promise<void> {
  if (!bucket) throw new Error("R2_BUCKET binding is missing or not provided.");
  return await bucket.delete(key);
}

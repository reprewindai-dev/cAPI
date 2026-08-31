import { request as httpRequest, type IncomingHttpHeaders, type RequestOptions } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import {
  OutboundTargetError,
  validateOutboundTargetWithAddresses,
  type OutboundTargetOptions,
} from "./outbound-target";

export interface PinnedOutboundRequestOptions extends OutboundTargetOptions {
  method?: string;
  headers?: Headers | Record<string, string>;
  body?: ArrayBuffer | Uint8Array | string | null;
  signal?: AbortSignal;
}

export interface PinnedOutboundResponse {
  status: number;
  statusText: string;
  headers: Headers;
  body: Uint8Array;
  ok: boolean;
  json<T = unknown>(): T;
  arrayBuffer(): ArrayBuffer;
}

function headerRecord(headers?: Headers | Record<string, string>): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  return { ...headers };
}

function responseHeaders(input: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(input)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (value !== undefined) {
      headers.set(name, String(value));
    }
  }
  return headers;
}

export async function pinnedOutboundRequest(
  input: string | URL,
  options: PinnedOutboundRequestOptions = {},
): Promise<PinnedOutboundResponse> {
  const validated = await validateOutboundTargetWithAddresses(input.toString(), options);
  const pinnedAddress = validated.addresses[0];
  const family = isIP(pinnedAddress);
  if (family !== 4 && family !== 6) {
    throw new OutboundTargetError("OUTBOUND_DNS_UNAVAILABLE");
  }

  const headers = headerRecord(options.headers);
  const requestOptions: RequestOptions = {
    method: options.method ?? "GET",
    headers,
    signal: options.signal,
    lookup: (_hostname, _lookupOptions, callback) => {
      callback(null, pinnedAddress, family);
    },
  };

  // Keep the original hostname for Host and TLS SNI while the custom lookup
  // forces the socket to the exact address that passed policy validation.
  if (validated.url.protocol === "https:") {
    requestOptions.servername = validated.url.hostname;
  }

  const requestImpl = validated.url.protocol === "https:" ? httpsRequest : httpRequest;

  return await new Promise<PinnedOutboundResponse>((resolve, reject) => {
    const req = requestImpl(validated.url, requestOptions, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer | string) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      res.on("end", () => {
        const body = Buffer.concat(chunks);
        const status = res.statusCode ?? 502;
        const statusText = res.statusMessage ?? "";
        const headers = responseHeaders(res.headers);
        resolve({
          status,
          statusText,
          headers,
          body,
          ok: status >= 200 && status < 300,
          json<T = unknown>(): T {
            return JSON.parse(body.toString("utf8")) as T;
          },
          arrayBuffer(): ArrayBuffer {
            return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
          },
        });
      });
      res.on("error", reject);
    });

    req.on("error", reject);

    if (options.body !== undefined && options.body !== null) {
      req.write(
        typeof options.body === "string"
          ? options.body
          : Buffer.from(options.body instanceof Uint8Array ? options.body : new Uint8Array(options.body)),
      );
    }
    req.end();
  });
}

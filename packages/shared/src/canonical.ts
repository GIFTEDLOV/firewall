import { sha256, toBytes, type Hex } from "viem";

export type CanonicalValue =
  | string
  | number
  | boolean
  | null
  | CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

function assertCanonicalNumber(value: number): void {
  if (!Number.isFinite(value)) {
    throw new TypeError("Canonical values cannot contain NaN or Infinity");
  }
}

function encode(value: CanonicalValue): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    assertCanonicalNumber(value);
    return Object.is(value, -0) ? "0" : JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(encode).join(",")}]`;

  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${encode(value[key]!)}`).join(",")}}`;
}

/** RFC 8785-shaped canonical JSON for the JSON-compatible values used by Firewall. */
export function canonicalJson(value: CanonicalValue): string {
  return encode(value);
}

export function hashCanonical(value: CanonicalValue): Hex {
  return sha256(toBytes(canonicalJson(value)));
}

export function hashHex(hex: Hex): Hex {
  return sha256(hex);
}

export function hashUtf8(value: string): Hex {
  return sha256(toBytes(value));
}

export function normalizeHex(value: string, byteLength?: number): Hex {
  const normalized = value.toLowerCase();
  if (!/^0x[0-9a-f]*$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new TypeError("Expected an even-length 0x-prefixed hexadecimal string");
  }
  if (byteLength !== undefined && (normalized.length - 2) / 2 !== byteLength) {
    throw new TypeError(`Expected ${byteLength} bytes`);
  }
  return normalized as Hex;
}

export function bytesLength(hex: Hex): number {
  return (hex.length - 2) / 2;
}

export function compareHex(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

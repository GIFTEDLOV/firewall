export type EntityPrefix = "MAN" | "PRP" | "EXE" | "EVD" | "ADJ" | "PRM";

export function formatEntityId(prefix: EntityPrefix, sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new RangeError("Entity sequence must be a positive safe integer");
  }
  return `${prefix}-${String(sequence).padStart(8, "0")}`;
}

export function isEntityId(prefix: EntityPrefix, value: string): boolean {
  return new RegExp(`^${prefix}-\\d{8}$`).test(value);
}

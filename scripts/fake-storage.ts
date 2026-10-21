// Storage adapters for the self-checks (the lib/storage.ts seam): a Map, and storage that always throws.
import type { KeyValueStorage } from "../lib/storage";

export const memory = (): KeyValueStorage & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    keys: () => [...map.keys()],
  };
};

const blocked = (): never => {
  throw new Error("blocked"); // private mode, quota, blocked site data
};
export const broken: KeyValueStorage = { getItem: blocked, setItem: blocked, removeItem: blocked, keys: blocked };

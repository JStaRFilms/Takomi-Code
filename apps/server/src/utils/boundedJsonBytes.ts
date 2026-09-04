function stringBytes(value: string, limit: number): number {
  let bytes = 2; // JSON quotes
  for (let index = 0; index < value.length && bytes <= limit; index += 1) {
    const code = value.charCodeAt(index);
    if (
      code === 0x22 ||
      code === 0x5c ||
      code === 0x08 ||
      code === 0x09 ||
      code === 0x0a ||
      code === 0x0c ||
      code === 0x0d
    ) {
      bytes += 2;
    } else if (code < 0x20) {
      bytes += 6;
    } else if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 6;
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      bytes += 6;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

/** Returns at most `limit + 1` without materializing a serialized payload. */
export function boundedJsonBytes(value: unknown, limit: number): number {
  const seen = new WeakSet<object>();
  let bytes = 0;

  const add = (amount: number) => {
    bytes = Math.min(limit + 1, bytes + amount);
  };

  const visit = (current: unknown): void => {
    if (bytes > limit) return;
    if (current === null) {
      add(4);
      return;
    }
    switch (typeof current) {
      case "string":
        add(stringBytes(current, limit - bytes));
        return;
      case "number":
        add(Number.isFinite(current) ? String(current).length : 4);
        return;
      case "boolean":
        add(current ? 4 : 5);
        return;
      case "undefined":
      case "function":
      case "symbol":
        add(4);
        return;
      case "bigint":
        add(limit + 1);
        return;
      case "object":
        break;
    }

    if (seen.has(current)) {
      add(limit + 1);
      return;
    }
    seen.add(current);
    if (Array.isArray(current)) {
      add(2);
      for (let index = 0; index < current.length; index += 1) {
        if (bytes > limit) break;
        if (index > 0) add(1);
        visit(current[index]);
      }
      return;
    }

    add(2);
    let emitted = 0;
    for (const key of Object.keys(current)) {
      const child = Reflect.get(current, key);
      if (child === undefined || typeof child === "function" || typeof child === "symbol") continue;
      if (emitted > 0) add(1);
      add(stringBytes(key, limit - bytes));
      add(1);
      visit(child);
      emitted += 1;
      if (bytes > limit) return;
    }
  };

  visit(value);
  return bytes;
}

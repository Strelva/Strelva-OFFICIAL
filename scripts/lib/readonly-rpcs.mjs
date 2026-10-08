// Each root uses its exact signature/body. Transitive calls conservatively
// consider overloads because source alone cannot resolve every argument type. Every branch gets its own
// visited set; memoizing a cycle's null result can hide a later locking path.
export function findReadonlyLockPaths(rows) {
  const cleanBody = (body) => body.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const functions = new Map();
  for (const row of rows) {
    const body = cleanBody(row.body);
    functions.set(row.name, [...(functions.get(row.name) ?? []), { ...row, body }]);
  }
  const lock = /\bfor\s+(?:no\s+key\s+update|key\s+share|share|update)\b(?!\s+each\b)/i;
  const calls = /\b(?:public\.)?([a-z_][a-z_0-9]*)\s*\(/gi;
  function path(name, ancestors = new Set(), definitions = functions.get(name) ?? []) {
    if (ancestors.has(name)) return null;
    const visited = new Set([...ancestors, name]);
    for (const definition of definitions) {
      if (lock.test(definition.body)) return [name];
      for (const match of definition.body.matchAll(calls)) {
        if (!functions.has(match[1])) continue;
        const below = path(match[1], visited);
        if (below) return [name, ...below];
      }
    }
    return null;
  }
  return rows.filter((row) => row.volatility === "s" || row.volatility === "i")
    .flatMap((row) => {
      const locks = path(row.name, new Set(), [{ ...row, body: cleanBody(row.body) }]);
      return locks ? [`${row.signature ?? row.name}: ${locks.join(" -> ")}`] : [];
    }).sort();
}

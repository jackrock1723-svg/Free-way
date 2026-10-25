export function mergeProjectList(serverValues, currentValues) {
  const merged = new Map();

  for (const item of Array.isArray(currentValues) ? currentValues : []) {
    if (!item || typeof item.id !== 'string' || !item.id.trim()) continue;
    const name = typeof item.name === 'string' && item.name.trim() ? item.name : item.id;
    merged.set(item.id, { id: item.id, name });
  }

  for (const value of Array.isArray(serverValues) ? serverValues : []) {
    const id = typeof value === 'string' ? value : value?.id;
    if (typeof id !== 'string' || !id.trim()) continue;
    const previous = merged.get(id);
    const name = typeof value === 'object' && typeof value.name === 'string' && value.name.trim()
      ? value.name
      : previous?.name || id;
    merged.set(id, { id, name });
  }

  return [...merged.values()];
}

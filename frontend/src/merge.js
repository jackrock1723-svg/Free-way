export function mergeRequestPayload(agent) {
  return { override: agent?.checks === 'failed' };
}

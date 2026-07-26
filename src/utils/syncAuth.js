export function isAuthorizedSyncRequest(req, secret) {
  const providedKey = req?.query?.key || req?.body?.key || "";
  return typeof secret === 'string' && secret.length > 0 && providedKey === secret;
}

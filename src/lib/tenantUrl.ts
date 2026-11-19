/**
 * Resolves the tenant identifier strictly from the application URL:
 * 1. Path segment: /[tenant]/... (e.g. /blipkart/admin/documents -> 'blipkart')
 * 2. Query param: ?tenant=... or ?tenantId=... (e.g. /admin/documents?tenant=blipkart -> 'blipkart')
 * 3. Default fallback: 'smk_tenant'
 */
export function getTenantFromUrl(defaultTenant = "smk_tenant"): string {
  if (typeof window === "undefined") return defaultTenant;

  // 1. Path segment check: /[tenant]/admin/... or /[tenant]/widget
  const pathSegments = window.location.pathname.split("/").filter(Boolean);
  if (pathSegments.length > 0) {
    const first = pathSegments[0].toLowerCase();
    // Exclude static and reserved top-level paths
    if (
      ![
        "admin",
        "api",
        "support",
        "widget",
        "_next",
        "favicon.ico",
        "embed.js",
        "images",
      ].includes(first)
    ) {
      return pathSegments[0];
    }
  }

  // 2. Query parameter check: ?tenant=... or ?tenantId=...
  const urlParams = new URLSearchParams(window.location.search);
  const param = urlParams.get("tenant") || urlParams.get("tenantId");
  if (param && param.trim()) {
    return param.trim();
  }

  return defaultTenant;
}

/**
 * Builds a tenant-scoped path for links and navigation.
 * If tenant is custom (e.g. 'blipkart'), prefixes /blipkart
 * If tenant is default ('smk_tenant' or 'tenant_smk_default'), keeps standard path.
 */
export function buildTenantPath(path: string, tenantId?: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const effectiveTenant = tenantId || getTenantFromUrl("smk_tenant");

  if (
    !effectiveTenant ||
    effectiveTenant === "smk_tenant" ||
    effectiveTenant === "tenant_smk_default"
  ) {
    return cleanPath;
  }

  // Avoid double-prefixing
  if (
    cleanPath.startsWith(`/${effectiveTenant}/`) ||
    cleanPath === `/${effectiveTenant}`
  ) {
    return cleanPath;
  }

  return `/${encodeURIComponent(effectiveTenant)}${cleanPath}`;
}

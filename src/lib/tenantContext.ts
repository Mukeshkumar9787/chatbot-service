import { AsyncLocalStorage } from "async_hooks";

export const DEFAULT_TENANT_ID = "tenant_smk_default";

export interface TenantContextData {
  tenantId: string;
  bypassRls?: boolean;
}

const tenantStorage =
  (globalThis as any).__chatbotTenantStorage ||
  ((globalThis as any).__chatbotTenantStorage = new AsyncLocalStorage<TenantContextData>());

export function runWithTenant<T>(
  tenantId: string,
  callback: () => T | Promise<T>,
  options: { bypassRls?: boolean } = {}
): T | Promise<T> {
  const current = tenantStorage.getStore() || { tenantId: DEFAULT_TENANT_ID };
  return tenantStorage.run(
    {
      ...current,
      tenantId: tenantId?.trim() || current.tenantId || DEFAULT_TENANT_ID,
      bypassRls: options.bypassRls !== undefined ? Boolean(options.bypassRls) : Boolean(current.bypassRls),
    },
    callback
  );
}

export function runWithBypass<T>(callback: () => T | Promise<T>): T | Promise<T> {
  const current = tenantStorage.getStore() || { tenantId: DEFAULT_TENANT_ID };
  return tenantStorage.run(
    {
      ...current,
      bypassRls: true,
    },
    callback
  );
}

export function getTenantContext(): TenantContextData | null {
  return tenantStorage.getStore() || null;
}

export function getCurrentTenantId(): string {
  return tenantStorage.getStore()?.tenantId || DEFAULT_TENANT_ID;
}

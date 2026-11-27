import type { DatabaseLoadStatus, ErpEntityType } from './erpDatabaseService';
import type {
  PagedEntityQueryInput,
  PagedEntityQueryResult,
} from './backendDataEngine';

export interface BackendBootstrapResponse {
  ok: boolean;
  status: DatabaseLoadStatus;
  message: string;
  recordCount: number;
  data: Partial<Record<ErpEntityType, unknown[]>>;
  latencyMs?: number;
}

export interface BackendPageDataResponse {
  ok: boolean;
  status: DatabaseLoadStatus;
  message: string;
  pageId: string;
  requiredEntities: ErpEntityType[];
  data: Partial<Record<ErpEntityType, unknown[]>>;
  entityCounts?: Partial<Record<ErpEntityType, number>>;
  latencyMs?: number;
}

export interface BackendPagedQueryResponse<T = unknown>
  extends PagedEntityQueryResult<T> {
  ok: boolean;
  message?: string;
  latencyMs?: number;
}

export interface BackendQueryContext {
  tenantId: string;
  roleCode?: string;
  allowedShopIds?: string[];
  queryVersion?: number;
}

export async function fetchErpBootstrap(): Promise<BackendBootstrapResponse> {
  try {
    const res = await fetch('/api/erp/bootstrap', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    const data = await res.json();
    return {
      ok: Boolean(data?.ok),
      status: (data?.status as DatabaseLoadStatus) || 'ERROR',
      message: String(data?.message || ''),
      recordCount: Number(data?.recordCount || 0),
      data: (data?.data as Partial<Record<ErpEntityType, unknown[]>>) || {},
      latencyMs: typeof data?.latencyMs === 'number' ? data.latencyMs : undefined,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      status: 'ERROR',
      message: `无法连接后台数据接口: ${err instanceof Error ? err.message : String(err)}`,
      recordCount: 0,
      data: {},
    };
  }
}

export async function fetchErpPageData(params: {
  pageId: string;
  tenantId?: string;
  roleCode?: string;
  allowedShopIds?: string[];
  signal?: AbortSignal;
}): Promise<BackendPageDataResponse> {
  try {
    const res = await fetch('/api/erp/page-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        pageId: params.pageId,
        tenantId: params.tenantId,
        roleCode: params.roleCode,
        allowedShopIds: params.allowedShopIds,
      }),
      signal: params.signal,
    });
    const data = await res.json();
    return {
      ok: Boolean(data?.ok),
      status: (data?.status as DatabaseLoadStatus) || (res.ok ? 'LOADED' : 'ERROR'),
      message: String(data?.message || ''),
      pageId: String(data?.pageId || params.pageId),
      requiredEntities: Array.isArray(data?.requiredEntities) ? data.requiredEntities : [],
      data: (data?.data as Partial<Record<ErpEntityType, unknown[]>>) || {},
      entityCounts: data?.entityCounts,
      latencyMs: typeof data?.latencyMs === 'number' ? data.latencyMs : undefined,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      status: 'ERROR',
      message: err instanceof Error ? err.message : String(err),
      pageId: params.pageId,
      requiredEntities: [],
      data: {},
    };
  }
}

export async function queryErpPagedData<T = unknown>(
  params: Omit<PagedEntityQueryInput, 'exchangeRates' | 'nowDate'> & {
    signal?: AbortSignal;
  }
): Promise<BackendPagedQueryResponse<T>> {
  const { signal, ...body } = params;
  try {
    const res = await fetch('/api/erp/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    const data = await res.json();
    return {
      ok: Boolean(data?.ok),
      entityType: (data?.entityType as ErpEntityType) || params.entityType,
      page: Number(data?.page || params.page || 1),
      pageSize: Number(data?.pageSize || params.pageSize || 20),
      totalItems: Number(data?.totalItems || 0),
      totalPages: Math.max(1, Number(data?.totalPages || 1)),
      items: Array.isArray(data?.items) ? (data.items as T[]) : [],
      summary: data?.summary,
      message: typeof data?.message === 'string' ? data.message : undefined,
      latencyMs: typeof data?.latencyMs === 'number' ? data.latencyMs : undefined,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      entityType: params.entityType,
      page: params.page || 1,
      pageSize: params.pageSize || 20,
      totalItems: 0,
      totalPages: 1,
      items: [],
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function invalidateErpBackendCache(
  entityTypes?: ErpEntityType[],
  tenantId?: string
): Promise<void> {
  try {
    await fetch('/api/erp/cache/invalidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityTypes, tenantId }),
    });
  } catch {
    // Best-effort cache invalidation
  }
}

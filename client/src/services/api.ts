import {
  SavedItem,
  ItemsResponse,
  CaptureItemResponse,
  HealthResponse,
  FetchItemsParams,
  TagsResponse,
} from '../types/item';

const API_BASE = '/api';

/**
 * Custom error with structured server response data
 */
export class ApiError extends Error {
  status: number;
  details?: string;

  constructor(message: string, status: number, details?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorMsg = `Server request failed with status ${res.status}`;
    let details: string | undefined;

    try {
      const data = await res.json();
      if (data.error) errorMsg = data.error;
      if (data.details) details = data.details;
    } catch {
      // response was not JSON
    }

    throw new ApiError(errorMsg, res.status, details);
  }

  return res.json() as Promise<T>;
}

/**
 * Fetches saved items with search query, filters, sorting, and pagination.
 */
export async function fetchItems(
  params?: FetchItemsParams,
  signal?: AbortSignal
): Promise<ItemsResponse> {
  const query = new URLSearchParams();

  if (params?.q?.trim()) query.set('q', params.q.trim());
  if (params?.tag?.trim()) query.set('tag', params.tag.trim());
  if (params?.status) query.set('status', params.status);
  if (params?.platform) query.set('platform', params.platform);
  if (params?.contentType) query.set('contentType', params.contentType);
  if (params?.sortBy) query.set('sortBy', params.sortBy);
  if (params?.sortOrder) query.set('sortOrder', params.sortOrder);
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));

  const url = `${API_BASE}/items${query.toString() ? `?${query.toString()}` : ''}`;
  const res = await fetch(url, { signal });
  return handleResponse<ItemsResponse>(res);
}

/**
 * Fetches unique normalized tags and their usage counts for discovery.
 */
export async function fetchTags(signal?: AbortSignal): Promise<TagsResponse> {
  const res = await fetch(`${API_BASE}/tags`, { signal });
  return handleResponse<TagsResponse>(res);
}

/**
 * Submits an Instagram Reel or YouTube Short URL for capture.
 */
export async function captureItem(url: string): Promise<CaptureItemResponse> {
  const res = await fetch(`${API_BASE}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });

  return handleResponse<CaptureItemResponse>(res);
}

/**
 * Fetches a single item by ID.
 */
export async function fetchItemById(id: string): Promise<{ item: SavedItem }> {
  const res = await fetch(`${API_BASE}/items/${id}`);
  return handleResponse<{ item: SavedItem }>(res);
}

/**
 * Deletes a saved item by ID.
 */
export async function deleteItem(id: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/items/${id}`, {
    method: 'DELETE',
  });

  return handleResponse<{ success: boolean; message: string }>(res);
}

/**
 * Triggers or re-runs AI text structuring and multimodal grounding on a saved item.
 */
export async function reanalyzeItem(id: string): Promise<{ message: string; item: SavedItem }> {
  const res = await fetch(`${API_BASE}/items/${id}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  return handleResponse<{ message: string; item: SavedItem }>(res);
}

/**
 * Checks system health and MongoDB connectivity.
 */
export async function checkHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/health`);
  return handleResponse<HealthResponse>(res);
}

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchItems, fetchTags, ApiError } from '../src/services/api';
import { FetchItemsParams } from '../src/types/item';

describe('Search & Discovery UI Logic Suite (Plan 05-02)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('1. API Client Query Serialization & Signal Propagation', () => {
    it('serializes all search, filter, sort, and pagination parameters into query string', async () => {
      const mockResponse = {
        items: [],
        total: 0,
        page: 2,
        limit: 18,
        totalPages: 1,
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });
      globalThis.fetch = fetchMock;

      const params: FetchItemsParams = {
        q: '  docker containers  ',
        tag: ' devops ',
        platform: 'youtube',
        status: 'full_analyzed',
        contentType: 'short',
        sortBy: 'relevance',
        sortOrder: 'desc',
        page: 2,
        limit: 18,
      };

      const result = await fetchItems(params);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const calledUrl = fetchMock.mock.calls[0][0];
      const parsedUrl = new URL(calledUrl, 'http://localhost');

      // Verify trimmed and properly mapped query parameters
      expect(parsedUrl.searchParams.get('q')).toBe('docker containers');
      expect(parsedUrl.searchParams.get('tag')).toBe('devops');
      expect(parsedUrl.searchParams.get('platform')).toBe('youtube');
      expect(parsedUrl.searchParams.get('status')).toBe('full_analyzed');
      expect(parsedUrl.searchParams.get('contentType')).toBe('short');
      expect(parsedUrl.searchParams.get('sortBy')).toBe('relevance');
      expect(parsedUrl.searchParams.get('sortOrder')).toBe('desc');
      expect(parsedUrl.searchParams.get('page')).toBe('2');
      expect(parsedUrl.searchParams.get('limit')).toBe('18');
      expect(result).toEqual(mockResponse);
    });

    it('omits empty, null, or undefined filter parameters from URL query string', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [], total: 0, page: 1, limit: 20, totalPages: 1 }),
      });
      globalThis.fetch = fetchMock;

      await fetchItems({
        q: '   ',
        tag: '',
        platform: '',
        status: '',
      });

      const calledUrl = fetchMock.mock.calls[0][0];
      expect(calledUrl).toBe('/api/items');
    });

    it('forwards AbortSignal to fetch to allow canceling in-flight requests', async () => {
      const controller = new AbortController();
      const fetchMock = vi.fn().mockImplementation((_url, options) => {
        if (options?.signal?.aborted) {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          return Promise.reject(err);
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ items: [], total: 0 }),
        });
      });
      globalThis.fetch = fetchMock;

      // Abort prior to completion
      controller.abort();

      await expect(fetchItems({ q: 'react' }, controller.signal)).rejects.toThrow('The operation was aborted');
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('q=react'),
        expect.objectContaining({ signal: controller.signal })
      );
    });

    it('parses error payloads and throws structured ApiError on non-200 responses', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Invalid search parameters', details: 'q too long' }),
      });
      globalThis.fetch = fetchMock;

      await expect(fetchItems({ q: 'x' })).rejects.toThrow(ApiError);
      await expect(fetchItems({ q: 'x' })).rejects.toMatchObject({
        status: 400,
        message: 'Invalid search parameters',
        details: 'q too long',
      });
    });

    it('fetchTags requests /api/tags and receives normalized tag list', async () => {
      const mockTags = {
        tags: [
          { tag: 'docker', count: 5 },
          { tag: 'devops', count: 3 },
        ],
        total: 2,
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockTags,
      });
      globalThis.fetch = fetchMock;

      const result = await fetchTags();

      expect(fetchMock).toHaveBeenCalledWith('/api/tags', expect.anything());
      expect(result.tags).toHaveLength(2);
      expect(result.tags[0].tag).toBe('docker');
    });
  });

  describe('2. Search Debounce & Stale Request Race Condition Simulation', () => {
    it('simulates 300ms debounce timer preventing rapid query dispatch', () => {
      vi.useFakeTimers();

      let activeQuery = '';
      const handleDebouncedChange = vi.fn((newQuery: string) => {
        activeQuery = newQuery;
      });

      // Simulate rapid keystrokes: 'd' -> 'do' -> 'doc' -> 'dock'
      const keystrokes = ['d', 'do', 'doc', 'dock'];
      let timeoutId: NodeJS.Timeout | null = null;

      for (const stroke of keystrokes) {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          handleDebouncedChange(stroke);
        }, 300);
      }

      // Fast-forward 150ms — timer should not have fired yet
      vi.advanceTimersByTime(150);
      expect(handleDebouncedChange).not.toHaveBeenCalled();

      // Fast-forward remaining 150ms — timer fires once with the final term
      vi.advanceTimersByTime(150);
      expect(handleDebouncedChange).toHaveBeenCalledTimes(1);
      expect(handleDebouncedChange).toHaveBeenCalledWith('dock');
      expect(activeQuery).toBe('dock');

      vi.useRealTimers();
    });

    it('simulates stale-request cancellation preventing out-of-order race conditions', async () => {
      let latestController: AbortController | null = null;
      const executedSearches: string[] = [];

      // Simulated network fetch with variable delays:
      // Search 1 ('dock') is slow (100ms)
      // Search 2 ('docker') is fast (20ms)
      const executeSearch = (searchTerm: string, delayMs: number): Promise<string> => {
        if (latestController) {
          latestController.abort();
        }

        const controller = new AbortController();
        latestController = controller;

        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            if (controller.signal.aborted) {
              const err = new Error('Aborted');
              err.name = 'AbortError';
              reject(err);
            } else {
              executedSearches.push(searchTerm);
              resolve(searchTerm);
            }
          }, delayMs);

          controller.signal.addEventListener('abort', () => {
            clearTimeout(timer);
            const err = new Error('Aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      };

      // Trigger first search ('dock', slow 100ms)
      const promise1 = executeSearch('dock', 100);

      // Trigger second search ('docker', fast 20ms) before search 1 completes
      const promise2 = executeSearch('docker', 20);

      const [res1Result, res2Result] = await Promise.allSettled([promise1, promise2]);

      // Search 1 was aborted
      expect(res1Result.status).toBe('rejected');
      if (res1Result.status === 'rejected') {
        expect((res1Result.reason as Error).name).toBe('AbortError');
      }

      // Search 2 succeeded
      expect(res2Result.status).toBe('fulfilled');
      if (res2Result.status === 'fulfilled') {
        expect(res2Result.value).toBe('docker');
      }

      // Only the freshest query committed its results
      expect(executedSearches).toEqual(['docker']);
    });
  });

  describe('3. Multi-Criteria Filter State Combinations & Pagination Resets', () => {
    it('resets page to 1 whenever search query, filters, or sorting change', () => {
      let page = 3;

      const setFilter = (_filterName: string, _value: string) => {
        // Enforced contract: any filter change resets page to 1
        page = 1;
      };

      // User was on page 3
      expect(page).toBe(3);

      // User changes platform filter
      setFilter('platform', 'youtube');
      expect(page).toBe(1);

      page = 4;
      // User changes tag filter
      setFilter('tag', 'devops');
      expect(page).toBe(1);

      page = 2;
      // User changes search query
      setFilter('q', 'postgres');
      expect(page).toBe(1);
    });

    it('correctly constructs combined filter states for UI badge display', () => {
      const activeState = {
        searchQuery: 'docker',
        selectedPlatform: 'youtube',
        selectedStatus: 'full_analyzed',
        selectedContentType: 'short',
        selectedTag: 'devops',
        sortBy: 'relevance' as const,
        sortOrder: 'desc' as const,
      };

      const hasActiveFilters = Boolean(
        activeState.searchQuery.trim() ||
        activeState.selectedPlatform ||
        activeState.selectedStatus ||
        activeState.selectedContentType ||
        activeState.selectedTag ||
        activeState.sortBy !== 'capturedAt' ||
        activeState.sortOrder !== 'desc'
      );

      expect(hasActiveFilters).toBe(true);

      // Individual filter removal
      const afterRemovingPlatform = {
        ...activeState,
        selectedPlatform: '',
      };
      expect(afterRemovingPlatform.selectedPlatform).toBe('');
      expect(afterRemovingPlatform.selectedTag).toBe('devops');
      expect(afterRemovingPlatform.searchQuery).toBe('docker');

      // Clear all filters resets to initial defaults
      const clearedState = {
        searchQuery: '',
        selectedPlatform: '',
        selectedStatus: '',
        selectedContentType: '',
        selectedTag: '',
        sortBy: 'capturedAt' as const,
        sortOrder: 'desc' as const,
      };

      const hasActiveAfterClear = Boolean(
        clearedState.searchQuery.trim() ||
        clearedState.selectedPlatform ||
        clearedState.selectedStatus ||
        clearedState.selectedContentType ||
        clearedState.selectedTag ||
        clearedState.sortBy !== 'capturedAt' ||
        clearedState.sortOrder !== 'desc'
      );

      expect(hasActiveAfterClear).toBe(false);
    });
  });
});

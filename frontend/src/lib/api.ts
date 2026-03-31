class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface BlobResponse {
  blob: Blob;
  filename: string;
  contentType: string;
}

export interface UploadFileProgress {
  loaded: number;
  total: number;
  percent: number;
  speed: number;
  elapsed: number;
}

export interface UploadFileOptions {
  onProgress?: (progress: UploadFileProgress) => void;
}

export interface TrashItem {
  id: string;
  original_path: string;
  trash_path: string;
  item_name: string;
  is_directory: boolean;
  size: number;
  deleted_at?: string;
}

export interface BatchTrashResponse {
  success: boolean;
  restored?: string[];
  deleted?: string[];
  failed: Array<{ id: string; error: string }>;
}

export interface AuditLogItem {
  id?: number;
  relative_path: string;
  event_type: 'view' | 'download';
  created_at?: string;
  ip_address?: string | null;
  user_agent?: string | null;
  access_scope?: string | null;
  title?: string | null;
}

export interface AuditLogsResponse {
  items: AuditLogItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface SystemStats {
  appVersion: string;
  deploymentMode: 'docker' | 'pm2' | 'node';
  rootPath: string;
  dbPath: string;
  frontendDistPath: string;
  frontendIndexExists: boolean;
  dbExists: boolean;
  dbSize: number;
  rootExists: boolean;
  nodeVersion: string;
  platform: string;
  arch: string;
  hostname: string;
  pid: number;
  cwd: string;
  uptime: number;
  osUptime: number;
  memoryUsage: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
    arrayBuffers: number;
  };
  systemMemory: {
    total: number;
    free: number;
    used: number;
  };
  cpu: {
    model: string;
    cores: number;
    loadavg: number[];
  };
  counters: {
    sharedCount: number;
    trashCount: number;
    recentActivity: number;
    auditEventDays: number;
  };
  disk: {
    total: number | null;
    free: number | null;
    used: number | null;
    usagePercent: number | null;
    blockSize: number | null;
  };
  activityTrend: Array<{
    date: string;
    view_count: number;
    download_count: number;
    total: number;
  }>;
  dbHealth: {
    status: 'healthy' | 'warning' | 'error';
    label: string;
    journalMode: string | null;
    message: string;
    updatedAt: string | null;
  };
  runtime: {
    env: string;
    startedAt: string;
    pm2Id: number | null;
    port: number;
    caddyDomain: string | null;
  };
}

function buildHeaders(options: RequestInit = {}) {
  const token = localStorage.getItem('yunlist_token');
  const headers = new Headers(options.headers);

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (!headers.has('Content-Type') && !(options.body instanceof FormData) && options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  return headers;
}

function parseFilename(contentDisposition: string | null, fallback = 'download') {
  if (!contentDisposition) return fallback;

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const simpleMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  if (simpleMatch?.[1]) {
    return decodeURIComponent(simpleMatch[1]);
  }

  return fallback;
}

export function triggerBlobDownload(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = buildHeaders(options);

  // 使用相对路径以触发配置在 Vite 中的 Proxy，或者在生成环境下同源
  const response = await fetch(`${endpoint}`, {
    ...options,
    headers,
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    // 处理 Token 失效
    if (response.status === 401 && endpoint !== '/api/login') {
      localStorage.removeItem('yunlist_token');
      window.location.reload();
    }
    throw new ApiError(response.status, data?.error || 'API Request Failed');
  }

  return data as T;
}

async function requestBlob(endpoint: string, options: RequestInit = {}, fallbackFilename = 'download'): Promise<BlobResponse> {
  const headers = buildHeaders(options);
  const response = await fetch(`${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const isJson = response.headers.get('content-type')?.includes('application/json');
    const data = isJson ? await response.json() : null;

    if (response.status === 401 && endpoint !== '/api/login') {
      localStorage.removeItem('yunlist_token');
      window.location.reload();
    }

    throw new ApiError(response.status, data?.error || 'API Request Failed');
  }

  return {
    blob: await response.blob(),
    filename: parseFilename(response.headers.get('Content-Disposition'), fallbackFilename),
    contentType: response.headers.get('content-type') || 'application/octet-stream',
  };
}

export const api = {
  login: (password: string) =>
    request<{token: string}>('/api/login', {
      method: 'POST',
      body: JSON.stringify({ password })
    }),

  getFiles: (dirPath: string = '') =>
    request<{files: any[] }>(`/api/admin/files?dirPath=${encodeURIComponent(dirPath)}`),

  mkdir: (dirPath: string, name: string) =>
    request<{success: boolean}>('/api/admin/mkdir', {
      method: 'POST',
      body: JSON.stringify({ dirPath, name })
    }),

  uploadFile: (dirPath: string, file: File, options: UploadFileOptions = {}) => {
    const formData = new FormData();
    formData.append('dirPath', dirPath);
    formData.append('file', file);

    return new Promise<{ success: boolean; relativePath: string }>((resolve, reject) => {
      const token = localStorage.getItem('yunlist_token');
      const xhr = new XMLHttpRequest();
      const startedAt = Date.now();

      xhr.open('POST', '/api/admin/upload', true);

      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;

        const total = event.total || file.size || event.loaded;
        const elapsed = Math.max((Date.now() - startedAt) / 1000, 0.001);

        options.onProgress?.({
          loaded: event.loaded,
          total,
          percent: total > 0 ? Math.min((event.loaded / total) * 100, 100) : 0,
          speed: event.loaded / elapsed,
          elapsed,
        });
      };

      xhr.onerror = () => {
        reject(new ApiError(0, '网络异常，上传失败'));
      };

      xhr.onabort = () => {
        reject(new ApiError(0, '上传已取消'));
      };

      xhr.onload = () => {
        let data: any = null;

        try {
          data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        } catch {
          data = null;
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data as { success: boolean; relativePath: string });
          return;
        }

        if (xhr.status === 401) {
          localStorage.removeItem('yunlist_token');
          window.location.reload();
          return;
        }

        reject(new ApiError(xhr.status, data?.error || '上传失败'));
      };

      xhr.send(formData);
    });
  },

  deleteFile: (filePath: string) =>
    request<{success: boolean}>('/api/admin/files', {
      method: 'DELETE',
      body: JSON.stringify({ filePath }),
    }),

  batchDelete: (paths: string[]) =>
    request<{success: boolean, count: number}>('/api/admin/batch/delete', {
      method: 'POST',
      body: JSON.stringify({ paths })
    }),

  renameFile: (sourcePath: string, newName: string) =>
    request<{success: boolean, relativePath: string}>('/api/admin/rename', {
      method: 'POST',
      body: JSON.stringify({ sourcePath, newName })
    }),

  moveFiles: (sourcePaths: string[], destinationDir: string) =>
    request<{success: boolean, moved: string[]}>('/api/admin/move', {
      method: 'POST',
      body: JSON.stringify({ sourcePaths, destinationDir })
    }),

  copyFiles: (sourcePaths: string[], destinationDir: string) =>
    request<{success: boolean, copied: string[]}>('/api/admin/copy', {
      method: 'POST',
      body: JSON.stringify({ sourcePaths, destinationDir })
    }),

  batchShare: (paths: string[], isPublic: boolean) =>
    request<{success: boolean, count: number}>('/api/admin/batch/share', {
      method: 'POST',
      body: JSON.stringify({ paths, isPublic })
    }),

  downloadArchive: (filePath: string, fallbackFilename?: string) =>
    requestBlob('/api/admin/archive', {
      method: 'POST',
      body: JSON.stringify({ filePath })
    }, fallbackFilename || 'archive.zip'),

  updateMeta: (data: { relativePath: string, title?: string | null, description?: string | null, isPublic?: boolean, accessPassword?: string | null, shareId?: string | null, expiresAt?: string | null, maxViews?: number | null, maxDownloads?: number | null }) =>
    request<{success: boolean}>('/api/admin/meta', {
      method: 'PUT',
      body: JSON.stringify({
        relativePath: data.relativePath,
        title: data.title,
        description: data.description,
        isPublic: data.isPublic,
        accessPassword: data.accessPassword || null,
        shareId: data.shareId || null,
        expiresAt: data.expiresAt ?? undefined,
        maxViews: data.maxViews ?? undefined,
        maxDownloads: data.maxDownloads ?? undefined,
      })
    }),

  getSharedFiles: () =>
    request<{files: any[]}>('/api/admin/shared'),

  getTrashItems: () =>
    request<{items: TrashItem[]}>('/api/admin/trash'),

  restoreTrashItem: (id: string) =>
    request<{success: boolean, relativePath: string}>(`/api/admin/trash/${id}/restore`, {
      method: 'POST',
    }),

  restoreTrashItems: (ids: string[]) =>
    request<BatchTrashResponse>('/api/admin/trash/batch/restore', {
      method: 'POST',
      body: JSON.stringify({ ids })
    }),

  deleteTrashItem: (id: string) =>
    request<{success: boolean}>(`/api/admin/trash/${id}`, {
      method: 'DELETE',
    }),

  deleteTrashItems: (ids: string[]) =>
    request<BatchTrashResponse>('/api/admin/trash/batch/delete', {
      method: 'POST',
      body: JSON.stringify({ ids })
    }),

  getAuditLogs: (params: { limit?: number; offset?: number; eventType?: 'view' | 'download' | 'all'; accessScope?: string; keyword?: string } = {}) => {
    const searchParams = new URLSearchParams();
    if (params.limit != null) searchParams.set('limit', String(params.limit));
    if (params.offset != null) searchParams.set('offset', String(params.offset));
    if (params.eventType && params.eventType !== 'all') searchParams.set('eventType', params.eventType);
    if (params.accessScope) searchParams.set('accessScope', params.accessScope);
    if (params.keyword) searchParams.set('keyword', params.keyword);

    return request<AuditLogsResponse>(`/api/admin/audit/logs?${searchParams.toString()}`);
  },

  getSystemStats: () =>
    request<SystemStats>('/api/admin/system-stats'),

  getStats: () =>
    request<{ dashboard: any[], hotFiles: any[] }>('/api/admin/stats'),

  updateAdminPassword: (oldPassword: string, newPassword: string) =>
    request<{success: boolean}>('/api/admin/password', {
      method: 'PUT',
      body: JSON.stringify({ oldPassword, newPassword })
    }),
};

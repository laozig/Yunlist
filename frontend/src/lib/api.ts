class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface BlobResponse {
  blob: Blob;
  filename: string;
  contentType: string;
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

  uploadFile: (dirPath: string, file: File) => {
    const formData = new FormData();
    formData.append('dirPath', dirPath);
    formData.append('file', file);
    return request<{success: boolean, relativePath: string}>('/api/admin/upload', {
      method: 'POST',
      body: formData
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

  getSystemStats: () =>
    request<any>('/api/admin/system-stats'),

  getStats: () =>
    request<{ dashboard: any[], hotFiles: any[] }>('/api/admin/stats'),

  updateAdminPassword: (oldPassword: string, newPassword: string) =>
    request<{success: boolean}>('/api/admin/password', {
      method: 'PUT',
      body: JSON.stringify({ oldPassword, newPassword })
    }),
};

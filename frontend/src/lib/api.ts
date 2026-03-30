class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('yunlist_token');
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

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
      body: formData // 省略 Content-Type 自动设定 multipart
    });
  },

  deleteFile: (filePath: string) => 
    request<{success: boolean}>('/api/admin/files', { 
      method: 'DELETE', 
      body: JSON.stringify({ filePath }) 
    }),

  updateMeta: (data: { relativePath: string, title?: string | null, description?: string | null, isPublic?: boolean, accessPassword?: string | null, shareId?: string | null }) => 
    request<{success: boolean}>('/api/admin/meta', { 
      method: 'PUT', 
      body: JSON.stringify({
        relativePath: data.relativePath,
        title: data.title,
        description: data.description,
        isPublic: data.isPublic,
        accessPassword: data.accessPassword || null,
        shareId: data.shareId || null,
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

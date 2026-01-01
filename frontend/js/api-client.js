// API Client Utility
// Handles all API communication, token management, and request helpers

(function() {
  'use strict';

  // API Configuration
  // Can be overridden by setting window.API_BASE_URL before loading this script
  // Default: http://localhost:3001/api (matches backend server default port)
  const API_BASE_URL = window.API_BASE_URL || 'http://localhost:3001/api';
  const TOKEN_STORAGE_KEY = 'admin_auth_token';
  const REFRESH_TOKEN_STORAGE_KEY = 'admin_refresh_token';
  const USER_STORAGE_KEY = 'admin_user';

  // Token Management
  const tokenManager = {
    getToken() {
      return localStorage.getItem(TOKEN_STORAGE_KEY);
    },

    setToken(token) {
      if (token) {
        localStorage.setItem(TOKEN_STORAGE_KEY, token);
      } else {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    },

    getRefreshToken() {
      return localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
    },

    setRefreshToken(token) {
      if (token) {
        localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, token);
      } else {
        localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
      }
    },

    clearTokens() {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
      localStorage.removeItem(USER_STORAGE_KEY);
    },

    getUser() {
      const userStr = localStorage.getItem(USER_STORAGE_KEY);
      return userStr ? JSON.parse(userStr) : null;
    },

    setUser(user) {
      if (user) {
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
      } else {
        localStorage.removeItem(USER_STORAGE_KEY);
      }
    },
  };

  // Request Helper
  async function request(url, options = {}) {
    const token = tokenManager.getToken();
    
    const defaultHeaders = {
      'Content-Type': 'application/json',
    };

    if (token) {
      defaultHeaders['Authorization'] = `Bearer ${token}`;
    }

    const config = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...(options.headers || {}),
      },
    };

    // Remove Content-Type for FormData (browser will set it with boundary)
    if (options.body instanceof FormData) {
      delete config.headers['Content-Type'];
    }

    try {
      const response = await fetch(`${API_BASE_URL}${url}`, config);

      // Handle 401 Unauthorized - token might be expired
      if (response.status === 401) {
        tokenManager.clearTokens();
        // Dispatch custom event for auth state change
        window.dispatchEvent(new CustomEvent('auth:logout'));
        
        // Redirect to login if not already there
        if (!window.location.pathname.includes('login.html')) {
          window.location.href = './login.html';
        }
        
        throw new Error('Authentication failed. Please log in again.');
      }

      const data = await response.json();

      if (!response.ok) {
        // Log error details for debugging
        console.error('API Error:', {
          url: `${API_BASE_URL}${url}`,
          status: response.status,
          statusText: response.statusText,
          data: data
        });
        
        throw new Error(data.message || `Request failed with status ${response.status}`);
      }

      return data;
    } catch (error) {
      // Handle network errors
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('Network error. Please check your internet connection.');
      }
      throw error;
    }
  }

  // API Client Object
  const api = {
    // GET request
    async get(url, options = {}) {
      return request(url, { ...options, method: 'GET' });
    },

    // POST request
    async post(url, data, options = {}) {
      return request(url, {
        ...options,
        method: 'POST',
        body: data instanceof FormData ? data : JSON.stringify(data),
      });
    },

    // PUT request
    async put(url, data, options = {}) {
      return request(url, {
        ...options,
        method: 'PUT',
        body: data instanceof FormData ? data : JSON.stringify(data),
      });
    },

    // PATCH request
    async patch(url, data, options = {}) {
      return request(url, {
        ...options,
        method: 'PATCH',
        body: data instanceof FormData ? data : JSON.stringify(data),
      });
    },

    // DELETE request
    async delete(url, options = {}) {
      return request(url, { ...options, method: 'DELETE' });
    },

    // Upload file (multipart/form-data)
    async upload(url, formData, options = {}) {
      return request(url, {
        ...options,
        method: 'POST',
        body: formData,
      });
    },

    // Authentication methods
    auth: {
      async register(userData) {
        const response = await api.post('/auth/register', userData);
        if (response.success && response.data.token) {
          tokenManager.setToken(response.data.token);
          if (response.data.refreshToken) {
            tokenManager.setRefreshToken(response.data.refreshToken);
          }
          tokenManager.setUser(response.data.user);
          window.dispatchEvent(new CustomEvent('auth:login', { detail: response.data.user }));
        }
        return response;
      },

      async login(credentials) {
        const response = await api.post('/auth/login', credentials);
        if (response.success && response.data.token) {
          tokenManager.setToken(response.data.token);
          if (response.data.refreshToken) {
            tokenManager.setRefreshToken(response.data.refreshToken);
          }
          tokenManager.setUser(response.data.user);
          window.dispatchEvent(new CustomEvent('auth:login', { detail: response.data.user }));
        }
        return response;
      },

      async logout() {
        try {
          await api.post('/auth/logout');
        } catch (error) {
          // Continue with logout even if API call fails
          console.error('Logout API call failed:', error);
        }
        tokenManager.clearTokens();
        window.dispatchEvent(new CustomEvent('auth:logout'));
      },

      async getCurrentUser() {
        try {
          const response = await api.get('/auth/me');
          if (response.success && response.data) {
            tokenManager.setUser(response.data);
            return response.data;
          }
          console.warn('Failed to get current user, but keeping token');
          return null;
        } catch (error) {
          // Only clear tokens if it's an authentication error (401)
          if (error.message && (error.message.includes('401') || error.message.includes('Authentication failed'))) {
            tokenManager.clearTokens();
          } else {
            console.warn('Error getting current user (non-auth error):', error.message);
          }
          return null;
        }
      },

      isAuthenticated() {
        return !!tokenManager.getToken();
      },

      getCurrentUserSync() {
        return tokenManager.getUser();
      },
    },

    // Token management
    token: tokenManager,
  };

  // Expose API client to window
  window.api = api;

  // Initialize: Check if user is already logged in (non-blocking)
  // Use requestIdleCallback for better performance, fallback to setTimeout
  const initAuthCheck = () => {
    const token = tokenManager.getToken();
    if (token) {
      // Verify token is still valid by fetching current user (non-blocking)
      // This runs asynchronously without blocking page rendering
      api.auth.getCurrentUser().catch(() => {
        // Token invalid, clear it
        tokenManager.clearTokens();
      });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // Use requestIdleCallback if available, otherwise use setTimeout for non-blocking execution
      if ('requestIdleCallback' in window) {
        requestIdleCallback(initAuthCheck, { timeout: 2000 });
      } else {
        setTimeout(initAuthCheck, 0);
      }
    });
  } else {
    // DOM already loaded, run immediately but non-blocking
    if ('requestIdleCallback' in window) {
      requestIdleCallback(initAuthCheck, { timeout: 2000 });
    } else {
      setTimeout(initAuthCheck, 0);
    }
  }
})();


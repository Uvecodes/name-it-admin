(() => {

  // console.log() redec;laration to avoid errors in some environments
console.log = function() {};
console.warn = function() {};
console.error = function() {};
console.info = function() {};
  
  // API Client - uses window.api from api-client.js

  // Use a data URI for placeholder to avoid network requests
  const AVATAR_PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Crect fill='%23ddd' width='120' height='120'/%3E%3Ctext fill='%23999' font-family='sans-serif' font-size='50' x='50%25' y='50%25' text-anchor='middle' dominant-baseline='middle'%3E%3C/text%3E%3C/svg%3E";
  const UPLOAD_MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

  const state = {
    currentUserId: null,
    avatarListenerAttached: false,
    uploadingAvatar: false,
  };

  function notify(message, type = "success") {
    if (typeof showToast === "function") {
      showToast(message, type);
    } else {
      const taggedMessage = `[${type.toUpperCase()}] ${message}`;
      type === "error" ? console.error(taggedMessage) : console.log(taggedMessage);
    }
  }

  function splitName(fullName) {
    if (!fullName || typeof fullName !== "string") {
      return { firstName: "", lastName: "" };
    }
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) {
      return { firstName: parts[0], lastName: "" };
    }
    const firstName = parts.shift();
    const lastName = parts.join(" ");
    return { firstName, lastName };
  }

  function updateProfileName(name) {
    const displayName = name || "Admin User";
    const { firstName, lastName } = splitName(displayName);

    const profileNameEl = document.querySelector(".profile-name");
    if (profileNameEl) {
      profileNameEl.textContent = displayName;
    }

    const headerNameEl = document.querySelector(".admin-name");
    if (headerNameEl) {
      headerNameEl.textContent = displayName;
    }

    const firstNameInput = document.getElementById("first-name");
    if (firstNameInput) {
      firstNameInput.value = firstName;
    }

    const lastNameInput = document.getElementById("last-name");
    if (lastNameInput) {
      lastNameInput.value = lastName;
    }
  }

  function updateProfileEmail(email) {
    if (!email) return;

    const profileEmailEl = document.querySelector(".profile-email");
    if (profileEmailEl) {
      profileEmailEl.textContent = email;
    }

    const emailInput = document.getElementById("email");
    if (emailInput) {
      emailInput.value = email;
    }
  }

  function updateAvatarPreview(imageUrl) {
    const avatarPreview = document.getElementById("avatar-preview");
    if (avatarPreview) {
      avatarPreview.src = imageUrl || AVATAR_PLACEHOLDER;
    }
  }

  function updateProductCount(count) {
    const productStatItem = Array.from(
      document.querySelectorAll(".profile-stats .stat-item")
    ).find((item) => {
      const label = item.querySelector(".stat-label");
      return label && label.textContent.trim().toLowerCase() === "products";
    });

    const statNumberEl = productStatItem?.querySelector(".stat-number");
    if (statNumberEl) {
      statNumberEl.textContent = typeof count === "number" ? count : "0";
    }
  }

  function updateOrdersCount(count) {
    const ordersStatItem = Array.from(
      document.querySelectorAll(".profile-stats .stat-item")
    ).find((item) => {
      const label = item.querySelector(".stat-label");
      return label && label.textContent.trim().toLowerCase() === "orders";
    });

    const statNumberEl = ordersStatItem?.querySelector(".stat-number");
    if (statNumberEl) {
      statNumberEl.textContent = typeof count === "number" ? count : "0";
    }
  }

  function updateRevenue(revenue) {
    const revenueStatItem = Array.from(
      document.querySelectorAll(".profile-stats .stat-item")
    ).find((item) => {
      const label = item.querySelector(".stat-label");
      return label && label.textContent.trim().toLowerCase() === "revenue";
    });

    const statNumberEl = revenueStatItem?.querySelector(".stat-number");
    if (statNumberEl) {
      if (typeof revenue === "number") {
        // Format revenue: if >= 1000, show as $X.Xk, otherwise show full amount
        if (revenue >= 1000) {
          statNumberEl.textContent = `$${(revenue / 1000).toFixed(1)}k`;
        } else {
          statNumberEl.textContent = `$${revenue.toFixed(2)}`;
        }
      } else {
        statNumberEl.textContent = "$0";
      }
    }
  }

  async function fetchAdminProfile() {
    if (typeof window === 'undefined' || !window.api) {
      return null;
    }

    try {
      const response = await window.api.get('/admin/profile');
      if (response.success && response.data) {
        return response.data;
      }
      return null;
    } catch (error) {
      console.error("Error fetching admin profile:", error);
      notify("Unable to load admin profile.", "error");
      return null;
    }
  }

  async function fetchStats() {
    if (typeof window === 'undefined' || !window.api) {
      return { productCount: 0, ordersCount: 0, revenue: 0 };
    }

    try {
      const response = await window.api.get('/admin/stats');
      if (response.success && response.data) {
        return {
          productCount: response.data.productCount || 0,
          ordersCount: response.data.ordersCount || 0,
          revenue: response.data.revenue || 0,
        };
      }
      return { productCount: 0, ordersCount: 0, revenue: 0 };
    } catch (error) {
      console.error("Error fetching statistics:", error);
      notify("Unable to load statistics.", "error");
      return { productCount: 0, ordersCount: 0, revenue: 0 };
    }
  }

  async function populateProfile() {
    // Get current user from API client
    const user = window.api?.auth?.getCurrentUserSync();
    if (!user) {
      redirectToLogin();
      return;
    }

    updateProfileName(user.name || user.email || "Admin User");
    updateProfileEmail(user.email || "");
    updateAvatarPreview(AVATAR_PLACEHOLDER);

    // Fetch profile and stats in parallel for better performance
    const [profileData, stats] = await Promise.all([
      fetchAdminProfile(),
      fetchStats()
    ]);

    if (profileData) {
      if (profileData.name) {
        updateProfileName(profileData.name);
      }
      if (profileData.email) {
        updateProfileEmail(profileData.email);
      }
      if (profileData.avatarUrl) {
        updateAvatarPreview(profileData.avatarUrl);
      }
    }

    updateProductCount(stats.productCount);
    updateOrdersCount(stats.ordersCount);
    updateRevenue(stats.revenue);
  }

  function attachAvatarUploadListener() {
    if (state.avatarListenerAttached) {
      return;
    }
    const avatarInput = document.getElementById("avatar-upload");
    if (!avatarInput) {
      return;
    }

    avatarInput.addEventListener("change", async (event) => {
      if (state.uploadingAvatar) {
        notify("Please wait for the current upload to finish.", "info");
        return;
      }

      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      if (!file.type.startsWith("image/")) {
        notify("Please select a valid image file.", "error");
        avatarInput.value = "";
        return;
      }

      if (file.size > UPLOAD_MAX_SIZE_BYTES) {
        notify("Image must be 5MB or smaller.", "error");
        avatarInput.value = "";
        return;
      }

      if (typeof window === 'undefined' || !window.api) {
        notify("Avatar upload is not available right now.", "error");
        avatarInput.value = "";
        return;
      }

      const tempUrl = URL.createObjectURL(file);
      updateAvatarPreview(tempUrl);

      try {
        state.uploadingAvatar = true;
        notify("Uploading avatar...", "info");

        // Create FormData for file upload
        const formData = new FormData();
        formData.append('avatar', file);

        // Upload via API
        const response = await window.api.upload('/admin/avatar', formData);

        if (response.success && response.data.avatarUrl) {
          updateAvatarPreview(response.data.avatarUrl);
          notify("Avatar updated successfully.", "success");
        } else {
          throw new Error(response.message || 'Upload failed');
        }
      } catch (error) {
        console.error("Error uploading avatar:", error);
        let errorMessage = "Failed to upload avatar. Please try again.";
        if (error.message) {
          errorMessage = error.message;
        }
        notify(errorMessage, "error");
        updateAvatarPreview(AVATAR_PLACEHOLDER);
      } finally {
        state.uploadingAvatar = false;
        URL.revokeObjectURL(tempUrl);
        avatarInput.value = "";
      }
    });

    state.avatarListenerAttached = true;
  }

  function redirectToLogin() {
    window.location.href = "./login.html";
  }

  async function handleAuthChange() {
    if (typeof window === 'undefined' || !window.api) {
      redirectToLogin();
      return;
    }

    const isAuthenticated = window.api.auth.isAuthenticated();
    
    if (!isAuthenticated) {
      redirectToLogin();
      return;
    }

    // Try to get user from sync first (from localStorage)
    let user = window.api.auth.getCurrentUserSync();
    
    // If no user in sync, try to fetch from API
    if (!user) {
      try {
        user = await window.api.auth.getCurrentUser();
        if (!user) {
          redirectToLogin();
          return;
        }
      } catch (error) {
        console.error('Error fetching current user:', error);
        // Don't redirect immediately - token might still be valid
        // Just use what we have
        user = window.api.auth.getCurrentUserSync();
        if (!user) {
          redirectToLogin();
          return;
        }
      }
    }

    const hasNewUser = state.currentUserId !== user.uid;
    state.currentUserId = user.uid;

    if (hasNewUser) {
      populateProfile();
      attachAvatarUploadListener();
    }
  }

  function subscribeToAuthChanges() {
    // Check initial auth state (async)
    handleAuthChange().catch(error => {
      console.error('Error in handleAuthChange:', error);
    });

    // Listen for auth events from API client
    window.addEventListener('auth:login', () => {
      handleAuthChange().catch(error => {
        console.error('Error in handleAuthChange after login:', error);
      });
    });

    window.addEventListener('auth:logout', () => {
      redirectToLogin();
    });
  }

  // Mobile menu toggle
  function setupMobileMenuToggle() {
    const mobileToggle = document.querySelector('.mobile-menu-toggle');
    const sidebar = document.querySelector('.sidebar');

    if (!mobileToggle || !sidebar) {
      console.warn('Mobile menu toggle or sidebar not found');
      return;
    }

    // Remove any existing event listeners by cloning the element
    const newToggle = mobileToggle.cloneNode(true);
    mobileToggle.parentNode.replaceChild(newToggle, mobileToggle);

    // Add click event listener
    newToggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      sidebar.classList.toggle('mobile-open');
      console.log('Mobile menu toggled, sidebar has mobile-open:', sidebar.classList.contains('mobile-open'));
    });

    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', (e) => {
      if (window.innerWidth <= 768) {
        if (sidebar.classList.contains('mobile-open') && 
            !sidebar.contains(e.target) && 
            !newToggle.contains(e.target)) {
          sidebar.classList.remove('mobile-open');
        }
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    setupMobileMenuToggle();
    
    if (!navigator.onLine) {
      notify("You are currently offline. Data may be outdated.", "error");
    }
    
    // Wait for API client to be ready
    if (typeof window !== 'undefined' && window.api) {
      subscribeToAuthChanges();
    } else {
      // Retry after a short delay if API client not ready
      setTimeout(() => {
        if (typeof window !== 'undefined' && window.api) {
          subscribeToAuthChanges();
        } else {
          notify("API client not available. Please refresh the page.", "error");
        }
      }, 500);
    }
  });
})();


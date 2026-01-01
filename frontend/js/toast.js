// Shared Toast Notification System
// This module provides a centralized toast notification function to avoid code duplication

(function() {
  'use strict';

  // Toast Notification System
  function showToast(message, type = "success") {
    let toast = document.getElementById("toast");
    
    // Create toast element if it doesn't exist
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "toast";
      toast.className = "toast hidden";
      toast.setAttribute("aria-live", "polite");
      document.body.appendChild(toast);
    }

    // Clear any existing timeout
    if (toast.timeoutId) {
      clearTimeout(toast.timeoutId);
    }

    // Set message and type
    toast.textContent = message;
    toast.className = `toast show ${type}`;

    // Hide toast after 3 seconds
    toast.timeoutId = setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => {
        toast.classList.add("hidden");
      }, 300);
    }, 3000);
  }

  // Expose to window object for global access
  window.showToast = showToast;
})();




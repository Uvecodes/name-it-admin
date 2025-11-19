// API Client - uses window.api from api-client.js
// Firebase client SDK has been migrated to backend API

// console.log() redec;laration to avoid errors in some environments
console.log = function() {};
console.warn = function() {};
console.error = function() {};
console.info = function() {};

// Toast Notification System (if not already defined)
function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  if (!toast) {
    // Create toast element if it doesn't exist
    const toastEl = document.createElement("div");
    toastEl.id = "toast";
    toastEl.className = "toast";
    document.body.appendChild(toastEl);
    toastEl.textContent = message;
    toastEl.className = `toast show ${type}`;
    setTimeout(() => {
      toastEl.classList.remove("show");
      setTimeout(() => {
        toastEl.classList.add("hidden");
      }, 300);
    }, 3000);
    return;
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

// Handle Product Form Submission
async function handleAddProduct(event) {
  event.preventDefault();

  if (!navigator.onLine) {
    showToast("Sorry, you are currently offline", "error");
    return;
  }

  // Check if user is authenticated
  if (typeof window === 'undefined' || !window.api) {
    showToast("API client not available. Please refresh the page.", "error");
    return;
  }

  if (!window.api.auth.isAuthenticated()) {
    console.error("No authenticated user found");
    showToast("You must be logged in to add products", "error");
    window.location.href = "login.html";
    return;
  }

  // Get form values
  const name = document.getElementById("product-name").value.trim();
  const description = document.getElementById("product-description").value.trim();
  const price = parseFloat(document.getElementById("product-price").value);
  const count = parseInt(document.getElementById("product-count").value);
  const category = document.getElementById("product-category").value;
  const imageFile = document.getElementById("product-image").files[0];

  // Validation
  if (!name || !description || !price || !count || !category || !imageFile) {
    showToast("Please fill all fields", "error");
    return;
  }

  if (price <= 0) {
    showToast("Price must be greater than 0", "error");
    return;
  }

  if (count <= 0) {
    showToast("Product count must be greater than 0", "error");
    return;
  }

  try {
    // Create FormData for product and image
    const formData = new FormData();
    formData.append('name', name);
    formData.append('description', description);
    formData.append('price', price);
    formData.append('count', count);
    formData.append('category', category);
    formData.append('status', 'active');
    formData.append('image', imageFile);

    // Create product via API
    const response = await window.api.upload('/products', formData);

    if (response.success) {
      showToast("Product added successfully!", "success");
      
      // Reset form after successful upload
      document.querySelector(".product-form").reset();
      
      // Clear image preview
      const previewContainer = document.getElementById("image-preview-container");
      const previewImage = document.getElementById("image-preview");
      if (previewContainer) previewContainer.style.display = "none";
      if (previewImage) previewImage.src = "";
    } else {
      showToast(response.message || "Failed to add product", "error");
    }
  } catch (error) {
    console.error("Error adding product:", error);
    
    // Provide user-friendly error messages
    let errorMessage = error.message || "Failed to add product. Please try again.";
    
    if (errorMessage.includes('Only image files')) {
      errorMessage = 'Please select a valid image file.';
    } else if (errorMessage.includes('File size')) {
      errorMessage = 'Image size must be less than 5MB.';
    } else if (errorMessage.includes('Network')) {
      errorMessage = 'Network error. Please check your internet connection.';
    } else if (errorMessage.includes('Permission denied') || errorMessage.includes('unauthorized')) {
      errorMessage = 'Permission denied. Please check your authentication.';
    } else if (errorMessage.includes('Missing required fields')) {
      errorMessage = 'Please fill all required fields.';
    }
    
    showToast(errorMessage, "error");
  }
}

// Image Preview Functionality
function setupImagePreview() {
  const imageInput = document.getElementById("product-image");
  const previewContainer = document.getElementById("image-preview-container");
  const previewImage = document.getElementById("image-preview");
  const removePreviewBtn = document.getElementById("remove-preview");

  if (!imageInput || !previewContainer || !previewImage) {
    return;
  }

  // Handle file selection
  imageInput.addEventListener("change", function(e) {
    const file = e.target.files[0];
    
    if (file) {
      // Validate file type
      if (!file.type.startsWith("image/")) {
        showToast("Please select an image file", "error");
        imageInput.value = "";
        return;
      }

      // Validate file size (max 5MB)
      const maxSize = 5 * 1024 * 1024; // 5MB in bytes
      if (file.size > maxSize) {
        showToast("Image size must be less than 5MB", "error");
        imageInput.value = "";
        return;
      }

      // Create a FileReader to read the file
      const reader = new FileReader();

      reader.onload = function(e) {
        previewImage.src = e.target.result;
        previewContainer.style.display = "block";
      };

      reader.onerror = function() {
        showToast("Error reading image file", "error");
        previewContainer.style.display = "none";
      };

      // Read the file as a data URL
      reader.readAsDataURL(file);
    } else {
      previewContainer.style.display = "none";
    }
  });

  // Handle remove preview button
  if (removePreviewBtn) {
    removePreviewBtn.addEventListener("click", function() {
      imageInput.value = "";
      previewContainer.style.display = "none";
      previewImage.src = "";
    });
  }
}

// Mobile menu toggle
function setupMobileMenuToggle() {
  const mobileToggle = document.querySelector(".mobile-menu-toggle");
  const sidebar = document.querySelector(".sidebar");

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

// Event Listener
document.addEventListener("DOMContentLoaded", () => {
  setupMobileMenuToggle();

  const productForm = document.querySelector(".product-form");
  if (productForm) {
    productForm.addEventListener("submit", handleAddProduct);
    console.log("Product form event listener attached");
  }

  // Setup image preview
  setupImagePreview();
});

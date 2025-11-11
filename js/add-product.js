// Firebase config, services, and toast are loaded from firebase-config.js


// console.log() redec;laration to avoid errors in some environments
console.log = function() {};
console.warn = function() {};
console.error = function() {};
console.info = function() {};
// Get Firebase services (use window if available, otherwise fallback to global firebase)
const auth = (typeof window !== 'undefined' && window.auth) ? window.auth : (typeof firebase !== 'undefined' && firebase.auth ? firebase.auth() : null);
const db = (typeof window !== 'undefined' && window.db) ? window.db : (typeof firebase !== 'undefined' && firebase.firestore ? firebase.firestore() : null);
const storage = (typeof window !== 'undefined' && window.storage) ? window.storage : (typeof firebase !== 'undefined' && firebase.storage ? firebase.storage() : null);

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
  const currentUser = auth.currentUser;
  if (!currentUser) {
    console.error("No authenticated user found");
    showToast("You must be logged in to add products", "error");
    window.location.href = "login.html";
    return;
  }
  console.log("Authenticated user:", currentUser.email);

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
    // Check if Firebase services are available
    if (!auth || !db || !storage) {
      console.error('Firebase services not available', { auth, db, storage });
      showToast('Firebase is not initialized. Please refresh the page.', 'error');
      return;
    }

    // Upload image to Firebase Storage
    const storageRef = storage.ref();
    const imageRef = storageRef.child(`products/${Date.now()}_${imageFile.name}`);
    const snapshot = await imageRef.put(imageFile);
    const imageUrl = await snapshot.ref.getDownloadURL();

    // Save product to Firestore
    console.log("Saving to Firestore...", { name, description, price, count, category, imageUrl });
    const docRef = await db.collection("products").add({
      name: name,
      description: description,
      price: price,
      count: count,
      category: category,
      imageUrl: imageUrl,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      status: "active"
    });
    console.log("Document written with ID: ", docRef.id);

    showToast("Product added successfully!", "success");
    
    // Reset form after successful upload
    document.querySelector(".product-form").reset();
    
    // Clear image preview
    const previewContainer = document.getElementById("image-preview-container");
    const previewImage = document.getElementById("image-preview");
    if (previewContainer) previewContainer.style.display = "none";
    if (previewImage) previewImage.src = "";
  } catch (error) {
    console.error("Error adding product:", error);
    
    // Provide user-friendly error messages
    let errorMessage = error.message;
    
    if (error.code === 'storage/unauthorized' || error.code === 'storage/permission-denied') {
      errorMessage = 'Permission denied. Please check Firebase Storage security rules. You need to allow authenticated users to upload files.';
    } else if (error.code === 'storage/canceled') {
      errorMessage = 'Upload was canceled. Please try again.';
    } else if (error.code === 'storage/unknown') {
      errorMessage = 'An unknown error occurred during upload. Please try again.';
    } else if (error.code === 'permission-denied') {
      errorMessage = 'Permission denied. Please check Firestore security rules.';
    } else if (error.code === 'unavailable') {
      errorMessage = 'Service unavailable. Please check your internet connection and try again.';
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
    return;
  }

  mobileToggle.addEventListener("click", () => {
    sidebar.classList.toggle("mobile-open");
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

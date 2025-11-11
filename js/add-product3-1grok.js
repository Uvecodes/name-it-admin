// Firebase config, services, and toast are loaded from firebase-config.js

// Handle Product Form Submission
async function handleAddProduct(event) {
  event.preventDefault();

  if (!navigator.onLine) {
    showToast("Sorry, you are currently offline", "error");
    return;
  }

  // Disable submit button to prevent multiple submissions
  const submitBtn = event.target.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;

  try {
    // Check if user is authenticated and is admin
    const currentUser = auth.currentUser;
    if (!currentUser) {
      showToast("You must be logged in to add products", "error");
      window.location.href = "login.html";
      return;
    }

    const adminDoc = await db.collection("admins").doc(currentUser.uid).get();
    if (!adminDoc.exists || adminDoc.data().role !== "admin") {
      showToast("Access denied: Admins only", "error");
      window.location.href = "login.html";
      return;
    }

    // Get form values
    const name = document.getElementById("product-name").value.trim();
    const description = document.getElementById("product-description").value.trim();
    const price = parseFloat(document.getElementById("product-price").value.trim());
    const count = parseInt(document.getElementById("product-count").value.trim(), 10);
    const category = document.getElementById("product-category").value.trim();
    const imageFile = document.getElementById("product-image").files[0];

    // Validation
    if (!name || !description || isNaN(price) || isNaN(count) || !category || !imageFile) {
      showToast("Please fill all fields correctly", "error");
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

    if (description.length > 500) {
      showToast("Description must be under 500 characters", "error");
      return;
    }

    if (!imageFile.type.startsWith('image/')) {
      showToast("Please upload a valid image file", "error");
      return;
    }

    if (imageFile.size > 5 * 1024 * 1024) {  // 5MB limit
      showToast("Image size must be under 5MB", "error");
      return;
    }

    // Upload image to Firebase Storage
    const storageRef = storage.ref();
    const imageRef = storageRef.child(`products/${Date.now()}_${imageFile.name}`);
    const snapshot = await imageRef.put(imageFile);
    const imageUrl = await snapshot.ref.getDownloadURL();

    // Save product to Firestore
    const docRef = await db.collection("products").add({
      name,
      description,
      price,
      count,
      category,
      imageUrl,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      status: "active"
    });

    showToast("Product added successfully!", "success");
    
    // Reset form after successful upload
    document.querySelector(".product-form").reset();

    // Optional: Redirect to manage products page
    // setTimeout(() => { window.location.href = "manage-products.html"; }, 1500);

  } catch (error) {
    console.error("Error adding product:", error);
    showToast(error.message || "An error occurred while adding the product", "error");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

// Event Listener
document.addEventListener("DOMContentLoaded", () => {
  const productForm = document.querySelector(".product-form");
  if (productForm) {
    productForm.addEventListener("submit", handleAddProduct);
    console.log("Product form event listener attached");
  }
});
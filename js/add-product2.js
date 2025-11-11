// Firebase config, services, and toast are loaded from firebase-config.js

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
  } catch (error) {
    console.error("Error adding product:", error);
    showToast(error.message, "error");
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

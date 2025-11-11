(() => {

  // console.log() redec;laration to avoid errors in some environments
console.log = function() {};
console.warn = function() {};
console.error = function() {};
console.info = function() {};
  const adminProfileAuth =
    (typeof window !== "undefined" && window.auth) ||
    (typeof firebase !== "undefined" && typeof firebase.auth === "function"
      ? firebase.auth()
      : null);
  const adminProfileDb =
    (typeof window !== "undefined" && window.db) ||
    (typeof firebase !== "undefined" && typeof firebase.firestore === "function"
      ? firebase.firestore()
      : null);
  const adminProfileStorage =
    (typeof window !== "undefined" && window.storage) ||
    (typeof firebase !== "undefined" && typeof firebase.storage === "function"
      ? firebase.storage()
      : null);

  const AVATAR_PLACEHOLDER = "https://via.placeholder.com/120x120";
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

  async function fetchAdminProfile(user) {
    if (!adminProfileDb || !user) {
      return null;
    }

    try {
      const docRef = adminProfileDb.collection("admin").doc(user.uid);
      const snapshot = await docRef.get();
      return snapshot.exists ? snapshot.data() : null;
    } catch (error) {
      console.error("Error fetching admin profile:", error);
      notify("Unable to load admin profile.", "error");
      return null;
    }
  }

  async function fetchProductCount(userId) {
    if (!adminProfileDb) {
      return 0;
    }

    try {
      const productsCollection = adminProfileDb.collection("products");

      let snapshot = null;
      if (userId) {
        snapshot = await productsCollection.where("createdBy", "==", userId).get();
        if (!snapshot.empty) {
          return snapshot.size;
        }
      }

      snapshot = await productsCollection.get();
      return snapshot.size;
    } catch (error) {
      console.error("Error fetching product count:", error);
      notify("Unable to load product statistics.", "error");
      return 0;
    }
  }

  async function populateProfile(user) {
    updateProfileName(user.displayName || user.email || "Admin User");
    updateProfileEmail(user.email || "");
    updateAvatarPreview(AVATAR_PLACEHOLDER);

    const profileData = await fetchAdminProfile(user);
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

    const productCount = await fetchProductCount(user.uid);
    updateProductCount(productCount);
  }

  function attachAvatarUploadListener(userId) {
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

      if (!adminProfileStorage || !adminProfileDb) {
        notify("Avatar upload is not available right now.", "error");
        avatarInput.value = "";
        return;
      }

      const tempUrl = URL.createObjectURL(file);
      updateAvatarPreview(tempUrl);

      try {
        state.uploadingAvatar = true;
        notify("Uploading avatar...", "info");

        const storageRef = adminProfileStorage.ref();
        const avatarRef = storageRef.child(
          `admin-avatars/${userId}/${Date.now()}_${file.name}`
        );
        const snapshot = await avatarRef.put(file);
        const downloadUrl = await snapshot.ref.getDownloadURL();

        await adminProfileDb.collection("admin").doc(userId).set(
          {
            avatarUrl: downloadUrl,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        updateAvatarPreview(downloadUrl);
        notify("Avatar updated successfully.", "success");
      } catch (error) {
        console.error("Error uploading avatar:", error);
        notify("Failed to upload avatar. Please try again.", "error");
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

  function handleAuthChange(user) {
    if (!user) {
      redirectToLogin();
      return;
    }

    const hasNewUser = state.currentUserId !== user.uid;
    state.currentUserId = user.uid;

    if (hasNewUser) {
      populateProfile(user);
      attachAvatarUploadListener(user.uid);
    }
  }

  function subscribeToAuthChanges() {
    if (!adminProfileAuth || typeof adminProfileAuth.onAuthStateChanged !== "function") {
      console.error("Firebase auth is not available for admin profile.");
      notify("Authentication is not available. Please refresh the page.", "error");
      return;
    }

    adminProfileAuth.onAuthStateChanged(handleAuthChange);

    const currentUser = adminProfileAuth.currentUser;
    if (currentUser) {
      handleAuthChange(currentUser);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (!navigator.onLine) {
      notify("You are currently offline. Data may be outdated.", "error");
    }
    subscribeToAuthChanges();
  });
})();

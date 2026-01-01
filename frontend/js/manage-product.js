// API Client - uses window.api from api-client.js
// Firebase client SDK has been migrated to backend API

console.log() //redec;laration to avoid errors in some environments
console.log = function() {};
console.warn = function() {};
console.error = function() {};
console.info = function() {};

// Toast notification system is loaded from js/toast.js
// showToast function is available via window.showToast

// Global state
let allProducts = [];
let filteredProducts = [];
let currentPage = 1;
const productsPerPage = 10;

// Format currency
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

// Format date
function formatDate(timestamp) {
  if (!timestamp) return 'N/A';
  if (timestamp.toDate) {
    return timestamp.toDate().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
  return new Date(timestamp).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

// Fetch products from API
async function fetchProducts() {
  try {
    if (typeof window === 'undefined' || !window.api) {
      showToast('API client not available. Please refresh the page.', 'error');
      return;
    }

    // Check authentication
    if (!window.api.auth.isAuthenticated()) {
      console.error('User not authenticated');
      showToast('Please log in to view products', 'error');
      window.location.href = './login.html';
      return;
    }

    const response = await window.api.get('/products');

    if (response.success && response.data) {
      allProducts = response.data.map(product => ({
        id: product.id,
        popular: product.popular === true, // Ensure boolean, default to false
        ...product
      }));

      filteredProducts = [...allProducts];
      renderProducts();
      renderPagination();
    } else {
      showToast(response.message || 'Failed to load products', 'error');
    }
  } catch (error) {
    console.error('Error fetching products:', error);
    showToast('Failed to load products. Please try again.', 'error');
  }
}

// Render products in table
function renderProducts() {
  const tbody = document.querySelector('.products-table tbody');
  if (!tbody) return;

  // Calculate pagination
  const startIndex = (currentPage - 1) * productsPerPage;
  const endIndex = startIndex + productsPerPage;
  const productsToShow = filteredProducts.slice(startIndex, endIndex);

  if (productsToShow.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 2rem;">
          <p style="color: var(--text-secondary);">No products found</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = productsToShow.map(product => {
    const statusClass = product.status === 'active' ? 'active' : 'inactive';
    const categoryClass = product.category || 'uncategorized';
    const imageUrl = product.imageUrl || 'https://via.placeholder.com/80';
    const price = product.price || 0;
    const count = product.count || 0;
    const isPopular = product.popular === true;
    const popularClass = isPopular ? 'popular' : 'not-popular';
    
    // Determine stock status styling
    let stockClass = 'stock-available';
    let stockText = count;
    if (count === 0) {
      stockClass = 'stock-out';
      stockText = 'Out of Stock';
    } else if (count < 10) {
      stockClass = 'stock-low';
      stockText = count;
    }

    return `
      <tr>
        <td class="product-image">
          <img src="${imageUrl}" alt="${product.name || 'Product'}" loading="lazy" onerror="this.src='https://via.placeholder.com/80'">
        </td>
        <td class="product-name">${product.name || 'Unnamed Product'}</td>
        <td class="product-category">
          <span class="category-badge ${categoryClass}">${(product.category || 'Uncategorized').charAt(0).toUpperCase() + (product.category || 'Uncategorized').slice(1)}</span>
        </td>
        <td class="product-price">${formatCurrency(price)}</td>
        <td class="product-count">
          <span class="stock-badge ${stockClass}">${stockText}</span>
        </td>
        <td class="product-status">
          <span class="status-badge ${statusClass}">${(product.status || 'inactive').charAt(0).toUpperCase() + (product.status || 'inactive').slice(1)}</span>
        </td>
        <td class="product-popular">
          <button class="popular-toggle-btn ${popularClass}" title="${isPopular ? 'Remove from popular' : 'Make popular'}" data-product-id="${product.id}" data-popular="${isPopular}">
            <i class="${isPopular ? 'fas fa-star' : 'far fa-star'}"></i>
            <span>${isPopular ? 'Popular' : 'Not Popular'}</span>
          </button>
        </td>
        <td class="product-actions">
          <button class="btn-icon edit-btn" title="Edit" data-product-id="${product.id}">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn-icon delete-btn" title="Delete" data-product-id="${product.id}">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // Attach event listeners to action buttons
  attachActionListeners();
}

// Attach event listeners to edit and delete buttons
function attachActionListeners() {
  // Edit buttons
  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent event bubbling
      const productId = e.currentTarget.getAttribute('data-product-id');
      handleEditProduct(productId, e);
    });
  });

  // Delete buttons
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent event bubbling
      const productId = e.currentTarget.getAttribute('data-product-id');
      handleDeleteProduct(productId);
    });
  });

  // Popular toggle buttons
  document.querySelectorAll('.popular-toggle-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent event bubbling
      const productId = e.currentTarget.getAttribute('data-product-id');
      const currentPopular = e.currentTarget.getAttribute('data-popular') === 'true';
      handleTogglePopular(productId, !currentPopular);
    });
  });
}

// Handle toggle popular status
async function handleTogglePopular(productId, makePopular) {
  try {
    if (typeof window === 'undefined' || !window.api) {
      showToast('API client not available. Please refresh the page.', 'error');
      return;
    }

    // If trying to make product popular, check if we already have 4 popular products
    if (makePopular) {
      // Count popular products, excluding the current product if it's already popular
      const currentProduct = allProducts.find(p => p.id === productId);
      const popularCount = allProducts.filter(p => p.popular === true && p.id !== productId).length;
      if (popularCount >= 4) {
        showToast('Maximum of 4 products can be popular at a time. Please remove a popular product first.', 'error');
        return;
      }
    }

    // Update product via API
    const response = await window.api.patch(`/products/${productId}/popular`, {
      popular: makePopular
    });

    if (response.success) {
      showToast(makePopular ? 'Product marked as popular' : 'Product removed from popular', 'success');
      // Refresh products list
      await fetchProducts();
    } else {
      showToast(response.message || 'Failed to update popular status', 'error');
    }
  } catch (error) {
    console.error('Error toggling popular status:', error);
    showToast('Failed to update popular status. Please try again.', 'error');
  }
}

// Handle edit product - Show dropdown menu
function handleEditProduct(productId, event) {
  // Close any existing edit dropdowns
  closeAllEditDropdowns();

  const product = allProducts.find(p => p.id === productId);
  if (!product) {
    showToast('Product not found', 'error');
    return;
  }

  // Get the button that was clicked
  const editButton = event.currentTarget;
  const buttonRect = editButton.getBoundingClientRect();
  
  // Create dropdown element
  const dropdown = document.createElement('div');
  dropdown.className = 'edit-dropdown';
  dropdown.id = `edit-dropdown-${productId}`;
  // We'll set top/left after appending so we can measure the dropdown's rendered size
  dropdown.style.position = 'fixed';
  dropdown.style.top = '0px';
  dropdown.style.left = '0px';
  dropdown.style.zIndex = '1000';

  dropdown.innerHTML = `
    <div class="edit-dropdown-content">
      <div class="edit-dropdown-header">
        <h4>Edit Product</h4>
        <button class="close-edit-dropdown" data-product-id="${productId}">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="edit-dropdown-body">
        <div class="edit-field-group">
          <label for="edit-name-${productId}">Product Name</label>
          <input type="text" id="edit-name-${productId}" value="${(product.name || '').replace(/"/g, '&quot;')}" class="edit-input">
        </div>
        <div class="edit-field-group">
          <label for="edit-description-${productId}">Description</label>
          <textarea id="edit-description-${productId}" class="edit-textarea" rows="3">${(product.description || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')}</textarea>
        </div>
        <div class="edit-field-group">
          <label for="edit-price-${productId}">Price (NGN)</label>
          <input type="number" id="edit-price-${productId}" value="${product.price || 0}" step="0.01" min="0" class="edit-input">
        </div>
        <div class="edit-field-group">
          <label for="edit-count-${productId}">Product Count</label>
          <input type="number" id="edit-count-${productId}" value="${product.count || 0}" step="1" min="0" class="edit-input">
        </div>
        <div class="edit-field-group">
          <label for="edit-status-${productId}">Status</label>
          <select id="edit-status-${productId}" class="edit-select">
            <option value="active" ${product.status === 'active' ? 'selected' : ''}>Active</option>
            <option value="inactive" ${product.status === 'inactive' ? 'selected' : ''}>Inactive</option>
          </select>
        </div>
        <div class="edit-field-group">
          <label for="edit-popular-${productId}">Popular</label>
          <select id="edit-popular-${productId}" class="edit-select">
            <option value="false" ${product.popular !== true ? 'selected' : ''}>Not Popular</option>
            <option value="true" ${product.popular === true ? 'selected' : ''}>Popular</option>
          </select>
        </div>
      </div>
      <div class="edit-dropdown-footer">
        <button class="btn-cancel-edit" data-product-id="${productId}">Cancel</button>
        <button class="btn-save-edit" data-product-id="${productId}">Save Changes</button>
      </div>
    </div>
  `;

  document.body.appendChild(dropdown);

  // Measure and position the dropdown relative to the button.
  // Center it horizontally under the trigger, clamp to viewport, and flip above if it would overflow.
  let dropdownRect = dropdown.getBoundingClientRect();

  const margin = 8; // minimal gap from viewport edges
  let top = buttonRect.bottom + 5; // default: below the button
  let left = buttonRect.left + (buttonRect.width / 2) - (dropdownRect.width / 2);

  // Clamp horizontally
  left = Math.max(margin, Math.min(left, window.innerWidth - dropdownRect.width - margin));

  // If dropdown would overflow bottom, flip it above the button
  if (top + dropdownRect.height > window.innerHeight - margin) {
    top = buttonRect.top - dropdownRect.height - 5;
    if (top < margin) top = margin; // ensure it's not off the top
  }

  dropdown.style.top = `${Math.round(top)}px`;
  dropdown.style.left = `${Math.round(left)}px`;

  // Attach event listeners
  const closeBtn = dropdown.querySelector('.close-edit-dropdown');
  const cancelBtn = dropdown.querySelector('.btn-cancel-edit');
  const saveBtn = dropdown.querySelector('.btn-save-edit');

  closeBtn.addEventListener('click', () => closeEditDropdown(productId));
  cancelBtn.addEventListener('click', () => closeEditDropdown(productId));
  saveBtn.addEventListener('click', () => saveProductEdit(productId));

  // Store event listener references on the dropdown element so we can remove them later
  const closeOnOutsideClick = function(e) {
    if (!dropdown.contains(e.target) && !editButton.contains(e.target)) {
      closeEditDropdown(productId);
    }
  };
  
  const closeOnEscape = function(e) {
    if (e.key === 'Escape') {
      closeEditDropdown(productId);
    }
  };

  // Store references on the dropdown element
  dropdown._closeOnOutsideClick = closeOnOutsideClick;
  dropdown._closeOnEscape = closeOnEscape;
  dropdown._editButton = editButton;

  // Close dropdown when clicking outside (with a small delay to avoid immediate closure)
  setTimeout(() => {
    document.addEventListener('click', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
  }, 100);
}

// Close edit dropdown
function closeEditDropdown(productId) {
  const dropdown = document.getElementById(`edit-dropdown-${productId}`);
  if (dropdown) {
    // Remove event listeners before removing the dropdown
    if (dropdown._closeOnOutsideClick) {
      document.removeEventListener('click', dropdown._closeOnOutsideClick);
      delete dropdown._closeOnOutsideClick;
    }
    if (dropdown._closeOnEscape) {
      document.removeEventListener('keydown', dropdown._closeOnEscape);
      delete dropdown._closeOnEscape;
    }
    dropdown.remove();
  }
}

// Close all edit dropdowns
function closeAllEditDropdowns() {
  document.querySelectorAll('.edit-dropdown').forEach(dropdown => {
    // Remove event listeners before removing the dropdown
    if (dropdown._closeOnOutsideClick) {
      document.removeEventListener('click', dropdown._closeOnOutsideClick);
      delete dropdown._closeOnOutsideClick;
    }
    if (dropdown._closeOnEscape) {
      document.removeEventListener('keydown', dropdown._closeOnEscape);
      delete dropdown._closeOnEscape;
    }
    dropdown.remove();
  });
}

// Save product edits
async function saveProductEdit(productId) {
  try {
    const product = allProducts.find(p => p.id === productId);
    if (!product) {
      showToast('Product not found', 'error');
      return;
    }

    // Get form values
    const nameInput = document.getElementById(`edit-name-${productId}`);
    const descriptionInput = document.getElementById(`edit-description-${productId}`);
    const priceInput = document.getElementById(`edit-price-${productId}`);
    const countInput = document.getElementById(`edit-count-${productId}`);
    const statusSelect = document.getElementById(`edit-status-${productId}`);
    const popularSelect = document.getElementById(`edit-popular-${productId}`);

    if (!nameInput || !descriptionInput || !priceInput || !countInput || !statusSelect || !popularSelect) {
      showToast('Edit form not found', 'error');
      return;
    }

    const newName = nameInput.value.trim();
    const newDescription = descriptionInput.value.trim();
    const newPrice = parseFloat(priceInput.value);
    const newCount = parseInt(countInput.value);
    const newStatus = statusSelect.value;
    const newPopular = popularSelect.value === 'true';

    // Validation
    if (!newName) {
      showToast('Product name cannot be empty', 'error');
      return;
    }

    if (!newDescription) {
      showToast('Product description cannot be empty', 'error');
      return;
    }

    if (isNaN(newPrice) || newPrice < 0) {
      showToast('Please enter a valid price', 'error');
      return;
    }

    if (isNaN(newCount) || newCount < 0) {
      showToast('Please enter a valid product count (must be 0 or greater)', 'error');
      return;
    }

    // Validate popular status - max 4 popular products
    if (newPopular && !product.popular) {
      // Count popular products, excluding the current product
      const popularCount = allProducts.filter(p => p.popular === true && p.id !== productId).length;
      if (popularCount >= 4) {
        showToast('Maximum of 4 products can be popular at a time. Please remove a popular product first.', 'error');
        return;
      }
    }

    // Prepare update object
    const updates = {};
    if (newName !== product.name) {
      updates.name = newName;
    }
    if (newDescription !== (product.description || '')) {
      updates.description = newDescription;
    }
    if (newPrice !== product.price) {
      updates.price = newPrice;
    }
    if (newCount !== product.count) {
      updates.count = newCount;
    }
    if (newStatus !== product.status) {
      updates.status = newStatus;
    }
    if (newPopular !== product.popular) {
      updates.popular = newPopular;
    }

    // Only update if there are changes
    if (Object.keys(updates).length === 0) {
      showToast('No changes to save', 'info');
      closeEditDropdown(productId);
      return;
    }

    // Update product via API
    if (typeof window === 'undefined' || !window.api) {
      showToast('API client not available. Please refresh the page.', 'error');
      return;
    }

    const response = await window.api.put(`/products/${productId}`, updates);

    if (response.success) {
      showToast('Product updated successfully', 'success');
      closeEditDropdown(productId);
      // Refresh products list
      await fetchProducts();
    } else {
      showToast(response.message || 'Failed to update product', 'error');
    }
  } catch (error) {
    console.error('Error updating product:', error);
    showToast('Failed to update product. Please try again.', 'error');
  }
}

// Handle delete product
async function handleDeleteProduct(productId) {
  if (!confirm('Are you sure you want to delete this product? This action cannot be undone.')) {
    return;
  }

  try {
    if (typeof window === 'undefined' || !window.api) {
      showToast('API client not available. Please refresh the page.', 'error');
      return;
    }

    // Delete product via API (backend handles image deletion)
    const response = await window.api.delete(`/products/${productId}`);

    if (response.success) {
      showToast('Product deleted successfully', 'success');
      // Refresh products list
      await fetchProducts();
    } else {
      showToast(response.message || 'Failed to delete product', 'error');
    }
  } catch (error) {
    console.error('Error deleting product:', error);
    showToast('Failed to delete product. Please try again.', 'error');
  }
}

// Search functionality
function setupSearch() {
  const searchInput = document.querySelector('.search-input');
  if (!searchInput) return;

  searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase().trim();
    filterProducts(searchTerm);
  });
}

// Filter products
function filterProducts(searchTerm = '', categoryFilter = '', sortBy = '') {
  filteredProducts = [...allProducts];

  // Apply search filter
  if (searchTerm) {
    filteredProducts = filteredProducts.filter(product => {
      const name = (product.name || '').toLowerCase();
      const description = (product.description || '').toLowerCase();
      const category = (product.category || '').toLowerCase();
      return name.includes(searchTerm) || 
             description.includes(searchTerm) || 
             category.includes(searchTerm);
    });
  }

  // Apply category filter
  if (categoryFilter) {
    filteredProducts = filteredProducts.filter(product => 
      product.category === categoryFilter
    );
  }

  // Apply sorting
  if (sortBy) {
    switch (sortBy) {
      case 'name':
        filteredProducts.sort((a, b) => {
          const nameA = (a.name || '').toLowerCase();
          const nameB = (b.name || '').toLowerCase();
          return nameA.localeCompare(nameB);
        });
        break;
      case 'price-low':
        filteredProducts.sort((a, b) => (a.price || 0) - (b.price || 0));
        break;
      case 'price-high':
        filteredProducts.sort((a, b) => (b.price || 0) - (a.price || 0));
        break;
      default:
        // Default: sort by createdAt (newest first)
        filteredProducts.sort((a, b) => {
          const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
          const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
          return dateB - dateA;
        });
    }
  }

  currentPage = 1; // Reset to first page
  renderProducts();
  renderPagination();
}

// Setup category filter
function setupCategoryFilter() {
  const categorySelect = document.querySelector('.filter-select');
  if (!categorySelect) return;

  categorySelect.addEventListener('change', (e) => {
    const category = e.target.value;
    const searchInput = document.querySelector('.search-input');
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const sortSelect = document.querySelectorAll('.filter-select')[1];
    const sortBy = sortSelect ? sortSelect.value : '';
    filterProducts(searchTerm, category, sortBy);
  });
}

// Setup sort
function setupSort() {
  const sortSelects = document.querySelectorAll('.filter-select');
  if (sortSelects.length < 2) return;

  const sortSelect = sortSelects[1];
  sortSelect.addEventListener('change', (e) => {
    const sortBy = e.target.value;
    const searchInput = document.querySelector('.search-input');
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const categorySelect = sortSelects[0];
    const category = categorySelect ? categorySelect.value : '';
    filterProducts(searchTerm, category, sortBy);
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

// Render pagination
function renderPagination() {
  const paginationContainer = document.querySelector('.pagination');
  if (!paginationContainer) return;

  const totalPages = Math.ceil(filteredProducts.length / productsPerPage);

  if (totalPages <= 1) {
    paginationContainer.innerHTML = '';
    return;
  }

  let paginationHTML = '';

  // Previous button
  paginationHTML += `
    <button class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}">
      <i class="fas fa-chevron-left"></i>
    </button>
  `;

  // Page numbers
  const maxVisiblePages = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
  let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

  if (endPage - startPage < maxVisiblePages - 1) {
    startPage = Math.max(1, endPage - maxVisiblePages + 1);
  }

  if (startPage > 1) {
    paginationHTML += `<button class="pagination-btn" data-page="1">1</button>`;
    if (startPage > 2) {
      paginationHTML += `<span class="pagination-dots">...</span>`;
    }
  }

  for (let i = startPage; i <= endPage; i++) {
    paginationHTML += `
      <button class="pagination-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">
        ${i}
      </button>
    `;
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      paginationHTML += `<span class="pagination-dots">...</span>`;
    }
    paginationHTML += `<button class="pagination-btn" data-page="${totalPages}">${totalPages}</button>`;
  }

  // Next button
  paginationHTML += `
    <button class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">
      <i class="fas fa-chevron-right"></i>
    </button>
  `;

  paginationContainer.innerHTML = paginationHTML;

  // Attach event listeners to pagination buttons
  paginationContainer.querySelectorAll('.pagination-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const page = parseInt(e.currentTarget.getAttribute('data-page'));
      if (page && page !== currentPage) {
        currentPage = page;
        renderProducts();
        renderPagination();
        // Scroll to top of table
        document.querySelector('.products-table').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  setupMobileMenuToggle();

  // Check if Firebase services are available
  if (typeof window === 'undefined' || !window.api) {
    showToast('API client not available. Please refresh the page.', 'error');
    return;
  }

  // Check authentication
  if (!window.api.auth.isAuthenticated()) {
    window.location.href = './login.html';
    return;
  }

  // Listen for auth events
  window.addEventListener('auth:logout', () => {
    window.location.href = './login.html';
  });

  // Initialize products
  fetchProducts();
  setupSearch();
  setupCategoryFilter();
  setupSort();
});


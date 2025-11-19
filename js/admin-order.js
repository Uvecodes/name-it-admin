// Admin Order Management
// Handles fetching and displaying orders, order statistics, and order management

(function() {
  'use strict';

  // State
  const state = {
    orders: [],
    stats: {
      totalOrders: 0,
      pendingOrders: 0,
      completedOrders: 0,
      revenue: 0,
    },
    filters: {
      status: '',
      category: '',
      search: '',
      date: '',
    },
    currentPage: 1,
    itemsPerPage: 10,
  };

  // DOM Elements
  const elements = {
    statsCards: {
      total: document.querySelector('.orders-stats .stat-card:nth-child(1) .stat-number'),
      pending: document.querySelector('.orders-stats .stat-card:nth-child(2) .stat-number'),
      completed: document.querySelector('.orders-stats .stat-card:nth-child(3) .stat-number'),
      revenue: document.querySelector('.orders-stats .stat-card:nth-child(4) .stat-number'),
    },
    ordersTable: document.querySelector('.orders-table tbody'),
    searchInput: document.querySelector('.search-input'),
    statusFilter: document.querySelector('.filter-select:nth-of-type(1)'),
    categoryFilter: document.querySelector('.filter-select:nth-of-type(2)'),
    dateFilter: document.querySelector('.filter-date'),
    filterButton: document.querySelector('.filter-bar .btn-primary'),
    pagination: document.querySelector('.pagination'),
  };

  // Utility Functions
  function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  }

  function formatDate(date) {
    if (!date) return 'N/A';
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function getStatusClass(status) {
    const statusLower = (status || '').toLowerCase();
    const statusMap = {
      pending: 'pending',
      processing: 'processing',
      shipped: 'shipped',
      delivered: 'delivered',
      completed: 'delivered',
      cancelled: 'cancelled',
    };
    return statusMap[statusLower] || 'pending';
  }

  // API Functions
  async function fetchOrderStats() {
    try {
      if (typeof window === 'undefined' || !window.api) {
        console.error('API client not available');
        return;
      }

      const response = await window.api.get('/orders/stats');
      if (response.success && response.data) {
        state.stats = response.data;
        updateStatsDisplay();
      }
    } catch (error) {
      console.error('Error fetching order stats:', error);
    }
  }

  async function fetchOrders() {
    try {
      if (typeof window === 'undefined' || !window.api) {
        console.error('API client not available');
        return;
      }

      const params = new URLSearchParams();
      if (state.filters.status) {
        params.append('status', state.filters.status);
      }
      if (state.filters.date) {
        params.append('startDate', state.filters.date);
      }

      const queryString = params.toString();
      const endpoint = queryString ? `/orders?${queryString}` : '/orders';
      
      const response = await window.api.get(endpoint);
      if (response.success && Array.isArray(response.data)) {
        state.orders = response.data;
        applyFilters();
        renderOrders();
      } else {
        state.orders = [];
        renderOrders();
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
      state.orders = [];
      renderOrders();
    }
  }

  async function updateOrderStatus(orderId, status, notes) {
    try {
      if (typeof window === 'undefined' || !window.api) {
        showToast('API client not available', 'error');
        return;
      }

      const response = await window.api.patch(`/orders/${orderId}/status`, {
        status,
        notes,
      });

      if (response.success) {
        showToast('Order status updated successfully', 'success');
        await fetchOrders();
        await fetchOrderStats();
      } else {
        showToast(response.message || 'Failed to update order status', 'error');
      }
    } catch (error) {
      console.error('Error updating order status:', error);
      showToast('Failed to update order status', 'error');
    }
  }

  async function deleteOrder(orderId) {
    try {
      if (typeof window === 'undefined' || !window.api) {
        showToast('API client not available', 'error');
        return;
      }

      if (!confirm('Are you sure you want to delete this order?')) {
        return;
      }

      const response = await window.api.delete(`/orders/${orderId}`);

      if (response.success) {
        showToast('Order deleted successfully', 'success');
        await fetchOrders();
        await fetchOrderStats();
      } else {
        showToast(response.message || 'Failed to delete order', 'error');
      }
    } catch (error) {
      console.error('Error deleting order:', error);
      showToast('Failed to delete order', 'error');
    }
  }

  // Display Functions
  function updateStatsDisplay() {
    if (elements.statsCards.total) {
      elements.statsCards.total.textContent = state.stats.totalOrders.toLocaleString();
    }
    if (elements.statsCards.pending) {
      elements.statsCards.pending.textContent = state.stats.pendingOrders.toLocaleString();
    }
    if (elements.statsCards.completed) {
      elements.statsCards.completed.textContent = state.stats.completedOrders.toLocaleString();
    }
    if (elements.statsCards.revenue) {
      const revenue = state.stats.revenue || 0;
      if (revenue >= 1000) {
        elements.statsCards.revenue.textContent = `$${(revenue / 1000).toFixed(1)}k`;
      } else {
        elements.statsCards.revenue.textContent = formatCurrency(revenue);
      }
    }
  }

  function applyFilters() {
    let filteredOrders = [...state.orders];

    // Search filter
    if (state.filters.search) {
      const searchLower = state.filters.search.toLowerCase();
      filteredOrders = filteredOrders.filter(order => {
        const orderId = (order.orderId || order.id || '').toLowerCase();
        const customerName = (order.customer?.name || '').toLowerCase();
        const customerEmail = (order.customer?.email || '').toLowerCase();
        const productNames = (order.products || [])
          .map(p => (p.name || p.productName || '').toLowerCase())
          .join(' ');

        return orderId.includes(searchLower) ||
               customerName.includes(searchLower) ||
               customerEmail.includes(searchLower) ||
               productNames.includes(searchLower);
      });
    }

    // Category filter (if products have categories)
    if (state.filters.category) {
      filteredOrders = filteredOrders.filter(order => {
        return (order.products || []).some(p => {
          const category = (p.category || '').toLowerCase();
          return category === state.filters.category.toLowerCase();
        });
      });
    }

    state.filteredOrders = filteredOrders;
  }

  function renderOrders() {
    if (!elements.ordersTable) {
      console.warn('Orders table not found');
      return;
    }

    const ordersToDisplay = state.filteredOrders || state.orders;

    if (ordersToDisplay.length === 0) {
      elements.ordersTable.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 2rem;">
            <p style="color: #999;">No orders found</p>
          </td>
        </tr>
      `;
      return;
    }

    elements.ordersTable.innerHTML = ordersToDisplay.map(order => {
      const statusClass = getStatusClass(order.status);
      const statusText = (order.status || 'pending').charAt(0).toUpperCase() + (order.status || 'pending').slice(1);

      // Render products
      const productsHtml = (order.products || []).map(product => {
        const productName = product.name || product.productName || 'Unknown Product';
        const quantity = product.quantity || product.qty || 1;
        const imageUrl = product.imageUrl || product.image || 'https://via.placeholder.com/40x40';

        return `
          <div class="product-item">
            <img src="${imageUrl}" alt="${productName}" onerror="this.src='https://via.placeholder.com/40x40'">
            <span>${productName}</span>
            <span class="quantity">x${quantity}</span>
          </div>
        `;
      }).join('') || '<span>No products</span>';

      return `
        <tr>
          <td class="order-id">${order.orderId || `#ORD-${order.id?.substring(0, 6).toUpperCase() || 'N/A'}`}</td>
          <td class="customer-info">
            <div class="customer-avatar">
              ${order.customer?.avatar ? `<img src="${order.customer.avatar}" alt="${order.customer.name}">` : '<i class="fas fa-user"></i>'}
            </div>
            <div>
              <div class="customer-name">${order.customer?.name || 'Unknown'}</div>
              <div class="customer-email">${order.customer?.email || ''}</div>
            </div>
          </td>
          <td class="order-products">${productsHtml}</td>
          <td class="order-total">${formatCurrency(order.total || 0)}</td>
          <td>
            <span class="status-badge ${statusClass}">${statusText}</span>
          </td>
          <td class="order-date">${formatDate(order.createdAt)}</td>
          <td class="order-actions">
            <button class="btn-icon view-btn" title="View Details" onclick="viewOrder('${order.id}')">
              <i class="fas fa-eye"></i>
            </button>
            <button class="btn-icon edit-btn" title="Edit Order" onclick="editOrder('${order.id}')">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn-icon delete-btn" title="Delete Order" onclick="deleteOrderHandler('${order.id}')">
              <i class="fas fa-trash"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Event Handlers
  function handleSearch() {
    if (elements.searchInput) {
      elements.searchInput.addEventListener('input', (e) => {
        state.filters.search = e.target.value;
        applyFilters();
        renderOrders();
      });
    }
  }

  function handleFilters() {
    if (elements.statusFilter) {
      elements.statusFilter.addEventListener('change', (e) => {
        state.filters.status = e.target.value;
        fetchOrders();
      });
    }

    if (elements.categoryFilter) {
      elements.categoryFilter.addEventListener('change', (e) => {
        state.filters.category = e.target.value;
        applyFilters();
        renderOrders();
      });
    }

    if (elements.dateFilter) {
      elements.dateFilter.addEventListener('change', (e) => {
        state.filters.date = e.target.value;
        fetchOrders();
      });
    }

    if (elements.filterButton) {
      elements.filterButton.addEventListener('click', () => {
        fetchOrders();
      });
    }
  }

  // Global functions for onclick handlers
  window.viewOrder = function(orderId) {
    // TODO: Implement order detail modal/view
    console.log('View order:', orderId);
    showToast('Order detail view coming soon', 'info');
  };

  window.editOrder = function(orderId) {
    const order = state.orders.find(o => o.id === orderId);
    if (!order) {
      showToast('Order not found', 'error');
      return;
    }

    const newStatus = prompt(`Current status: ${order.status}\n\nEnter new status (pending, processing, shipped, delivered, cancelled):`, order.status);
    if (newStatus && newStatus !== order.status) {
      const notes = prompt('Add notes (optional):', order.notes || '');
      updateOrderStatus(orderId, newStatus, notes);
    }
  };

  window.deleteOrderHandler = function(orderId) {
    deleteOrder(orderId);
  };

  // Toast notification (if available)
  function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (toast && typeof window.showToast === 'function') {
      window.showToast(message, type);
    } else if (toast) {
      toast.textContent = message;
      toast.className = `toast ${type}`;
      toast.classList.remove('hidden');
      setTimeout(() => {
        toast.classList.add('hidden');
      }, 3000);
    } else {
      console.log(`[${type.toUpperCase()}] ${message}`);
    }
  }

  // Authentication check
  function checkAuth() {
    if (typeof window === 'undefined' || !window.api) {
      console.error('API client not available');
      return false;
    }

    if (!window.api.auth.isAuthenticated()) {
      window.location.href = './login.html';
      return false;
    }

    return true;
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

  // Initialize
  async function init() {
    if (!checkAuth()) {
      return;
    }

    // Set up mobile menu toggle
    setupMobileMenuToggle();

    // Set up event listeners
    handleSearch();
    handleFilters();

    // Fetch initial data
    await Promise.all([
      fetchOrderStats(),
      fetchOrders(),
    ]);
  }

  // Run on DOM load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();



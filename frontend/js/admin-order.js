// Admin Order Management
// Handles fetching and displaying orders, order statistics, and order management
// Supports both API-based fetching and Firebase real-time listeners

(function() {
  'use strict';

  // Expose showAnalyticsDashboard early to avoid timing issues
  window.showAnalyticsDashboard = function(statType) {
    // Placeholder - will be redefined later
    console.warn('showAnalyticsDashboard called before full initialization');
  };

  // State
  const state = {
    orders: [],
    stats: {
      totalOrders: 0,
      pendingOrders: 0,
      completedOrders: 0,
      revenue: 0,
      totalCost: 0,
    },
    filters: {
      status: '',
      category: '',
      search: '',
      date: '',
    },
    currentPage: 1,
    itemsPerPage: 10,
    // Firebase real-time listener state
    useFirebaseRealtime: false, // Toggle between API and Firebase
    firebaseUnsubscribe: null,
    firebaseConnected: false,
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
    refreshBtn: document.getElementById('refreshBtn'),
    realtimeStatus: document.getElementById('realtimeStatus'),
  };

  // Utility Functions
  function formatCurrency(amount) {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      currencyDisplay: 'symbol',
    }).format(amount);
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatDate(date) {
    if (!date) return 'N/A';
    
    try {
      // Use normalizeDate to handle all date formats
      const d = normalizeDate(date);
      
      if (!d) {
        return 'N/A';
      }
      
      // Validate the date
      if (isNaN(d.getTime())) {
        console.warn('Invalid date value:', date);
        return 'Invalid Date';
      }
      
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      console.error('Error formatting date:', error, date);
      return 'Invalid Date';
    }
  }

  function getStatusClass(status) {
    const statusLower = (status || '').toLowerCase();
    const statusMap = {
      pending: 'pending',
      paid: 'paid',
      rejected: 'rejected',
      processing: 'processing',
      shipped: 'shipped',
      delivered: 'delivered',
      completed: 'completed',
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

  async function fetchOrders(forAnalytics = false) {
    // If using Firebase real-time, don't fetch via API unless for analytics
      if (state.useFirebaseRealtime && !forAnalytics) {
      return;
    }

    try {
      if (typeof window === 'undefined' || !window.api) {
        console.error('API client not available');
        if (!forAnalytics) {
          showToast('API client not available. Please refresh the page.', 'error');
        }
        return;
      }

      // Show loading state only if not for analytics
      if (!forAnalytics && elements.ordersTable) {
        elements.ordersTable.innerHTML = `
          <tr>
            <td colspan="8" style="text-align: center; padding: 2rem;">
              <i class="fas fa-spinner fa-spin"></i> Loading orders...
            </td>
          </tr>
        `;
      }

      const params = new URLSearchParams();
      // For analytics, fetch ALL orders without filters to get complete data
      if (!forAnalytics) {
        if (state.filters.status) {
          params.append('status', state.filters.status);
        }
        if (state.filters.date) {
          params.append('startDate', state.filters.date);
        }
      }
      // For analytics, increase limit to get more orders
      if (forAnalytics) {
        params.append('limit', '1000'); // Get up to 1000 orders for analytics
      }

      const queryString = params.toString();
      const endpoint = queryString ? `/orders?${queryString}` : '/orders';
      
      const response = await window.api.get(endpoint);
      
      if (response && response.success && Array.isArray(response.data)) {
        // Normalize order data to handle different formats
        const normalizedOrders = response.data.map(order => normalizeOrder(order));
        
        if (forAnalytics) {
          // For analytics, store all orders without filtering
          state.orders = normalizedOrders;
        } else {
          // For regular table view, apply filters
          state.orders = normalizedOrders;
          applyFilters();
          renderOrders();
          
          if (state.orders.length === 0) {
            showToast('No orders found', 'info');
          } else {
            showToast(`Loaded ${state.orders.length} order(s)`, 'success');
          }
        }
      } else {
        console.warn('Invalid response format:', response);
        state.orders = [];
        if (!forAnalytics) {
          renderOrders();
          showToast('Failed to load orders. Invalid response format.', 'error');
        }
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
      state.orders = [];
      if (!forAnalytics) {
        renderOrders();
        showToast('Failed to load orders: ' + (error.message || 'Unknown error'), 'error');
      }
    }
  }

  /**
   * Updates Firebase real-time connection status indicator in UI
   */
  function updateRealtimeStatus(connected) {
    state.firebaseConnected = connected;
    if (elements.realtimeStatus) {
      if (connected && state.firebaseUnsubscribe) {
        elements.realtimeStatus.className = 'realtime-status active';
        elements.realtimeStatus.innerHTML = '<i class="fas fa-circle"></i><span>Real-time: On</span>';
        elements.realtimeStatus.title = 'Firebase real-time updates active';
      } else {
        elements.realtimeStatus.className = 'realtime-status inactive';
        elements.realtimeStatus.innerHTML = '<i class="fas fa-circle"></i><span>Real-time: Off</span>';
        elements.realtimeStatus.title = 'Firebase real-time updates inactive';
      }
    }
  }

  /**
   * Sets up Firebase real-time listener for pending orders
   */
  function setupFirebaseRealtimeListener() {
    // Check if Firebase is available
    if (typeof firebase === 'undefined' || !firebase.firestore) {
      console.warn('Firebase Firestore not available. Falling back to API.');
      state.useFirebaseRealtime = false;
      return;
    }

    const db = firebase.firestore();

    // Unsubscribe from previous listener if exists
    if (state.firebaseUnsubscribe) {
      state.firebaseUnsubscribe();
      state.firebaseUnsubscribe = null;
    }

    try {
      // Listen to orders where status == 'pending'
      state.firebaseUnsubscribe = db.collection('orders')
        .where('status', '==', 'pending')
        .onSnapshot(
          (snapshot) => {
            const firebaseOrders = [];
            snapshot.forEach((doc) => {
              const data = doc.data();
              firebaseOrders.push(normalizeOrder({
                id: doc.id,
                docId: doc.id,
                ...data
              }));
            });

            // Merge Firebase orders with API orders or replace if only using Firebase
            if (state.useFirebaseRealtime) {
              state.orders = firebaseOrders;
            } else {
              // Merge: add Firebase orders that aren't already in state.orders
              const existingIds = new Set(state.orders.map(o => o.id));
              const newOrders = firebaseOrders.filter(o => !existingIds.has(o.id));
              state.orders = [...state.orders, ...newOrders];
            }

            applyFilters();
            renderOrders();
            state.firebaseConnected = true;
            updateRealtimeStatus(true);
            
            if (snapshot.size > 0) {
              showToast(`Real-time: ${snapshot.size} pending order(s)`, 'success');
            }
          },
          (error) => {
            console.error('Error listening to Firebase orders:', error);
            state.firebaseConnected = false;
            updateRealtimeStatus(false);
            showToast('Firebase connection error. Using API fallback.', 'error');
            
            // Fallback to API if Firebase fails
            if (state.useFirebaseRealtime) {
              state.useFirebaseRealtime = false;
              fetchOrders();
            }
          }
        );

      // Monitor connection status
      db.enableNetwork().then(() => {
        state.firebaseConnected = true;
        updateRealtimeStatus(true);
      }).catch((error) => {
        console.error('Firebase network error:', error);
        state.firebaseConnected = false;
        updateRealtimeStatus(false);
      });

    } catch (error) {
      console.error('Error setting up Firebase listener:', error);
      state.firebaseConnected = false;
    }
  }

  /**
   * Stops Firebase real-time listener
   */
  function stopFirebaseRealtimeListener() {
    if (state.firebaseUnsubscribe) {
      state.firebaseUnsubscribe();
      state.firebaseUnsubscribe = null;
    }
  }

  /**
   * Normalizes date from various sources (Firestore timestamp, Date object, string, etc.)
   * Used to ensure dates are properly extracted from database regardless of format
   */
  function normalizeDate(dateValue) {
    if (!dateValue) return null;
    
    try {
      // Handle Firestore Timestamp
      if (dateValue && typeof dateValue === 'object' && dateValue.toDate && typeof dateValue.toDate === 'function') {
        return dateValue.toDate();
      }
      
      // Handle Firestore Timestamp from converted data (has _seconds and _nanoseconds)
      if (dateValue && typeof dateValue === 'object' && (dateValue._seconds || dateValue.seconds)) {
        const seconds = dateValue._seconds || dateValue.seconds || 0;
        const nanoseconds = dateValue._nanoseconds || dateValue.nanoseconds || 0;
        return new Date(seconds * 1000 + nanoseconds / 1000000);
      }
      
      // Handle Date object
      if (dateValue instanceof Date) {
        return dateValue;
      }
      
      // Handle timestamp (number)
      if (typeof dateValue === 'number') {
        return new Date(dateValue);
      }
      
      // Handle date string
      if (typeof dateValue === 'string') {
        const parsed = new Date(dateValue);
        if (!isNaN(parsed.getTime())) {
          return parsed;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error normalizing date:', error, dateValue);
      return null;
    }
  }

  function normalizeOrder(order) {
    // Handle products - check multiple possible field names and structures
    let products = [];
    if (order.products && Array.isArray(order.products)) {
      products = order.products;
    } else if (order.items && Array.isArray(order.items)) {
      products = order.items;
    } else if (order.cartItems && Array.isArray(order.cartItems)) {
      products = order.cartItems;
    } else if (order.products && typeof order.products === 'object') {
      // Handle case where products might be an object
      products = Object.values(order.products);
    }
    
    // Normalize dates - try multiple field names and formats
    const createdAt = normalizeDate(order.createdAt) || 
                      normalizeDate(order.submittedAt) || 
                      normalizeDate(order.created_at) ||
                      normalizeDate(order.date) ||
                      null;
    
    const updatedAt = normalizeDate(order.updatedAt) || 
                      normalizeDate(order.updated_at) ||
                      null;
    
    // Calculate total - prioritize totalAmount as it's the primary field in Firebase
    const total = parseFloat(order.totalAmount || order.total || order.amount || 0);
    
    return {
      id: order.id || order.docId || '',
      orderId: order.orderId || `#ORD-${(order.id || '').substring(0, 6).toUpperCase()}`,
      customer: {
        name: order.customer?.name || order.customerName || 'Unknown',
        email: order.customer?.email || order.customerEmail || '',
        phone: order.customer?.phone || order.customerPhone || '',
        avatar: order.customer?.avatar || order.customerAvatar || null,
      },
      // Products array
      products: products,
      // Total amount (calculated from products if missing)
      total: total || 0,
      status: (order.status || 'pending').toLowerCase(),
      createdAt: createdAt,
      updatedAt: updatedAt,
      shippingAddress: order.shippingAddress || null,
      notes: order.notes || order.comments || null,
    };
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
    // Calculate percentage changes for each stat (comparing last 30 days vs previous 30 days)
    const totalComparison = calculateComparison('total', '30d');
    const pendingComparison = calculateComparison('pending', '30d');
    const completedComparison = calculateComparison('completed', '30d');
    const revenueComparison = calculateComparison('revenue', '30d');
    
    // Total Orders card - display count and percentage change
    const totalCard = document.querySelector('.stat-card[data-stat-type="total"]');
    if (elements.statsCards.total) {
      const totalOrders = state.stats.totalOrders || 0;
      elements.statsCards.total.textContent = totalOrders.toLocaleString();
    }
    if (totalCard) {
      const changeElement = totalCard.querySelector('.stat-change');
      if (changeElement) {
        const percentage = totalComparison.percentage || 0;
        changeElement.textContent = `${percentage >= 0 ? '+' : ''}${percentage}%`;
        changeElement.className = `stat-change ${percentage >= 0 ? 'positive' : 'negative'}`;
      }
    }
    
    // Pending Orders card - display count and percentage change
    const pendingCard = document.querySelector('.stat-card[data-stat-type="pending"]');
    if (elements.statsCards.pending) {
      elements.statsCards.pending.textContent = (state.stats.pendingOrders || 0).toLocaleString();
    }
    if (pendingCard) {
      const changeElement = pendingCard.querySelector('.stat-change');
      if (changeElement) {
        const percentage = pendingComparison.percentage || 0;
        changeElement.textContent = `${percentage >= 0 ? '+' : ''}${percentage}%`;
        changeElement.className = `stat-change ${percentage >= 0 ? 'positive' : 'negative'}`;
      }
    }
    
    // Completed Orders card - display count and percentage change
    const completedCard = document.querySelector('.stat-card[data-stat-type="completed"]');
    if (elements.statsCards.completed) {
      elements.statsCards.completed.textContent = (state.stats.completedOrders || 0).toLocaleString();
    }
    if (completedCard) {
      const changeElement = completedCard.querySelector('.stat-change');
      if (changeElement) {
        const percentage = completedComparison.percentage || 0;
        changeElement.textContent = `${percentage >= 0 ? '+' : ''}${percentage}%`;
        changeElement.className = `stat-change ${percentage >= 0 ? 'positive' : 'negative'}`;
      }
    }
    
    // Revenue card - display currency and percentage change
    const revenueCard = document.querySelector('.stat-card[data-stat-type="revenue"]');
    if (elements.statsCards.revenue) {
      const revenue = state.stats.revenue || 0;
      if (revenue >= 1000) {
        elements.statsCards.revenue.textContent = `₦${(revenue / 1000).toFixed(1)}k`;
      } else {
        elements.statsCards.revenue.textContent = formatCurrency(revenue);
      }
    }
    if (revenueCard) {
      const changeElement = revenueCard.querySelector('.stat-change');
      if (changeElement) {
        const percentage = revenueComparison.percentage || 0;
        changeElement.textContent = `${percentage >= 0 ? '+' : ''}${percentage}%`;
        changeElement.className = `stat-change ${percentage >= 0 ? 'positive' : 'negative'}`;
      }
    }
  }

  function applyFilters() {
    // Normalize all orders first
    let filteredOrders = state.orders.map(order => normalizeOrder(order));

    // Search filter
    if (state.filters.search) {
      const searchLower = state.filters.search.toLowerCase();
      filteredOrders = filteredOrders.filter(order => {
        const orderId = (order.orderId || order.id || '').toLowerCase();
        const customerName = (order.customer?.name || order.customerName || '').toLowerCase();
        const customerEmail = (order.customer?.email || order.customerEmail || '').toLowerCase();
        const customerPhone = (order.customer?.phone || order.customerPhone || '').toLowerCase();
        const productNames = (order.products || [])
          .map(p => (p.name || p.productName || p.title || '').toLowerCase())
          .join(' ');

        return orderId.includes(searchLower) ||
               customerName.includes(searchLower) ||
               customerEmail.includes(searchLower) ||
               customerPhone.includes(searchLower) ||
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
          <td colspan="8" style="text-align: center; padding: 2rem;">
            <p style="color: #999;">
              <i class="fas fa-inbox" style="font-size: 2rem; opacity: 0.3; margin-bottom: 0.5rem; display: block;"></i>
              No orders found
            </p>
          </td>
        </tr>
      `;
      return;
    }

    elements.ordersTable.innerHTML = ordersToDisplay.map(order => {
      // Ensure order is normalized
      const normalizedOrder = normalizeOrder(order);
      
      const statusClass = getStatusClass(normalizedOrder.status);
      const statusText = (normalizedOrder.status || 'pending').charAt(0).toUpperCase() + (normalizedOrder.status || 'pending').slice(1);

      // Escape HTML for onclick handlers to prevent XSS
      const orderId = (normalizedOrder.id || '').replace(/'/g, "\\'");
      const safeOrderId = orderId || 'N/A';

      // Escape order ID for checkbox data attributes
      const escapedOrderId = (normalizedOrder.id || '').replace(/"/g, '&quot;');
      const escapedDocId = (normalizedOrder.docId || normalizedOrder.id || '').replace(/"/g, '&quot;');
      
      return `
        <tr data-order-id="${escapedOrderId}">
          <td class="order-id" style="text-align: left;">
            <strong style="font-size: 11px;">${normalizedOrder.orderId || `#ORD-${(normalizedOrder.id || '').substring(0, 6).toUpperCase() || 'N/A'}`}</strong>
          </td>
          <td class="customer-info" style="text-align: left;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <div class="customer-avatar" style="flex-shrink: 0;">
                ${normalizedOrder.customer?.avatar 
                  ? `<img src="${normalizedOrder.customer.avatar}" alt="${normalizedOrder.customer.name}" loading="lazy" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover;">` 
                  : '<i class="fas fa-user" style="font-size: 1rem; color: #999;"></i>'}
              </div>
              <div style="flex: 1;">
                <div class="customer-name" style="font-weight: 600; margin-bottom: 0.1rem; color: #333; font-size: 12px;">
                  ${normalizedOrder.customer?.name || 'Unknown'}
                </div>
                ${normalizedOrder.customer?.email ? `<div class="customer-email" style="font-size: 10px; color: #666;">${normalizedOrder.customer.email}</div>` : ''}
                ${normalizedOrder.customer?.phone ? `<div class="customer-phone" style="font-size: 10px; color: #666;">${normalizedOrder.customer.phone}</div>` : ''}
              </div>
            </div>
          </td>
          <td class="order-total" style="text-align: right; font-weight: 700; font-size: 1rem; color: #333;">
            ${formatCurrency(normalizedOrder.total || 0)}
          </td>
          <td style="text-align: center;">
            <span class="status-badge ${statusClass}" style="padding: 0.2rem 0.5rem; font-size: 10px;">${statusText}</span>
          </td>
          <td class="order-date" style="text-align: left; font-size: 11px; color: #666;">
            ${formatDate(normalizedOrder.createdAt) || 'N/A'}
          </td>
          <td style="text-align: center; vertical-align: middle;">
            ${normalizedOrder.status === 'pending'
              ? `<input type="checkbox" class="mark-paid-checkbox" data-order-id="${escapedOrderId}" data-order-doc-id="${escapedDocId}" data-order-number="${normalizedOrder.orderId}" title="Mark as Paid">`
              : normalizedOrder.status === 'paid' || normalizedOrder.status === 'completed'
                ? '<span style="color: #28a745; font-size: 1.2rem;" title="Already Paid"><i class="fas fa-check-circle"></i></span>'
                : '<span style="color: #999;">-</span>'}
          </td>
          <td style="text-align: center; vertical-align: middle;">
            ${normalizedOrder.status === 'pending'
              ? `<input type="checkbox" class="reject-checkbox" data-order-id="${escapedOrderId}" data-order-doc-id="${escapedDocId}" data-order-number="${normalizedOrder.orderId}" title="Reject Order">`
              : normalizedOrder.status === 'cancelled' || normalizedOrder.status === 'rejected'
                ? '<span style="color: #dc3545; font-size: 1.2rem;" title="Rejected"><i class="fas fa-times-circle"></i></span>'
                : '<span style="color: #999;">-</span>'}
          </td>
          <td class="order-actions" style="text-align: center;">
            <button class="btn-icon view-btn" title="View Details" onclick="viewOrder('${safeOrderId}')">
              <i class="fas fa-eye"></i>
            </button>
            <button class="btn-icon edit-btn" title="Edit Order" onclick="editOrder('${safeOrderId}')">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn-icon delete-btn" title="Delete Order" onclick="deleteOrderHandler('${safeOrderId}')">
              <i class="fas fa-trash"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Attach checkbox event handlers after rendering
    handleCheckboxActions();
  }

  // Event Handlers
  function handleSearch() {
    if (elements.searchInput) {
      elements.searchInput.addEventListener('input', (e) => {
        state.filters.search = e.target.value;
        applyFilters();
        renderOrders();
        handleCheckboxActions(); // Re-attach checkbox handlers after re-render
      });
    }
  }

  /**
   * Handles checkbox actions for Mark as Paid and Reject
   */
  function handleCheckboxActions() {
    // Handle Mark as Paid checkboxes
    const markPaidCheckboxes = document.querySelectorAll('.mark-paid-checkbox');
    markPaidCheckboxes.forEach(checkbox => {
      // Remove existing listeners by cloning
      const newCheckbox = checkbox.cloneNode(true);
      checkbox.parentNode.replaceChild(newCheckbox, checkbox);
      
      newCheckbox.addEventListener('change', async (e) => {
        if (e.target.checked) {
          const orderDocId = e.target.getAttribute('data-order-doc-id');
          const orderId = e.target.getAttribute('data-order-number') || e.target.getAttribute('data-order-id');
          
          if (confirm(`Mark order ${orderId} as paid?`)) {
            const success = await markOrderAsPaid(orderDocId, orderId);
            if (success) {
              // Keep checkbox checked
              e.target.checked = true;
              e.target.disabled = true;
            } else {
              // Uncheck if failed
              e.target.checked = false;
            }
          } else {
            // Uncheck if user cancelled
            e.target.checked = false;
          }
        }
      });
    });

    // Handle Reject checkboxes
    const rejectCheckboxes = document.querySelectorAll('.reject-checkbox');
    rejectCheckboxes.forEach(checkbox => {
      // Remove existing listeners by cloning
      const newCheckbox = checkbox.cloneNode(true);
      checkbox.parentNode.replaceChild(newCheckbox, checkbox);
      
      newCheckbox.addEventListener('change', async (e) => {
        if (e.target.checked) {
          const orderDocId = e.target.getAttribute('data-order-doc-id');
          const orderId = e.target.getAttribute('data-order-number') || e.target.getAttribute('data-order-id');
          
          // Confirm rejection (prompt is inside rejectOrder function)
          const success = await rejectOrder(orderDocId, orderId);
          if (success) {
            // Keep checkbox checked
            e.target.checked = true;
            e.target.disabled = true;
            // Also disable the mark as paid checkbox if both exist
            const row = e.target.closest('tr');
            const markPaidCheckbox = row?.querySelector('.mark-paid-checkbox');
            if (markPaidCheckbox) {
              markPaidCheckbox.disabled = true;
            }
          } else {
            // Uncheck if failed
            e.target.checked = false;
          }
        }
      });
    });
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
  window.viewOrder = async function(orderId) {
    // Show loading state
    const productsContainer = document.getElementById('viewOrderProducts');
    if (productsContainer) {
      productsContainer.innerHTML = '<p style="text-align: center; padding: 2rem;"><i class="fas fa-spinner fa-spin"></i> Loading order details...</p>';
    }

    try {
      // Fetch order from database
      if (!window.api) {
        showToast('API client not available', 'error');
        return;
      }

      const response = await window.api.get(`/orders/${orderId}`);
      
      if (!response || !response.success || !response.data) {
        showToast('Failed to fetch order details', 'error');
        return;
      }

      const order = response.data;
      console.log('Order fetched from API:', order);
      console.log('Order products/cartItems:', order.products || order.items || order.cartItems);
      
      const normalizedOrder = normalizeOrder(order);
      console.log('Normalized order:', normalizedOrder);
      console.log('Normalized products:', normalizedOrder.products);
      
      // Fetch product details for each product in the order
      if (normalizedOrder.products && normalizedOrder.products.length > 0) {
        console.log(`Fetching details for ${normalizedOrder.products.length} products`);
        await fetchProductDetails(normalizedOrder);
        console.log('Products after fetching details:', normalizedOrder.products);
      } else {
        console.warn('No products found in normalized order. Original order:', order);
        console.warn('Checking original order fields:', {
          products: order.products,
          items: order.items,
          cartItems: order.cartItems
        });
      }
      
      showViewOrderModal(normalizedOrder);
    } catch (error) {
      console.error('Error fetching order:', error);
      showToast('Failed to load order details: ' + (error.message || 'Unknown error'), 'error');
      
      // Fallback to local order if available
      const localOrder = state.orders.find(o => {
        const normalized = normalizeOrder(o);
        return normalized.id === orderId || o.id === orderId;
      });
      
      if (localOrder) {
        const normalizedOrder = normalizeOrder(localOrder);
        showViewOrderModal(normalizedOrder);
      }
    }
  };

  /**
   * Fetches product details from database for products in order
   */
  async function fetchProductDetails(normalizedOrder) {
    const products = normalizedOrder.products || [];
    
    console.log('Fetching product details. Products:', products);
    
    if (products.length === 0) {
      return;
    }

    // Fetch product details for each product
    const productPromises = products.map(async (product, index) => {
      // Log product structure for debugging
      console.log(`Processing product ${index}:`, product);
      
      let productId = null;
      let needsFetching = false;
      
        // Extract product ID - check multiple possible structures
        if (typeof product === 'string') {
          productId = product;
          needsFetching = true;
        } else if (typeof product === 'object' && product !== null) {
          // Check for product ID in various fields (including nested product)
          productId = product.productId || 
                     product.product_id || 
                     product.id || 
                     product.product?.id || 
                     product.product?.productId ||
                     product.product?.product_id;
        
        // Check if product has name/details (cartItems might have nested product)
        const hasProductName = product.name || product.productName || product.title || product.productTitle;
        const hasProductData = product.image || product.imageUrl || product.description || product.category;
        const nestedProduct = product.product;
        
        // If product is nested (cartItems might have product: {...}), extract it
        if (nestedProduct && typeof nestedProduct === 'object') {
          console.log('Found nested product:', nestedProduct);
          // Merge nested product data with cart item data
          const mergedProduct = {
            ...nestedProduct,
            ...product, // Preserve cartItem fields (quantity, price, etc.)
            // Override with nested product details if available
            name: nestedProduct.name || nestedProduct.productName || nestedProduct.title || product.name || product.productName || product.title,
            productName: nestedProduct.productName || nestedProduct.name || product.productName || product.name,
            title: nestedProduct.title || nestedProduct.name || product.title || product.name,
            quantity: product.quantity || product.qty || nestedProduct.quantity || 1,
            price: product.price || product.itemPrice || nestedProduct.price || 0,
            orderPrice: product.price || product.itemPrice || nestedProduct.price || 0,
          };
          
          // If nested product has details, use it
          if (mergedProduct.name || mergedProduct.productName || mergedProduct.title) {
            console.log('Using merged product with nested data:', mergedProduct);
            return mergedProduct;
          }
        }
        
        // Need to fetch if we have an ID but no name/details
        needsFetching = productId && !hasProductName && !hasProductData;
        
        // If cartItems have productId but no product details, fetch them
        if (product.productId && !hasProductName) {
          needsFetching = true;
        }
      }
      
      // Fetch product details if needed
      if (needsFetching && productId) {
        try {
          if (!window.api) {
            console.warn('API not available, returning product as-is');
            return product;
          }
          
          console.log(`Fetching product details for ID: ${productId}`);
          const response = await window.api.get(`/products/${productId}`);
          
          if (response && response.success && response.data) {
            console.log(`Fetched product ${productId}:`, response.data);
            // Merge fetched product data with order product data (quantity, price, etc.)
            const mergedProduct = {
              ...response.data,
              quantity: product.quantity || product.qty || 1,
              price: product.price || product.itemPrice || response.data.price || 0,
              // Preserve order-specific data
              orderPrice: product.price || product.itemPrice || response.data.price || 0,
            };
            console.log('Merged product:', mergedProduct);
            return mergedProduct;
          }
        } catch (error) {
          console.warn(`Failed to fetch product ${productId}:`, error);
          // Return product as-is if fetch fails
          return product;
        }
      }
      
      // Product already has details or no ID to fetch
      // Ensure we preserve all existing fields and extract name properly
      const nestedProduct = product.product || null;
      
      // Build final product with all possible fields
      const finalProduct = {
        ...product,
        // Merge nested product data if it exists
        ...(nestedProduct || {}),
        // Override with top-level fields to preserve cartItem-specific data
        quantity: product.quantity || product.qty || nestedProduct?.quantity || 1,
        orderPrice: product.price || product.itemPrice || product.orderPrice || nestedProduct?.price || 0,
        price: product.price || product.itemPrice || product.orderPrice || nestedProduct?.price || 0,
        // Make sure name field exists from all possible sources (prioritize nested product name)
        name: nestedProduct?.name ||
              nestedProduct?.productName ||
              nestedProduct?.title ||
              product.name || 
              product.productName || 
              product.title || 
              product.productTitle ||
              'Unknown Product',
        // Ensure image is available
        imageUrl: nestedProduct?.imageUrl ||
                  nestedProduct?.image ||
                  nestedProduct?.imageURL ||
                  nestedProduct?.photo ||
                  nestedProduct?.thumbnail ||
                  product.imageUrl || 
                  product.image || 
                  product.imageURL || 
                  product.photo || 
                  product.thumbnail ||
                  product.productImage ||
                  null,
        // Preserve category
        category: nestedProduct?.category || product.category || null,
      };
      
      console.log(`Final product ${index}:`, finalProduct);
      console.log(`Product name: "${finalProduct.name}"`);
      return finalProduct;
    });
    
    // Wait for all product fetches to complete
    normalizedOrder.products = await Promise.all(productPromises);
    console.log('Final products after fetching:', normalizedOrder.products);
  }

  /**
   * Shows view order modal with complete order details
   */
  function showViewOrderModal(normalizedOrder) {
    const modal = document.getElementById('viewOrderModal');
    const closeBtn = document.getElementById('viewOrderModalClose');
    const closeBtn2 = document.getElementById('viewOrderCloseBtn');
    
    if (!modal) return;

    // Populate order information
    document.getElementById('viewOrderId').textContent = normalizedOrder.orderId || 'N/A';
    
    const statusElement = document.getElementById('viewOrderStatus');
    if (statusElement) {
      const statusClass = getStatusClass(normalizedOrder.status);
      const statusText = (normalizedOrder.status || 'pending').charAt(0).toUpperCase() + (normalizedOrder.status || 'pending').slice(1);
      statusElement.innerHTML = `<span class="status-badge ${statusClass}">${statusText}</span>`;
    }

    document.getElementById('viewOrderCreatedAt').textContent = formatDate(normalizedOrder.createdAt) || 'N/A';
    document.getElementById('viewOrderUpdatedAt').textContent = formatDate(normalizedOrder.updatedAt) || 'N/A';

    // Populate customer information
    const customerAvatar = document.getElementById('viewOrderCustomerAvatar');
    if (customerAvatar && normalizedOrder.customer?.avatar) {
      customerAvatar.innerHTML = `<img src="${normalizedOrder.customer.avatar}" alt="${normalizedOrder.customer.name}" loading="lazy">`;
    } else if (customerAvatar) {
      customerAvatar.innerHTML = '<i class="fas fa-user"></i>';
    }

    document.getElementById('viewOrderCustomerName').textContent = normalizedOrder.customer?.name || 'Unknown';
    document.getElementById('viewOrderCustomerEmail').textContent = normalizedOrder.customer?.email || 'N/A';
    document.getElementById('viewOrderCustomerPhone').textContent = normalizedOrder.customer?.phone || 'N/A';

    // Populate shipping address
    const addressElement = document.getElementById('viewOrderAddress');
    if (normalizedOrder.shippingAddress) {
      const address = normalizedOrder.shippingAddress;
      if (typeof address === 'string') {
        addressElement.innerHTML = `<p>${address}</p>`;
      } else if (typeof address === 'object') {
        const addressLines = [
          address.street || address.address,
          address.city && address.state ? `${address.city}, ${address.state}` : address.city || address.state,
          address.zipCode || address.zip,
          address.country
        ].filter(Boolean);
        addressElement.innerHTML = `<p>${addressLines.join('<br>')}</p>`;
      } else {
        addressElement.innerHTML = '<p>N/A</p>';
      }
    } else {
      addressElement.innerHTML = '<p>N/A</p>';
    }

    // Populate products (after fetching from database)
    const productsContainer = document.getElementById('viewOrderProducts');
    const products = normalizedOrder.products || [];
    
    console.log('Products to display in modal:', products);
    console.log('Products array length:', products.length);
    
    if (products.length > 0) {
      console.log('Rendering products:', products);
      productsContainer.innerHTML = products.map(product => {
        // Get product details from fetched data
        // Handle cartItems structure where product data might be nested
        const productObj = product.product || product;
        const productName = escapeHtml(
          product.name || 
          product.productName || 
          product.title || 
          product.productTitle ||
          productObj?.name ||
          productObj?.productName ||
          productObj?.title ||
          productObj?.productTitle ||
          'Unknown Product'
        );
        
        // Get image URL (prioritize fetched product image)
        // Handle nested product structure
        const imageUrl = escapeHtml(
          product.imageUrl || 
          product.image || 
          product.imageURL || 
          product.photo || 
          product.thumbnail ||
          product.productImage ||
          productObj?.imageUrl ||
          productObj?.image ||
          productObj?.imageURL ||
          productObj?.photo ||
          productObj?.thumbnail ||
          'https://via.placeholder.com/60x60'
        );
        
        // Get quantity from order product data
        const quantity = product.quantity || product.qty || 1;
        
        // Use order-specific price if available, otherwise use product price
        const price = parseFloat(
          product.orderPrice || 
          product.price || 
          product.itemPrice || 
          product.productPrice ||
          0
        );
        
        const totalPrice = price * quantity;

        return `
          <div class="view-order-product-item">
            <img src="${imageUrl}" alt="${productName}" class="view-order-product-image" onerror="this.src='https://via.placeholder.com/60x60'">
            <div class="view-order-product-details">
              <div class="view-order-product-name">${productName}</div>
              <div class="view-order-product-quantity">Quantity: ${quantity}</div>
              ${(product.category || productObj?.category) ? `<div class="view-order-product-category" style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">Category: ${escapeHtml(product.category || productObj?.category || '')}</div>` : ''}
            </div>
            <div class="view-order-product-price">
              <div style="font-weight: 600; color: var(--text-primary);">${formatCurrency(totalPrice)}</div>
              ${price > 0 ? `<div style="font-size: 0.75rem; color: var(--text-secondary);">${formatCurrency(price)} each</div>` : ''}
            </div>
          </div>
        `;
      }).join('');
    } else {
      productsContainer.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">No products in this order</p>';
    }

    // Populate order summary
    // Calculate subtotal from products if available, otherwise use order total
    let subtotal = normalizedOrder.total || normalizedOrder.totalAmount || 0;
    
    // If we have products with prices, calculate subtotal from products
    if (products.length > 0) {
      const calculatedSubtotal = products.reduce((sum, product) => {
        const quantity = product.quantity || product.qty || 1;
        const price = parseFloat(product.orderPrice || product.price || product.itemPrice || product.productPrice || 0);
        return sum + (price * quantity);
      }, 0);
      
      // Use calculated subtotal if it's greater than 0, otherwise use order total
      if (calculatedSubtotal > 0) {
        subtotal = calculatedSubtotal;
      }
    }
    
    document.getElementById('viewOrderSubtotal').textContent = formatCurrency(subtotal);
    document.getElementById('viewOrderTotal').textContent = formatCurrency(subtotal);

    // Populate notes
    const notesSection = document.getElementById('viewOrderNotesSection');
    const notesElement = document.getElementById('viewOrderNotes');
    if (normalizedOrder.notes) {
      notesSection.style.display = 'block';
      notesElement.innerHTML = `<p>${normalizedOrder.notes}</p>`;
    } else {
      notesSection.style.display = 'none';
    }

    // Show modal
    modal.classList.remove('hidden');

    // Set up close handlers
    if (closeBtn) {
      const newCloseBtn = closeBtn.cloneNode(true);
      closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
      newCloseBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
      });
    }

    if (closeBtn2) {
      const newCloseBtn2 = closeBtn2.cloneNode(true);
      closeBtn2.parentNode.replaceChild(newCloseBtn2, closeBtn2);
      newCloseBtn2.addEventListener('click', () => {
        modal.classList.add('hidden');
      });
    }

    // Close on overlay click
    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden');
      }
    };
  }

  window.editOrder = function(orderId) {
    // Find order in normalized format
    const order = state.orders.find(o => {
      const normalized = normalizeOrder(o);
      return normalized.id === orderId || o.id === orderId;
    });
    
    if (!order) {
      showToast('Order not found', 'error');
      return;
    }

    const normalizedOrder = normalizeOrder(order);
    showEditOrderModal(orderId, normalizedOrder);
  };

  window.deleteOrderHandler = function(orderId) {
    // Find order to confirm deletion
    const order = state.orders.find(o => {
      const normalized = normalizeOrder(o);
      return normalized.id === orderId || o.id === orderId;
    });
    
    if (!order) {
      showToast('Order not found', 'error');
      return;
    }

    const normalizedOrder = normalizeOrder(order);
    showConfirmationModal({
      title: 'Delete Order',
      message: `Are you sure you want to delete order ${normalizedOrder.orderId}? This action cannot be undone.`,
      confirmText: 'Delete',
      confirmClass: 'btn-danger',
      onConfirm: () => deleteOrder(orderId),
    });
  };

  /**
   * Shows confirmation modal
   */
  function showConfirmationModal(options) {
    const modal = document.getElementById('confirmationModal');
    const title = document.getElementById('confirmationTitle');
    const message = document.getElementById('confirmationMessage');
    const inputContainer = document.getElementById('confirmationInputContainer');
    const input = document.getElementById('confirmationInput');
    const confirmBtn = document.getElementById('confirmationConfirmBtn');
    const cancelBtn = document.getElementById('confirmationCancelBtn');
    
    if (!modal || !title || !message || !confirmBtn || !cancelBtn) return;

    // Set modal content
    title.textContent = options.title || 'Confirm Action';
    message.textContent = options.message || 'Are you sure you want to proceed?';
    
    // Show/hide input field
    const showInput = options.showInput || false;
    inputContainer.style.display = showInput ? 'block' : 'none';
    if (input) input.value = '';
    
    // Set confirm button text and class
    confirmBtn.textContent = options.confirmText || 'Confirm';
    confirmBtn.className = `btn btn-primary ${options.confirmClass || ''}`;
    
    // Remove existing listeners
    const newConfirmBtn = confirmBtn.cloneNode(true);
    const newCancelBtn = cancelBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    
    // Show modal
    modal.classList.remove('hidden');
    
    // Set up confirm handler
    newConfirmBtn.addEventListener('click', () => {
      const inputValue = showInput && input ? input.value : null;
      modal.classList.add('hidden');
      if (options.onConfirm) {
        options.onConfirm(inputValue);
      }
    });
    
    // Set up cancel handler
    newCancelBtn.addEventListener('click', () => {
      modal.classList.add('hidden');
      if (options.onCancel) {
        options.onCancel();
      }
    });
    
    // Close button
    const closeBtn = document.getElementById('confirmationModalClose');
    if (closeBtn) {
      const newCloseBtn = closeBtn.cloneNode(true);
      closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
      newCloseBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
        if (options.onCancel) {
          options.onCancel();
        }
      });
    }
    
    // Close on overlay click
    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden');
        if (options.onCancel) {
          options.onCancel();
        }
      }
    };
  }

  /**
   * Shows edit order modal
   */
  function showEditOrderModal(orderId, normalizedOrder) {
    const modal = document.getElementById('editOrderModal');
    const statusSelect = document.getElementById('editOrderStatus');
    const notesTextarea = document.getElementById('editOrderNotes');
    const saveBtn = document.getElementById('editOrderSaveBtn');
    const cancelBtn = document.getElementById('editOrderCancelBtn');
    
    if (!modal || !statusSelect || !notesTextarea || !saveBtn || !cancelBtn) return;

    // Set current values
    statusSelect.value = normalizedOrder.status || 'pending';
    notesTextarea.value = normalizedOrder.notes || '';
    
    // Remove existing listeners
    const newSaveBtn = saveBtn.cloneNode(true);
    const newCancelBtn = cancelBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    
    // Show modal
    modal.classList.remove('hidden');
    
    // Set up save handler
    newSaveBtn.addEventListener('click', () => {
      const newStatus = statusSelect.value;
      const notes = notesTextarea.value.trim();
      modal.classList.add('hidden');
      
      if (newStatus !== normalizedOrder.status || notes !== (normalizedOrder.notes || '')) {
        updateOrderStatus(orderId, newStatus, notes);
      }
    });
    
    // Set up cancel handler
    newCancelBtn.addEventListener('click', () => {
      modal.classList.add('hidden');
    });
    
    // Close button
    const closeBtn = document.getElementById('editOrderModalClose');
    if (closeBtn) {
      const newCloseBtn = closeBtn.cloneNode(true);
      closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
      newCloseBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
      });
    }
    
    // Close on overlay click
    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden');
      }
    };
  }

  /**
   * Marks an order as paid (via Firebase or API)
   */
  async function markOrderAsPaid(orderDocId, orderId) {
    if (!orderDocId) {
      showToast('Order ID not found', 'error');
      return false;
    }

    // Show confirmation modal first
    return new Promise((resolve) => {
      showConfirmationModal({
        title: 'Mark as Paid',
        message: `Are you sure you want to mark order ${orderId} as paid?`,
        confirmText: 'Mark as Paid',
        onConfirm: async () => {
          try {
            // Try Firebase first if available
            if (typeof firebase !== 'undefined' && firebase.firestore) {
              const db = firebase.firestore();
              await db.collection('orders').doc(orderDocId).update({
                status: 'paid',
                paidAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
              });
              showToast(`Order ${orderId} marked as paid!`, 'success');
              
              // Refresh orders if using API
              if (!state.useFirebaseRealtime) {
                await fetchOrders();
                await fetchOrderStats();
              }
              resolve(true);
            } else if (window.api) {
              // Fallback to API
              const response = await window.api.patch(`/orders/${orderDocId}/status`, {
                status: 'paid',
                notes: 'Marked as paid by admin'
              });
              
              if (response.success) {
                showToast(`Order ${orderId} marked as paid!`, 'success');
                await fetchOrders();
                await fetchOrderStats();
                resolve(true);
              } else {
                throw new Error(response.message || 'Failed to update order status');
              }
            } else {
              throw new Error('Neither Firebase nor API is available');
            }
          } catch (error) {
            console.error('Error marking order as paid:', error);
            showToast('Failed to update order status: ' + (error.message || 'Unknown error'), 'error');
            resolve(false);
          }
        },
        onCancel: () => resolve(false),
      });
    });
  }

  /**
   * Rejects an order (via Firebase or API)
   */
  async function rejectOrder(orderDocId, orderId) {
    if (!orderDocId) {
      showToast('Order ID not found', 'error');
      return false;
    }

    // Show confirmation modal with reason input
    return new Promise((resolve) => {
      showConfirmationModal({
        title: 'Reject Order',
        message: `Are you sure you want to reject order ${orderId}?`,
        confirmText: 'Reject Order',
        confirmClass: 'btn-danger',
        showInput: true,
        onConfirm: async (reason) => {
          try {
            // Try Firebase first if available
            if (typeof firebase !== 'undefined' && firebase.firestore) {
              const db = firebase.firestore();
              await db.collection('orders').doc(orderDocId).update({
                status: 'rejected',
                rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
                rejectedReason: reason || '',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
              });
              showToast(`Order ${orderId} rejected!`, 'success');
              
              // Refresh orders if using API
              if (!state.useFirebaseRealtime) {
                await fetchOrders();
                await fetchOrderStats();
              }
              resolve(true);
            } else if (window.api) {
              // Fallback to API
              const response = await window.api.patch(`/orders/${orderDocId}/status`, {
                status: 'rejected',
                notes: reason || 'Order rejected by admin'
              });
              
              if (response.success) {
                showToast(`Order ${orderId} rejected!`, 'success');
                await fetchOrders();
                await fetchOrderStats();
                resolve(true);
              } else {
                throw new Error(response.message || 'Failed to update order status');
              }
            } else {
              throw new Error('Neither Firebase nor API is available');
            }
          } catch (error) {
            console.error('Error rejecting order:', error);
            showToast('Failed to reject order: ' + (error.message || 'Unknown error'), 'error');
            resolve(false);
          }
        },
        onCancel: () => resolve(false),
      });
    });
  }

  // Toast notification (if available)
  function showToast(message, type = 'info') {
    // Use shared toast function from toast.js
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
    } else {
      // Fallback if toast.js is not loaded
      const toast = document.getElementById('toast');
      if (toast) {
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
    handleCheckboxActions();

    // Set up refresh button
    if (elements.refreshBtn) {
      elements.refreshBtn.addEventListener('click', async () => {
        if (elements.refreshBtn) {
          const originalHTML = elements.refreshBtn.innerHTML;
          elements.refreshBtn.disabled = true;
          elements.refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
          
          try {
            // Refresh both API and Firebase data
            await Promise.all([
              fetchOrderStats(),
              fetchOrders(),
            ]);
            
            // Restart Firebase listener if it was active
            if (state.firebaseUnsubscribe) {
              setupFirebaseRealtimeListener();
            }
          } catch (error) {
            console.error('Error refreshing:', error);
            showToast('Error refreshing orders', 'error');
          } finally {
            setTimeout(() => {
              if (elements.refreshBtn) {
                elements.refreshBtn.disabled = false;
                elements.refreshBtn.innerHTML = originalHTML;
              }
            }, 500);
          }
        }
      });
    }

    // Initialize real-time status indicator
    updateRealtimeStatus(false);

    // Check if Firebase is available and should be used for real-time updates
    const useFirebase = typeof firebase !== 'undefined' && firebase.firestore;
    
    if (useFirebase) {
      // Check URL parameter or default behavior
      const urlParams = new URLSearchParams(window.location.search);
      const realtimeParam = urlParams.get('realtime');
      
      // Enable Firebase real-time if:
      // 1. URL has ?realtime=true parameter, OR
      // 2. We detect this might be a pending orders page (can be customized)
      if (realtimeParam === 'true' || window.location.pathname.includes('firebase')) {
        state.useFirebaseRealtime = true;
        setupFirebaseRealtimeListener();
      } else {
        // Use Firebase as a supplement (merge with API data)
        setupFirebaseRealtimeListener();
      }
    } else {
      // Firebase not available
      updateRealtimeStatus(false);
    }

    // Fetch initial data (API-based)
    try {
      await Promise.all([
        fetchOrderStats(),
        fetchOrders(),
      ]);
    } catch (error) {
      console.error('Error during initialization:', error);
      showToast('Error loading data. Please refresh the page.', 'error');
    }
  }

  // Run on DOM load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    stopFirebaseRealtimeListener();
  });

  // Dashboard Analytics Functions
  let dashboardCharts = {
    mainChart: null,
    breakdownChart: null,
  };
  
  // Current dashboard state
  let currentDashboardStatType = null;
  let currentTimePeriod = '30d'; // Default to 30 days

  /**
   * Get time period boundaries based on period string
   */
  function getTimePeriodBounds(period) {
    const now = new Date();
    let startDate, previousStartDate;
    
    switch (period) {
      case '24h':
        startDate = new Date(now);
        startDate.setHours(now.getHours() - 24);
        previousStartDate = new Date(startDate);
        previousStartDate.setHours(previousStartDate.getHours() - 24);
        return { startDate, previousStartDate, periodLabel: 'last 24 hours' };
        
      case '3d':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 3);
        previousStartDate = new Date(startDate);
        previousStartDate.setDate(previousStartDate.getDate() - 3);
        return { startDate, previousStartDate, periodLabel: 'last 3 days' };
        
      case '1w':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        previousStartDate = new Date(startDate);
        previousStartDate.setDate(previousStartDate.getDate() - 7);
        return { startDate, previousStartDate, periodLabel: 'last week' };
        
      case '30d':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 30);
        previousStartDate = new Date(startDate);
        previousStartDate.setDate(previousStartDate.getDate() - 30);
        return { startDate, previousStartDate, periodLabel: 'last 30 days' };
        
      case '1y':
        startDate = new Date(now);
        startDate.setFullYear(now.getFullYear() - 1);
        previousStartDate = new Date(startDate);
        previousStartDate.setFullYear(previousStartDate.getFullYear() - 1);
        return { startDate, previousStartDate, periodLabel: 'last year' };
        
      case 'all':
        // For all time, compare against itself (0% change)
        return { startDate: new Date(0), previousStartDate: new Date(0), periodLabel: 'all time' };
        
      default:
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 30);
        previousStartDate = new Date(startDate);
        previousStartDate.setDate(previousStartDate.getDate() - 30);
        return { startDate, previousStartDate, periodLabel: 'last 30 days' };
    }
  }
  
  /**
   * Calculate performance comparison for any time period
   */
  function calculateComparison(statType, timePeriod) {
    const { startDate, previousStartDate } = getTimePeriodBounds(timePeriod);
    const now = new Date();

    const orders = state.orders || [];
    
    let previousPeriodValue = 0;
    let currentPeriodValue = 0;

    // For "all time", no comparison is possible
    if (timePeriod === 'all') {
      return { percentage: 0, periodLabel: 'all time' };
    }

    orders.forEach(order => {
      const orderDate = normalizeDate(order.createdAt);
      if (!orderDate) return;

      const orderTotal = parseFloat(order.total || order.totalAmount || order.amount || 0);
      const status = (order.status || '').toLowerCase();

      // Check if order is in current period
      if (orderDate >= startDate && orderDate <= now) {
        if (statType === 'total') {
          currentPeriodValue++;
        } else if (statType === 'pending' && status === 'pending') {
          currentPeriodValue++;
        } else if (statType === 'completed' && (status === 'completed' || status === 'delivered')) {
          currentPeriodValue++;
        } else if (statType === 'revenue' && (status === 'completed' || status === 'delivered' || status === 'paid')) {
          currentPeriodValue += orderTotal;
        }
      }
      // Check if order is in previous period (for comparison)
      else if (orderDate >= previousStartDate && orderDate < startDate) {
        if (statType === 'total') {
          previousPeriodValue++;
        } else if (statType === 'pending' && status === 'pending') {
          previousPeriodValue++;
        } else if (statType === 'completed' && (status === 'completed' || status === 'delivered')) {
          previousPeriodValue++;
        } else if (statType === 'revenue' && (status === 'completed' || status === 'delivered' || status === 'paid')) {
          previousPeriodValue += orderTotal;
        }
      }
    });

    // Calculate percentage change
    let percentage = 0;
    if (previousPeriodValue === 0) {
      percentage = currentPeriodValue > 0 ? 100 : 0;
    } else {
      percentage = ((currentPeriodValue - previousPeriodValue) / previousPeriodValue) * 100;
    }
    
    const { periodLabel } = getTimePeriodBounds(timePeriod);
    return {
      percentage: Math.round(percentage * 10) / 10,
      periodLabel: periodLabel
    };
  }

  /**
   * Generate time series data for charts based on time period
   */
  function generateTimeSeriesData(statType, timePeriod) {
    const now = new Date();
    const labels = [];
    const data = [];
    
    let intervalCount, intervalDuration, labelFormat;
    
    // Determine interval based on time period
    switch (timePeriod) {
      case '24h':
        intervalCount = 24; // Hourly intervals
        intervalDuration = 60 * 60 * 1000; // 1 hour in milliseconds
        labelFormat = (date) => date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        break;
      case '3d':
        intervalCount = 18; // 4-hour intervals (72 hours / 4 = 18)
        intervalDuration = 4 * 60 * 60 * 1000; // 4 hours
        labelFormat = (date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit' });
        break;
      case '1w':
        intervalCount = 7; // Daily intervals
        intervalDuration = 24 * 60 * 60 * 1000; // 1 day
        labelFormat = (date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        break;
      case '30d':
        intervalCount = 30; // Daily intervals
        intervalDuration = 24 * 60 * 60 * 1000; // 1 day
        labelFormat = (date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        break;
      case '1y':
        intervalCount = 12; // Monthly intervals
        intervalDuration = null; // Will be calculated per month
        labelFormat = (date) => date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        break;
      case 'all':
        // For all time, show monthly intervals for last 12 months or total if less
        intervalCount = 12;
        intervalDuration = null;
        labelFormat = (date) => date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        break;
      default:
        intervalCount = 30;
        intervalDuration = 24 * 60 * 60 * 1000;
        labelFormat = (date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    for (let i = intervalCount - 1; i >= 0; i--) {
      let intervalStart, intervalEnd;
      
      if (timePeriod === '1y' || timePeriod === 'all') {
        // Monthly intervals
        intervalStart = new Date(now);
        intervalStart.setMonth(now.getMonth() - i);
        intervalStart.setDate(1);
        intervalStart.setHours(0, 0, 0, 0);
        
        intervalEnd = new Date(intervalStart);
        intervalEnd.setMonth(intervalEnd.getMonth() + 1);
        intervalEnd.setMilliseconds(-1);
      } else {
        // Fixed duration intervals
        intervalEnd = new Date(now.getTime() - (i * intervalDuration));
        intervalStart = new Date(intervalEnd.getTime() - intervalDuration);
      }
      
      labels.push(labelFormat(intervalStart));

      let count = 0;

      (state.orders || []).forEach(order => {
        const orderDate = normalizeDate(order.createdAt);
        if (!orderDate) return;

        if (orderDate >= intervalStart && orderDate <= intervalEnd) {
          const orderTotal = parseFloat(order.total || order.amount || 0);
          const status = (order.status || '').toLowerCase();

          if (statType === 'total') {
            count++;
          } else if (statType === 'pending' && status === 'pending') {
            count++;
          } else if (statType === 'completed' && (status === 'completed' || status === 'delivered')) {
            count++;
          } else if (statType === 'revenue' && (status === 'completed' || status === 'delivered' || status === 'paid')) {
            count += orderTotal;
          }
        }
      });

      data.push(count);
    }

    return { labels, data };
  }

  /**
   * Show analytics dashboard modal
   */
  window.showAnalyticsDashboard = async function(statType) {
    console.log('showAnalyticsDashboard called:', statType);
    
    // Check if Chart.js is loaded
    if (typeof Chart === 'undefined') {
      console.error('Chart.js is not loaded!');
      showToast('Chart.js library not loaded. Please refresh the page.', 'error');
      return;
    }
    
    const modal = document.getElementById('analyticsDashboardModal');
    if (!modal) {
      console.error('Analytics modal not found');
      return;
    }

    // Destroy existing charts
    destroyCharts();
    
    // Store current stat type
    currentDashboardStatType = statType;
    
    // Reset time period to default
    const timePeriodSelect = document.getElementById('dashboardTimePeriod');
    if (timePeriodSelect) {
      currentTimePeriod = timePeriodSelect.value || '30d';
    }

    // Show modal with loading state
    modal.classList.remove('hidden');
    
    // Show loading indicator
    const dashboardBody = document.querySelector('.dashboard-body');
    if (dashboardBody) {
      const existingLoader = dashboardBody.querySelector('.dashboard-loader');
      if (existingLoader) existingLoader.remove();
      
      const loader = document.createElement('div');
      loader.className = 'dashboard-loader';
      loader.style.cssText = 'display: flex; align-items: center; justify-content: center; padding: 3rem; text-align: center;';
      loader.innerHTML = '<div><i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary-color); margin-bottom: 1rem;"></i><p>Loading analytics data...</p></div>';
      dashboardBody.insertBefore(loader, dashboardBody.firstChild);
    }

    try {
      // Always fetch fresh orders data for analytics (with all orders, no filters)
      await fetchOrders(true); // true = for analytics
      
      // Also refresh stats
      await fetchOrderStats();
      
      // Wait a bit to ensure data is processed
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Remove loading indicator
      const loader = dashboardBody?.querySelector('.dashboard-loader');
      if (loader) loader.remove();

      // Log data for debugging
      console.log('Analytics Data Loaded:', {
        statType,
        ordersCount: state.orders?.length || 0,
        stats: state.stats,
        timePeriod: currentTimePeriod
      });
      
      // Render dashboard based on stat type
      renderDashboard(statType, currentTimePeriod);
      
      // Set up time period filter change handler
      setupDashboardTimePeriodFilter();
    } catch (error) {
      console.error('Error loading analytics data:', error);
      
      // Remove loading indicator
      const loader = dashboardBody?.querySelector('.dashboard-loader');
      if (loader) loader.remove();
      
      // Show error message
      showToast('Failed to load analytics data. Please try again.', 'error');
      
      // Still render dashboard with available data
      renderDashboard(statType, currentTimePeriod);
      setupDashboardTimePeriodFilter();
    }
  };

  /**
   * Set up time period filter change handler
   */
  function setupDashboardTimePeriodFilter() {
    const timePeriodSelect = document.getElementById('dashboardTimePeriod');
    if (!timePeriodSelect) return;
    
    // Remove existing listener by cloning
    const newSelect = timePeriodSelect.cloneNode(true);
    timePeriodSelect.parentNode.replaceChild(newSelect, timePeriodSelect);
    
    newSelect.addEventListener('change', async (e) => {
      currentTimePeriod = e.target.value;
      if (currentDashboardStatType) {
        // Ensure we have fresh data before rendering
        try {
          if (!state.orders || state.orders.length === 0) {
            await fetchOrders();
          }
          renderDashboard(currentDashboardStatType, currentTimePeriod);
        } catch (error) {
          console.error('Error refreshing analytics:', error);
          renderDashboard(currentDashboardStatType, currentTimePeriod);
        }
      }
    });
  }
  
  /**
   * Render dashboard content
   */
  function renderDashboard(statType, timePeriod = '30d') {
    console.log('Rendering dashboard:', { statType, timePeriod, ordersCount: state.orders?.length || 0 });
    
    const statConfig = {
      total: {
        title: 'Total Orders Analytics',
        label: 'Total Orders',
        value: state.stats.totalOrders || 0,
        icon: 'fa-shopping-bag',
        color: 'var(--primary-color)',
        isCurrency: false,
      },
      pending: {
        title: 'Pending Orders Analytics',
        label: 'Pending Orders',
        value: state.stats.pendingOrders,
        icon: 'fa-clock',
        color: 'var(--danger-color)',
      },
      completed: {
        title: 'Completed Orders Analytics',
        label: 'Completed Orders',
        value: state.stats.completedOrders,
        icon: 'fa-check-circle',
        color: 'var(--success-color)',
      },
      revenue: {
        title: 'Revenue Analytics',
        label: 'Total Revenue',
        value: state.stats.revenue,
        icon: 'fa-dollar-sign',
        color: 'var(--info-color)',
        isCurrency: true,
      },
    };

    const config = statConfig[statType] || statConfig.total;
    
    // Calculate actual value for the selected time period
    const { startDate } = getTimePeriodBounds(timePeriod);
    const now = new Date();
    let periodValue = 0;
    
    (state.orders || []).forEach(order => {
      const orderDate = normalizeDate(order.createdAt);
      if (!orderDate) return;
      
      // Check if order is within the selected time period (or all time)
      if (timePeriod === 'all' || (orderDate >= startDate && orderDate <= now)) {
        const orderTotal = parseFloat(order.total || order.totalAmount || order.amount || 0);
        const status = (order.status || '').toLowerCase();
        
        if (statType === 'total') {
          periodValue++;
        } else if (statType === 'pending' && status === 'pending') {
          periodValue++;
        } else if (statType === 'completed' && (status === 'completed' || status === 'delivered')) {
          periodValue++;
        } else if (statType === 'revenue' && (status === 'completed' || status === 'delivered' || status === 'paid')) {
          periodValue += orderTotal;
        }
      }
    });
    
    // Calculate performance comparison for selected time period
    const comparison = calculateComparison(statType, timePeriod);
    const percentageChange = comparison.percentage || 0;
    const isPositive = percentageChange >= 0;

    // Update main stat display
    const mainLabel = document.getElementById('dashboardMainLabel');
    const mainValue = document.getElementById('dashboardMainValue');
    const mainChange = document.getElementById('dashboardMainChange');
    const title = document.getElementById('dashboardTitle');

    if (mainLabel) mainLabel.textContent = config.label;
    if (title) title.textContent = config.title;
    
    if (mainValue) {
      if (config.isCurrency) {
        mainValue.textContent = formatCurrency(periodValue);
      } else {
        mainValue.textContent = periodValue.toLocaleString();
      }
    }

    if (mainChange) {
      const indicator = mainChange.querySelector('.change-indicator');
      const label = mainChange.querySelector('.change-label') || document.getElementById('dashboardChangeLabel');
      
      if (indicator) {
        if (timePeriod === 'all') {
          indicator.textContent = 'N/A';
        } else {
          indicator.textContent = `${isPositive ? '+' : ''}${percentageChange}%`;
        }
        indicator.className = `change-indicator ${isPositive ? 'positive' : 'negative'}`;
      }
      if (label) {
        if (timePeriod === 'all') {
          label.textContent = 'All time (no comparison)';
        } else {
          label.textContent = `vs previous ${comparison.periodLabel}`;
        }
      }
    }

    // Render charts with selected time period
    renderMainChart(statType, config, timePeriod);
    renderBreakdownChart(statType, config, timePeriod);
    renderActivityList(statType, timePeriod);
  }

  /**
   * Render main time series chart
   */
  function renderMainChart(statType, config, timePeriod = '30d') {
    const canvas = document.getElementById('dashboardMainChart');
    if (!canvas) {
      console.error('Main chart canvas not found');
      return;
    }

    console.log('Rendering main chart:', { statType, timePeriod });
    
    const ctx = canvas.getContext('2d');
    const { labels, data } = generateTimeSeriesData(statType, timePeriod);
    
    console.log('Main chart data:', { labelsCount: labels.length, dataPoints: data.length, data });
    
    if (!labels || labels.length === 0 || !data || data.length === 0) {
      console.warn('No data for main chart');
      return;
    }

    if (dashboardCharts.mainChart) {
      dashboardCharts.mainChart.destroy();
    }

    try {
      dashboardCharts.mainChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: config.label,
          data: data,
          borderColor: config.color,
          backgroundColor: config.color + '20',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: config.color,
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            padding: 12,
            titleFont: { size: 14, weight: '600' },
            bodyFont: { size: 13 },
            displayColors: false,
            callbacks: {
              label: function(context) {
                const value = context.parsed.y;
                if (config.isCurrency) {
                  return formatCurrency(value);
                }
                return value.toLocaleString();
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: {
              color: 'rgba(0, 0, 0, 0.05)',
            },
            ticks: {
              callback: function(value) {
                if (config.isCurrency) {
                  return '₦' + (value / 1000).toFixed(1) + 'k';
                }
                return value;
              },
            },
          },
          x: {
            grid: {
              display: false,
            },
            ticks: {
              maxRotation: 45,
              minRotation: 45,
            },
          },
        },
      },
    });
    
    console.log('Main chart rendered successfully');
    } catch (error) {
      console.error('Error rendering main chart:', error);
      const container = canvas.parentElement;
      if (container) {
        container.innerHTML = `<p style="color: var(--danger-color); text-align: center; padding: 2rem;">Error rendering chart: ${error.message}</p>`;
      }
    }
  }

  /**
   * Render breakdown chart (doughnut/pie)
   */
  function renderBreakdownChart(statType, config, timePeriod = '30d') {
    const canvas = document.getElementById('dashboardBreakdownChart');
    if (!canvas) {
      console.error('Breakdown chart canvas not found');
      return;
    }

    console.log('Rendering breakdown chart:', { statType, timePeriod });
    
    const ctx = canvas.getContext('2d');
    
    // Set explicit canvas dimensions
    const container = canvas.parentElement;
    if (container) {
      const containerWidth = container.clientWidth || container.offsetWidth || 400;
      const containerHeight = container.clientHeight || container.offsetHeight || 300;
      // Don't set canvas.width/height directly - let Chart.js handle it
      // But ensure container has proper dimensions
      if (containerWidth > 0 && containerHeight > 0) {
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.display = 'block';
      }
    }
    
    // Get time period bounds for filtering
    const { startDate } = getTimePeriodBounds(timePeriod);
    const now = new Date();
    
    // Filter orders by time period
    const filteredOrders = (state.orders || []).filter(order => {
      const orderDate = normalizeDate(order.createdAt);
      if (!orderDate) return false;
      return timePeriod === 'all' || (orderDate >= startDate && orderDate <= now);
    });
    
    // Get breakdown data based on stat type
    let breakdownData = {};
    
    if (statType === 'total') {
      // Break down by status (order count per status)
      filteredOrders.forEach(order => {
        const status = (order.status || '').toLowerCase();
        breakdownData[status] = (breakdownData[status] || 0) + 1;
      });
    } else if (statType === 'completed') {
      // Break down by status
      filteredOrders.forEach(order => {
        const status = (order.status || '').toLowerCase();
        if (status === 'completed' || status === 'delivered') {
          breakdownData[status] = (breakdownData[status] || 0) + 1;
        }
      });
    } else if (statType === 'pending') {
      // Break down by age (days pending)
      filteredOrders.forEach(order => {
        const status = (order.status || '').toLowerCase();
        if (status === 'pending') {
          const orderDate = normalizeDate(order.createdAt);
          if (orderDate) {
            const daysPending = Math.floor((new Date() - orderDate) / (1000 * 60 * 60 * 24));
            let category = 'Normal (0-3 days)';
            if (daysPending >= 7) category = 'Urgent (7+ days)';
            else if (daysPending >= 3) category = 'Warning (3-7 days)';
            
            breakdownData[category] = (breakdownData[category] || 0) + 1;
          }
        }
      });
    } else if (statType === 'revenue') {
      // Break down by order status
      filteredOrders.forEach(order => {
        const status = (order.status || '').toLowerCase();
        if (status === 'completed' || status === 'delivered' || status === 'paid') {
          const orderTotal = parseFloat(order.total || order.totalAmount || order.amount || 0);
          breakdownData[status] = (breakdownData[status] || 0) + orderTotal;
        }
      });
    }

    const labels = Object.keys(breakdownData);
    const data = Object.values(breakdownData);
    
    // Show message if no data
    if (labels.length === 0 || data.every(d => d === 0)) {
      const container = document.getElementById('dashboardDetailContent1');
      if (container) {
        container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">No data available for this period</p>';
      }
      if (dashboardCharts.breakdownChart) {
        dashboardCharts.breakdownChart.destroy();
        dashboardCharts.breakdownChart = null;
      }
      return;
    }
    
    console.log('Rendering breakdown chart with data:', { labels, data, statType, timePeriod });
    
    const colors = [
      'rgba(99, 102, 241, 0.8)',
      'rgba(16, 185, 129, 0.8)',
      'rgba(239, 68, 68, 0.8)',
      'rgba(245, 158, 11, 0.8)',
      'rgba(59, 130, 246, 0.8)',
      'rgba(139, 92, 246, 0.8)',
    ];

    if (dashboardCharts.breakdownChart) {
      dashboardCharts.breakdownChart.destroy();
    }

    try {
      dashboardCharts.breakdownChart = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: colors.slice(0, labels.length),
          borderWidth: 3,
          borderColor: '#fff',
          hoverBorderWidth: 4,
          hoverOffset: 8,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              padding: 15,
              font: { 
                size: 12,
                weight: '500',
              },
              usePointStyle: true,
              pointStyle: 'circle',
            },
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            padding: 12,
            titleFont: { size: 13, weight: '600' },
            bodyFont: { size: 12 },
            cornerRadius: 8,
            displayColors: true,
            callbacks: {
              label: function(context) {
                const label = context.label || '';
                const value = context.parsed || context.parsed === 0 ? context.parsed : context.raw;
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                
                if (config.isCurrency) {
                  return `${label}: ${formatCurrency(value)} (${percentage}%)`;
                }
                return `${label}: ${value.toLocaleString()} (${percentage}%)`;
              },
              footer: function(tooltipItems) {
                const total = tooltipItems.reduce((sum, item) => {
                  return sum + (item.parsed || item.raw || 0);
                }, 0);
                
                if (config.isCurrency) {
                  return `Total: ${formatCurrency(total)}`;
                }
                return `Total: ${total.toLocaleString()}`;
              },
            },
          },
        },
        animation: {
          animateRotate: true,
          animateScale: true,
          duration: 1000,
        },
      },
    });
    
    console.log('Breakdown chart rendered successfully');
    } catch (error) {
      console.error('Error rendering breakdown chart:', error);
      const container = document.getElementById('dashboardDetailContent1');
      if (container) {
        container.innerHTML = `<p style="color: var(--danger-color); text-align: center; padding: 2rem;">Error rendering chart: ${error.message}</p>`;
      }
    }
  }

  /**
   * Render activity list
   */
  function renderActivityList(statType, timePeriod = '30d') {
    const container = document.getElementById('dashboardDetailContent2');
    if (!container) return;

    // Get time period bounds for filtering
    const { startDate } = getTimePeriodBounds(timePeriod);
    const now = new Date();
    
    // Filter orders by time period first
    const filteredOrders = (state.orders || []).filter(order => {
      const orderDate = normalizeDate(order.createdAt);
      if (!orderDate) return false;
      return timePeriod === 'all' || (orderDate >= startDate && orderDate <= now);
    });
    
    let relevantOrders = [];

    if (statType === 'total') {
      relevantOrders = filteredOrders
        .sort((a, b) => {
          const dateA = normalizeDate(a.createdAt);
          const dateB = normalizeDate(b.createdAt);
          return (dateB || new Date(0)) - (dateA || new Date(0));
        })
        .slice(0, 10);
    } else if (statType === 'pending') {
      relevantOrders = filteredOrders
        .filter(o => (o.status || '').toLowerCase() === 'pending')
        .slice(0, 10);
    } else if (statType === 'completed') {
      relevantOrders = filteredOrders
        .filter(o => {
          const status = (o.status || '').toLowerCase();
          return status === 'completed' || status === 'delivered';
        })
        .slice(0, 10);
    } else if (statType === 'revenue') {
      relevantOrders = filteredOrders
        .filter(o => {
          const status = (o.status || '').toLowerCase();
          return status === 'completed' || status === 'delivered' || status === 'paid';
        })
        .sort((a, b) => {
          const totalA = parseFloat(a.total || a.totalAmount || a.amount || 0);
          const totalB = parseFloat(b.total || b.totalAmount || b.amount || 0);
          return totalB - totalA;
        })
        .slice(0, 10);
    }

    if (relevantOrders.length === 0) {
      container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">No recent activity</p>';
      return;
    }

    container.innerHTML = relevantOrders.map(order => {
      const normalizedOrder = normalizeOrder(order);
      const orderDate = formatDate(normalizedOrder.createdAt);
      const status = (normalizedOrder.status || '').toLowerCase();
      const total = parseFloat(normalizedOrder.total || normalizedOrder.amount || 0);
      
      let icon = 'fa-shopping-bag';
      let iconColor = 'var(--primary-color)';
      
      if (statType === 'total') {
        icon = 'fa-dollar-sign';
        iconColor = 'var(--primary-color)';
      } else if (statType === 'pending') {
        icon = 'fa-clock';
        iconColor = 'var(--danger-color)';
      } else if (statType === 'completed') {
        icon = 'fa-check-circle';
        iconColor = 'var(--success-color)';
      } else if (statType === 'revenue') {
        icon = 'fa-dollar-sign';
        iconColor = 'var(--info-color)';
      }

      return `
        <div class="dashboard-activity-item">
          <div class="activity-icon" style="background: ${iconColor}20; color: ${iconColor};">
            <i class="fas ${icon}"></i>
          </div>
          <div class="activity-content">
            <div class="activity-title">${normalizedOrder.orderId || 'N/A'}</div>
            <div class="activity-time">${orderDate}</div>
          </div>
          <div class="activity-value">
            ${statType === 'revenue' ? formatCurrency(total) : status.charAt(0).toUpperCase() + status.slice(1)}
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Destroy all charts
   */
  function destroyCharts() {
    if (dashboardCharts.mainChart) {
      dashboardCharts.mainChart.destroy();
      dashboardCharts.mainChart = null;
    }
    if (dashboardCharts.breakdownChart) {
      dashboardCharts.breakdownChart.destroy();
      dashboardCharts.breakdownChart = null;
    }
  }

  // Dashboard modal event listeners
  document.addEventListener('DOMContentLoaded', function() {
    const modal = document.getElementById('analyticsDashboardModal');
    const closeBtn = document.getElementById('dashboardModalClose');
    const closeBtn2 = document.getElementById('dashboardModalCloseBtn');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        if (modal) modal.classList.add('hidden');
        destroyCharts();
      });
    }

    if (closeBtn2) {
      closeBtn2.addEventListener('click', () => {
        if (modal) modal.classList.add('hidden');
        destroyCharts();
      });
    }

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.add('hidden');
          destroyCharts();
        }
      });
    }
  });
})();



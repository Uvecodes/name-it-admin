// Order Routes
const express = require('express');
const router = express.Router();
const { db } = require('../config');
const { sendSuccess, sendError, asyncHandler } = require('../utils/api-helpers');
const { verifyToken } = require('../middleware/auth');
const { 
  getCollection: getFirestoreCollection, 
  getDocument: getFirestoreDocument,
  createDocument: createFirestoreDocument,
  deleteDocument: deleteFirestoreDocument
} = require('../utils/firestore-rest');

/**
 * GET /api/orders/stats
 * Get order statistics (total, pending, completed, revenue)
 */
router.get('/stats', verifyToken, asyncHandler(async (req, res) => {
  try {
    // Get the ID token for REST API calls
    const authHeader = req.headers.authorization;
    const idToken = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.split('Bearer ')[1] 
      : null;

    let totalOrders = 0;
    let pendingOrders = 0;
    let completedOrders = 0;
    let revenue = 0;

    try {
      let orders = [];

      // Try Admin SDK first
      if (db && typeof db.collection === 'function') {
        try {
          const ordersSnapshot = await db.collection('orders').get();
          orders = ordersSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
          }));
        } catch (adminError) {
          console.warn('Admin SDK failed, trying REST API:', adminError.message);
          // Fallback to REST API
          orders = await getFirestoreCollection('orders', idToken);
        }
      } else {
        // Use REST API directly
        orders = await getFirestoreCollection('orders', idToken);
      }

      totalOrders = orders.length;

      orders.forEach(order => {
        const status = (order.status || '').toLowerCase();
        const total = parseFloat(order.total || order.amount || 0);

        if (status === 'pending') {
          pendingOrders++;
        } else if (status === 'delivered' || status === 'completed') {
          completedOrders++;
          revenue += total;
        } else if (status === 'shipped' || status === 'processing') {
          // Count shipped/processing as pending for now
          pendingOrders++;
        }
      });
    } catch (error) {
      console.warn('Orders collection might not exist:', error.message);
      // Return zeros if collection doesn't exist
    }

    return sendSuccess(res, {
      totalOrders,
      pendingOrders,
      completedOrders,
      revenue: Math.round(revenue * 100) / 100, // Round to 2 decimal places
    }, 'Order statistics retrieved successfully');
  } catch (error) {
    console.error('Get order stats error:', error);
    return sendError(res, 'Failed to retrieve order statistics', 500, error);
  }
}));

/**
 * GET /api/orders
 * Get all orders (with optional filtering and pagination)
 */
router.get('/', verifyToken, asyncHandler(async (req, res) => {
  try {
    // Get the ID token for REST API calls
    const authHeader = req.headers.authorization;
    const idToken = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.split('Bearer ')[1] 
      : null;

    let orders = [];

    // Try Admin SDK first
    if (db && typeof db.collection === 'function') {
      try {
        let query = db.collection('orders');

        // Apply status filter if provided
        if (req.query.status) {
          query = query.where('status', '==', req.query.status);
        }

        // Apply date filter if provided
        if (req.query.startDate) {
          const startDate = new Date(req.query.startDate);
          query = query.where('createdAt', '>=', startDate);
        }

        if (req.query.endDate) {
          const endDate = new Date(req.query.endDate);
          endDate.setHours(23, 59, 59, 999); // End of day
          query = query.where('createdAt', '<=', endDate);
        }

        // Order by creation date (newest first)
        query = query.orderBy('createdAt', 'desc');

        // Apply pagination
        const limit = parseInt(req.query.limit) || 50;
        if (limit > 0) {
          query = query.limit(limit);
        }

        const snapshot = await query.get();
        orders = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            orderId: data.orderId || `#ORD-${doc.id.substring(0, 6).toUpperCase()}`,
            customer: {
              name: data.customerName || data.customer?.name || 'Unknown',
              email: data.customerEmail || data.customer?.email || '',
              avatar: data.customerAvatar || data.customer?.avatar || null,
            },
            products: data.products || data.items || [],
            total: parseFloat(data.total || data.amount || 0),
            status: data.status || 'pending',
            createdAt: data.createdAt?.toDate?.() || data.createdAt || null,
            updatedAt: data.updatedAt?.toDate?.() || data.updatedAt || null,
            shippingAddress: data.shippingAddress || null,
            notes: data.notes || data.comments || null,
          };
        });
      } catch (adminError) {
        console.warn('Admin SDK failed, trying REST API:', adminError.message);
        // Fallback to REST API
        const ordersData = await getFirestoreCollection('orders', idToken);
        orders = ordersData.map(data => {
          return {
            id: data.id,
            orderId: data.orderId || `#ORD-${data.id?.substring(0, 6).toUpperCase() || 'N/A'}`,
            customer: {
              name: data.customerName || data.customer?.name || 'Unknown',
              email: data.customerEmail || data.customer?.email || '',
              avatar: data.customerAvatar || data.customer?.avatar || null,
            },
            products: data.products || data.items || [],
            total: parseFloat(data.total || data.amount || 0),
            status: data.status || 'pending',
            createdAt: data.createdAt || null,
            updatedAt: data.updatedAt || null,
            shippingAddress: data.shippingAddress || null,
            notes: data.notes || data.comments || null,
          };
        });

        // Apply filters in JavaScript (REST API doesn't support complex queries)
        if (req.query.status) {
          orders = orders.filter(o => o.status === req.query.status);
        }
        if (req.query.startDate) {
          const startDate = new Date(req.query.startDate);
          orders = orders.filter(o => o.createdAt && new Date(o.createdAt) >= startDate);
        }
        if (req.query.endDate) {
          const endDate = new Date(req.query.endDate);
          endDate.setHours(23, 59, 59, 999);
          orders = orders.filter(o => o.createdAt && new Date(o.createdAt) <= endDate);
        }

        // Sort by createdAt descending
        orders.sort((a, b) => {
          const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bDate - aDate;
        });

        // Apply pagination
        const limit = parseInt(req.query.limit) || 50;
        if (limit > 0) {
          orders = orders.slice(0, limit);
        }
      }
    } else {
      // Use REST API directly
      const ordersData = await getFirestoreCollection('orders', idToken);
      orders = ordersData.map(data => {
        return {
          id: data.id,
          orderId: data.orderId || `#ORD-${data.id?.substring(0, 6).toUpperCase() || 'N/A'}`,
          customer: {
            name: data.customerName || data.customer?.name || 'Unknown',
            email: data.customerEmail || data.customer?.email || '',
            avatar: data.customerAvatar || data.customer?.avatar || null,
          },
          products: data.products || data.items || [],
          total: parseFloat(data.total || data.amount || 0),
          status: data.status || 'pending',
          createdAt: data.createdAt || null,
          updatedAt: data.updatedAt || null,
          shippingAddress: data.shippingAddress || null,
          notes: data.notes || data.comments || null,
        };
      });

      // Apply filters in JavaScript
      if (req.query.status) {
        orders = orders.filter(o => o.status === req.query.status);
      }
      if (req.query.startDate) {
        const startDate = new Date(req.query.startDate);
        orders = orders.filter(o => o.createdAt && new Date(o.createdAt) >= startDate);
      }
      if (req.query.endDate) {
        const endDate = new Date(req.query.endDate);
        endDate.setHours(23, 59, 59, 999);
        orders = orders.filter(o => o.createdAt && new Date(o.createdAt) <= endDate);
      }

      // Sort by createdAt descending
      orders.sort((a, b) => {
        const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bDate - aDate;
      });

      // Apply pagination
      const limit = parseInt(req.query.limit) || 50;
      if (limit > 0) {
        orders = orders.slice(0, limit);
      }
    }

    return sendSuccess(res, orders, 'Orders retrieved successfully');
  } catch (error) {
    console.error('Get orders error:', error);
    return sendError(res, 'Failed to retrieve orders', 500, error);
  }
}));

/**
 * GET /api/orders/:id
 * Get single order by ID
 */
router.get('/:id', verifyToken, asyncHandler(async (req, res) => {
  try {
    // Get the ID token for REST API calls
    const authHeader = req.headers.authorization;
    const idToken = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.split('Bearer ')[1] 
      : null;

    let order = null;

    // Try Admin SDK first
    if (db && typeof db.collection === 'function') {
      try {
        const orderDoc = await db.collection('orders').doc(req.params.id).get();

        if (!orderDoc.exists) {
          return sendError(res, 'Order not found', 404);
        }

        const data = orderDoc.data();
        order = {
          id: orderDoc.id,
          orderId: data.orderId || `#ORD-${orderDoc.id.substring(0, 6).toUpperCase()}`,
          customer: {
            name: data.customerName || data.customer?.name || 'Unknown',
            email: data.customerEmail || data.customer?.email || '',
            avatar: data.customerAvatar || data.customer?.avatar || null,
          },
          products: data.products || data.items || [],
          total: parseFloat(data.total || data.amount || 0),
          status: data.status || 'pending',
          createdAt: data.createdAt?.toDate?.() || data.createdAt || null,
          updatedAt: data.updatedAt?.toDate?.() || data.updatedAt || null,
          shippingAddress: data.shippingAddress || null,
          notes: data.notes || data.comments || null,
        };
      } catch (adminError) {
        console.warn('Admin SDK failed, trying REST API:', adminError.message);
        // Fallback to REST API
        const orderData = await getFirestoreDocument('orders', req.params.id, idToken);
        if (!orderData) {
          return sendError(res, 'Order not found', 404);
        }
        order = {
          id: orderData.id,
          orderId: orderData.orderId || `#ORD-${orderData.id?.substring(0, 6).toUpperCase() || 'N/A'}`,
          customer: {
            name: orderData.customerName || orderData.customer?.name || 'Unknown',
            email: orderData.customerEmail || orderData.customer?.email || '',
            avatar: orderData.customerAvatar || orderData.customer?.avatar || null,
          },
          products: orderData.products || orderData.items || [],
          total: parseFloat(orderData.total || orderData.amount || 0),
          status: orderData.status || 'pending',
          createdAt: orderData.createdAt || null,
          updatedAt: orderData.updatedAt || null,
          shippingAddress: orderData.shippingAddress || null,
          notes: orderData.notes || orderData.comments || null,
        };
      }
    } else {
      // Use REST API directly
      const orderData = await getFirestoreDocument('orders', req.params.id, idToken);
      if (!orderData) {
        return sendError(res, 'Order not found', 404);
      }
      order = {
        id: orderData.id,
        orderId: orderData.orderId || `#ORD-${orderData.id?.substring(0, 6).toUpperCase() || 'N/A'}`,
        customer: {
          name: orderData.customerName || orderData.customer?.name || 'Unknown',
          email: orderData.customerEmail || orderData.customer?.email || '',
          avatar: orderData.customerAvatar || orderData.customer?.avatar || null,
        },
        products: orderData.products || orderData.items || [],
        total: parseFloat(orderData.total || orderData.amount || 0),
        status: orderData.status || 'pending',
        createdAt: orderData.createdAt || null,
        updatedAt: orderData.updatedAt || null,
        shippingAddress: orderData.shippingAddress || null,
        notes: orderData.notes || orderData.comments || null,
      };
    }

    return sendSuccess(res, order, 'Order retrieved successfully');
  } catch (error) {
    console.error('Get order error:', error);
    return sendError(res, 'Failed to retrieve order', 500, error);
  }
}));

/**
 * PATCH /api/orders/:id/status
 * Update order status
 */
router.patch('/:id/status', verifyToken, asyncHandler(async (req, res) => {
  try {
    const { status, notes } = req.body;

    if (!status) {
      return sendError(res, 'Status is required', 400);
    }

    const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'completed', 'cancelled', 'paid', 'rejected'];
    if (!validStatuses.includes(status.toLowerCase())) {
      return sendError(res, `Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);
    }

    // Get the ID token for REST API calls
    const authHeader = req.headers.authorization;
    const idToken = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.split('Bearer ')[1] 
      : null;

    const updateData = {
      status: status.toLowerCase(),
      updatedAt: new Date(),
    };

    if (notes !== undefined) {
      updateData.notes = notes;
      updateData.comments = notes; // Also update comments field for compatibility
    }

    // Handle rejectedReason if status is rejected
    if (status.toLowerCase() === 'rejected' && req.body.rejectedReason) {
      updateData.rejectedReason = req.body.rejectedReason;
    }

    // Try Admin SDK first
    if (db && typeof db.collection === 'function') {
      try {
        const orderRef = db.collection('orders').doc(req.params.id);
        const orderDoc = await orderRef.get();

        if (!orderDoc.exists) {
          return sendError(res, 'Order not found', 404);
        }

        await orderRef.update(updateData);
      } catch (adminError) {
        console.warn('Admin SDK failed, trying REST API:', adminError.message);
        // Fallback to REST API
        // First check if order exists
        const existingOrder = await getFirestoreDocument('orders', req.params.id, idToken);
        if (!existingOrder) {
          return sendError(res, 'Order not found', 404);
        }
        // Update using createDocument with docId (which performs PATCH)
        await createFirestoreDocument('orders', updateData, idToken, req.params.id);
      }
    } else {
      // Use REST API directly
      const existingOrder = await getFirestoreDocument('orders', req.params.id, idToken);
      if (!existingOrder) {
        return sendError(res, 'Order not found', 404);
      }
      // Update using createDocument with docId (which performs PATCH)
      await createFirestoreDocument('orders', updateData, idToken, req.params.id);
    }

    return sendSuccess(res, { status: updateData.status, notes: updateData.notes }, 'Order status updated successfully');
  } catch (error) {
    console.error('Update order status error:', error);
    return sendError(res, 'Failed to update order status', 500, error);
  }
}));

/**
 * DELETE /api/orders/:id
 * Delete an order
 */
router.delete('/:id', verifyToken, asyncHandler(async (req, res) => {
  try {
    // Get the ID token for REST API calls
    const authHeader = req.headers.authorization;
    const idToken = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.split('Bearer ')[1] 
      : null;

    // Try Admin SDK first
    if (db && typeof db.collection === 'function') {
      try {
        const orderRef = db.collection('orders').doc(req.params.id);
        const orderDoc = await orderRef.get();

        if (!orderDoc.exists) {
          return sendError(res, 'Order not found', 404);
        }

        await orderRef.delete();
      } catch (adminError) {
        console.warn('Admin SDK failed, trying REST API:', adminError.message);
        // Fallback to REST API
        // First check if order exists
        const existingOrder = await getFirestoreDocument('orders', req.params.id, idToken);
        if (!existingOrder) {
          return sendError(res, 'Order not found', 404);
        }
        // Delete using REST API
        await deleteFirestoreDocument('orders', req.params.id, idToken);
      }
    } else {
      // Use REST API directly
      const existingOrder = await getFirestoreDocument('orders', req.params.id, idToken);
      if (!existingOrder) {
        return sendError(res, 'Order not found', 404);
      }
      // Delete using REST API
      await deleteFirestoreDocument('orders', req.params.id, idToken);
    }

    return sendSuccess(res, null, 'Order deleted successfully');
  } catch (error) {
    console.error('Delete order error:', error);
    return sendError(res, 'Failed to delete order', 500, error);
  }
}));

module.exports = router;


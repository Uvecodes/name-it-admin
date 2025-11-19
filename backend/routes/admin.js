// Admin Routes
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { db, storage } = require('../config');
const { sendSuccess, sendError, asyncHandler } = require('../utils/api-helpers');
const { verifyToken } = require('../middleware/auth');
const { getDocument: getFirestoreDocument, getCollection: getFirestoreCollection } = require('../utils/firestore-rest');

// Configure multer for file uploads (in-memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  },
});

/**
 * GET /api/admin/profile
 * Get admin profile data
 */
router.get('/profile', verifyToken, asyncHandler(async (req, res) => {
  try {
    // Check if req.user is set (should be set by verifyToken middleware)
    if (!req.user || !req.user.uid) {
      console.error('req.user is not set or missing uid:', req.user);
      return sendError(res, 'User not authenticated', 401);
    }

    console.log('Fetching profile for user:', req.user.uid);

    // Try to get admin data from Firestore (if available)
    // Always default to null - we'll return basic user info if Firestore fails
    let adminData = null;
    
    // First try Admin SDK (if available and has credentials)
    if (db && typeof db.collection === 'function') {
      try {
        console.log('Attempting to fetch from Firestore (Admin SDK)...');
        const adminDoc = await db.collection('admin').doc(req.user.uid).get();
        adminData = adminDoc.exists ? adminDoc.data() : null;
        console.log('Firestore result (Admin SDK):', adminDoc.exists ? 'found' : 'not found');
      } catch (firestoreError) {
        // If Admin SDK fails (credentials issue), try REST API instead
        console.warn('Admin SDK failed, trying Firestore REST API:', firestoreError.message);
      }
    }
    
    // If Admin SDK didn't work, try REST API (uses API key, respects security rules)
    if (!adminData) {
      try {
        // Get the ID token from the request
        const authHeader = req.headers.authorization;
        const idToken = authHeader && authHeader.startsWith('Bearer ') 
          ? authHeader.split('Bearer ')[1] 
          : null;
        
        adminData = await getFirestoreDocument('admin', req.user.uid, idToken);
      } catch (restApiError) {
        // Catch REST API errors (network, permissions, etc.)
        // Silently fail and return basic info (non-critical)
        adminData = null;
      }
    }

    // If admin document doesn't exist, return basic user info
    // This allows the profile page to work even if Firestore isn't fully set up
    if (!adminData) {
      return sendSuccess(res, {
        uid: req.user.uid,
        name: '',
        email: req.user.email || '',
        avatarUrl: null,
        createdAt: null,
        updatedAt: null,
      }, 'Profile retrieved successfully (basic info)');
    }

    // Safely convert Firestore Timestamps to dates
    let createdAt = null;
    let updatedAt = null;
    try {
      if (adminData.createdAt) {
        createdAt = adminData.createdAt.toDate ? adminData.createdAt.toDate() : adminData.createdAt;
      }
    } catch (e) {
      console.warn('Error converting createdAt:', e.message);
    }
    try {
      if (adminData.updatedAt) {
        updatedAt = adminData.updatedAt.toDate ? adminData.updatedAt.toDate() : adminData.updatedAt;
      }
    } catch (e) {
      console.warn('Error converting updatedAt:', e.message);
    }
    
    return sendSuccess(res, {
      uid: req.user.uid,
      name: adminData.name || '',
      email: adminData.email || req.user.email,
      avatarUrl: adminData.avatarUrl || null,
      createdAt: createdAt,
      updatedAt: updatedAt,
    }, 'Profile retrieved successfully');
  } catch (error) {
    console.error('Get profile error:', error.message);
    return sendError(res, 'Failed to retrieve profile', 500, error);
  }
}));

/**
 * GET /api/admin/stats
 * Get admin statistics (product count, orders count, revenue, etc.)
 */
router.get('/stats', verifyToken, asyncHandler(async (req, res) => {
  try {
    // Get the ID token for REST API calls
    const authHeader = req.headers.authorization;
    const idToken = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.split('Bearer ')[1] 
      : null;

    // Get product count
    let productCount = 0;
    try {
      // Try Admin SDK first (if available and has credentials)
      if (db && typeof db.collection === 'function') {
        try {
          const productsSnapshot = await db.collection('products').get();
          productCount = productsSnapshot.size;
        } catch (adminError) {
          // Admin SDK failed (credentials issue), try REST API
          console.warn('Admin SDK failed for products, trying REST API:', adminError.message);
          const products = await getFirestoreCollection('products', idToken);
          productCount = products.length;
        }
      } else {
        // Use REST API directly
        const products = await getFirestoreCollection('products', idToken);
        productCount = products.length;
      }
    } catch (error) {
      console.error('Error fetching product count:', error.message);
      // Continue with 0 if error occurs
      productCount = 0;
    }

    // Get orders statistics (if orders collection exists)
    let ordersCount = 0;
    let revenue = 0;
    try {
      // Try Admin SDK first (if available and has credentials)
      if (db && typeof db.collection === 'function') {
        try {
          const ordersSnapshot = await db.collection('orders').get();
          ordersCount = ordersSnapshot.size;

          // Calculate revenue from completed/delivered orders
          ordersSnapshot.forEach(doc => {
            const orderData = doc.data();
            const status = (orderData.status || '').toLowerCase();
            const total = parseFloat(orderData.total || orderData.amount || 0);

            if (status === 'delivered' || status === 'completed') {
              revenue += total;
            }
          });
        } catch (adminError) {
          // Admin SDK failed (credentials issue), try REST API
          console.warn('Admin SDK failed for orders, trying REST API:', adminError.message);
          const orders = await getFirestoreCollection('orders', idToken);
          ordersCount = orders.length;

          // Calculate revenue from completed/delivered orders
          orders.forEach(order => {
            const status = (order.status || '').toLowerCase();
            const total = parseFloat(order.total || order.amount || 0);

            if (status === 'delivered' || status === 'completed') {
              revenue += total;
            }
          });
        }
      } else {
        // Use REST API directly
        const orders = await getFirestoreCollection('orders', idToken);
        ordersCount = orders.length;

        // Calculate revenue from completed/delivered orders
        orders.forEach(order => {
          const status = (order.status || '').toLowerCase();
          const total = parseFloat(order.total || order.amount || 0);

          if (status === 'delivered' || status === 'completed') {
            revenue += total;
          }
        });
      }
    } catch (error) {
      // Orders collection might not exist, that's okay
      console.warn('Orders collection might not exist:', error.message);
      ordersCount = 0;
      revenue = 0;
    }

    return sendSuccess(res, {
      productCount,
      ordersCount,
      revenue: Math.round(revenue * 100) / 100, // Round to 2 decimal places
    }, 'Statistics retrieved successfully');
  } catch (error) {
    console.error('Get stats error:', error);
    return sendError(res, 'Failed to retrieve statistics', 500, error);
  }
}));

/**
 * POST /api/admin/avatar
 * Upload admin avatar
 */
router.post('/avatar', verifyToken, upload.single('avatar'), asyncHandler(async (req, res) => {
  try {
    if (!req.file) {
      return sendError(res, 'No file uploaded', 400);
    }

    // Validate file type
    if (!req.file.mimetype.startsWith('image/')) {
      return sendError(res, 'Only image files are allowed', 400);
    }

    // Validate file size (already handled by multer, but double-check)
    if (req.file.size > 5 * 1024 * 1024) {
      return sendError(res, 'File size must be less than 5MB', 400);
    }

    // Upload to Firebase Storage
    const bucket = storage.bucket();
    const fileName = `admin-avatars/${req.user.uid}/${Date.now()}_${req.file.originalname}`;
    const file = bucket.file(fileName);

    // Upload file
    await file.save(req.file.buffer, {
      metadata: {
        contentType: req.file.mimetype,
        metadata: {
          uploadedBy: req.user.uid,
          uploadedAt: new Date().toISOString(),
        },
      },
    });

    // Make file publicly accessible
    await file.makePublic();

    // Get public URL
    const avatarUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

    // Update admin document in Firestore
    await db.collection('admin').doc(req.user.uid).set(
      {
        avatarUrl: avatarUrl,
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return sendSuccess(res, {
      avatarUrl: avatarUrl,
    }, 'Avatar uploaded successfully');
  } catch (error) {
    console.error('Upload avatar error:', error);
    
    if (error.message === 'Only image files are allowed') {
      return sendError(res, error.message, 400);
    }
    
    return sendError(res, 'Failed to upload avatar', 500, error);
  }
}));

module.exports = router;


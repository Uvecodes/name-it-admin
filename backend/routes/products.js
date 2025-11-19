// Product Routes
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { db, storage } = require('../config');
const { sendSuccess, sendError, asyncHandler, validateRequiredFields } = require('../utils/api-helpers');
const { verifyToken } = require('../middleware/auth');
const { getCollection: getFirestoreCollection, getDocument: getFirestoreDocument, createDocument: createFirestoreDocument, deleteDocument: deleteFirestoreDocument } = require('../utils/firestore-rest');

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
 * GET /api/products
 * Get all products (with optional pagination and filtering)
 */
router.get('/', verifyToken, asyncHandler(async (req, res) => {
  try {
    // Get the ID token for REST API calls
    const authHeader = req.headers.authorization;
    const idToken = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.split('Bearer ')[1] 
      : null;

    let products = [];

    // Try Admin SDK first
    if (db && typeof db.collection === 'function') {
      try {
        let query = db.collection('products');
        // Apply ordering
        query = query.orderBy('createdAt', 'desc');
        // Get products
        const snapshot = await query.get();
        products = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt || null,
          updatedAt: doc.data().updatedAt?.toDate?.() || doc.data().updatedAt || null,
        }));
      } catch (adminError) {
        console.warn('Admin SDK failed, trying REST API:', adminError.message);
        // Fallback to REST API
        const productsData = await getFirestoreCollection('products', idToken);
        // Sort by createdAt descending (REST API doesn't support orderBy, so we sort in JS)
        products = productsData.sort((a, b) => {
          const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bDate - aDate;
        });
      }
    } else {
      // Use REST API directly
      const productsData = await getFirestoreCollection('products', idToken);
      // Sort by createdAt descending
      products = productsData.sort((a, b) => {
        const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bDate - aDate;
      });
    }

    return sendSuccess(res, products, 'Products retrieved successfully');
  } catch (error) {
    console.error('Get products error:', error);
    return sendError(res, 'Failed to retrieve products', 500, error);
  }
}));

/**
 * GET /api/products/:id
 * Get single product by ID
 */
router.get('/:id', verifyToken, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get the ID token for REST API calls
    const authHeader = req.headers.authorization;
    const idToken = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.split('Bearer ')[1] 
      : null;

    let product = null;

    // Try Admin SDK first
    if (db && typeof db.collection === 'function') {
      try {
        const doc = await db.collection('products').doc(id).get();
        if (doc.exists) {
          product = {
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt || null,
            updatedAt: doc.data().updatedAt?.toDate?.() || doc.data().updatedAt || null,
          };
        }
      } catch (adminError) {
        console.warn('Admin SDK failed, trying REST API:', adminError.message);
        // Fallback to REST API
        product = await getFirestoreDocument('products', id, idToken);
        if (product) {
          product.id = id;
        }
      }
    } else {
      // Use REST API directly
      product = await getFirestoreDocument('products', id, idToken);
      if (product) {
        product.id = id;
      }
    }

    if (!product) {
      return sendError(res, 'Product not found', 404);
    }

    return sendSuccess(res, product, 'Product retrieved successfully');
  } catch (error) {
    console.error('Get product error:', error);
    return sendError(res, 'Failed to retrieve product', 500, error);
  }
}));

/**
 * POST /api/products
 * Create a new product
 */
router.post('/', verifyToken, upload.single('image'), asyncHandler(async (req, res) => {
  try {
    const { name, description, price, count, category, status } = req.body;

    // Validate required fields
    const missing = validateRequiredFields(req.body, ['name', 'description', 'price', 'count', 'category']);
    if (missing.length > 0) {
      return sendError(res, `Missing required fields: ${missing.join(', ')}`, 400);
    }

    // Validate price and count
    const priceNum = parseFloat(price);
    const countNum = parseInt(count);

    if (isNaN(priceNum) || priceNum <= 0) {
      return sendError(res, 'Price must be a positive number', 400);
    }

    if (isNaN(countNum) || countNum < 0) {
      return sendError(res, 'Count must be a non-negative integer', 400);
    }

    // Handle image upload
    let imageUrl = null;
    if (req.file) {
      // Validate file type
      if (!req.file.mimetype.startsWith('image/')) {
        return sendError(res, 'Only image files are allowed', 400);
      }

      // Try to upload to Firebase Storage using Admin SDK
      try {
        if (storage && typeof storage.bucket === 'function') {
          const bucket = storage.bucket();
          const fileName = `products/${Date.now()}_${req.file.originalname}`;
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
          imageUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        } else {
          throw new Error('Storage not available');
        }
      } catch (storageError) {
        console.warn('Storage upload failed:', storageError.message);
        // For base64 fallback, we need to compress/resize the image
        // Firestore has a 1MB limit on string values
        // Let's compress the image to a reasonable size
        try {
          const sharp = require('sharp');
          const compressedBuffer = await sharp(req.file.buffer)
            .resize(800, 800, { 
              fit: 'inside',
              withoutEnlargement: true 
            })
            .jpeg({ quality: 70 }) // Convert to JPEG and compress
            .toBuffer();
          
          const base64 = compressedBuffer.toString('base64');
          const sizeKB = Math.round(base64.length / 1024);
          
          if (base64.length > 900000) { // ~900KB limit to stay under 1MB
            throw new Error('Image is too large even after compression. Please use Firebase Storage or reduce image size.');
          }
          
          imageUrl = `data:image/jpeg;base64,${base64}`;
        } catch (compressionError) {
          // If sharp is not available or compression fails, provide helpful error
          console.error('Image compression failed:', compressionError.message);
          return sendError(res, 'Image is too large. Please install Firebase Storage credentials or reduce the image size. Alternatively, install "sharp" package for image compression: npm install sharp', 400);
        }
      }
    } else {
      return sendError(res, 'Product image is required', 400);
    }

    // Get the ID token for REST API calls
    const authHeader = req.headers.authorization;
    const idToken = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.split('Bearer ')[1] 
      : null;

    // Create product document
    const productData = {
      name: name.trim(),
      description: description.trim(),
      price: priceNum,
      count: countNum,
      category: category.trim(),
      imageUrl: imageUrl,
      status: status || 'active',
      popular: false,
      createdAt: new Date(),
      createdBy: req.user.uid,
    };

    let createdProduct;

    // Try Admin SDK first
    if (db && typeof db.collection === 'function') {
      try {
        const docRef = await db.collection('products').add(productData);
        createdProduct = {
          id: docRef.id,
          ...productData,
        };
      } catch (adminError) {
        console.warn('Admin SDK failed, trying REST API:', adminError.message);
        // Fallback to REST API
        try {
          createdProduct = await createFirestoreDocument('products', productData, idToken);
        } catch (restError) {
          console.error('REST API also failed:', restError);
          throw restError;
        }
      }
    } else {
      // Use REST API directly
      try {
        createdProduct = await createFirestoreDocument('products', productData, idToken);
      } catch (restError) {
        console.error('REST API failed:', restError.message);
        throw restError;
      }
    }

    return sendSuccess(res, createdProduct, 'Product created successfully', 201);
  } catch (error) {
    console.error('Create product error:', error.message);
    
    if (error.message === 'Only image files are allowed') {
      return sendError(res, error.message, 400);
    }
    
    // Provide more specific error message
    let errorMessage = 'Failed to create product';
    if (error.message.includes('Permission denied') || error.message.includes('403')) {
      errorMessage = 'Permission denied. Please check your Firestore security rules.';
    } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      errorMessage = 'Authentication failed. Please try logging in again.';
    }
    
    return sendError(res, errorMessage, 500, error);
  }
}));

/**
 * PUT /api/products/:id
 * Update a product
 */
router.put('/:id', verifyToken, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, count, category, status, popular } = req.body;

    // Get the ID token for REST API calls
    const authHeader = req.headers.authorization;
    const idToken = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.split('Bearer ')[1] 
      : null;

    // Build update object
    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description.trim();
    if (price !== undefined) {
      const priceNum = parseFloat(price);
      if (isNaN(priceNum) || priceNum <= 0) {
        return sendError(res, 'Price must be a positive number', 400);
      }
      updates.price = priceNum;
    }
    if (count !== undefined) {
      const countNum = parseInt(count);
      if (isNaN(countNum) || countNum < 0) {
        return sendError(res, 'Count must be a non-negative integer', 400);
      }
      updates.count = countNum;
    }
    if (category !== undefined) updates.category = category.trim();
    if (status !== undefined) updates.status = status;
    if (popular !== undefined) updates.popular = popular === true || popular === 'true';
    
    updates.updatedAt = new Date();

    let updatedProduct = null;

    // Try Admin SDK first
    if (db && typeof db.collection === 'function') {
      try {
        // Check if product exists
        const doc = await db.collection('products').doc(id).get();
        if (!doc.exists) {
          return sendError(res, 'Product not found', 404);
        }

        // Update product
        await db.collection('products').doc(id).update(updates);

        // Get updated product
        const updatedDoc = await db.collection('products').doc(id).get();
        updatedProduct = {
          id: updatedDoc.id,
          ...updatedDoc.data(),
          createdAt: updatedDoc.data().createdAt?.toDate?.() || updatedDoc.data().createdAt || null,
          updatedAt: updatedDoc.data().updatedAt?.toDate?.() || updatedDoc.data().updatedAt || null,
        };
      } catch (adminError) {
        console.warn('Admin SDK failed, trying REST API:', adminError.message);
        // Fallback to REST API
        const product = await getFirestoreDocument('products', id, idToken);
        if (!product) {
          return sendError(res, 'Product not found', 404);
        }

        // Update using REST API
        updatedProduct = await createFirestoreDocument('products', updates, idToken, id);
        // Merge with existing product data
        updatedProduct = {
          ...product,
          ...updatedProduct,
        };
      }
    } else {
      // Use REST API directly
      const product = await getFirestoreDocument('products', id, idToken);
      if (!product) {
        return sendError(res, 'Product not found', 404);
      }

      // Update using REST API
      updatedProduct = await createFirestoreDocument('products', updates, idToken, id);
      // Merge with existing product data
      updatedProduct = {
        ...product,
        ...updatedProduct,
      };
    }

    return sendSuccess(res, updatedProduct, 'Product updated successfully');
  } catch (error) {
    console.error('Update product error:', error);
    return sendError(res, 'Failed to update product', 500, error);
  }
}));

/**
 * PATCH /api/products/:id/popular
 * Toggle popular status of a product
 */
router.patch('/:id/popular', verifyToken, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { popular } = req.body;

    // Get the ID token for REST API calls
    const authHeader = req.headers.authorization;
    const idToken = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.split('Bearer ')[1] 
      : null;

    const makePopular = popular === true || popular === 'true';

    // Check if product exists and get current data
    let product = null;
    let updatedProduct = null;

    // Try Admin SDK first
    if (db && typeof db.collection === 'function') {
      try {
        const doc = await db.collection('products').doc(id).get();
        if (!doc.exists) {
          return sendError(res, 'Product not found', 404);
        }
        product = { id: doc.id, ...doc.data() };

        // If making popular, check if we already have 4 popular products
        if (makePopular) {
          const popularSnapshot = await db.collection('products')
            .where('popular', '==', true)
            .get();
          
          const popularCount = popularSnapshot.docs.filter(d => d.id !== id).length;
          if (popularCount >= 4) {
            return sendError(res, 'Maximum of 4 products can be popular at a time. Please remove a popular product first.', 400);
          }
        }

        // Update popular status
        await db.collection('products').doc(id).update({
          popular: makePopular,
          updatedAt: new Date(),
        });

        // Get updated product
        const updatedDoc = await db.collection('products').doc(id).get();
        updatedProduct = {
          id: updatedDoc.id,
          ...updatedDoc.data(),
          createdAt: updatedDoc.data().createdAt?.toDate?.() || updatedDoc.data().createdAt || null,
          updatedAt: updatedDoc.data().updatedAt?.toDate?.() || updatedDoc.data().updatedAt || null,
        };
      } catch (adminError) {
        console.warn('Admin SDK failed, trying REST API:', adminError.message);
        // Fallback to REST API
        product = await getFirestoreDocument('products', id, idToken);
        if (!product) {
          return sendError(res, 'Product not found', 404);
        }
        product.id = id;

        // If making popular, check if we already have 4 popular products
        if (makePopular) {
          const allProducts = await getFirestoreCollection('products', idToken);
          const popularCount = allProducts.filter(p => p.popular === true && p.id !== id).length;
          if (popularCount >= 4) {
            return sendError(res, 'Maximum of 4 products can be popular at a time. Please remove a popular product first.', 400);
          }
        }

        // Update using REST API
        const updateData = {
          popular: makePopular,
          updatedAt: new Date(),
        };
        updatedProduct = await createFirestoreDocument('products', updateData, idToken, id);
        // Merge with existing product data
        updatedProduct = {
          ...product,
          ...updatedProduct,
        };
      }
    } else {
      // Use REST API directly
      product = await getFirestoreDocument('products', id, idToken);
      if (!product) {
        return sendError(res, 'Product not found', 404);
      }
      product.id = id;

      // If making popular, check if we already have 4 popular products
      if (makePopular) {
        const allProducts = await getFirestoreCollection('products', idToken);
        const popularCount = allProducts.filter(p => p.popular === true && p.id !== id).length;
        if (popularCount >= 4) {
          return sendError(res, 'Maximum of 4 products can be popular at a time. Please remove a popular product first.', 400);
        }
      }

      // Update using REST API
      const updateData = {
        popular: makePopular,
        updatedAt: new Date(),
      };
      updatedProduct = await createFirestoreDocument('products', updateData, idToken, id);
      // Merge with existing product data
      updatedProduct = {
        ...product,
        ...updatedProduct,
      };
    }

    return sendSuccess(res, updatedProduct, makePopular ? 'Product marked as popular' : 'Product removed from popular');
  } catch (error) {
    console.error('Toggle popular error:', error);
    return sendError(res, 'Failed to update popular status', 500, error);
  }
}));

/**
 * DELETE /api/products/:id
 * Delete a product
 */
router.delete('/:id', verifyToken, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    // Get the ID token for REST API calls
    const authHeader = req.headers.authorization;
    const idToken = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.split('Bearer ')[1] 
      : null;

    // Use REST API directly (Admin SDK requires credentials that aren't set up)
    console.log('Using REST API to delete product:', id);
    
    // Check if product exists
    const productData = await getFirestoreDocument('products', id, idToken);
    if (!productData) {
      console.log('Product not found via REST API');
      return sendError(res, 'Product not found', 404);
    }

    console.log('Product found, deleting via REST API...');
    // Delete using REST API
    await deleteFirestoreDocument('products', id, idToken);
    console.log('Product deleted successfully via REST API');
    return sendSuccess(res, null, 'Product deleted successfully');
  } catch (error) {
    console.error('Delete product error:', error.message);
    console.error('Delete product error details:', {
      message: error.message,
      status: error.status,
      data: error.data,
    });
    
    // Provide more specific error message
    let errorMessage = 'Failed to delete product';
    if (error.message.includes('Permission denied') || error.message.includes('403')) {
      errorMessage = 'Permission denied. Please check your Firestore security rules.';
    } else if (error.message.includes('404') || error.message.includes('not found')) {
      errorMessage = 'Product not found.';
    } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      errorMessage = 'Authentication failed. Please try logging in again.';
    }
    
    return sendError(res, errorMessage, 500, error);
  }
}));

module.exports = router;


// Firestore REST API Helper
// Uses Firebase REST API with API key instead of Admin SDK
// This respects Firestore security rules (unlike Admin SDK)

const { firebaseConfig } = require('../config');

const FIRESTORE_REST_URL = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;
const API_KEY = process.env.FIREBASE_API_KEY || firebaseConfig.apiKey;

/**
 * Get a document from Firestore using REST API
 * @param {string} collection - Collection name
 * @param {string} docId - Document ID
 * @param {string} idToken - Firebase ID token (for authenticated requests)
 * @returns {Promise<Object|null>} Document data or null if not found
 */
async function getDocument(collection, docId, idToken = null) {
  try {
    const url = `${FIRESTORE_REST_URL}/${collection}/${docId}`;
    const headers = {
      'Content-Type': 'application/json',
    };

    // Add authorization header if token is provided
    if (idToken) {
      headers['Authorization'] = `Bearer ${idToken}`;
    } else {
      // Use API key for unauthenticated requests (if rules allow)
      headers['X-Goog-Api-Key'] = API_KEY;
    }

    // Use fetch or https
    let response;
    if (typeof fetch !== 'undefined') {
      response = await fetch(url, {
        method: 'GET',
        headers: headers,
      });
    } else {
      // Fallback to https module
      const https = require('https');
      const { URL } = require('url');
      
      response = await new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
          hostname: urlObj.hostname,
          path: urlObj.pathname + urlObj.search,
          method: 'GET',
          headers: headers,
        };

        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              statusText: res.statusMessage,
              json: async () => JSON.parse(data),
            });
          });
        });

        req.on('error', (error) => {
          reject(error);
        });

        req.end();
      });
    }

    if (!response.ok) {
      if (response.status === 404) {
        return null; // Document not found
      }
      throw new Error(`Firestore REST API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Convert Firestore REST API format to simple object
    if (!data.fields) {
      return null;
    }

    return convertFirestoreFields(data.fields);
  } catch (error) {
    console.error('Error fetching document from Firestore REST API:', error);
    throw error;
  }
}

/**
 * Get all documents from a collection using REST API
 * @param {string} collection - Collection name
 * @param {string} idToken - Firebase ID token (for authenticated requests)
 * @returns {Promise<Array>} Array of documents
 */
async function getCollection(collection, idToken = null) {
  try {
    const url = `${FIRESTORE_REST_URL}/${collection}`;
    const headers = {
      'Content-Type': 'application/json',
    };

    if (idToken) {
      headers['Authorization'] = `Bearer ${idToken}`;
    } else {
      headers['X-Goog-Api-Key'] = API_KEY;
    }

    let response;
    if (typeof fetch !== 'undefined') {
      response = await fetch(url, {
        method: 'GET',
        headers: headers,
      });
    } else {
      const https = require('https');
      const { URL } = require('url');
      
      response = await new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
          hostname: urlObj.hostname,
          path: urlObj.pathname + urlObj.search,
          method: 'GET',
          headers: headers,
        };

        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              statusText: res.statusMessage,
              json: async () => JSON.parse(data),
            });
          });
        });

        req.on('error', reject);
        req.end();
      });
    }

    if (!response.ok) {
      throw new Error(`Firestore REST API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.documents || data.documents.length === 0) {
      return [];
    }

    return data.documents.map(doc => {
      const docId = doc.name.split('/').pop();
      return {
        id: docId,
        ...convertFirestoreFields(doc.fields),
      };
    });
  } catch (error) {
    console.error('Error fetching collection from Firestore REST API:', error);
    throw error;
  }
}

/**
 * Convert Firestore REST API field format to JavaScript values
 * @param {Object} fields - Firestore fields object
 * @returns {Object} Plain JavaScript object
 */
function convertFirestoreFields(fields) {
  const result = {};
  
  for (const [key, value] of Object.entries(fields)) {
    if (value.stringValue !== undefined) {
      result[key] = value.stringValue;
    } else if (value.integerValue !== undefined) {
      result[key] = parseInt(value.integerValue, 10);
    } else if (value.doubleValue !== undefined) {
      result[key] = parseFloat(value.doubleValue);
    } else if (value.booleanValue !== undefined) {
      result[key] = value.booleanValue === 'true' || value.booleanValue === true;
    } else if (value.timestampValue !== undefined) {
      result[key] = new Date(value.timestampValue);
    } else if (value.nullValue !== undefined) {
      result[key] = null;
    } else if (value.arrayValue) {
      result[key] = value.arrayValue.values.map(v => {
        if (v.stringValue !== undefined) return v.stringValue;
        if (v.integerValue !== undefined) return parseInt(v.integerValue, 10);
        if (v.doubleValue !== undefined) return parseFloat(v.doubleValue);
        if (v.booleanValue !== undefined) return v.booleanValue === 'true' || v.booleanValue === true;
        return v;
      });
    } else if (value.mapValue) {
      result[key] = convertFirestoreFields(value.mapValue.fields || {});
    }
  }
  
  return result;
}

/**
 * Create a document in Firestore using REST API
 * @param {string} collection - Collection name
 * @param {Object} data - Document data
 * @param {string} idToken - Firebase ID token (for authenticated requests)
 * @param {string} docId - Optional document ID (if not provided, Firestore will generate one)
 * @returns {Promise<Object>} Created document with ID
 */
async function createDocument(collection, data, idToken = null, docId = null) {
  try {
    let url;
    if (docId) {
      url = `${FIRESTORE_REST_URL}/${collection}/${docId}`;
    } else {
      url = `${FIRESTORE_REST_URL}/${collection}`;
    }

    const headers = {
      'Content-Type': 'application/json',
    };

    // Always use ID token if available (for authenticated requests)
    // API key alone might not work for writes
    if (idToken) {
      headers['Authorization'] = `Bearer ${idToken}`;
    } else {
      // Fallback to API key (may not work for writes depending on security rules)
      headers['X-Goog-Api-Key'] = API_KEY;
    }

    // Convert JavaScript values to Firestore REST API format
    const fields = convertToFirestoreFields(data);

    const body = { fields };
    
    // For PATCH requests (updating existing document), include updateMask as query parameter
    if (docId) {
      const fieldPaths = Object.keys(fields);
      if (fieldPaths.length > 0) {
        url += `?updateMask.fieldPaths=${fieldPaths.join('&updateMask.fieldPaths=')}`;
      }
    }

    // Reduced logging for performance (only log on errors)

    let response;
    if (typeof fetch !== 'undefined') {
      response = await fetch(url, {
        method: docId ? 'PATCH' : 'POST',
        headers: headers,
        body: JSON.stringify(body),
      });
    } else {
      const https = require('https');
      const { URL } = require('url');
      
      response = await new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
          hostname: urlObj.hostname,
          path: urlObj.pathname + urlObj.search,
          method: docId ? 'PATCH' : 'POST',
          headers: headers,
        };

        const req = https.request(options, (res) => {
          let responseData = '';
          res.on('data', (chunk) => {
            responseData += chunk;
          });
          res.on('end', () => {
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              statusText: res.statusMessage,
              json: async () => JSON.parse(responseData),
            });
          });
        });

        req.on('error', reject);
        req.write(JSON.stringify(body));
        req.end();
      });
    }

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        errorData = { message: response.statusText };
      }
      
      console.error('Firestore REST API error response:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData,
      });
      
      const errorMessage = errorData.error?.message || errorData.message || 'Unknown error';
      const error = new Error(`Firestore REST API error: ${response.status} ${response.statusText} - ${errorMessage}`);
      error.status = response.status;
      error.data = errorData;
      throw error;
    }

    const result = await response.json();
    
    // Extract document ID from the response
    // For POST requests, the document ID is in result.name
    // For PATCH requests, we already have docId
    let createdDocId = docId;
    if (!createdDocId && result.name) {
      const parts = result.name.split('/');
      createdDocId = parts[parts.length - 1];
    }
    
    // Return the created document data
    // If result has fields, use them; otherwise use the original data
    const documentData = result.fields ? convertFirestoreFields(result.fields) : data;
    
    return {
      id: createdDocId,
      ...documentData,
    };
  } catch (error) {
    console.error('Error creating document in Firestore REST API:', error);
    throw error;
  }
}

/**
 * Convert JavaScript values to Firestore REST API field format
 * @param {Object} data - Plain JavaScript object
 * @returns {Object} Firestore fields object
 */
function convertToFirestoreFields(data) {
  const fields = {};
  
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      fields[key] = { nullValue: null };
    } else if (typeof value === 'string') {
      fields[key] = { stringValue: value };
    } else if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        fields[key] = { integerValue: value.toString() };
      } else {
        fields[key] = { doubleValue: value.toString() };
      }
    } else if (typeof value === 'boolean') {
      fields[key] = { booleanValue: value };
    } else if (value instanceof Date) {
      // Firestore REST API expects timestamp in RFC3339 format
      fields[key] = { timestampValue: value.toISOString() };
    } else if (value && typeof value.toDate === 'function') {
      // Handle Firestore Timestamp objects
      fields[key] = { timestampValue: value.toDate().toISOString() };
    } else if (Array.isArray(value)) {
      fields[key] = {
        arrayValue: {
          values: value.map(v => {
            if (typeof v === 'string') return { stringValue: v };
            if (typeof v === 'number') {
              if (Number.isInteger(v)) return { integerValue: v.toString() };
              return { doubleValue: v.toString() };
            }
            if (typeof v === 'boolean') return { booleanValue: v };
            if (v instanceof Date) return { timestampValue: v.toISOString() };
            if (typeof v === 'object' && v !== null) return { mapValue: { fields: convertToFirestoreFields(v) } };
            return { nullValue: null };
          }),
        },
      };
    } else if (typeof value === 'object') {
      fields[key] = { mapValue: { fields: convertToFirestoreFields(value) } };
    }
  }
  
  return fields;
}

/**
 * Delete a document from Firestore using REST API
 * @param {string} collection - Collection name
 * @param {string} docId - Document ID
 * @param {string} idToken - Firebase ID token (for authenticated requests)
 * @returns {Promise<void>}
 */
async function deleteDocument(collection, docId, idToken = null) {
  try {
    const url = `${FIRESTORE_REST_URL}/${collection}/${docId}`;
    const headers = {
      'Content-Type': 'application/json',
    };

    // Always use ID token if available (for authenticated requests)
    if (idToken) {
      headers['Authorization'] = `Bearer ${idToken}`;
    } else {
      // Fallback to API key (may not work for deletes depending on security rules)
      headers['X-Goog-Api-Key'] = API_KEY;
    }

    let response;
    if (typeof fetch !== 'undefined') {
      response = await fetch(url, {
        method: 'DELETE',
        headers: headers,
      });
    } else {
      const https = require('https');
      const { URL } = require('url');
      
      response = await new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
          hostname: urlObj.hostname,
          path: urlObj.pathname + urlObj.search,
          method: 'DELETE',
          headers: headers,
        };

        const req = https.request(options, (res) => {
          let responseData = '';
          res.on('data', (chunk) => {
            responseData += chunk;
          });
          res.on('end', () => {
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              statusText: res.statusMessage,
              json: async () => {
                if (responseData && responseData.trim()) {
                  return JSON.parse(responseData);
                }
                return {};
              },
            });
          });
        });

        req.on('error', reject);
        req.end();
      });
    }

    if (!response.ok) {
      let errorData;
      try {
        const jsonData = await response.json();
        errorData = jsonData;
      } catch (e) {
        // If response body is empty or not JSON, use status text
        errorData = { message: response.statusText || 'Unknown error' };
      }
      
      console.error('Firestore REST API delete error response:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData,
      });
      
      const errorMessage = errorData.error?.message || errorData.message || 'Unknown error';
      const error = new Error(`Firestore REST API error: ${response.status} ${response.statusText} - ${errorMessage}`);
      error.status = response.status;
      error.data = errorData;
      throw error;
    }

    // DELETE requests return empty body on success
    return;
  } catch (error) {
    console.error('Error deleting document from Firestore REST API:', error);
    throw error;
  }
}

module.exports = {
  getDocument,
  getCollection,
  createDocument,
  deleteDocument,
  convertFirestoreFields,
  convertToFirestoreFields,
};


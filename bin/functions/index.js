const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize the admin SDK if not already
try {
  admin.initializeApp();
} catch (e) {
  // already initialized
}

const db = admin.firestore();

// Callable function to request admin rights. This should be protected and only
// callable by authenticated users. The function will create an adminRequests
// document and (optionally) send an email/notification to existing admins.
exports.requestAdmin = functions.https.onCall(async (data, context) => {
  // Ensure the user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated to request admin.');
  }

  const uid = context.auth.uid;
  const { name, email } = data || {};

  if (!email || !name) {
    throw new functions.https.HttpsError('invalid-argument', 'Name and email are required.');
  }

  // Create an adminRequests doc for manual review
  const requestRef = db.collection('adminRequests').doc(uid);
  await requestRef.set({
    uid,
    name,
    email,
    status: 'pending',
    requestedAt: admin.firestore.FieldValue.serverTimestamp(),
    requestedBy: uid
  });

  // Optionally: notify existing admins (e.g., send email, write to a queue, etc.)
  // TODO: implement notification logic (sendgrid, pubsub, etc.)

  return { success: true };
});

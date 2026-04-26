// public/js/firebase-config.js
// ──────────────────────────────────────────────────────────────
// Fill in your Firebase project credentials here.
// Get these from: Firebase Console → Project Settings → Your Apps
// ──────────────────────────────────────────────────────────────

const firebaseConfig = {
    apiKey:            "YOUR_API_KEY",
    authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
    projectId:         "YOUR_PROJECT_ID",
    storageBucket:     "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId:             "YOUR_APP_ID",
};

// Initialize Firebase (only if credentials are filled in)
if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
    firebase.initializeApp(firebaseConfig);
    console.log("Firebase initialized ✓");
} else {
    console.warn("Firebase not configured — running in demo mode. Fill in public/js/firebase-config.js to enable persistence.");
}

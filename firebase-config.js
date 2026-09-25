// firebase-config.js
// Central Firebase init for the whole site. Every page/script that needs
// Firestore or Auth should import { db, auth } from here (relative path
// varies by folder depth, e.g. '../firebase-config.js' from MainList/).
//
// Uses the Firebase modular CDN build directly — no npm/bundler in this
// project, so we can't `import "firebase/app"` like the console snippet
// shows. This is the equivalent for a plain <script type="module"> site.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCujNE2tak3SPCH_MEJ54skGe83Alnw338",
  authDomain: "kaizolist.firebaseapp.com",
  projectId: "kaizolist",
  storageBucket: "kaizolist.firebasestorage.app",
  messagingSenderId: "114689077926",
  appId: "1:114689077926:web:c44bd25bb632ac8121ba67",
  measurementId: "G-05BRK2LQ86"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);

importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyCujNE2tak3SPCH_MEJ54skGe83Alnw338",
    authDomain: "kaizolist.firebaseapp.com",
    projectId: "kaizolist",
    storageBucket: "kaizolist.firebasestorage.app",
    messagingSenderId: "114689077926",
    appId: "1:114689077926:web:c44bd25bb632ac8121ba67",
});
firebase.messaging();

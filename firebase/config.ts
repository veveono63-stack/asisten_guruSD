import { initializeApp } from 'firebase/app';
import * as firebaseAuth from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAia3IehEalptnrdQaFVw9WfFpUYKeJYZ4",
  authDomain: "e-perangkat-pembelajaran.firebaseapp.com",
  projectId: "e-perangkat-pembelajaran",
  storageBucket: "e-perangkat-pembelajaran.appspot.com",
  messagingSenderId: "856270816801",
  appId: "1:856270816801:web:e2855422072d7015a0c560",
  measurementId: "G-VML6BB0VB6"
};


// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Get Firebase services
const auth = firebaseAuth.getAuth(app);
const db = getFirestore(app);

export { auth, db };
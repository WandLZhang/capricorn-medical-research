// Copyright 2025 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// src/firebase.js
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  getDocs, 
  updateDoc,
  deleteDoc, 
  doc,
  getDoc,
  onSnapshot
} from 'firebase/firestore';

// Your Firebase configuration object
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Get Auth and Firestore instances
export const auth = getAuth(app);
export const db = getFirestore(app, process.env.REACT_APP_FIREBASE_DATABASE_ID || "capricorn-eu");

// Helper functions for chat operations
// In firebase.js
export const createNewChat = async (userId, initialMessages) => {
  try {
    const chatRef = await addDoc(collection(db, `chats/${userId}/conversations`), {
      createdAt: new Date(),
      updatedAt: new Date(),
      messages: initialMessages,
      template: 'default'
    });
    return chatRef.id;
  } catch (error) {
    console.error('Error creating new chat:', error);
    throw error;
  }
};

export const addMessageToChat = async (userId, chatId, message) => {
  try {
    const chatRef = doc(db, `chats/${userId}/conversations/${chatId}`);
    await updateDoc(chatRef, {
      messages: [...message],  // Firestore will merge this with existing messages
      updatedAt: new Date()
    });
  } catch (error) {
    console.error('Error adding message to chat:', error);
    throw error;
  }
};

export const getUserChats = async (userId) => {
  try {
    const chatsRef = collection(db, `chats/${userId}/conversations`);
    const q = query(chatsRef, orderBy('updatedAt', 'desc'));
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error getting user chats:', error);
    throw error;
  }
};

export const updateChatTitle = async (userId, chatId, newTitle) => {
  try {
    const chatRef = doc(db, `chats/${userId}/conversations/${chatId}`);
    await updateDoc(chatRef, {
      title: newTitle,
      updatedAt: new Date()
    });
  } catch (error) {
    console.error('Error updating chat title:', error);
    throw error;
  }
};

export const deleteChat = async (userId, chatId) => {
  try {
    const chatRef = doc(db, `chats/${userId}/conversations/${chatId}`);
    await deleteDoc(chatRef);
  } catch (error) {
    console.error('Error deleting chat:', error);
    throw error;
  }
};

export const getChatMessages = async (userId, chatId) => {
  try {
    const chatRef = doc(db, `chats/${userId}/conversations/${chatId}`);
    const chatDoc = await getDoc(chatRef);
    
    if (chatDoc.exists()) {
      const chatData = chatDoc.data();
      return chatData.messages || [];
    } else {
      console.error('Chat document does not exist');
      return [];
    }
  } catch (error) {
    console.error('Error getting chat messages:', error);
    throw error;
  }
};

// Anonymous authentication
export const signInAnonymousUser = async () => {
  try {
    const userCredential = await signInAnonymously(auth);
    return userCredential.user;
  } catch (error) {
    console.error("Error signing in anonymously:", error);
    return null;
  }
};

export const getChatDocumentsRealTime = (userId, callback) => {
  const chatsRef = collection(db, `chats/${userId}/conversations`);
  const q = query(chatsRef, orderBy('updatedAt', 'desc'));

  return onSnapshot(q, (querySnapshot) => {
    const chats = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    callback(chats);
  }, (error) => {
    console.error("Error getting real-time chat documents:", error);
  });
};

export default app;

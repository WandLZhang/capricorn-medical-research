import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';

export const getLatestMessages = async (userId, chatId) => {
  if (!userId || !chatId) {
    console.error('Missing userId or chatId in getLatestMessages');
    return [];
  }
  try {
    const chatRef = doc(db, `chats/${userId}/conversations/${chatId}`);
    const chatDoc = await getDoc(chatRef);
    if (chatDoc.exists()) {
      return chatDoc.data().messages || [];
    }
    return [];
  } catch (error) {
    console.error('Error getting latest messages:', error);
    return [];
  }
};

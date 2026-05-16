import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  User,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
  handleFirestoreError,
  OperationType,
  toFirestoreData
} from '../firebase';

interface ConnectedAccounts {
  agarioUid?: string;
  youtube?: string;
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  isVerified?: boolean;
}

interface FirebaseContextType {
  user: User | null;
  loading: boolean;
  isLoggingIn: boolean;
  connectedAccounts: ConnectedAccounts | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  updateConnectedAccounts: (accounts: ConnectedAccounts) => Promise<void>;
  verifyAccount: (uid: string) => Promise<boolean>;
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

export const FirebaseProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccounts | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Sync user to Firestore
        const userRef = doc(db, 'users', user.uid);
        try {
          const userDoc = await getDoc(userRef);
          if (!userDoc.exists()) {
            await setDoc(userRef, toFirestoreData({
              uid: user.uid,
              email: user.email,
              displayName: user.displayName,
              photoURL: user.photoURL,
              createdAt: serverTimestamp(),
            }));
          } else {
            setConnectedAccounts(userDoc.data().connectedAccounts || null);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
        }
        setUser(user);
      } else {
        setUser(null);
        setConnectedAccounts(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const login = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      if (error.code !== 'auth/popup-closed-by-user') {
        console.error('Login failed:', error);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const updateConnectedAccounts = async (accounts: ConnectedAccounts) => {
    if (!user) return;
    const userRef = doc(db, 'users', user.uid);
    try {
      await setDoc(userRef, toFirestoreData({
        connectedAccounts: accounts
      }), { merge: true });
      setConnectedAccounts(accounts);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    }
  };

  const verifyAccount = async (uid: string) => {
    if (!user || !uid) return false;
    
    // Simulate API call to Agar.io servers
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // For demo purposes, we'll "verify" any non-empty UID
    const success = uid.length > 10; 
    
    if (success) {
      const updated = { ...connectedAccounts, agarioUid: uid, isVerified: true };
      await updateConnectedAccounts(updated);
    }
    
    return success;
  };

  return (
    <FirebaseContext.Provider value={{ 
      user, 
      loading, 
      isLoggingIn, 
      connectedAccounts, 
      login, 
      logout,
      updateConnectedAccounts,
      verifyAccount
    }}>
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return context;
};

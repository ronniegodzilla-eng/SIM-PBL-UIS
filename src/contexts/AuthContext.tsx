import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType, logout } from '../firebase';
import { toast } from 'sonner';

export type UserRole = 'Mahasiswa' | 'Admin' | 'AdminProdi' | 'Dosen' | 'PembimbingLapangan';
export type AccountStatus = 'Pending' | 'Active' | 'Blocked';
export type ProgramStudi = 'S1 Kesehatan dan Keselamatan Kerja' | 'S1 Kesehatan Lingkungan';
export type Jalur = 'Reg A' | 'Reg B' | 'Reg C' | 'RPL';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  account_status: AccountStatus;
  prodi?: ProgramStudi;
  jalur?: Jalur;
  createdAt: string;
  lastLogin?: string;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAuthReady: boolean;
  impersonateUser: (uid: string) => Promise<void>;
  stopImpersonating: () => void;
  isImpersonating: boolean;
  originalProfile: UserProfile | null;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAuthReady: false,
  impersonateUser: async () => {},
  stopImpersonating: () => {},
  isImpersonating: false,
  originalProfile: null,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [originalProfile, setOriginalProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isImpersonating, setIsImpersonating] = useState(false);

  // Inactivity auto-logout (30 minutes) with background suspension guard
  useEffect(() => {
    if (!user) return;

    let timeoutId: NodeJS.Timeout | number;
    const INACTIVITY_LIMIT = 30 * 60 * 1000; // 30 minutes
    const LAST_ACTIVE_KEY = `last_active_${user.uid}`;

    const checkInactivity = async () => {
      const lastActiveStr = localStorage.getItem(LAST_ACTIVE_KEY);
      if (!lastActiveStr) {
        localStorage.setItem(LAST_ACTIVE_KEY, Date.now().toString());
        return;
      }

      const lastActive = parseInt(lastActiveStr, 10);
      const now = Date.now();
      if (now - lastActive >= INACTIVITY_LIMIT) {
        try {
          if (timeoutId) clearTimeout(timeoutId);
          localStorage.removeItem(LAST_ACTIVE_KEY);
          await logout();
          toast.info('Sesi Anda telah berakhir karena tidak ada aktivitas selama 30 menit.', {
            duration: 10000,
            id: 'inactivity-logout-toast'
          });
        } catch (error) {
          console.error("Gagal melakukan auto logout:", error);
        }
      }
    };

    const resetInactivityTimeout = () => {
      localStorage.setItem(LAST_ACTIVE_KEY, Date.now().toString());
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(async () => {
        await checkInactivity();
      }, INACTIVITY_LIMIT);
    };

    // Track user active events
    const activityEvents = ['mousemove', 'mousedown', 'click', 'scroll', 'keypress', 'touchstart'];

    // Initial check and start timer
    checkInactivity();
    resetInactivityTimeout();

    const handleActivity = () => {
      resetInactivityTimeout();
    };

    const handleFocus = () => {
      checkInactivity();
    };

    activityEvents.forEach(event => {
      window.addEventListener(event, handleActivity);
    });
    window.addEventListener('focus', handleFocus);

    // Also run a small periodic interval to check in case the tab is open but untouched
    const intervalId = setInterval(() => {
      checkInactivity();
    }, 30000); // Check every 30 seconds

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      clearInterval(intervalId);
      activityEvents.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
      window.removeEventListener('focus', handleFocus);
    };
  }, [user]);

  useEffect(() => {
    let unsubSnapshot: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const userDocRef = doc(db, 'users', currentUser.uid);
          
          // Initial auto-upgrade check
          if (currentUser.email === 'ronniegodzilla@gmail.com' || currentUser.email === 'admin@uis.ac.id') {
             const snap = await getDoc(userDocRef);
             if (snap.exists()) {
                 const data = snap.data();
                 if (data.role !== 'Admin' || data.account_status !== 'Active') {
                     await setDoc(userDocRef, { ...data, role: 'Admin', account_status: 'Active' }, { merge: true });
                 }
             } else {
                 // Create initial admin doc if it doesn't exist
                 await setDoc(userDocRef, {
                   uid: currentUser.uid,
                   name: "Super Admin",
                   email: currentUser.email,
                   role: 'Admin',
                   account_status: 'Active',
                   createdAt: new Date().toISOString()
                 });
             }
          }

          unsubSnapshot = onSnapshot(userDocRef, (userDoc) => {
            if (userDoc.exists()) {
              const userData = userDoc.data() as UserProfile;
              if (!isImpersonating) {
                setProfile(userData);
              }
              setOriginalProfile(userData);
            } else {
              if (!isImpersonating) setProfile(null);
              setOriginalProfile(null);
            }
            setLoading(false);
            setIsAuthReady(true);
          }, (error) => {
            console.error("Error listening to user profile", error);
            if (!isImpersonating) setProfile(null);
            setOriginalProfile(null);
            setLoading(false);
            setIsAuthReady(true);
          });
        } catch (error) {
          console.error("Error fetching user profile", error);
          if (!isImpersonating) setProfile(null);
          setOriginalProfile(null);
          setLoading(false);
          setIsAuthReady(true);
        }
      } else {
        if (unsubSnapshot) {
          unsubSnapshot();
          unsubSnapshot = null;
        }
        setProfile(null);
        setOriginalProfile(null);
        setIsImpersonating(false);
        setLoading(false);
        setIsAuthReady(true);
      }
    });

    return () => {
      if (unsubSnapshot) unsubSnapshot();
      unsubscribe();
    };
  }, [isImpersonating]);

  const impersonateUser = async (uid: string) => {
    if (originalProfile?.role !== 'Admin') {
      console.error("Only Admin can impersonate users");
      return;
    }
    try {
      const userDocRef = doc(db, 'users', uid);
      const userDoc = await getDoc(userDocRef);
      if (userDoc.exists()) {
        setProfile(userDoc.data() as UserProfile);
        setIsImpersonating(true);
      }
    } catch (error) {
      console.error("Error impersonating user", error);
    }
  };

  const stopImpersonating = () => {
    setProfile(originalProfile);
    setIsImpersonating(false);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAuthReady, impersonateUser, stopImpersonating, isImpersonating, originalProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged as fbOnAuthStateChanged,
  type Auth,
  type User,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  onSnapshot,
  query,
  orderBy,
  updateDoc,
  type Firestore,
} from "firebase/firestore";
import type { Business, FeedbackItem, AuthUserProfile } from "../types";

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const currentUser = auth?.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid,
      email: currentUser?.email,
      emailVerified: currentUser?.emailVerified,
      isAnonymous: currentUser?.isAnonymous,
      tenantId: currentUser?.tenantId,
      providerInfo: currentUser?.providerData?.map((p) => ({
        providerId: p.providerId,
        email: p.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export type { AuthUserProfile };

import firebaseAppletConfig from "../../firebase-applet-config.json";

// Check if credentials are present in env or provisioned firebase-applet-config.json
const env = (import.meta as any).env || {};
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || firebaseAppletConfig.apiKey || "",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || firebaseAppletConfig.authDomain || "",
  projectId: env.VITE_FIREBASE_PROJECT_ID || firebaseAppletConfig.projectId || "",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || firebaseAppletConfig.storageBucket || "",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseAppletConfig.messagingSenderId || "",
  appId: env.VITE_FIREBASE_APP_ID || firebaseAppletConfig.appId || "",
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let app: FirebaseApp | null = null;
export let auth: Auth | null = null;
export let db: Firestore | null = null;

if (isFirebaseConfigured) {
  try {
    app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
    auth = getAuth(app);
    const dbId = (firebaseAppletConfig as any).firestoreDatabaseId;
    db = dbId ? getFirestore(app, dbId) : getFirestore(app);
  } catch (err) {
    console.warn("Firebase initialization warning (will use local server API fallback):", err);
  }
}

// Local mock storage key for when running in sandbox without Firebase credentials
const LOCAL_STORAGE_FEEDBACKS_KEY = "tapshield_feedbacks_cache";
const LOCAL_STORAGE_BIZ_KEY = "tapshield_biz_cache";

export async function fetchBusiness(businessId: string): Promise<Business> {
  if (db) {
    const docPath = `businesses/${businessId}`;
    try {
      const docRef = doc(db, "businesses", businessId);
      const snapshot = await getDoc(docRef);
      if (snapshot.exists()) {
        return { id: snapshot.id, ...snapshot.data() } as Business;
      }
    } catch (error) {
      console.warn("Firestore fetchBusiness error, falling back to server API:", error);
    }
  }

  // Fallback to Express backend API
  try {
    const res = await fetch(`/api/businesses/${encodeURIComponent(businessId)}`);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn("Server API fetch error:", err);
  }

  // Fallback default
  return {
    id: businessId,
    ownerUid: `owner_${businessId}`,
    businessName: "Artisan Brews & Roastery",
    googleMapsReviewUrl: "https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4",
    subscriptionStatus: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function saveBusinessProfile(data: Partial<Business> & { id: string }): Promise<void> {
  const docPath = `businesses/${data.id}`;
  if (db) {
    try {
      const docRef = doc(db, "businesses", data.id);
      await setDoc(docRef, {
        ...data,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      return;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, docPath);
    }
  }

  // Fallback to Express backend API
  const res = await fetch(`/api/businesses/${encodeURIComponent(data.id)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    throw new Error("Failed to save business profile");
  }
}

export async function submitCustomerFeedback(
  feedback: Omit<FeedbackItem, "id" | "createdAt">
): Promise<FeedbackItem> {
  const { businessId, customerNote, customerContact, customerName, rating } = feedback;
  const newFeedback: FeedbackItem = {
    id: `fb_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    businessId,
    rating,
    customerNote,
    customerContact,
    customerName,
    status: "new",
    createdAt: new Date().toISOString(),
  };

  if (db) {
    const writePath = `businesses/${businessId}/feedbacks/${newFeedback.id}`;
    try {
      const feedbackDocRef = doc(db, "businesses", businessId, "feedbacks", newFeedback.id);
      await setDoc(feedbackDocRef, newFeedback);
      return newFeedback;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, writePath);
    }
  }

  // Fallback to Express backend API
  const res = await fetch(`/api/businesses/${encodeURIComponent(businessId)}/feedbacks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(newFeedback),
  });

  if (!res.ok) {
    throw new Error("Failed to save customer feedback");
  }

  return await res.json();
}

export function subscribeToFeedbacks(
  businessId: string,
  onUpdate: (feedbacks: FeedbackItem[]) => void
): () => void {
  if (db) {
    const colPath = `businesses/${businessId}/feedbacks`;
    try {
      const q = query(
        collection(db, "businesses", businessId, "feedbacks"),
        orderBy("createdAt", "desc")
      );
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const items: FeedbackItem[] = [];
          snapshot.forEach((docSnap) => {
            items.push({ id: docSnap.id, ...docSnap.data() } as FeedbackItem);
          });
          onUpdate(items);
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, colPath);
        }
      );
      return unsubscribe;
    } catch (err) {
      console.warn("Failed to subscribe via Firestore, falling back to polling:", err);
    }
  }

  // Fallback: poll server API
  let active = true;
  const fetchFeedbacks = async () => {
    try {
      const res = await fetch(`/api/businesses/${encodeURIComponent(businessId)}/feedbacks`);
      if (res.ok && active) {
        const data = await res.json();
        onUpdate(data);
      }
    } catch (err) {
      console.warn("Poll feedbacks error:", err);
    }
  };

  fetchFeedbacks();
  const interval = setInterval(fetchFeedbacks, 4000);
  return () => {
    active = false;
    clearInterval(interval);
  };
}

export async function updateFeedbackItemStatus(
  businessId: string,
  feedbackId: string,
  status: FeedbackItem["status"],
  internalNote?: string
): Promise<void> {
  if (db) {
    const docPath = `businesses/${businessId}/feedbacks/${feedbackId}`;
    try {
      const docRef = doc(db, "businesses", businessId, "feedbacks", feedbackId);
      const updateData: any = { status, updatedAt: new Date().toISOString() };
      if (internalNote !== undefined) updateData.internalNote = internalNote;
      await updateDoc(docRef, updateData);
      return;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, docPath);
    }
  }

  // Fallback to Express backend API
  await fetch(`/api/businesses/${encodeURIComponent(businessId)}/feedbacks/${encodeURIComponent(feedbackId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, internalNote }),
  });
}

// Authentication Helpers
export async function signInWithGoogle(): Promise<AuthUserProfile> {
  if (!auth) {
    throw new Error("Firebase Auth is not initialized. Use Demo Sign In or configure Firebase.");
  }
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  return {
    uid: result.user.uid,
    email: result.user.email,
    displayName: result.user.displayName,
  };
}

export async function signOutUser(): Promise<void> {
  if (auth) {
    await fbSignOut(auth);
  }
}

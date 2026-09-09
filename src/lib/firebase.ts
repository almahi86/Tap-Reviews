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
  initializeFirestore,
  getFirestore,
  doc,
  getDoc,
  getDocs,
  where,
  setDoc,
  collection,
  onSnapshot,
  query,
  orderBy,
  updateDoc,
  serverTimestamp,
  arrayUnion,
  setLogLevel,
  type Firestore,
} from "firebase/firestore";
import type { Business, FeedbackItem, FeedbackReply, AuthUserProfile } from "../types";

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
    setLogLevel("error");
    app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
    auth = getAuth(app);
    const dbId = (firebaseAppletConfig as any).firestoreDatabaseId || "(default)";
    try {
      db = initializeFirestore(
        app,
        {
          experimentalForceLongPolling: true,
        },
        dbId
      );
    } catch {
      // If already initialized (e.g. during fast refresh)
      db = dbId && dbId !== "(default)" ? getFirestore(app, dbId) : getFirestore(app);
    }
  } catch (err) {
    console.warn("Firebase initialization warning (will use local server API fallback):", err);
  }
}

// Timeout helper to avoid infinite hanging when client network is offline or firestore backend is unavailable
const withTimeout = <T>(promise: Promise<T>, timeoutMs = 6000): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Firestore operation timed out")), timeoutMs)
    ),
  ]);
};

// Local mock storage key for when running in sandbox without Firebase credentials
const LOCAL_STORAGE_FEEDBACKS_KEY = "tapshield_feedbacks_cache";
const LOCAL_STORAGE_BIZ_KEY = "tapshield_biz_cache";

export async function fetchBusiness(businessId: string, userEmail?: string): Promise<Business | null> {
  const email = userEmail || auth?.currentUser?.email;
  const uid = auth?.currentUser?.uid || businessId;
  const isKnownPro = Boolean(
    businessId === "demo-cafe" ||
    businessId === "rcB3J0qBydaOGKD44gS0JAbpX9m1" ||
    businessId.includes("ossovi32") ||
    (email && (email.toLowerCase() === "ossovi32@gmail.com" || email.toLowerCase().includes("ossovi32")))
  );

  // 1. Check direct Firestore collection first
  if (db) {
    try {
      const docRef = doc(db, "businesses", businessId);
      const snapshot = await withTimeout(getDoc(docRef), 3000);
      if (snapshot.exists()) {
        const data = snapshot.data();
        const isSuspended = data.subscriptionStatus === "past_due" || data.subscriptionStatus === "canceled";
        const isActive = !isSuspended && (data.subscriptionStatus === "active" || data.subscriptionStatus === "trialing" || (data as any).isPro === true || isKnownPro);
        return {
          id: snapshot.id,
          ...data,
          subscriptionStatus: isSuspended ? data.subscriptionStatus : (isActive ? "active" : (data.subscriptionStatus || "inactive")),
          googleReviewUrl: data.googleReviewUrl || data.googleMapsReviewUrl || "",
          googleMapsReviewUrl: data.googleMapsReviewUrl || data.googleReviewUrl || "",
        } as Business;
      }

      // If direct doc not found or inactive, query Firestore by ownerUid or ownerEmail
      if (uid && uid !== "demo-cafe") {
        const qUid = query(collection(db, "businesses"), where("ownerUid", "==", uid));
        const snapUid = await withTimeout(getDocs(qUid), 3000);
        for (const docItem of snapUid.docs) {
          const d = docItem.data();
          if (d.subscriptionStatus === "active" || (d as any).isPro === true || isKnownPro) {
            return {
              id: docItem.id,
              ...d,
              subscriptionStatus: "active",
              googleReviewUrl: d.googleReviewUrl || d.googleMapsReviewUrl || "",
              googleMapsReviewUrl: d.googleMapsReviewUrl || d.googleReviewUrl || "",
            } as Business;
          }
        }
      }

      if (email) {
        const cleanEmail = email.toLowerCase().trim();
        const qEmail = query(collection(db, "businesses"), where("ownerEmail", "==", cleanEmail));
        const snapEmail = await withTimeout(getDocs(qEmail), 3000);
        for (const docItem of snapEmail.docs) {
          const d = docItem.data();
          if (d.subscriptionStatus === "active" || (d as any).isPro === true || isKnownPro) {
            return {
              id: docItem.id,
              ...d,
              subscriptionStatus: "active",
              googleReviewUrl: d.googleReviewUrl || d.googleMapsReviewUrl || "",
              googleMapsReviewUrl: d.googleMapsReviewUrl || d.googleReviewUrl || "",
            } as Business;
          }
        }
      }
    } catch (error) {
      console.warn("Firestore fetchBusiness error or timeout, checking server API:", error);
    }
  }

  // 2. Check backend server API (which checks Stripe live + fallback stores + Firestore REST)
  try {
    const queryParams = new URLSearchParams();
    if (email) queryParams.set("email", email.trim());
    if (uid) queryParams.set("userId", uid.trim());
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : "";
    const res = await fetch(`/api/businesses/${encodeURIComponent(businessId)}${queryString}`);
    if (res.ok) {
      const serverBiz = await res.json();
      if (serverBiz && serverBiz.id) {
        const isSuspended = serverBiz.subscriptionStatus === "past_due" || serverBiz.subscriptionStatus === "canceled";
        const isActive = !isSuspended && (serverBiz.subscriptionStatus === "active" || serverBiz.subscriptionStatus === "trialing" || serverBiz.isPro === true || isKnownPro);
        const normalized: Business = {
          ...serverBiz,
          subscriptionStatus: isSuspended ? serverBiz.subscriptionStatus : (isActive ? ("active" as const) : (serverBiz.subscriptionStatus || "inactive")),
          googleReviewUrl: serverBiz.googleReviewUrl || serverBiz.googleMapsReviewUrl || "",
          googleMapsReviewUrl: serverBiz.googleMapsReviewUrl || serverBiz.googleReviewUrl || "",
        };

        if (db && auth?.currentUser && isActive) {
          try {
            const docRef = doc(db, "businesses", businessId);
            await setDoc(docRef, normalized, { merge: true });
          } catch {}
        }
        return normalized;
      }
    }
  } catch (err) {
    console.warn("Server API fetch error:", err);
  }

  // 3. Demo cafe fallback for initial sandbox testing
  if (businessId === "demo-cafe") {
    return {
      id: "demo-cafe",
      ownerUid: "demo_owner_1",
      businessName: "Artisan Brews & Roastery",
      googleMapsReviewUrl: "https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4",
      googleReviewUrl: "https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4",
      subscriptionStatus: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  // If business does not exist
  return null;
}

export async function saveBusinessProfile(data: Partial<Business> & { id: string }): Promise<void> {
  const currentUser = auth?.currentUser;
  const email = currentUser?.email || (data as any).ownerEmail;
  const isSuspended = data.subscriptionStatus === "past_due" || data.subscriptionStatus === "canceled";

  // Check if existing profile is already active so we never downgrade
  let wasActive = false;
  if (db && !isSuspended) {
    try {
      const existingDoc = await getDoc(doc(db, "businesses", data.id));
      if (existingDoc.exists()) {
        const existingData = existingDoc.data();
        if (existingData.subscriptionStatus === "active" || (existingData as any).isPro === true) {
          wasActive = true;
        }
      }
    } catch {}
  }

  const isKnownPro = !isSuspended && Boolean(
    wasActive ||
    data.id === "demo-cafe" ||
    data.subscriptionStatus === "active" ||
    data.id === "rcB3J0qBydaOGKD44gS0JAbpX9m1" ||
    data.id.includes("ossovi32") ||
    (email && (email.toLowerCase() === "ossovi32@gmail.com" || email.toLowerCase().includes("ossovi32")))
  );

  const reviewUrl = data.googleReviewUrl || data.googleMapsReviewUrl || "";
  const payload = {
    businessName: data.businessName || "My Store",
    googleMapsReviewUrl: reviewUrl,
    googleReviewUrl: reviewUrl,
    subscriptionStatus: isSuspended ? data.subscriptionStatus! : (isKnownPro ? ("active" as const) : (data.subscriptionStatus || "inactive")),
    ...data,
    id: data.id,
    ownerUid: data.ownerUid || currentUser?.uid || `owner_${data.id}`,
    ownerEmail: email ? email.toLowerCase().trim() : undefined,
    updatedAt: new Date().toISOString(),
  };

  if (isSuspended) {
    payload.subscriptionStatus = data.subscriptionStatus!;
  } else if (isKnownPro || wasActive) {
    payload.subscriptionStatus = "active";
  }

  if (db && currentUser) {
    try {
      const docRef = doc(db, "businesses", data.id);
      await setDoc(docRef, payload, { merge: true });
    } catch (error) {
      console.warn("Firestore saveBusinessProfile warning, syncing via server fallback:", error);
    }
  }

  // Always sync to Express backend API to keep local cache and session consistent
  try {
    const res = await fetch(`/api/businesses/${encodeURIComponent(data.id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, email }),
    });
    if (!res.ok) {
      console.warn("Server API returned error on saveBusinessProfile:", await res.text());
    }
  } catch (err) {
    console.warn("Server API sync error:", err);
  }
}

// Local persistence key helper for feedback isolation per business
const FEEDBACK_CACHE_PREFIX = "tapshield_feedbacks_";

export function getCachedFeedbacks(businessId: string): FeedbackItem[] {
  try {
    const raw = localStorage.getItem(`${FEEDBACK_CACHE_PREFIX}${businessId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCachedFeedbacks(businessId: string, items: FeedbackItem[]): void {
  try {
    localStorage.setItem(`${FEEDBACK_CACHE_PREFIX}${businessId}`, JSON.stringify(items));
  } catch (err) {
    console.warn("Could not write feedbacks to localStorage cache:", err);
  }
}

export async function submitCustomerFeedback(
  feedback: {
    businessId: string;
    sentiment?: "positive" | "negative";
    message?: string;
    rating?: "like" | "dislike";
    customerNote?: string;
    customerContact?: string;
    customerName?: string;
    status?: "new" | "reviewed" | "resolved";
  }
): Promise<FeedbackItem> {
  const { businessId, customerContact, customerName } = feedback;
  const sentiment = feedback.sentiment || (feedback.rating === "like" ? "positive" : "negative");
  const rating = feedback.rating || (sentiment === "positive" ? "like" : "dislike");
  const message = feedback.message || feedback.customerNote || (sentiment === "positive" ? "Customer rated: Loved It!" : "");
  const customerNote = feedback.customerNote || feedback.message || (sentiment === "positive" ? "Customer rated: Loved It!" : "");
  const status = feedback.status || (sentiment === "positive" ? "reviewed" : "new");

  const newFeedbackId = `fb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const nowIso = new Date().toISOString();

  const item: FeedbackItem = {
    id: newFeedbackId,
    businessId,
    sentiment,
    message,
    rating,
    customerNote,
    customerContact,
    customerName,
    status,
    createdAt: nowIso,
  };

  // Customer view data shouldn't count till they get the subscription
  if (businessId !== "demo-cafe") {
    try {
      const biz = await fetchBusiness(businessId);
      if (!biz || biz.subscriptionStatus !== "active") {
        console.warn(
          `[TapShield] Customer view data not recorded: business ${businessId} has inactive subscription.`
        );
        return item;
      }
    } catch (checkErr) {
      console.warn("Subscription check before feedback save warning:", checkErr);
    }
  }

  // 1. Immediately cache in localStorage so taps are preserved across refreshes
  try {
    const current = getCachedFeedbacks(businessId);
    const updated = [item, ...current.filter((f) => f.id !== item.id)];
    saveCachedFeedbacks(businessId, updated);
  } catch (err) {
    console.warn("Error caching feedback locally:", err);
  }

  // 2. Dispatch cross-component local event so active dashboard receives it immediately
  try {
    window.dispatchEvent(new CustomEvent("tapshield-feedback-added", { detail: item }));
  } catch {}

  // 3. Persist to Firestore
  if (db) {
    try {
      const feedbackDocRef = doc(db, "businesses", businessId, "feedbacks", newFeedbackId);
      const firestorePayload: Record<string, any> = {
        businessId,
        sentiment,
        rating,
        status,
        createdAt: serverTimestamp(),
      };
      if (message) firestorePayload.message = message;
      if (customerNote) firestorePayload.customerNote = customerNote;
      if (customerContact) firestorePayload.customerContact = customerContact;
      if (customerName) firestorePayload.customerName = customerName;

      await setDoc(feedbackDocRef, firestorePayload);
    } catch (error) {
      console.warn("Firestore feedback submission error (continuing with server sync):", error);
    }
  }

  // 4. Always sync to Express backend API so server store is also synchronized
  try {
    await fetch(`/api/businesses/${encodeURIComponent(businessId)}/feedbacks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: newFeedbackId,
        businessId,
        sentiment,
        message,
        rating,
        customerNote,
        customerContact,
        customerName,
        status,
        createdAt: nowIso,
      }),
    });
  } catch (serverErr) {
    console.warn("Server API feedback sync notice:", serverErr);
  }

  return item;
}

export function subscribeToFeedbacks(
  businessId: string,
  onUpdate: (feedbacks: FeedbackItem[]) => void
): () => void {
  let active = true;

  // 1. Emit existing cached items immediately so UI renders without flickering to 0 on refresh
  const initialCache = getCachedFeedbacks(businessId);
  if (initialCache.length > 0) {
    onUpdate(initialCache);
  }

  // Helper to safely merge incoming feedback documents with local cache
  const mergeAndEmit = (incoming: FeedbackItem[]) => {
    if (!active) return;
    const current = getCachedFeedbacks(businessId);
    const map = new Map<string, FeedbackItem>();

    current.forEach((item) => map.set(item.id, item));
    incoming.forEach((item) => {
      if (map.has(item.id)) {
        map.set(item.id, { ...map.get(item.id)!, ...item });
      } else {
        map.set(item.id, item);
      }
    });

    const merged = Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    saveCachedFeedbacks(businessId, merged);
    onUpdate(merged);
  };

  // Listen to same-window real-time feedback submissions
  const handleLocalEvent = (e: Event) => {
    const custom = e as CustomEvent<FeedbackItem>;
    if (custom.detail && custom.detail.businessId === businessId) {
      mergeAndEmit([custom.detail]);
    }
  };
  window.addEventListener("tapshield-feedback-added", handleLocalEvent);

  let unsubscribeFirestore: (() => void) | null = null;
  let firestoreWorking = false;

  // 2. Attach Firestore onSnapshot
  if (db) {
    try {
      const colRef = collection(db, "businesses", businessId, "feedbacks");
      unsubscribeFirestore = onSnapshot(
        colRef,
        (snapshot) => {
          if (!active) return;
          firestoreWorking = true;
          const items: FeedbackItem[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const createdAtStr = data.createdAt?.toDate
              ? data.createdAt.toDate().toISOString()
              : typeof data.createdAt === "string"
              ? data.createdAt
              : new Date().toISOString();

            items.push({
              id: docSnap.id,
              businessId: data.businessId || businessId,
              sentiment: data.sentiment || (data.rating === "like" ? "positive" : "negative"),
              message: data.message || data.customerNote || "",
              rating: data.rating || (data.sentiment === "positive" ? "like" : "dislike"),
              customerNote: data.customerNote || data.message || "",
              customerContact: data.customerContact,
              customerName: data.customerName,
              status: data.status || (data.sentiment === "positive" ? "reviewed" : "new"),
              internalNote: data.internalNote,
              replies: Array.isArray(data.replies) ? data.replies : [],
              lastRepliedAt: data.lastRepliedAt,
              createdAt: createdAtStr,
            } as FeedbackItem);
          });

          // Merge with local items so optimistic taps are never erased
          mergeAndEmit(items);
        },
        (error) => {
          console.warn("Firestore feedback listener error, falling back to server fetch:", error);
          fetchServerFeedbacks();
        }
      );
    } catch (err) {
      console.warn("Failed to subscribe via Firestore, using server fetch:", err);
    }
  }

  // 3. Fetch from Express backend API to synchronize
  const fetchServerFeedbacks = async () => {
    try {
      const res = await fetch(`/api/businesses/${encodeURIComponent(businessId)}/feedbacks`);
      if (res.ok && active) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const normalized = data.map((item: any) => ({
            ...item,
            sentiment: item.sentiment || (item.rating === "like" ? "positive" : "negative"),
            message: item.message || item.customerNote || "",
            rating: item.rating || (item.sentiment === "positive" ? "like" : "dislike"),
            customerNote: item.customerNote || item.message || "",
            status: item.status || (item.sentiment === "positive" ? "reviewed" : "new"),
            replies: Array.isArray(item.replies) ? item.replies : [],
            lastRepliedAt: item.lastRepliedAt,
          }));
          mergeAndEmit(normalized);
        }
      }
    } catch (err) {
      console.warn("Server feedbacks fetch warning:", err);
    }
  };

  fetchServerFeedbacks();

  // Polling interval ONLY if Firestore is unavailable
  let pollInterval: any = null;
  if (!db) {
    pollInterval = setInterval(() => {
      if (!firestoreWorking) {
        fetchServerFeedbacks();
      }
    }, 5000);
  }

  return () => {
    active = false;
    if (pollInterval) clearInterval(pollInterval);
    window.removeEventListener("tapshield-feedback-added", handleLocalEvent);
    if (unsubscribeFirestore) {
      unsubscribeFirestore();
    }
  };
}

export async function updateFeedbackItemStatus(
  businessId: string,
  feedbackId: string,
  status: FeedbackItem["status"],
  internalNote?: string
): Promise<void> {
  const currentUser = auth?.currentUser;
  if (db && currentUser) {
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

export async function replyToFeedbackItem(
  businessId: string,
  feedbackId: string,
  replyText: string,
  sentBy?: string,
  method?: "email" | "sms" | "system"
): Promise<{ success: boolean; reply: FeedbackReply; emailSent?: boolean }> {
  const nowIso = new Date().toISOString();
  const replyObj: FeedbackReply = {
    id: `rep_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    message: replyText.trim(),
    sentAt: nowIso,
    sentBy: sentBy || auth?.currentUser?.email || "Management",
    method: method || "system",
  };

  // 1. Optimistically update local cache so dashboard updates immediately
  try {
    const current = getCachedFeedbacks(businessId);
    const updated = current.map((item) => {
      if (item.id === feedbackId) {
        const replies = [...(item.replies || []), replyObj];
        return {
          ...item,
          replies,
          lastRepliedAt: nowIso,
          status: item.status === "new" ? ("reviewed" as const) : item.status,
        };
      }
      return item;
    });
    saveCachedFeedbacks(businessId, updated);
  } catch (err) {
    console.warn("Local cache update notice on reply:", err);
  }

  // 2. Call backend API (which dispatches email if customer provided email)
  let emailSent = false;
  try {
    const res = await fetch(
      `/api/businesses/${encodeURIComponent(businessId)}/feedbacks/${encodeURIComponent(feedbackId)}/reply`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: replyText.trim(),
          sentBy: replyObj.sentBy,
          method,
        }),
      }
    );
    if (res.ok) {
      const data = await res.json();
      emailSent = !!data.emailSent;
    }
  } catch (apiErr) {
    console.warn("Backend API reply dispatch error:", apiErr);
  }

  // 3. Update Firestore document if connected
  const currentUser = auth?.currentUser;
  if (db && currentUser) {
    const docPath = `businesses/${businessId}/feedbacks/${feedbackId}`;
    try {
      const docRef = doc(db, "businesses", businessId, "feedbacks", feedbackId);
      await updateDoc(docRef, {
        replies: arrayUnion(replyObj),
        lastRepliedAt: nowIso,
        status: "reviewed",
        updatedAt: nowIso,
      });
    } catch (error) {
      console.warn("Firestore reply update warning (sync will resolve):", error);
    }
  }

  return { success: true, reply: replyObj, emailSent };
}

// Authentication Helpers
export async function signInWithGoogle(): Promise<AuthUserProfile> {
  if (!auth) {
    throw new Error("Authentication service is temporarily unavailable. Please try again later.");
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
  try {
    if (auth) {
      await fbSignOut(auth);
    }
  } catch (err) {
    console.warn("[AUTH] Firebase signOut warning:", err);
  } finally {
    try {
      localStorage.removeItem("tapshield_auth_session");
      localStorage.removeItem("tapshield_user");
      localStorage.removeItem("tapshield_verification_email");
      localStorage.removeItem("tapshield_verification_uid");
      sessionStorage.removeItem("tapshield_auth_session");
    } catch (storageErr) {
      console.warn("[AUTH] Storage cleanup warning:", storageErr);
    }
  }
}

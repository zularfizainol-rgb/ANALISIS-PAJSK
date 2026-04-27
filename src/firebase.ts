import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, doc, writeBatch, getDocs, deleteDoc, query, where, Timestamp } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { AggregatePajskData } from './types';

const app = initializeApp(firebaseConfig);
// CRITICAL: The app will break without this line
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId); 
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
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
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Function to save data replacing all old data
export async function savePajskData(data: AggregatePajskData[]) {
  const collectionPath = `shared_pajsk_data`;
  const collectionRef = collection(db, collectionPath);
  
  try {
    // 1. Delete all existing data
    const q = query(collectionRef);
    const querySnapshot = await getDocs(q);
    const batch = writeBatch(db);
    
    querySnapshot.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });
    
    // 2. Add new data
    const serverTimestamp = Timestamp.now();
    data.forEach((item) => {
      const docRef = doc(collectionRef);
      batch.set(docRef, {
        tahun: item.tahun,
        aliran: item.aliran,
        jumlahPelajar: item.jumlahPelajar,
        gredA: item.gredA,
        gredB: item.gredB,
        gredC: item.gredC,
        gredD: item.gredD,
        gredE: item.gredE,
        gredTL: item.gredTL,
        createdAt: serverTimestamp,
        updatedAt: serverTimestamp
      });
    });
    
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, collectionPath);
  }
}

// Function to load data
export async function loadPajskData(): Promise<AggregatePajskData[]> {
  const collectionPath = `shared_pajsk_data`;
  try {
    const q = query(collection(db, collectionPath));
    const querySnapshot = await getDocs(q);
    
    const data: AggregatePajskData[] = [];
    querySnapshot.forEach((doc) => {
      const dbItem = doc.data();
      data.push({
        tahun: dbItem.tahun,
        aliran: dbItem.aliran,
        jumlahPelajar: dbItem.jumlahPelajar,
        gredA: dbItem.gredA,
        gredB: dbItem.gredB,
        gredC: dbItem.gredC,
        gredD: dbItem.gredD,
        gredE: dbItem.gredE,
        gredTL: dbItem.gredTL
      });
    });
    
    return data;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, collectionPath);
    return [];
  }
}

// Test connection
export async function testConnection() {
  try {
    const docRef = doc(db, 'test', 'connection');
    // Using getDocs to a random collection just to test connection
    await getDocs(query(collection(db, 'test')));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();

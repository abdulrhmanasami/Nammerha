/**
 * offline-db.ts — IndexedDB wrapper for Offline-First Architecture
 * 
 * Specifically designed to store heavy blobs/base64 strings (like Camera Proofs)
 * that exceed the 5MB localStorage limit in low-connectivity Syrian environments.
 */

export interface CameraProofRecord {
  id: string;
  projectId: string;
  dataUrl: string;
  gpsLat: number;
  gpsLng: number;
  gpsAccuracy: number | null;
  timestamp: number;
}

const DB_NAME = 'NammerhaOfflineDB';
const STORE_NAME = 'camera_proofs';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function initDB(): Promise<IDBDatabase> {
  if (dbPromise) {return dbPromise;}
  
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    
    request.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    request.onerror = () => reject(request.error);
  });
  
  return dbPromise;
}

export async function saveCameraProof(proof: CameraProofRecord): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(proof);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getCameraProofs(projectId?: string): Promise<CameraProofRecord[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite'); // Changed to readwrite to allow deletion
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    
    request.onsuccess = () => {
      let results = request.result as CameraProofRecord[];
      const now = Date.now();
      const MAX_AGE_MS = 48 * 60 * 60 * 1000; // 48 hours TTL
      
      // Filter and delete zombie proofs
      const validResults: CameraProofRecord[] = [];
      results.forEach(proof => {
        if (now - proof.timestamp > MAX_AGE_MS) {
          store.delete(proof.id); // Silently clean up zombie draft
        } else {
          validResults.push(proof);
        }
      });
      
      results = validResults;
      
      if (projectId) {
        results = results.filter(r => r.projectId === projectId);
      }
      resolve(results.sort((a, b) => a.timestamp - b.timestamp));
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deleteCameraProof(id: string): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function clearCameraProofs(): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

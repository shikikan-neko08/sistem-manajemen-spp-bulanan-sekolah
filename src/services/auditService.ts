import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import type { AksiAudit } from '../types/spp.ts';

export interface AuditActor {
  uid: string;
  nama: string;
  peran: string;
}

export async function catatLog(
  actor: AuditActor,
  aksi: AksiAudit,
  entitas: string,
  entitasId: string,
  ringkasan: string
): Promise<void> {
  const path = 'log_aktivitas';
  try {
    const ref = doc(collection(db, path));
    await setDoc(ref, {
      actorUid: actor.uid,
      actorNama: actor.nama.slice(0, 120),
      actorPeran: actor.peran.slice(0, 40),
      aksi,
      entitas: entitas.slice(0, 60),
      entitasId: entitasId.slice(0, 128),
      ringkasan: ringkasan.slice(0, 400),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

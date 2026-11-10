import { hdosDB } from './db';
import { AuthState } from './auth-state';
import { hseApi } from './api';

export interface OfflineContractorSiaDocument {
  id: string; kind: 'contractor-sia'; ownerUserId: string; ownerCompanyCode: string;
  fleetId: string; fileName: string; mimeType: string; size: number; blob: Blob; createdAt: string;
}

function getOwner(): { userId: string; companyCode: string } {
  const user = AuthState.getUser();
  if (!user?.id) throw new Error('Sesi pengguna tidak ditemukan. Login kembali sebelum menyimpan dokumen SIA.');
  const companyCode = String(user.companyCode || (user.roles?.includes('Admin CGG') ? 'CGG' : '')).trim().toUpperCase();
  if (!companyCode) throw new Error('Identitas perusahaan tidak tersedia. Dokumen SIA tidak dapat disimpan.');
  return { userId: String(user.id), companyCode };
}

export async function saveOfflineContractorSia(file: File, fleetId: string): Promise<string> {
  if (typeof window === 'undefined' || !window.indexedDB) throw new Error('Penyimpanan dokumen SIA offline memerlukan IndexedDB. Dokumen belum disimpan.');
  if (!fleetId || !['application/pdf', 'image/jpeg', 'image/png'].includes(file.type) || file.size <= 0 || file.size > 10 * 1024 * 1024) throw new Error('Dokumen SIA harus PDF, JPG, atau PNG dengan ukuran maksimal 10 MB.');
  const owner = getOwner(); const id = `sia-${crypto.randomUUID()}`;
  await hdosDB.put('photos', { id, kind: 'contractor-sia', ownerUserId: owner.userId, ownerCompanyCode: owner.companyCode, fleetId, fileName: file.name.slice(0, 120), mimeType: file.type, size: file.size, blob: file, createdAt: new Date().toISOString() });
  return id;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer()); let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

export async function uploadOfflineContractorSia(document: OfflineContractorSiaDocument): Promise<void> {
  const owner = getOwner();
  if (document.ownerUserId !== owner.userId || document.ownerCompanyCode !== owner.companyCode) throw new Error('Dokumen SIA lokal bukan milik akun aktif. Sinkronisasi dihentikan.');
  if (!(document.blob instanceof Blob) || document.blob.size <= 0 || document.blob.size > 10 * 1024 * 1024 || !['application/pdf', 'image/jpeg', 'image/png'].includes(document.mimeType)) throw new Error('Berkas SIA lokal tidak valid atau melebihi batas 10 MB.');
  await hseApi.uploadContractorSia(document.fleetId, { fileName: document.fileName, mimeType: document.mimeType, fileBase64: await blobToBase64(document.blob), uploadKey: `hdos-${document.id}` });
}

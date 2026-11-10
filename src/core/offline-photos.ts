import { hdosDB } from './db';
import { AuthState } from './auth-state';
import { hseApi } from './api';

export interface OfflineOperationalPhoto {
  id: string;
  ownerUserId: string;
  ownerCompanyCode: string;
  fileName: string;
  mimeType: string;
  size: number;
  blob: Blob;
  createdAt: string;
  photoFileId?: string;
  photoUrl?: string;
}

function getPhotoOwner(): { userId: string; companyCode: string } {
  const user = AuthState.getUser();
  if (!user?.id) throw new Error('Sesi pengguna tidak ditemukan. Login kembali sebelum menyimpan foto.');
  const companyCode = String(user.companyCode || (user.roles?.includes('Admin CGG') ? 'CGG' : '')).trim().toUpperCase();
  if (!companyCode) throw new Error('Identitas perusahaan tidak tersedia. Foto tidak dapat disimpan.');
  return { userId: String(user.id), companyCode };
}

export async function saveOfflineOperationalPhoto(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size <= 0 || file.size > 5 * 1024 * 1024) {
    throw new Error('Foto harus JPG, PNG, atau WEBP dengan ukuran maksimal 5 MB.');
  }
  const owner = getPhotoOwner();
  const id = `photo-${crypto.randomUUID()}`;
  const record: OfflineOperationalPhoto = {
    id, ...owner, fileName: file.name.slice(0, 150), mimeType: file.type,
    size: file.size, blob: file, createdAt: new Date().toISOString(),
  };
  await hdosDB.put('photos', record);
  return id;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export async function uploadOfflineOperationalPhoto(photo: OfflineOperationalPhoto): Promise<{ photoFileId: string; photoUrl: string }> {
  const owner = getPhotoOwner();
  if (photo.ownerUserId !== owner.userId || photo.ownerCompanyCode !== owner.companyCode) {
    throw new Error('Foto lokal bukan milik akun aktif. Sinkronisasi dihentikan untuk mencegah kebocoran data.');
  }
  if (!(photo.blob instanceof Blob) || photo.blob.size <= 0 || photo.blob.size > 5 * 1024 * 1024) {
    throw new Error('Berkas foto lokal tidak valid atau melebihi 5 MB.');
  }
  const uploaded = await hseApi.uploadOperationalPhoto({
    fileName: photo.fileName,
    mimeType: photo.mimeType,
    fileBase64: await blobToBase64(photo.blob),
    // Stable across queue retries; GAS returns the existing Drive file after a lost response.
    uploadKey: `hdos-${photo.id}`,
  });
  return { photoFileId: uploaded.photoFileId, photoUrl: uploaded.photoUrl };
}

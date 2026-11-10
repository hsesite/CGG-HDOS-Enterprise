import React, { useEffect, useRef, useState } from 'react';
import {
  HardHat,
  ShieldCheck,
  Building2,
  Users,
  Truck,
  CheckCircle,
  AlertTriangle,
  Award,
  Phone,
  FileCheck,
} from 'lucide-react';
import { useHDOSStore } from '../../core/store';
import { ContractorPassport } from '../../core/types';
import { hseApi, type ContractorComplianceReport, type ContractorComplianceReportInput, type ContractorFleetUnit, type ContractorFleetInput, type ContractorP2HRecord, type ContractorP2HInput } from '../../core/api';
import { getCurrentUser } from '../../core/auth-utils';
import { canDownloadDocuments } from '../../core/access-policy';
import { hdosDB } from '../../core/db';
import { hdosSync } from '../../core/sync';
import { saveOfflineOperationalPhoto, uploadOfflineOperationalPhoto, type OfflineOperationalPhoto } from '../../core/offline-photos';

export const ContractorModule: React.FC = () => {
  const store = useHDOSStore();
  const sessionUser = getCurrentUser();
  const [selectedContractor, setSelectedContractor] = useState<ContractorPassport | undefined>(store.contractors[0]);
  const [complianceReports, setComplianceReports] = useState<ContractorComplianceReport[]>([]);
  const [fleetUnits, setFleetUnits] = useState<ContractorFleetUnit[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [fleetLoading, setFleetLoading] = useState(false);
  const [fleetBusy, setFleetBusy] = useState(false);
  const [fleetMessage, setFleetMessage] = useState('');
  const [p2hUnitId, setP2hUnitId] = useState('');
  const [p2hHistory, setP2hHistory] = useState<ContractorP2HRecord[]>([]);
  const [p2hLoading, setP2hLoading] = useState(false);
  const [p2hLocalPhotoId, setP2hLocalPhotoId] = useState('');
  const [p2hPhotoReference, setP2hPhotoReference] = useState<Pick<ContractorP2HInput, 'photoFileId' | 'photoFileName' | 'photoMimeType'> | null>(null);
  const [p2hPhotoPreview, setP2hPhotoPreview] = useState('');
  const [p2hPhotoView, setP2hPhotoView] = useState<Record<string, string>>({});
  const [siaPreview, setSiaPreview] = useState<Record<string, {url: string; mimeType: string; fileName: string}>>({});
  const [p2hRequestId, setP2hRequestId] = useState('');
  const [p2hDraft, setP2hDraft] = useState<ContractorP2HInput>({ inspectionDate: new Date().toISOString().slice(0,10), status: 'READY', hourMeter: '', operatorName: '', findings: '', correctiveAction: '' });
  const [fleetDraft, setFleetDraft] = useState({
    unitNumber: '', unitType: '', brand: '', model: '',
    ownershipType: 'OWNED' as ContractorFleetInput['ownershipType'],
    p2hStatus: 'NOT_CHECKED' as ContractorFleetInput['p2hStatus'],
    siaExpiry: ''
  });
  const [reportBusy, setReportBusy] = useState(false);
  const [reportMessage, setReportMessage] = useState('');
  const [editingReportId, setEditingReportId] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const localNow = new Date();
  const currentPeriod = localNow.getFullYear() + '-' + String(localNow.getMonth() + 1).padStart(2, '0');
  const [reportDraft, setReportDraft] = useState({
    period: currentPeriod, manpowerCount: '', equipmentCount: '',
    mcuEligibleCount: '', mcuFitCount: '', inductionRequiredCount: '',
    inductionCompletedCount: '', safeHours: '', ltiCount: '0', remarks: ''
  });
  const ownCompanyCode = String(sessionUser?.companyCode || '').trim().toUpperCase();
  const p2hDraftKey = sessionUser && p2hUnitId
    ? `contractor-p2h-draft:${sessionUser.id}:${ownCompanyCode}:${p2hUnitId}`
    : '';
  const reportDraftKey = sessionUser && ownCompanyCode && ownCompanyCode !== 'CGG'
    ? `contractor-report-draft:${sessionUser.id}:${ownCompanyCode}`
    : '';
  const loadedP2HDraftKey = useRef('');
  const loadedReportDraftKey = useRef('');
  const draftOwner = { ownerUserId: String(sessionUser?.id || ''), ownerCompanyCode: ownCompanyCode };
  const sessionRoles = sessionUser?.roles || [];
  const canSubmitReport = Boolean(sessionUser && ownCompanyCode && ownCompanyCode !== 'CGG' &&
    sessionRoles.some(role => ['Company Admin', 'Contractor', 'Subkon', 'Contractor PIC'].includes(role)));
  const canReviewReport = Boolean(sessionUser && (
    sessionRoles.includes('Admin CGG') ||
    (sessionUser.roleVerified === true && sessionRoles.some(role => ['Foreman Safety', 'SPV HSE'].includes(role)))
  ));

  const selectedCompanyCode = String(selectedContractor?.code || '').trim().toUpperCase();
  const selectedCompanyPicas = store.picas.filter((pica) => {
    const record = pica as unknown as Record<string, unknown>;
    const operatingCompany = String(record.subcontractorCode || record.subkonCode || record.companyCode || record.contractorCode || '').trim().toUpperCase();
    const parentCompany = String(record.parentCompanyCode || '').trim().toUpperCase();
    return operatingCompany === selectedCompanyCode || parentCompany === selectedCompanyCode;
  });
  const actualActivePicaCount = selectedCompanyPicas.filter(pica => pica.status !== 'CLOSED').length;

  // The company master arrives asynchronously after the local workspace is loaded.
  // Keep the selected passport aligned with the authoritative store.
  useEffect(() => {
    if (store.contractors.length === 0) {
      setSelectedContractor(undefined);
      return;
    }
    setSelectedContractor(current => {
      if (!current) return store.contractors[0];
      return store.contractors.find(company => company.code.toUpperCase() === current.code.toUpperCase())
        || store.contractors[0];
    });
  }, [store.contractors]);

  // Re-fetch tenant-scoped registers whenever the authenticated account or
  // company changes. Clear the previous tenant's data immediately and ignore
  // late responses from requests started by the previous session.
  const sessionScopeKey = sessionUser
    ? `${sessionUser.id}::${String(sessionUser.companyCode || '').trim().toUpperCase()}::${sessionUser.roleVerified === true ? 'verified' : 'unverified'}::${[...(sessionUser.roles || [])].sort().join(',')}`
    : 'anonymous';

  useEffect(() => {
    let active = true;
    setComplianceReports([]);
    setReportsLoading(Boolean(sessionUser));
    setReportMessage('');
    if (!sessionUser) {
      setReportsLoading(false);
      return () => { active = false; };
    }
    hseApi.listContractorComplianceReports()
      .then(reports => { if (active) setComplianceReports(reports); })
      .catch(error => { if (active) setReportMessage(error instanceof Error ? error.message : 'Laporan kepatuhan tidak dapat dimuat.'); })
      .finally(() => { if (active) setReportsLoading(false); });
    return () => { active = false; };
  }, [sessionScopeKey]);

  useEffect(() => {
    let active = true;
    setFleetUnits([]);
    setP2hUnitId('');
    setP2hHistory([]);
    setP2hPhotoView({});
    setSiaPreview({});
    setFleetMessage('');
    setFleetLoading(Boolean(sessionUser));
    if (!sessionUser) {
      setFleetLoading(false);
      return () => { active = false; };
    }
    hseApi.listContractorFleet()
      .then(units => { if (active) setFleetUnits(units); })
      .catch(error => { if (active) setFleetMessage(error instanceof Error ? error.message : 'Register fleet tidak dapat dimuat.'); })
      .finally(() => { if (active) setFleetLoading(false); });
    return () => { active = false; };
  }, [sessionScopeKey]);

  useEffect(() => {
    let active = true;
    loadedP2HDraftKey.current = '';
    if (!p2hDraftKey || !draftOwner.ownerUserId || !draftOwner.ownerCompanyCode) return () => { active = false; };
    void hdosDB.getById<{id:string;ownerUserId:string;ownerCompanyCode:string;draft:ContractorP2HInput;localPhotoId?:string;requestId?:string;photoReference?:Pick<ContractorP2HInput, 'photoFileId' | 'photoFileName' | 'photoMimeType'> | null}>('contractor', p2hDraftKey)
      .then(async saved => {
        if (!active || !isCurrentSessionScope(sessionScopeKey)) return;
        if (saved && saved.ownerUserId === draftOwner.ownerUserId && saved.ownerCompanyCode === draftOwner.ownerCompanyCode) {
          setP2hDraft(saved.draft);
          setP2hLocalPhotoId(saved.localPhotoId || '');
          setP2hRequestId(saved.requestId || '');
          setP2hPhotoReference(saved.photoReference || null);
          if (saved.localPhotoId) {
            const photo = await hdosDB.getById<OfflineOperationalPhoto>('photos', saved.localPhotoId);
            if (photo && active && photo.ownerUserId === draftOwner.ownerUserId && photo.ownerCompanyCode === draftOwner.ownerCompanyCode) {
              setP2hPhotoPreview(URL.createObjectURL(photo.blob));
            }
          }
        }
        if (active) loadedP2HDraftKey.current = p2hDraftKey;
      })
      .catch(error => { if (active) setFleetMessage(error instanceof Error ? error.message : 'Draft P2H lokal gagal dibaca.'); });
    return () => { active = false; };
  }, [p2hDraftKey, sessionScopeKey]);

  useEffect(() => {
    let active = true;
    loadedReportDraftKey.current = '';
    if (!reportDraftKey || !draftOwner.ownerUserId || !draftOwner.ownerCompanyCode) return () => { active = false; };
    void hdosDB.getById<{id:string;ownerUserId:string;ownerCompanyCode:string;draft:typeof reportDraft}>('contractor', reportDraftKey)
      .then(saved => {
        if (!active || !isCurrentSessionScope(sessionScopeKey)) return;
        if (saved && saved.ownerUserId === draftOwner.ownerUserId && saved.ownerCompanyCode === draftOwner.ownerCompanyCode) setReportDraft(saved.draft);
        if (active) loadedReportDraftKey.current = reportDraftKey;
      })
      .catch(error => { if (active) setReportMessage(error instanceof Error ? error.message : 'Draft laporan lokal gagal dibaca.'); });
    return () => { active = false; };
  }, [reportDraftKey, sessionScopeKey]);

  useEffect(() => {
    if (!p2hDraftKey || loadedP2HDraftKey.current !== p2hDraftKey) return;
    const timer = window.setTimeout(() => {
      void hdosDB.put('contractor', { id: p2hDraftKey, ...draftOwner, draft: p2hDraft, localPhotoId: p2hLocalPhotoId || undefined, requestId: p2hRequestId || undefined, photoReference: p2hPhotoReference, updatedAt: new Date().toISOString() })
        .catch(error => setFleetMessage(error instanceof Error ? error.message : 'Draft P2H gagal disimpan di perangkat.'));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [p2hDraft, p2hLocalPhotoId, p2hRequestId, p2hPhotoReference, p2hDraftKey, sessionScopeKey]);

  useEffect(() => {
    if (!reportDraftKey || loadedReportDraftKey.current !== reportDraftKey) return;
    const timer = window.setTimeout(() => {
      void hdosDB.put('contractor', { id: reportDraftKey, ...draftOwner, draft: reportDraft, updatedAt: new Date().toISOString() })
        .catch(error => setReportMessage(error instanceof Error ? error.message : 'Draft laporan gagal disimpan di perangkat.'));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [reportDraft, reportDraftKey, sessionScopeKey]);

  const isCurrentSessionScope = (scopeKey: string) => {
    const current = getCurrentUser();
    const currentKey = current
      ? `${current.id}::${String(current.companyCode || '').trim().toUpperCase()}::${current.roleVerified === true ? 'verified' : 'unverified'}::${[...(current.roles || [])].sort().join(',')}`
      : 'anonymous';
    return currentKey === scopeKey;
  };

  const refreshFleet = async () => {
    const requestScope = sessionScopeKey;
    setFleetLoading(true);
    try {
      const units = await hseApi.listContractorFleet();
      if (isCurrentSessionScope(requestScope)) setFleetUnits(units);
    } catch (error) {
      if (isCurrentSessionScope(requestScope)) setFleetMessage(error instanceof Error ? error.message : 'Register fleet tidak dapat dimuat.');
    } finally {
      if (isCurrentSessionScope(requestScope)) setFleetLoading(false);
    }
  };

  const openP2HHistory = async (unit: ContractorFleetUnit) => {
    if (p2hUnitId === unit.id) { setP2hUnitId(''); setP2hHistory([]); return; }
    const requestScope = sessionScopeKey;
    setP2hUnitId(unit.id);
    setP2hHistory([]);
    setP2hLoading(true);
    try {
      const history = await hseApi.listContractorP2HHistory(unit.id);
      if (isCurrentSessionScope(requestScope)) setP2hHistory(history);
    } catch (error) {
      if (isCurrentSessionScope(requestScope)) setFleetMessage(error instanceof Error ? error.message : 'Riwayat P2H tidak dapat dimuat.');
    } finally {
      if (isCurrentSessionScope(requestScope)) setP2hLoading(false);
    }
  };

  const uploadSiaDocument = async (unit: ContractorFleetUnit, file: File) => {
    if (file.size > 10 * 1024 * 1024) { setFleetMessage('Ukuran dokumen SIA maksimal 10 MB.'); return; }
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) { setFleetMessage('Dokumen SIA harus PDF, JPG, atau PNG.'); return; }
    const requestScope = sessionScopeKey;
    setFleetBusy(true); setFleetMessage('');
    try {
      const fileBase64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error('Dokumen SIA tidak dapat dibaca.')); reader.onload = () => resolve(String(reader.result || '').split(',')[1] || ''); reader.readAsDataURL(file); });
      if (!isCurrentSessionScope(requestScope)) return;
      await hseApi.uploadContractorSia(unit.id, { fileName: file.name, mimeType: file.type, fileBase64 });
      if (!isCurrentSessionScope(requestScope)) return;
      setFleetMessage('Dokumen SIA berhasil diunggah dan ditautkan ke unit.');
      await refreshFleet();
    } catch (error) { if (isCurrentSessionScope(requestScope)) setFleetMessage(error instanceof Error ? error.message : 'Unggah dokumen SIA gagal.'); }
    finally { if (isCurrentSessionScope(requestScope)) setFleetBusy(false); }
  };

  const previewSiaDocument = async (unit: ContractorFleetUnit) => {
    if (siaPreview[unit.id]) { setSiaPreview(current => { const next = {...current}; delete next[unit.id]; return next; }); return; }
    const requestScope = sessionScopeKey;
    try {
      const file = await hseApi.previewContractorSia(unit.id);
      if (!isCurrentSessionScope(requestScope)) return;
      setSiaPreview(current => ({...current, [unit.id]: { url: `data:${file.mimeType};base64,${file.base64}`, mimeType: file.mimeType, fileName: file.fileName }}));
    } catch (error) {
      if (isCurrentSessionScope(requestScope)) setFleetMessage(error instanceof Error ? error.message : 'Dokumen SIA tidak dapat dibuka.');
    }
  };

  const openP2HPhoto = async (record: ContractorP2HRecord) => {
    if (p2hPhotoView[record.id]) { setP2hPhotoView(current => { const next = {...current}; delete next[record.id]; return next; }); return; }
    const requestScope = sessionScopeKey;
    try {
      const photo = await hseApi.getContractorP2HPhoto(record.id);
      if (!isCurrentSessionScope(requestScope)) return;
      setP2hPhotoView(current => ({...current, [record.id]: `data:${photo.mimeType};base64,${photo.base64}`}));
    } catch (error) {
      if (isCurrentSessionScope(requestScope)) setFleetMessage(error instanceof Error ? error.message : 'Bukti foto tidak dapat dibuka.');
    }
  };

  const submitP2HRecord = async (event: React.FormEvent<HTMLFormElement>, unit: ContractorFleetUnit) => {
    event.preventDefault();
    const requestScope = sessionScopeKey;
    setFleetBusy(true);
    setFleetMessage('');
    try {
      const requestId = p2hRequestId || (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `p2h_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`);
      const queueId = `contractor-p2h:${requestId}`;
      const payload = {
        id: queueId,
        fleetId: unit.id,
        input: {
          ...p2hDraft,
          requestId,
          ...(p2hPhotoReference || {}),
          hourMeter: p2hDraft.hourMeter === '' ? '' : Number(p2hDraft.hourMeter),
        },
        localPhotoId: p2hLocalPhotoId || undefined,
      };
      await hdosSync.enqueue({
        action: 'CREATE',
        entity: 'contractor',
        payload,
      });
      if (!isCurrentSessionScope(requestScope)) return;
      setP2hRequestId('');
      setP2hPhotoReference(null);
      setP2hLocalPhotoId('');
      setP2hDraft({ inspectionDate: new Date().toISOString().slice(0,10), status: 'READY', hourMeter: '', operatorName: '', findings: '', correctiveAction: '' });
      if (p2hDraftKey) await hdosDB.delete('contractor', p2hDraftKey);
      loadedP2HDraftKey.current = '';
      setP2hPhotoPreview('');
      setFleetMessage(navigator.onLine
        ? 'P2H masuk antrean sinkronisasi. Status pengiriman dapat dipantau pada modul Sinkronisasi.'
        : 'P2H tersimpan di antrean offline perangkat dan akan dikirim otomatis saat koneksi kembali.');
      if (navigator.onLine) {
        void hdosSync.triggerSync();
      }
    } catch (error) {
      if (isCurrentSessionScope(requestScope)) setFleetMessage(error instanceof Error ? error.message : 'Pencatatan P2H gagal disimpan ke antrean.');
    } finally {
      if (isCurrentSessionScope(requestScope)) setFleetBusy(false);
    }
  };

  const submitFleetUnit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const requestScope = sessionScopeKey;
    setFleetBusy(true);
    setFleetMessage('');
    const payload: ContractorFleetInput = { ...fleetDraft };
    try {
      await hseApi.createContractorFleetUnit(payload);
      if (!isCurrentSessionScope(requestScope)) return;
      setFleetDraft({unitNumber:'',unitType:'',brand:'',model:'',ownershipType:'OWNED',p2hStatus:'NOT_CHECKED',siaExpiry:''});
      setFleetMessage('Unit berhasil ditambahkan ke register fleet.');
      await refreshFleet();
    } catch (error) {
      if (isCurrentSessionScope(requestScope)) setFleetMessage(error instanceof Error ? error.message : 'Unit gagal didaftarkan.');
    } finally {
      if (isCurrentSessionScope(requestScope)) setFleetBusy(false);
    }
  };

  const updateFleetUnit = async (unit: ContractorFleetUnit, updates: Partial<ContractorFleetInput>) => {
    const requestScope = sessionScopeKey;
    setFleetBusy(true);
    setFleetMessage('');
    try {
      await hseApi.updateContractorFleetUnit(unit.id, updates);
      if (!isCurrentSessionScope(requestScope)) return;
      setFleetMessage('Data unit berhasil diperbarui.');
      await refreshFleet();
    } catch (error) {
      if (isCurrentSessionScope(requestScope)) setFleetMessage(error instanceof Error ? error.message : 'Data unit gagal diperbarui.');
    } finally {
      if (isCurrentSessionScope(requestScope)) setFleetBusy(false);
    }
  };

  const refreshComplianceReports = async () => {
    const requestScope = sessionScopeKey;
    setReportsLoading(true);
    try {
      const reports = await hseApi.listContractorComplianceReports();
      if (isCurrentSessionScope(requestScope)) setComplianceReports(reports);
    } catch (error) {
      if (isCurrentSessionScope(requestScope)) setReportMessage(error instanceof Error ? error.message : 'Laporan kepatuhan tidak dapat dimuat.');
    } finally {
      if (isCurrentSessionScope(requestScope)) setReportsLoading(false);
    }
  };

  const submitComplianceReport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const requestScope = sessionScopeKey;
    setReportBusy(true);
    setReportMessage('');
    const payload: ContractorComplianceReportInput = {
      period: reportDraft.period,
      manpowerCount: Number(reportDraft.manpowerCount),
      equipmentCount: Number(reportDraft.equipmentCount),
      mcuEligibleCount: Number(reportDraft.mcuEligibleCount),
      mcuFitCount: Number(reportDraft.mcuFitCount),
      inductionRequiredCount: Number(reportDraft.inductionRequiredCount),
      inductionCompletedCount: Number(reportDraft.inductionCompletedCount),
      safeHours: Number(reportDraft.safeHours),
      ltiCount: Number(reportDraft.ltiCount),
      remarks: reportDraft.remarks.trim()
    };
    try {
      if (editingReportId) {
        await hseApi.updateContractorComplianceReport(editingReportId, payload);
        if (!isCurrentSessionScope(requestScope)) return;
        setReportMessage('Perbaikan laporan berhasil dikirim dan menunggu verifikasi HSE.');
        await refreshComplianceReports();
      } else {
        const requestId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `report_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
        await hdosSync.enqueue({
          action: 'CREATE',
          entity: 'contractor-report',
          payload: { id: `contractor-report:${requestId}`, input: payload },
        });
        if (!isCurrentSessionScope(requestScope)) return;
        setReportMessage(navigator.onLine
          ? 'Laporan masuk antrean sinkronisasi dan akan dikirim ke HSE.'
          : 'Laporan tersimpan di perangkat dan akan dikirim otomatis saat koneksi kembali.');
        if (navigator.onLine) void hdosSync.triggerSync();
      }
      if (!isCurrentSessionScope(requestScope)) return;
      setEditingReportId('');
      setReportDraft({ period: currentPeriod, manpowerCount: '', equipmentCount: '', mcuEligibleCount: '', mcuFitCount: '', inductionRequiredCount: '', inductionCompletedCount: '', safeHours: '', ltiCount: '0', remarks: '' });
      if (reportDraftKey) await hdosDB.delete('contractor', reportDraftKey);
      loadedReportDraftKey.current = '';
    } catch (error) {
      if (isCurrentSessionScope(requestScope)) setReportMessage(error instanceof Error ? error.message : 'Laporan gagal disimpan.');
    } finally {
      if (isCurrentSessionScope(requestScope)) setReportBusy(false);
    }
  };

  const reviewComplianceReport = async (report: ContractorComplianceReport, action: 'VERIFY' | 'RETURN') => {
    if (action === 'RETURN' && !reviewNotes.trim()) {
      setReportMessage('Alasan pengembalian wajib diisi.');
      return;
    }
    const requestScope = sessionScopeKey;
    setReportBusy(true);
    setReportMessage('');
    try {
      await hseApi.updateContractorComplianceReport(report.id, { action, reviewNotes: reviewNotes.trim() });
      if (!isCurrentSessionScope(requestScope)) return;
      setReviewNotes('');
      setReportMessage(action === 'VERIFY' ? 'Laporan diverifikasi.' : 'Laporan dikembalikan kepada perusahaan untuk diperbaiki.');
      await refreshComplianceReports();
    } catch (error) {
      if (isCurrentSessionScope(requestScope)) setReportMessage(error instanceof Error ? error.message : 'Review laporan gagal disimpan.');
    } finally {
      if (isCurrentSessionScope(requestScope)) setReportBusy(false);
    }
  };

  const startReportCorrection = (report: ContractorComplianceReport) => {
    setEditingReportId(report.id);
    setReportDraft({
      period: report.period,
      manpowerCount: String(report.manpowerCount),
      equipmentCount: String(report.equipmentCount),
      mcuEligibleCount: String(report.mcuEligibleCount),
      mcuFitCount: String(report.mcuFitCount),
      inductionRequiredCount: String(report.inductionRequiredCount),
      inductionCompletedCount: String(report.inductionCompletedCount),
      safeHours: String(report.safeHours),
      ltiCount: String(report.ltiCount),
      remarks: report.remarks || ''
    });
    setReportMessage('Perbaiki data sesuai catatan HSE, lalu kirim ulang laporan.');
  };

  const selectedVerifiedReport = complianceReports
    .filter(report => report.companyCode.toUpperCase() === selectedCompanyCode && report.status === 'VERIFIED')
    .sort((a, b) => b.period.localeCompare(a.period))[0];
  const selectedCompanyReports = complianceReports
    .filter(report => report.companyCode.toUpperCase() === selectedCompanyCode ||
      (report.parentCompanyCode || '').toUpperCase() === selectedCompanyCode)
    .sort((a, b) => b.period.localeCompare(a.period));
  const selectedCompanyFleet = fleetUnits
    .filter(unit => unit.companyCode.toUpperCase() === selectedCompanyCode ||
      (unit.parentCompanyCode || '').toUpperCase() === selectedCompanyCode)
    .sort((a, b) => a.companyCode.localeCompare(b.companyCode) || a.unitNumber.localeCompare(b.unitNumber));
  const activeFleetCount = selectedCompanyFleet.filter(unit => unit.status === 'ACTIVE').length;

  const exportFleetCsv = () => {
    if (!canDownloadDocuments(sessionUser) || selectedCompanyFleet.length === 0) return;
    const rows = [
      ['Kode Perusahaan', 'Nomor Unit', 'Jenis Unit', 'Merek', 'Model', 'Kepemilikan', 'Status P2H', 'Waktu P2H Terakhir', 'Dicatat Oleh', 'Masa Berlaku SIA', 'Status Unit'],
      ...selectedCompanyFleet.map(unit => [
        unit.companyCode, unit.unitNumber, unit.unitType, unit.brand, unit.model,
        unit.ownershipType, unit.p2hStatus, unit.p2hLastCheckedAt || '',
        unit.p2hCheckedBy || '', unit.siaExpiry || '', unit.status
      ])
    ];
    const csv = '\uFEFF' + rows.map(row => row.map(value =>
      '"' + String(value ?? '').replace(/"/g, '""') + '"'
    ).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'HDOS_Contractor_Fleet_' + selectedCompanyCode + '_' + localNow.getFullYear() + '-' + String(localNow.getMonth() + 1).padStart(2, '0') + '-' + String(localNow.getDate()).padStart(2, '0') + '.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const exportComplianceReports = () => {
    if (!canDownloadDocuments(sessionUser) || selectedCompanyReports.length === 0) return;
    const rows = [
      ['Periode', 'Kode Perusahaan', 'Manpower', 'Fleet', 'MCU Wajib', 'MCU Fit', 'Induksi Wajib', 'Induksi Selesai', 'Safe Hours Kumulatif', 'LTI', 'Status', 'Catatan', 'Catatan Review'],
      ...selectedCompanyReports.map(report => [
        report.period, report.companyCode, report.manpowerCount, report.equipmentCount,
        report.mcuEligibleCount, report.mcuFitCount, report.inductionRequiredCount,
        report.inductionCompletedCount, report.safeHours, report.ltiCount,
        report.status, report.remarks || '', report.reviewNotes || ''
      ])
    ];
    const csv = '\uFEFF' + rows.map(row => row.map(value =>
      '"' + String(value ?? '').replace(/"/g, '""') + '"'
    ).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'HDOS_Contractor_Compliance_' + selectedCompanyCode + '_' + localNow.getFullYear() + '-' + String(localNow.getMonth() + 1).padStart(2, '0') + '-' + String(localNow.getDate()).padStart(2, '0') + '.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const activeCompanyCount = store.contractors.filter(company => company.status === 'ACTIVE').length;
  const passportExpiry = selectedContractor?.safetyPassportExpiry
    ? new Date(selectedContractor.safetyPassportExpiry.slice(0, 10) + 'T00:00:00')
    : null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const passportDaysRemaining = passportExpiry && !Number.isNaN(passportExpiry.getTime())
    ? Math.ceil((passportExpiry.getTime() - today.getTime()) / 86400000)
    : null;

  if (store.contractors.length === 0 || !selectedContractor) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <h2 className="flex items-center gap-2 text-lg font-bold text-white"><HardHat className="h-5 w-5 text-amber-400"/>Contractor Passport</h2>
        <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center">
          <Building2 className="mx-auto mb-3 h-8 w-8 text-neutral-500"/>
          <p className="font-semibold text-white">Belum ada data kontraktor</p>
          <p className="mt-2 text-sm text-neutral-400">Tambahkan kontraktor melalui modul Pengaturan. Manpower, jam kerja, MCU, dan KPI akan tetap kosong sampai data aktual dimasukkan.</p>
          <button onClick={() => store.openWindow('settings')} className="mt-4 rounded-xl bg-[#00E676] px-4 py-2 text-sm font-semibold text-black">Buka Pengaturan</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <HardHat className="w-5 h-5 text-[#F59E0B]" />
            Contractor Passport &amp; Subcontractor Compliance
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Passport digital kontraktor pertambangan: verifikasi MCU, kepatuhan safety induction, rasio PICA, dan Safe Hours.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-semibold">
            {activeCompanyCount} dari {store.contractors.length} Mitra Kerja Aktif
          </span>
        </div>
      </div>

      {/* Contractor Selector Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {store.contractors.map((c) => {
          const isSelected = selectedContractor.id === c.id;
          const verifiedReport = complianceReports
            .filter(report => report.companyCode.toUpperCase() === c.code.toUpperCase() && report.status === 'VERIFIED')
            .sort((a, b) => b.period.localeCompare(a.period))[0];

          return (
            <div
              key={c.id}
              onClick={() => setSelectedContractor(c)}
              className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-amber-500/15 border-amber-500/50 shadow-xl'
                  : 'bg-white/5 border-white/10 hover:bg-white/10'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 font-black flex items-center justify-center font-mono text-base border border-amber-500/30">
                    {c.code}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white leading-tight">{c.companyName}</h4>
                    <div className="text-[10px] text-neutral-400 mt-0.5 font-mono">Kode Mitra: {c.code}</div>
                    <div className="mt-1 text-[10px] text-neutral-500">
                      {c.companyRole || 'Perusahaan'}
                      {c.parentCompanyCode ? ` · Induk: ${c.parentCompanyCode}` : ''}
                    </div>
                  </div>
                </div>

                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${c.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-300' : c.status === 'WARNING' ? 'bg-amber-500/20 text-amber-300' : 'bg-red-500/20 text-red-300'}`}>
                  {c.status}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] border-t border-white/5 pt-2 font-mono">
                <div>
                  <span className="text-neutral-400">LTI Periode:</span>{' '}
                  <strong className="text-[#00E676]">{verifiedReport ? (verifiedReport.ltiCount === 0 ? 'Tanpa LTI' : verifiedReport.ltiCount + ' LTI') : 'Belum diverifikasi'}</strong>
                </div>
                <div>
                  <span className="text-neutral-400">Manpower:</span>{' '}
                  <strong className="text-white">{verifiedReport ? verifiedReport.manpowerCount.toLocaleString('id-ID') + ' org' : 'Belum diverifikasi'}</strong>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Contractor Passport View */}
      <div className="apple-glass-card p-6 rounded-2xl space-y-6">
        {/* Top Info Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-400 font-black flex items-center justify-center font-mono text-2xl border border-amber-500/30">
              {selectedContractor.code}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">{selectedContractor.companyName}</h3>
                <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] text-neutral-300">{selectedContractor.companyRole || 'Perusahaan'}</span>
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${selectedContractor.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-300' : selectedContractor.status === 'WARNING' ? 'bg-amber-500/20 text-amber-300' : 'bg-red-500/20 text-red-300'}`}>
                  Status: {selectedContractor.status}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-neutral-400 mt-1">
                {selectedContractor.parentCompanyCode && <span>Perusahaan Induk: <strong className="text-white">{selectedContractor.parentCompanyCode}</strong></span>}
                <span>PIC Safety: <strong className="text-white">{selectedContractor.picName}</strong></span>
                <span>·</span>
                <span className="flex items-center gap-1 font-mono text-neutral-300">
                  <Phone className="w-3 h-3 text-neutral-400" /> {selectedContractor.picContact}
                </span>
              </div>
            </div>
          </div>

          <div className="text-right text-xs">
            <div className="text-neutral-400 font-mono">Masa Berlaku Safety Passport:</div>
            <div className="text-[#00E676] font-bold font-mono text-sm mt-0.5">
              {selectedContractor.safetyPassportExpiry || 'Belum dicatat'}
            </div>
            {passportDaysRemaining !== null && (
              <div className="mt-1 text-[10px] text-neutral-400">
                {passportDaysRemaining < 0 ? 'Kedaluwarsa ' + Math.abs(passportDaysRemaining) + ' hari lalu' : passportDaysRemaining === 0 ? 'Berakhir hari ini' : 'Sisa ' + passportDaysRemaining + ' hari'}
              </div>
            )}
          </div>
        </div>

        {/* 4 Compliance Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center justify-between text-neutral-400 text-xs">
              <span>MCU Tahunan</span>
              <FileCheck className="w-4 h-4 text-[#00E676]" />
            </div>
            <div className="text-2xl font-bold text-white font-mono mt-1">
              {selectedVerifiedReport && selectedVerifiedReport.mcuEligibleCount > 0 ? `${Math.round(selectedVerifiedReport.mcuFitCount / selectedVerifiedReport.mcuEligibleCount * 100)}%` : '—'}
            </div>
            <div className="text-[10px] text-neutral-400 mt-1">Fit to work certified</div>
          </div>

          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center justify-between text-neutral-400 text-xs">
              <span>Induksi Safety</span>
              <Award className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-2xl font-bold text-white font-mono mt-1">
              {selectedVerifiedReport && selectedVerifiedReport.inductionRequiredCount > 0 ? `${Math.round(selectedVerifiedReport.inductionCompletedCount / selectedVerifiedReport.inductionRequiredCount * 100)}%` : '—'}
            </div>
            <div className="text-[10px] text-neutral-400 mt-1">Berdasarkan data induksi yang tercatat</div>
          </div>

          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center justify-between text-neutral-400 text-xs">
              <span>Jam Kerja Selamat</span>
              <ShieldCheck className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-xl font-bold text-white font-mono mt-1 truncate">
              {selectedVerifiedReport ? selectedVerifiedReport.safeHours.toLocaleString('id-ID') : '—'}
            </div>
            <div className="text-[10px] text-neutral-400 mt-1">LTI-Free Hours</div>
          </div>

          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center justify-between text-neutral-400 text-xs">
              <span>PICA Aktif</span>
              <AlertTriangle className="w-4 h-4 text-red-400" />
            </div>
            <div className="text-2xl font-bold text-amber-400 font-mono mt-1">
              {actualActivePicaCount > 0 ? actualActivePicaCount : '0'}
            </div>
            <div className="text-[10px] text-neutral-400 mt-1">Sedang ditindaklanjuti</div>
          </div>
        </div>

        {/* Equipment & Fleet Status — show only verified master data. */}
        <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-2">
              <Truck className="w-4 h-4 text-[#F59E0B]" />
              Peralatan &amp; Fleet
            </h4>
            <span className="text-xs font-mono text-neutral-400">
              {activeFleetCount} unit aktif di register
            </span>
          </div>
          <p className="text-xs text-neutral-400">
            Jumlah unit berasal dari register fleet. Status P2H dan masa berlaku SIA ditampilkan dari data unit yang didaftarkan; jumlah pada laporan bulanan tetap dapat dibandingkan pada tabel laporan.
          </p>
        </div>

      </div>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <h4 className="text-sm font-bold text-white">Laporan Kepatuhan Bulanan Kontraktor</h4>
            <p className="mt-1 text-xs text-neutral-400">Data agregat manpower, fleet, MCU, induksi, jam kerja selamat, dan LTI. Nilai KPI hanya ditampilkan setelah diverifikasi HSE.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-neutral-300">{selectedCompanyReports.length} laporan</span>
            <button type="button" onClick={() => void refreshComplianceReports()} disabled={reportsLoading} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-neutral-300 disabled:opacity-50">{reportsLoading ? 'Memuat...' : 'Muat Ulang'}</button>
            {canDownloadDocuments(sessionUser) && <button type="button" onClick={exportComplianceReports} disabled={selectedCompanyReports.length === 0} className="rounded-lg bg-[#00E676]/15 px-3 py-1.5 text-xs font-semibold text-[#00E676] disabled:opacity-40">Unduh CSV</button>}
          </div>
        </div>

        {canSubmitReport && ownCompanyCode === selectedCompanyCode && (
          <form onSubmit={submitComplianceReport} className="grid grid-cols-1 gap-3 border-b border-white/10 p-5 sm:grid-cols-2 lg:grid-cols-3">
            <div className="sm:col-span-2 lg:col-span-3">
              <h5 className="text-xs font-semibold text-white">{editingReportId ? 'Perbaikan Laporan yang Dikembalikan' : 'Kirim Laporan Bulanan'} · {ownCompanyCode}</h5>
            </div>
            <label className="space-y-1 text-xs text-neutral-400">Periode laporan
              <input type="month" required disabled={Boolean(editingReportId)} value={reportDraft.period} onChange={e => setReportDraft(current => ({...current, period:e.target.value}))} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-white disabled:opacity-60" />
            </label>
            {([
              ['manpowerCount','Jumlah manpower'],
              ['equipmentCount','Jumlah unit peralatan'],
              ['mcuEligibleCount','Pekerja wajib MCU'],
              ['mcuFitCount','Pekerja MCU fit'],
              ['inductionRequiredCount','Pekerja wajib induksi'],
              ['inductionCompletedCount','Pekerja selesai induksi'],
              ['safeHours','Jam kerja selamat kumulatif'],
              ['ltiCount','Jumlah LTI periode ini']
            ] as const).map(([field,label]) => (
              <label key={field} className="space-y-1 text-xs text-neutral-400">{label}
                <input type="number" min="0" step="1" required value={reportDraft[field]} onChange={e => setReportDraft(current => ({...current,[field]:e.target.value}))} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-white" />
              </label>
            ))}
            <label className="space-y-1 text-xs text-neutral-400 sm:col-span-2 lg:col-span-3">Catatan / keterangan
              <textarea rows={2} maxLength={1000} value={reportDraft.remarks} onChange={e => setReportDraft(current => ({...current,remarks:e.target.value}))} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-white" placeholder="Sumber data, periode cut-off, atau keterangan pendukung." />
            </label>
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-3">
              <button type="submit" disabled={reportBusy} className="rounded-lg bg-[#00E676] px-4 py-2 text-xs font-bold text-black disabled:opacity-50">{reportBusy ? 'Menyimpan...' : editingReportId ? 'Kirim Ulang Laporan' : 'Kirim untuk Verifikasi HSE'}</button>
              {editingReportId && <button type="button" onClick={() => { setEditingReportId(''); setReportDraft({period:currentPeriod,manpowerCount:'',equipmentCount:'',mcuEligibleCount:'',mcuFitCount:'',inductionRequiredCount:'',inductionCompletedCount:'',safeHours:'',ltiCount:'0',remarks:''}); }} className="rounded-lg border border-white/10 px-4 py-2 text-xs text-neutral-300">Batal Perbaikan</button>}
              <span className="text-[10px] text-neutral-500">MCU hanya berupa jumlah agregat; jangan masukkan diagnosis atau data medis individu.</span>
            </div>
          </form>
        )}
        {canSubmitReport && ownCompanyCode !== selectedCompanyCode && (
          <div className="border-b border-white/10 px-5 py-3 text-xs text-neutral-400">Pengiriman laporan dilakukan oleh akun perusahaan masing-masing. Pilih perusahaan akun Anda ({ownCompanyCode}) untuk mengirim laporan.</div>
        )}
        {reportMessage && <div className="border-b border-white/10 px-5 py-3 text-xs text-amber-200">{reportMessage}</div>}

        {selectedCompanyReports.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-neutral-400">Belum ada laporan kepatuhan untuk perusahaan ini.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-xs">
              <thead className="bg-white/5 text-neutral-400">
                <tr><th className="px-4 py-3">Periode / Perusahaan</th><th className="px-4 py-3">Manpower</th><th className="px-4 py-3">Fleet</th><th className="px-4 py-3">MCU</th><th className="px-4 py-3">Induksi</th><th className="px-4 py-3">Safe Hours</th><th className="px-4 py-3">LTI</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Tindakan</th></tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {selectedCompanyReports.map(report => (
                  <tr key={report.id} className="text-neutral-300">
                    <td className="px-4 py-3"><div className="font-mono text-white">{report.period}</div><div className="text-[10px] text-neutral-500">{report.companyCode}</div></td>
                    <td className="px-4 py-3">{report.manpowerCount.toLocaleString('id-ID')}</td>
                    <td className="px-4 py-3">{report.equipmentCount.toLocaleString('id-ID')}</td>
                    <td className="px-4 py-3">{report.mcuEligibleCount ? Math.round(report.mcuFitCount / report.mcuEligibleCount * 100) + '%' : '—'}</td>
                    <td className="px-4 py-3">{report.inductionRequiredCount ? Math.round(report.inductionCompletedCount / report.inductionRequiredCount * 100) + '%' : '—'}</td>
                    <td className="px-4 py-3">{report.safeHours.toLocaleString('id-ID')}</td>
                    <td className="px-4 py-3">{report.ltiCount}</td>
                    <td className="px-4 py-3"><span className={`rounded px-2 py-1 text-[10px] font-semibold ${report.status === 'VERIFIED' ? 'bg-emerald-500/15 text-emerald-300' : report.status === 'RETURNED' ? 'bg-red-500/15 text-red-300' : 'bg-amber-500/15 text-amber-300'}`}>{report.status}</span>{report.reviewNotes && <div className="mt-1 max-w-[180px] whitespace-normal text-[10px] text-red-300">{report.reviewNotes}</div>}</td>
                    <td className="px-4 py-3">
                      {canReviewReport && report.status === 'SUBMITTED' && <div className="flex flex-col gap-1"><button type="button" disabled={reportBusy} onClick={() => void reviewComplianceReport(report,'VERIFY')} className="rounded bg-emerald-500/15 px-2 py-1 text-[10px] text-emerald-300">Verifikasi</button><button type="button" disabled={reportBusy} onClick={() => void reviewComplianceReport(report,'RETURN')} className="rounded bg-red-500/15 px-2 py-1 text-[10px] text-red-300">Kembalikan</button></div>}
                      {report.status === 'RETURNED' && canSubmitReport && report.companyCode.toUpperCase() === ownCompanyCode && <button type="button" onClick={() => startReportCorrection(report)} className="rounded bg-amber-500/15 px-2 py-1 text-[10px] text-amber-300">Perbaiki</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {canReviewReport && selectedCompanyReports.some(report => report.status === 'SUBMITTED') && (
          <div className="border-t border-white/10 p-5">
            <label className="block space-y-1 text-xs text-neutral-400">Catatan pengembalian (wajib jika laporan dikembalikan)
              <textarea rows={2} value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} maxLength={1000} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-white" placeholder="Tuliskan data yang perlu diperbaiki." />
            </label>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <h4 className="flex items-center gap-2 text-sm font-bold text-white"><Truck className="h-4 w-4 text-amber-400" />Register Peralatan &amp; Fleet</h4>
            <p className="mt-1 text-xs text-neutral-400">Daftar unit Contractor dan Subkon, status P2H, kepemilikan, serta masa berlaku SIA.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-neutral-300">{activeFleetCount} unit aktif · {selectedCompanyFleet.length} total</span>
            <button type="button" onClick={() => void refreshFleet()} disabled={fleetLoading} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-neutral-300 disabled:opacity-50">{fleetLoading ? 'Memuat...' : 'Muat Ulang'}</button>
            {canDownloadDocuments(sessionUser) && <button type="button" onClick={exportFleetCsv} disabled={selectedCompanyFleet.length === 0} className="rounded-lg bg-[#00E676]/15 px-3 py-1.5 text-xs font-semibold text-[#00E676] disabled:opacity-40">Unduh CSV</button>}
          </div>
        </div>

        {canSubmitReport && ownCompanyCode === selectedCompanyCode && (
          <form onSubmit={submitFleetUnit} className="grid grid-cols-1 gap-3 border-b border-white/10 p-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2 lg:col-span-4"><h5 className="text-xs font-semibold text-white">Tambah Unit · {ownCompanyCode}</h5></div>
            <label className="space-y-1 text-xs text-neutral-400">Nomor lambung / unit *
              <input required minLength={2} maxLength={50} value={fleetDraft.unitNumber} onChange={e => setFleetDraft(current => ({...current,unitNumber:e.target.value}))} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-white" placeholder="Contoh: DT-001" />
            </label>
            <label className="space-y-1 text-xs text-neutral-400">Jenis unit *
              <input required minLength={2} maxLength={80} value={fleetDraft.unitType} onChange={e => setFleetDraft(current => ({...current,unitType:e.target.value}))} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-white" placeholder="Dump Truck" />
            </label>
            <label className="space-y-1 text-xs text-neutral-400">Merek
              <input maxLength={80} value={fleetDraft.brand} onChange={e => setFleetDraft(current => ({...current,brand:e.target.value}))} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-white" placeholder="XCMG" />
            </label>
            <label className="space-y-1 text-xs text-neutral-400">Model
              <input maxLength={80} value={fleetDraft.model} onChange={e => setFleetDraft(current => ({...current,model:e.target.value}))} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-white" placeholder="DH400" />
            </label>
            <label className="space-y-1 text-xs text-neutral-400">Kepemilikan
              <select value={fleetDraft.ownershipType} onChange={e => setFleetDraft(current => ({...current,ownershipType:e.target.value as ContractorFleetInput['ownershipType']}))} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-white">
                <option value="OWNED">Milik perusahaan</option><option value="RENTAL">Sewa</option><option value="LEASED">Leasing</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-neutral-400">Status P2H
              <select value={fleetDraft.p2hStatus} onChange={e => setFleetDraft(current => ({...current,p2hStatus:e.target.value as ContractorFleetInput['p2hStatus']}))} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-white">
                <option value="NOT_CHECKED">Belum diperiksa</option><option value="READY">Siap operasi</option><option value="NOT_READY">Tidak laik operasi</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-neutral-400">Masa berlaku SIA
              <input type="date" value={fleetDraft.siaExpiry} onChange={e => setFleetDraft(current => ({...current,siaExpiry:e.target.value}))} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-white" />
            </label>
            <div className="flex items-end"><button type="submit" disabled={fleetBusy} className="w-full rounded-lg bg-[#00E676] px-4 py-2 text-xs font-bold text-black disabled:opacity-50">{fleetBusy ? 'Menyimpan...' : 'Daftarkan Unit'}</button></div>
            <p className="text-[10px] text-neutral-500 sm:col-span-2 lg:col-span-4">Riwayat P2H disimpan sebagai catatan terpisah yang tidak menimpa pemeriksaan sebelumnya. Dokumen bukti inspeksi dan lampiran SIA masih dalam tahap pengembangan.</p>
          </form>
        )}
        {canSubmitReport && ownCompanyCode !== selectedCompanyCode && (
          <div className="border-b border-white/10 px-5 py-3 text-xs text-neutral-400">Pendaftaran dan perubahan unit dilakukan oleh akun perusahaan pemilik unit.</div>
        )}
        {fleetMessage && <div className="border-b border-white/10 px-5 py-3 text-xs text-amber-200">{fleetMessage}</div>}
        {selectedCompanyFleet.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-neutral-400">{fleetLoading ? 'Memuat register fleet...' : 'Belum ada unit yang didaftarkan untuk perusahaan ini.'}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-xs">
              <thead className="bg-white/5 text-neutral-400">
                <tr><th className="px-4 py-3">Unit / Perusahaan</th><th className="px-4 py-3">Jenis / Model</th><th className="px-4 py-3">Kepemilikan</th><th className="px-4 py-3">P2H</th><th className="px-4 py-3">SIA</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Tindakan</th></tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {selectedCompanyFleet.map(unit => {
                  const expiry = unit.siaExpiry ? new Date(unit.siaExpiry.slice(0,10) + 'T00:00:00') : null;
                  const expiryDays = expiry !== null && !Number.isNaN(expiry.getTime()) ? Math.ceil((expiry.getTime() - today.getTime()) / 86400000) : null;
                  const expired = expiryDays !== null && expiryDays < 0;
                  const expiringSoon = expiryDays !== null && expiryDays >= 0 && expiryDays <= 30;
                  const editable = canSubmitReport && unit.companyCode.toUpperCase() === ownCompanyCode;
                  return (
                    <React.Fragment key={unit.id}>
                    <tr className="text-neutral-300">
                      <td className="px-4 py-3"><div className="font-mono font-semibold text-white">{unit.unitNumber}</div><div className="text-[10px] text-neutral-500">{unit.companyCode}</div></td>
                      <td className="px-4 py-3"><div>{unit.unitType}</div><div className="text-[10px] text-neutral-500">{[unit.brand,unit.model].filter(Boolean).join(' ') || 'Merek/model belum dicatat'}</div></td>
                      <td className="px-4 py-3">{unit.ownershipType === 'OWNED' ? 'Milik perusahaan' : unit.ownershipType === 'RENTAL' ? 'Sewa' : 'Leasing'}</td>
                      <td className="px-4 py-3">
                        {editable ? <select value={unit.p2hStatus} disabled={fleetBusy} onChange={e => void updateFleetUnit(unit,{p2hStatus:e.target.value as ContractorFleetInput['p2hStatus']})} className="rounded border border-white/10 bg-neutral-950 px-2 py-1 text-xs text-white"><option value="NOT_CHECKED">Belum diperiksa</option><option value="READY">Siap operasi</option><option value="NOT_READY">Tidak laik operasi</option></select> : <span className={unit.p2hStatus === 'READY' ? 'text-emerald-300' : unit.p2hStatus === 'NOT_READY' ? 'text-red-300' : 'text-amber-300'}>{unit.p2hStatus === 'READY' ? 'Siap operasi' : unit.p2hStatus === 'NOT_READY' ? 'Tidak laik operasi' : 'Belum diperiksa'}</span>}
                        {unit.p2hLastCheckedAt && <div className="mt-1 text-[10px] text-neutral-500">{new Date(unit.p2hLastCheckedAt).toLocaleDateString('id-ID')} · {unit.p2hCheckedBy || 'Akun tidak tercatat'}</div>}
                      </td>
                      <td className={`px-4 py-3 ${expired ? 'text-red-300' : expiringSoon ? 'text-amber-300' : 'text-neutral-300'}`}>
                        {editable ? <input type="date" defaultValue={unit.siaExpiry || ''} disabled={fleetBusy} onBlur={e => { if (e.target.value !== unit.siaExpiry) void updateFleetUnit(unit,{siaExpiry:e.target.value}); }} className="rounded border border-white/10 bg-neutral-950 px-2 py-1 text-xs text-white" /> : (unit.siaExpiry || 'Belum dicatat')}
                        {expired && <div className="text-[10px]">Kedaluwarsa {Math.abs(expiryDays || 0)} hari lalu</div>}
                        <div className="mt-1 flex flex-wrap gap-2">{editable && <label className="cursor-pointer text-[10px] text-sky-300 underline">{unit.siaFileName ? 'Ganti SIA' : 'Unggah SIA'}<input type="file" accept="application/pdf,image/jpeg,image/png" disabled={fleetBusy} className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) void uploadSiaDocument(unit, file); e.currentTarget.value = ''; }} /></label>}{unit.siaFileId && <button type="button" onClick={() => void previewSiaDocument(unit)} className="text-[10px] text-sky-300 underline">{siaPreview[unit.id] ? 'Tutup dokumen' : 'Lihat SIA'}</button>}</div>
                        {siaPreview[unit.id] && <div className="mt-2 rounded border border-white/10 p-2"><div className="mb-2 text-[10px] text-neutral-400">{siaPreview[unit.id].fileName}</div>{siaPreview[unit.id].mimeType === 'application/pdf' ? <iframe title={`Dokumen SIA ${unit.unitNumber}`} src={siaPreview[unit.id].url} className="h-64 w-full rounded bg-white" /> : <img src={siaPreview[unit.id].url} alt={`Dokumen SIA ${unit.unitNumber}`} className="max-h-64 rounded object-contain" />}</div>}
                        {expiringSoon && <div className="text-[10px]">Sisa {expiryDays} hari</div>}
                      </td>
                      <td className="px-4 py-3">{unit.status}</td>
                      <td className="px-4 py-3"><div className="flex flex-wrap gap-1"><button type="button" disabled={p2hLoading} onClick={() => void openP2HHistory(unit)} className="rounded bg-sky-400/10 px-2 py-1 text-[10px] text-sky-200">{p2hUnitId === unit.id ? 'Tutup Riwayat' : 'Riwayat P2H'}</button>{editable && <button type="button" disabled={fleetBusy} onClick={() => void updateFleetUnit(unit,{status:unit.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'})} className="rounded bg-white/5 px-2 py-1 text-[10px] text-neutral-300">{unit.status === 'ACTIVE' ? 'Nonaktifkan' : 'Aktifkan'}</button>}</div></td>
                    </tr>
                    {p2hUnitId === unit.id && <tr><td colSpan={7} className="bg-neutral-950/70 px-4 py-4">
                      <div className="mb-3 flex items-center justify-between"><div className="text-xs font-semibold text-white">Riwayat Pemeriksaan P2H · {unit.unitNumber}</div><div className="text-[10px] text-neutral-500">{p2hHistory.length} catatan tersimpan</div></div>
                      {editable && <form onSubmit={event => void submitP2HRecord(event, unit)} className="mb-4 grid grid-cols-1 gap-2 rounded-lg border border-white/10 p-3 sm:grid-cols-2 lg:grid-cols-4">
                        <label className="space-y-1 text-[10px] text-neutral-400">Tanggal pemeriksaan *<input required type="date" value={p2hDraft.inspectionDate} onChange={e => setP2hDraft(current => ({...current,inspectionDate:e.target.value}))} className="w-full rounded border border-white/10 bg-neutral-900 px-2 py-2 text-xs text-white" /></label>
                        <label className="space-y-1 text-[10px] text-neutral-400">Hasil P2H *<select value={p2hDraft.status} onChange={e => setP2hDraft(current => ({...current,status:e.target.value as ContractorP2HInput['status']}))} className="w-full rounded border border-white/10 bg-neutral-900 px-2 py-2 text-xs text-white"><option value="READY">Laik operasi</option><option value="NOT_READY">Tidak laik operasi</option></select></label>
                        <label className="space-y-1 text-[10px] text-neutral-400">Hour meter<input type="number" min="0" step="0.1" value={p2hDraft.hourMeter} onChange={e => setP2hDraft(current => ({...current,hourMeter:e.target.value === '' ? '' : Number(e.target.value)}))} className="w-full rounded border border-white/10 bg-neutral-900 px-2 py-2 text-xs text-white" /></label>
                        <label className="space-y-1 text-[10px] text-neutral-400">Nama operator *<input required maxLength={120} value={p2hDraft.operatorName} onChange={e => setP2hDraft(current => ({...current,operatorName:e.target.value}))} className="w-full rounded border border-white/10 bg-neutral-900 px-2 py-2 text-xs text-white" /></label>
                        <label className="space-y-1 text-[10px] text-neutral-400 sm:col-span-2">Temuan pemeriksaan<textarea maxLength={2000} rows={2} value={p2hDraft.findings} onChange={e => setP2hDraft(current => ({...current,findings:e.target.value}))} className="w-full rounded border border-white/10 bg-neutral-900 px-2 py-2 text-xs text-white" /></label>
                        <label className="space-y-1 text-[10px] text-neutral-400 sm:col-span-2">Tindakan koreksi / pengendalian {p2hDraft.status === 'NOT_READY' ? '*' : ''}<textarea maxLength={2000} required={p2hDraft.status === 'NOT_READY'} rows={2} value={p2hDraft.correctiveAction} onChange={e => setP2hDraft(current => ({...current,correctiveAction:e.target.value}))} className="w-full rounded border border-white/10 bg-neutral-900 px-2 py-2 text-xs text-white" /></label>
                        <label className="space-y-1 text-[10px] text-neutral-400 sm:col-span-2 lg:col-span-4">Bukti foto inspeksi (JPG, PNG, WEBP · maks. 5 MB)
                          <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={e => { const file = e.target.files?.[0] || null; if (file && file.size > 5 * 1024 * 1024) { setFleetMessage('Ukuran foto maksimal 5 MB.'); e.target.value = ''; return; } void (async () => { if (p2hLocalPhotoId) await hdosDB.delete('photos', p2hLocalPhotoId); setP2hPhotoReference(null); setP2hLocalPhotoId(''); setP2hPhotoPreview(file ? URL.createObjectURL(file) : ''); if (file) { try { const id = await saveOfflineOperationalPhoto(file); setP2hLocalPhotoId(id); setFleetMessage('Bukti foto tersimpan di perangkat. Foto akan diunggah saat P2H dikirim dan koneksi tersedia.'); } catch (error) { setFleetMessage(error instanceof Error ? error.message : 'Bukti foto gagal disimpan di perangkat.'); setP2hPhotoPreview(''); } } })(); e.target.value = ''; }} className="block w-full text-xs text-neutral-300 file:mr-3 file:rounded file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-xs file:text-white" />
                          {p2hPhotoPreview && <img src={p2hPhotoPreview} alt="Pratinjau bukti P2H" className="mt-2 max-h-32 rounded-lg border border-white/10 object-contain" />}
                        </label>
                        <div className="flex items-end sm:col-span-2 lg:col-span-4"><button type="submit" disabled={fleetBusy} className="rounded bg-[#00E676] px-4 py-2 text-xs font-bold text-black disabled:opacity-50">{fleetBusy ? 'Menyimpan...' : 'Simpan Catatan P2H'}</button></div>
                      </form>}
                      {p2hLoading ? <div className="text-xs text-neutral-400">Memuat riwayat P2H...</div> : p2hHistory.length === 0 ? <div className="text-xs text-neutral-500">Belum terdapat catatan riwayat P2H untuk unit ini.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-[10px]"><thead className="text-neutral-500"><tr><th className="py-2 pr-3">Tanggal</th><th className="py-2 pr-3">Hasil</th><th className="py-2 pr-3">HM</th><th className="py-2 pr-3">Operator</th><th className="py-2 pr-3">Temuan / Tindakan</th><th className="py-2">Pemeriksa</th></tr></thead><tbody className="divide-y divide-white/5">{p2hHistory.map(record => <tr key={record.id} className="text-neutral-300"><td className="py-2 pr-3 whitespace-nowrap">{record.inspectionDate}</td><td className={record.status === 'READY' ? 'py-2 pr-3 text-emerald-300' : 'py-2 pr-3 text-red-300'}>{record.status === 'READY' ? 'Laik operasi' : 'Tidak laik operasi'}</td><td className="py-2 pr-3">{record.hourMeter === '' || record.hourMeter === undefined ? '—' : record.hourMeter}</td><td className="py-2 pr-3">{record.operatorName}</td><td className="py-2 pr-3"><div>{record.findings || 'Tidak ada temuan dicatat'}</div>{record.correctiveAction && <div className="mt-1 text-amber-200">Tindakan: {record.correctiveAction}</div>}</td><td className="py-2">{record.checkedBy || '—'}{record.photoFileId && <button type="button" onClick={() => void openP2HPhoto(record)} className="mt-1 block text-sky-300 underline">{p2hPhotoView[record.id] ? 'Tutup foto' : 'Lihat foto'}</button>}{record.photoFileId && p2hPhotoView[record.id] && <img src={p2hPhotoView[record.id]} alt={`Bukti foto P2H ${record.unitNumber}`} className="mt-2 max-h-72 rounded-lg border border-white/10 object-contain" />}</td></tr>)}</tbody></table></div>}
                    </td></tr>}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <h4 className="flex items-center gap-2 text-sm font-bold text-white"><AlertTriangle className="h-4 w-4 text-amber-400" />Register PICA Perusahaan</h4>
            <p className="mt-1 text-xs text-neutral-400">Daftar tindak lanjut yang terkait dengan perusahaan terpilih, termasuk subkontraktor di bawahnya.</p>
          </div>
          <span className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-mono text-neutral-300">{selectedCompanyPicas.length} total · {actualActivePicaCount} aktif</span>
        </div>
        {selectedCompanyPicas.length === 0 ? (
          <div className="px-5 py-10 text-center text-xs text-neutral-400">Belum ada PICA yang tercatat untuk perusahaan ini.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead className="bg-white/5 text-neutral-400">
                <tr>
                  <th className="px-5 py-3 font-medium">Nomor PICA</th>
                  <th className="px-5 py-3 font-medium">Sumber Temuan</th>
                  <th className="px-5 py-3 font-medium">PIC</th>
                  <th className="px-5 py-3 font-medium">Target</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {selectedCompanyPicas.map(pica => {
                  const targetDate = pica.targetDate ? new Date(pica.targetDate.slice(0, 10) + 'T00:00:00') : null;
                  const isOverdue = pica.status !== 'CLOSED' && targetDate !== null && !Number.isNaN(targetDate.getTime()) && targetDate < today;
                  const statusLabel = isOverdue ? 'OVERDUE' : pica.status;
                  return (
                    <tr key={pica.id} className="text-neutral-300">
                      <td className="px-5 py-3 font-mono text-white">{pica.code}</td>
                      <td className="px-5 py-3">{pica.source} · {pica.sourceRefCode}</td>
                      <td className="px-5 py-3">{pica.picName || 'Belum ditetapkan'}</td>
                      <td className="px-5 py-3 font-mono">{pica.targetDate || '—'}</td>
                      <td className="px-5 py-3"><span className={`rounded px-2 py-1 text-[10px] font-semibold ${statusLabel === 'CLOSED' ? 'bg-emerald-500/15 text-emerald-300' : statusLabel === 'OVERDUE' ? 'bg-red-500/15 text-red-300' : 'bg-amber-500/15 text-amber-300'}`}>{statusLabel}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

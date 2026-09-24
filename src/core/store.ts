import { useState, useEffect } from 'react';
import {
  Inspection,
  Hazard,
  Incident,
  PICA,
  DocumentItem,
  ContractorPassport,
  MiningLocationGIS,
  AppWindow,
  WindowId,
  MiningArea,
} from './types';
import { hdosDB } from './db';
import { hdosEvents } from './events';
import { hdosSync } from './sync';
import { hdosAuth } from './auth';

// Initial Seed Data reflecting real Indonesian mining operations
const INITIAL_LOCATIONS: MiningLocationGIS[] = [
  {
    id: 'loc_pit_jaja',
    name: 'Pit Jaja KM10',
    utm: '51S 382900 mE 9672100 mN',
    lat: -2.9642,
    lng: 121.9421,
    description: 'Area penambangan utama pit timur, elevasi RL +80m s/d RL -20m, 4 fleet active',
    activeHazards: 2,
    activeInspections: 5,
    safetyStatus: 'WARNING',
    zoneType: 'PIT',
  },
  {
    id: 'loc_siumbatu',
    name: 'Siumbatu',
    utm: '51S 391200 mE 9680400 mN',
    lat: -2.8891,
    lng: 122.0165,
    description: 'Pelabuhan jetty pemuatan ore nikel/batubara & conveyor loading dock',
    activeHazards: 1,
    activeInspections: 3,
    safetyStatus: 'SAFE',
    zoneType: 'PORT',
  },
  {
    id: 'loc_workshop',
    name: 'Workshop',
    utm: '51S 385100 mE 9674800 mN',
    lat: -2.9395,
    lng: 121.9618,
    description: 'Central Maintenance Workshop heavy equipment, welding bay & tire shop',
    activeHazards: 1,
    activeInspections: 4,
    safetyStatus: 'SAFE',
    zoneType: 'FACILITY',
  },
  {
    id: 'loc_stockpile',
    name: 'Stockpile',
    utm: '51S 389400 mE 9678200 mN',
    lat: -2.9088,
    lng: 122.0004,
    description: 'ROM Stockpile blending ore & area timbunan overburden sub-grade',
    activeHazards: 0,
    activeInspections: 2,
    safetyStatus: 'SAFE',
    zoneType: 'FACILITY',
  },
  {
    id: 'loc_fuel_bay',
    name: 'Fuel Bay',
    utm: '51S 384800 mE 9674500 mN',
    lat: -2.9422,
    lng: 121.9592,
    description: 'Stasiun pengisian bahan bakar solar industri & tangki bulk 500kL',
    activeHazards: 1,
    activeInspections: 3,
    safetyStatus: 'WARNING',
    zoneType: 'FACILITY',
  },
  {
    id: 'loc_haul_road',
    name: 'Haul Road',
    utm: '51S 387000 mE 9676000 mN',
    lat: -2.9258,
    lng: 121.9791,
    description: 'Jalan angkut utama KM 0 s/d KM 18, lebar 28m, grade max 8%',
    activeHazards: 1,
    activeInspections: 6,
    safetyStatus: 'SAFE',
    zoneType: 'HAUL_ROAD',
  },
];

const INITIAL_CONTRACTORS: ContractorPassport[] = [
  {
    id: 'cont_sls',
    code: 'SLS',
    companyName: 'PT Sumber Logistik Sejahtera',
    picName: 'Hendrik Wijaya (HSE Manager)',
    picContact: '+62 811-4456-7890',
    manpowerCount: 142,
    equipmentCount: 38,
    kpiSafetyScore: 94.5,
    safeHours: 418200,
    activePicaCount: 1,
    mcuCompliancePercent: 98.2,
    inductionRatePercent: 100,
    status: 'ACTIVE',
    safetyPassportExpiry: '2027-12-31',
  },
  {
    id: 'cont_vip',
    code: 'VIP',
    companyName: 'PT Vale Indo Pratama',
    picName: 'Rian Setyabudi (Safety Officer)',
    picContact: '+62 812-8821-3344',
    manpowerCount: 88,
    equipmentCount: 22,
    kpiSafetyScore: 89.0,
    safeHours: 236400,
    activePicaCount: 2,
    mcuCompliancePercent: 94.0,
    inductionRatePercent: 96.5,
    status: 'ACTIVE',
    safetyPassportExpiry: '2027-06-30',
  },
  {
    id: 'cont_buma',
    code: 'BUMA',
    companyName: 'PT Bukit Makmur Mandiri Utama',
    picName: 'Ir. Agus Santoso',
    picContact: '+62 813-9090-1234',
    manpowerCount: 260,
    equipmentCount: 65,
    kpiSafetyScore: 96.8,
    safeHours: 820100,
    activePicaCount: 0,
    mcuCompliancePercent: 99.1,
    inductionRatePercent: 100,
    status: 'ACTIVE',
    safetyPassportExpiry: '2028-01-15',
  },
];

const INITIAL_DOCUMENTS: DocumentItem[] = [
  {
    id: 'doc_1',
    docNumber: 'CGG-HSE-SOP-001',
    title: 'Standar Operasional Prosedur Pengelolaan Keselamatan Pertambangan (SMKP ESDM)',
    category: 'SOP',
    revision: 3,
    owner: 'SPV HSE',
    status: 'EFFECTIVE',
    effectiveDate: '2026-01-10',
    fileType: 'PDF',
    size: '2.4 MB',
    downloadCount: 184,
    smkpElement: 'Elemen I: Kebijakan Keselamatan',
    summary: 'Pedoman implementasi Kepmen ESDM No. 1827 K/30/MEM/2018 di area konsesi pertambangan CGG.',
  },
  {
    id: 'doc_2',
    docNumber: 'CGG-HSE-SOP-014',
    title: 'SOP Manajemen Lalu Lintas & Operasional Kendaraan Berat di Haul Road',
    category: 'SOP',
    revision: 2,
    owner: 'Safety Officer',
    status: 'EFFECTIVE',
    effectiveDate: '2026-02-01',
    fileType: 'PDF',
    size: '1.8 MB',
    downloadCount: 312,
    smkpElement: 'Elemen IV: Pengendalian Operasional',
    summary: 'Aturan kecepatan maksimum 40 km/jam, jarak iring 50m, prioritas simpang, dan prosedur overtake unit tambang.',
  },
  {
    id: 'doc_3',
    docNumber: 'CGG-HSE-WI-022',
    title: 'Instruksi Kerja (IK) Pemasangan Wheel Chock & Pengamanan Lereng Pit',
    category: 'WI',
    revision: 1,
    owner: 'Foreman Safety',
    status: 'EFFECTIVE',
    effectiveDate: '2026-03-05',
    fileType: 'PDF',
    size: '890 KB',
    downloadCount: 97,
    smkpElement: 'Elemen IV: Pengendalian Bahaya Fisik',
    summary: 'Panduan teknis pengganjalan ban unit haulage pada tanjakan/turunan grade > 5%.',
  },
  {
    id: 'doc_4',
    docNumber: 'CGG-HSE-FRM-031',
    title: 'Formulir Pemeriksaan Harian Pra-Operasi (P2H) Unit Berat Komatsu & Caterpillar',
    category: 'Form',
    revision: 4,
    owner: 'SPV HSE',
    status: 'EFFECTIVE',
    effectiveDate: '2026-01-15',
    fileType: 'XLSX',
    size: '640 KB',
    downloadCount: 540,
    smkpElement: 'Elemen V: Pemantauan & Evaluasi',
    summary: 'Checklist 25 item kelayakan rem, steering, hidrolik, kaca, safety belt sebelum unit dihidupkan.',
  },
  {
    id: 'doc_5',
    docNumber: 'CGG-HSE-WI-045',
    title: 'Instruksi Kerja Penanganan Medis & Tanggap Darurat Heat Stress di Area Tambang',
    category: 'WI',
    revision: 1,
    owner: 'Paramedis',
    status: 'EFFECTIVE',
    effectiveDate: '2026-02-18',
    fileType: 'PDF',
    size: '1.1 MB',
    downloadCount: 78,
    smkpElement: 'Elemen IV: Kesiapsiagaan Tanggap Darurat',
    summary: 'Protokol penanganan dehidrasi, heat cramps, heat exhaustion, dan heat stroke pada temperatur >33°C.',
  },
];

const INITIAL_INSPECTIONS: Inspection[] = [
  {
    id: 'ins_01',
    code: 'INS-2026-081',
    title: 'Inspeksi Kesiapan Sistem APAR & Hydrant Workshop Utama',
    templateType: 'APAR',
    location: 'Workshop',
    inspectorName: 'Doni Pratama',
    inspectorRole: 'Safety Officer',
    date: '2026-09-24',
    status: 'PICA_TRIGGERED',
    smkpElement: 'Elemen IV: Pengendalian Operasional',
    scorePercent: 80,
    notes: 'APAR No. 04 tekanan jarum berada pada zona merah rendah (underpressure). Auto-PICA dibuat.',
    createdAt: '2026-09-24 08:10:00',
    gpsCoordinates: {
      lat: -2.9395,
      lng: 121.9618,
      utm: '51S 385100 mE 9674800 mN',
    },
    items: [
      {
        id: 'i1',
        question: 'Pin pengaman & segel APAR masih utuh dan terkunci sempurna',
        standardRef: 'Kepdirjen Minerba 185 K Lampiran I',
        result: 'PASS',
      },
      {
        id: 'i2',
        question: 'Jarum penunjuk pressure gauge berada di area hijau (tekanan normal)',
        standardRef: 'SNI 03-3987-1995',
        result: 'FAIL',
        notes: 'Jarum di zona merah (drop pressure), segel telah kedaluwarsa 2 minggu.',
        picaId: 'pica_01',
      },
      {
        id: 'i3',
        question: 'Selang (hose) dan corong (nozzle) bersih tanpa keretakan/sumbatan',
        standardRef: 'SOP-CGG-HSE-019',
        result: 'PASS',
      },
      {
        id: 'i4',
        question: 'Tinggi pemasangan APAR 120 cm dari permukaan tanah & rambu jelas',
        standardRef: 'Permenaker 04/MEN/1980',
        result: 'PASS',
      },
      {
        id: 'i5',
        question: 'Kartu riwayat pemeriksaan bulanan ditandatangani petugas',
        standardRef: 'SMKP Elemen IV.4',
        result: 'PASS',
      },
    ],
  },
  {
    id: 'ins_02',
    code: 'INS-2026-080',
    title: 'Inspeksi Kestabilan Lereng Highwall Pit Jaja KM10 (Bench 3 - 5)',
    templateType: 'PIT_SLOPE',
    location: 'Pit Jaja KM10',
    inspectorName: 'Rudi Hermawan',
    inspectorRole: 'Foreman Safety',
    date: '2026-09-23',
    status: 'COMPLETED',
    smkpElement: 'Elemen II: Pengelolaan Risiko Pertambangan',
    scorePercent: 100,
    notes: 'Kondisi berm lereng stabil, prisma geotek monitoring deviasi 0.4mm (dalam batas aman).',
    createdAt: '2026-09-23 14:30:00',
    gpsCoordinates: {
      lat: -2.9642,
      lng: 121.9421,
      utm: '51S 382900 mE 9672100 mN',
    },
    items: [
      {
        id: 'i1',
        question: 'Lebar safety berm minimal 5 meter bersih dari bongkahan batuan labil',
        standardRef: 'Kepmen ESDM 1827 K Lampiran II',
        result: 'PASS',
      },
      {
        id: 'i2',
        question: 'Tidak ditemukan retakan tarik (tension crack) di puncak lereng',
        standardRef: 'Kajian Geoteknik Pit Jaja 2026',
        result: 'PASS',
      },
      {
        id: 'i3',
        question: 'Saluran air penirisan (drainage ditch) di toe slope mengalir lancar',
        standardRef: 'SOP-CGG-ENV-008',
        result: 'PASS',
      },
    ],
  },
];

const INITIAL_HAZARDS: Hazard[] = [
  {
    id: 'haz_01',
    code: 'HAZ-2026-042',
    title: 'Unit HD785 Parkir di Turunan Ramp KM10 Tanpa Wheel Chock',
    category: 'Unsafe Condition',
    location: 'Pit Jaja KM10',
    specificLocation: 'Ramp Akses Bench 4 Elevasi +45',
    riskMatrix: {
      severity: 4,
      likelihood: 4,
      score: 16,
      level: 'HIGH',
    },
    reporter: 'Rudi Hermawan',
    reporterRole: 'Foreman Safety',
    status: 'PICA_ISSUED',
    picaId: 'pica_02',
    createdAt: '2026-09-24 08:12:00',
    actionTaken: 'Operator diinstruksikan segera memasang ganjal ban standar dan mematikan mesin.',
    aiDetected: true,
    aiSuggestions: [
      'Terdeteksi kemiringan jalan 7.2%. Wajib double chock roda belakang.',
      'Rekomendasi verifikasi IK-CGG-SAF-021 kepada seluruh pengawas shift.',
    ],
  },
  {
    id: 'haz_02',
    code: 'HAZ-2026-041',
    title: 'Ceceran Pelumas Hidrolik di Sekitar Area Pompa Fuel Bay',
    category: 'Environmental',
    location: 'Fuel Bay',
    specificLocation: 'Dispenser Jalur B',
    riskMatrix: {
      severity: 2,
      likelihood: 3,
      score: 6,
      level: 'MEDIUM',
    },
    reporter: 'Ahmad Fauzi, S.K.M.',
    reporterRole: 'SPV HSE',
    status: 'OPEN',
    createdAt: '2026-09-23 16:45:00',
    actionTaken: 'Menebarkan serbuk oil spill kit dan memasang safety cone tanda licin.',
    aiDetected: false,
  },
  {
    id: 'haz_03',
    code: 'HAZ-2026-040',
    title: 'Pekerja Subkon VIP Mengelas Tanpa Tirai Pelindung Flash Sparks',
    category: 'Unsafe Action',
    location: 'Workshop',
    specificLocation: 'Bay Fabrikasi Bucket Excavator',
    riskMatrix: {
      severity: 3,
      likelihood: 3,
      score: 9,
      level: 'MEDIUM',
    },
    reporter: 'Doni Pratama',
    reporterRole: 'Safety Officer',
    status: 'CLOSED',
    createdAt: '2026-09-22 11:20:00',
    actionTaken: 'Pekerjaan dihentikan 10 menit untuk mendirikan welding safety screen portable.',
  },
];

const INITIAL_PICAS: PICA[] = [
  {
    id: 'pica_01',
    code: 'PICA-2026-099',
    source: 'INSPECTION',
    sourceRefCode: 'INS-2026-081',
    findingDescription: 'APAR Powder 6kg di Workshop No. 04 mengalami kebocoran tekanan (jarum merah underpressure).',
    correctiveAction: 'Tarik APAR No. 04 untuk pengisian ulang & pasang APAR cadangan tersertifikasi.',
    preventiveAction: 'Jadwalkan uji hidrostatik seluruh tabung APAR workshop setiap 6 bulan.',
    picDepartment: 'Maintenance & Facility',
    picName: 'Rian Setyabudi',
    targetDate: '2026-09-26',
    status: 'PROGRESS',
    daysAging: 1,
    approvalStages: {
      foreman: true,
      spvHse: false,
      ktt: false,
    },
    createdAt: '2026-09-24 08:15:00',
  },
  {
    id: 'pica_02',
    code: 'PICA-2026-098',
    source: 'HAZARD',
    sourceRefCode: 'HAZ-2026-042',
    findingDescription: 'Truk HD parkir di tanjakan KM10 pit tanpa pemasangan wheel chock.',
    correctiveAction: 'Sediakan holder wheel chock permanen di setiap unit HD785 dan pasang sebelum operator turun.',
    preventiveAction: 'Safety briefing P5M pengawas operasional kontraktor SLS terkait Golden Rules Parkir Lereng.',
    picDepartment: 'Mining Operations',
    picName: 'Hendrik Wijaya (SLS)',
    targetDate: '2026-09-25',
    status: 'OPEN',
    daysAging: 0,
    approvalStages: {
      foreman: false,
      spvHse: false,
      ktt: false,
    },
    createdAt: '2026-09-24 08:15:00',
  },
  {
    id: 'pica_03',
    code: 'PICA-2026-097',
    source: 'AUDIT',
    sourceRefCode: 'SMKP-AUDIT-2026-Q3',
    findingDescription: 'Label kalibrasi gas detector di Pos Paramedis belum diperbarui sejak bulan lalu.',
    correctiveAction: 'Kirim gas detector ke lab kalibrasi terakreditasi KAN dan catat di logbook.',
    preventiveAction: 'Pembuatan alert otomatis di HDOS Repository untuk jadwal kalibrasi alat ukur K3.',
    picDepartment: 'HSE & Medical',
    picName: 'Ns. Maya Indriani',
    targetDate: '2026-09-20',
    completionDate: '2026-09-19',
    status: 'CLOSED',
    daysAging: 0,
    approvalStages: {
      foreman: true,
      spvHse: true,
      ktt: true,
    },
    createdAt: '2026-09-15 10:00:00',
  },
];

const INITIAL_INCIDENTS: Incident[] = [
  {
    id: 'inc_01',
    code: 'INC-2026-003',
    title: 'Near Miss: Batuan Berdiameter 40cm Menggelinding di Berm Pit Jaja KM10',
    type: 'Near Miss',
    date: '2026-09-21',
    time: '14:15 WITA',
    location: 'Pit Jaja KM10',
    victimsCount: 0,
    damageCostEst: 'Rp 0',
    status: 'REVIEWED_KTT',
    reporter: 'Rudi Hermawan (Foreman Safety)',
    createdAt: '2026-09-21 14:45:00',
    smkpReportSubmitted: true,
    timeline: [
      { time: '14:10 WITA', event: 'Hujan deras intensitas 24mm/jam mengguyur area highwall pit jaja.' },
      { time: '14:15 WITA', event: 'Batuan lepas dari crest bench 3 menggelinding dan berhenti di windrow pengaman.' },
      { time: '14:18 WITA', event: 'Operator LV melintas melihat kejadian dan melakukan panggilan radio darurat Channel 1.' },
      { time: '14:25 WITA', event: 'Foreman menghentikan sementara lalu lintas ramp dan menginstruksikan dozer pembersihan.' },
    ],
    fiveWhyAnalysis: [
      'Mengapa batuan lepas? Terjadi erosi air permukaan pada celah batuan lapuk akibat hujan deras.',
      'Mengapa air mengikis celah? Saluran drainase puncak belum tersambung ke kolam sedimen (sediment pond).',
      'Mengapa belum tersambung? Alat excavator trenching sedang mengalami scheduled maintenance.',
      'Mengapa tidak ada backup drainage? Belum ada penentuan prioritas penirisan pada zona rawan longsor.',
      'Akar Masalah (Root Cause): Belum optimalnya integrasi jadwal geoteknik penirisan lereng dengan rencana penambangan mingguan.',
    ],
    rootCause: 'Integrasi jadwal penirisan air lereng rawan erosi dengan sequence penambangan mingguan belum sinkron.',
    correctiveActions: [
      'Normalisasi paritan air puncak lereng bench 3 selesai dalam 2x24 jam.',
      'Tinggikan safety windrow dari 1.2m menjadi 1.8m di sepanjang jalur lintasan aktif.',
      'Inspeksi harian geoteknik wajib dilakukan sebelum shift kerja dimulai pasca hujan.',
    ],
  },
];

const INITIAL_WINDOWS: AppWindow[] = [
  { id: 'dashboard', title: 'HDOS Dashboard & Operations Center', isOpen: true, isMinimized: false, isMaximized: false, zIndex: 10 },
  { id: 'inspection', title: 'Inspection Runtime & Digital Forms', isOpen: false, isMinimized: false, isMaximized: false, zIndex: 5 },
  { id: 'hazard', title: 'Hazard Management & Risk Matrix', isOpen: false, isMinimized: false, isMaximized: false, zIndex: 5 },
  { id: 'pica', title: 'PICA & Corrective Action Tracking', isOpen: false, isMinimized: false, isMaximized: false, zIndex: 5 },
  { id: 'incident', title: 'Incident Investigation & 5-Why', isOpen: false, isMinimized: false, isMaximized: false, zIndex: 5 },
  { id: 'repository', title: 'SMKP Master Document Control', isOpen: false, isMinimized: false, isMaximized: false, zIndex: 5 },
  { id: 'contractor', title: 'Contractor Passport & Compliance', isOpen: false, isMinimized: false, isMaximized: false, zIndex: 5 },
  { id: 'map', title: 'Mining GIS & Offline Area Map', isOpen: false, isMinimized: false, isMaximized: false, zIndex: 5 },
  { id: 'ai', title: 'HDOS AI Vision & SMKP Assistant', isOpen: false, isMinimized: false, isMaximized: false, zIndex: 5 },
  { id: 'sync', title: 'Offline Queue & Google Sheets Sync', isOpen: false, isMinimized: false, isMaximized: false, zIndex: 5 },
];

export class HDOSCentralStore {
  public inspections: Inspection[] = INITIAL_INSPECTIONS;
  public hazards: Hazard[] = INITIAL_HAZARDS;
  public incidents: Incident[] = INITIAL_INCIDENTS;
  public picas: PICA[] = INITIAL_PICAS;
  public documents: DocumentItem[] = INITIAL_DOCUMENTS;
  public contractors: ContractorPassport[] = INITIAL_CONTRACTORS;
  public locations: MiningLocationGIS[] = INITIAL_LOCATIONS;
  public windows: AppWindow[] = INITIAL_WINDOWS;
  public focusedWindowId: WindowId = 'dashboard';
  public isMobileMode: boolean = false;
  public missionControlOpen: boolean = false;
  public safeHours: number = 1482920; // 1.48M safe man-hours LTI-free
  public weather = {
    temp: 32,
    humidity: 74,
    wbgt: 29.4,
    heatStressLevel: 'MODERATE' as 'NORMAL' | 'MODERATE' | 'HIGH' | 'EXTREME',
    rainMm: 0,
    pitStatus: 'OPERATIONAL' as 'OPERATIONAL' | 'STANDBY_RAIN' | 'RESTRICTED',
  };
  public liveFeed = [
    { id: 'f1', time: '08:15', category: 'PICA', text: 'PICA-2026-099 auto-dibuat dari temuan inspeksi APAR underpressure', level: 'warning' },
    { id: 'f2', time: '08:12', category: 'Hazard', text: 'HAZ-2026-042 dilaporkan: Unit HD785 parkir turunan tanpa chock', level: 'danger' },
    { id: 'f3', time: '08:10', category: 'Inspection', text: 'INS-2026-081 selesai di Workshop Utama (Skor 80%)', level: 'normal' },
    { id: 'f4', time: '07:30', category: 'Sync', text: 'Sinkronisasi cloud repository selesai. 24 entitas terverifikasi.', level: 'normal' },
  ];

  private listeners: Set<() => void> = new Set();
  private maxZIndex: number = 20;

  async init(): Promise<void> {
    try {
      const storedIns = await hdosDB.getAll<Inspection>('inspection');
      if (storedIns.length > 0) this.inspections = storedIns;
      else {
        for (const item of INITIAL_INSPECTIONS) await hdosDB.put('inspection', item);
      }

      const storedHaz = await hdosDB.getAll<Hazard>('hazard');
      if (storedHaz.length > 0) this.hazards = storedHaz;
      else {
        for (const item of INITIAL_HAZARDS) await hdosDB.put('hazard', item);
      }

      const storedPicas = await hdosDB.getAll<PICA>('pica');
      if (storedPicas.length > 0) this.picas = storedPicas;
      else {
        for (const item of INITIAL_PICAS) await hdosDB.put('pica', item);
      }

      const storedInc = await hdosDB.getAll<Incident>('incident');
      if (storedInc.length > 0) this.incidents = storedInc;
      else {
        for (const item of INITIAL_INCIDENTS) await hdosDB.put('incident', item);
      }

      const storedDocs = await hdosDB.getAll<DocumentItem>('repository');
      if (storedDocs.length > 0) this.documents = storedDocs;
      else {
        for (const item of INITIAL_DOCUMENTS) await hdosDB.put('repository', item);
      }

      const storedCont = await hdosDB.getAll<ContractorPassport>('contractor');
      if (storedCont.length > 0) this.contractors = storedCont;
      else {
        for (const item of INITIAL_CONTRACTORS) await hdosDB.put('contractor', item);
      }
    } catch (err) {
      console.warn('[HDOS Store] IndexedDB fallback in memory', err);
    }
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }

  // Windows Management
  openWindow(id: WindowId): void {
    this.maxZIndex += 1;
    this.windows = this.windows.map((w) => {
      if (w.id === id) {
        return { ...w, isOpen: true, isMinimized: false, zIndex: this.maxZIndex };
      }
      return w;
    });
    this.focusedWindowId = id;
    this.missionControlOpen = false;
    this.notify();
    hdosEvents.emit('window:opened', { id });
  }

  closeWindow(id: WindowId): void {
    this.windows = this.windows.map((w) => (w.id === id ? { ...w, isOpen: false } : w));
    // Focus next available window
    const openWindows = this.windows.filter((w) => w.isOpen && !w.isMinimized);
    if (openWindows.length > 0) {
      const top = openWindows.sort((a, b) => b.zIndex - a.zIndex)[0];
      this.focusedWindowId = top.id;
    }
    this.notify();
    hdosEvents.emit('window:closed', { id });
  }

  minimizeWindow(id: WindowId): void {
    this.windows = this.windows.map((w) => (w.id === id ? { ...w, isMinimized: true } : w));
    const openWindows = this.windows.filter((w) => w.isOpen && !w.isMinimized);
    if (openWindows.length > 0) {
      const top = openWindows.sort((a, b) => b.zIndex - a.zIndex)[0];
      this.focusedWindowId = top.id;
    }
    this.notify();
  }

  toggleMaximizeWindow(id: WindowId): void {
    this.windows = this.windows.map((w) => (w.id === id ? { ...w, isMaximized: !w.isMaximized } : w));
    this.notify();
  }

  bringToFront(id: WindowId): void {
    this.maxZIndex += 1;
    this.windows = this.windows.map((w) => (w.id === id ? { ...w, isMinimized: false, zIndex: this.maxZIndex } : w));
    this.focusedWindowId = id;
    this.notify();
  }

  toggleMissionControl(): void {
    this.missionControlOpen = !this.missionControlOpen;
    this.notify();
  }

  setMobileMode(isMobile: boolean): void {
    this.isMobileMode = isMobile;
    this.notify();
  }

  // Business Action: Add Inspection + Auto PICA Trigger (Section 12)
  async addInspection(inspection: Omit<Inspection, 'id' | 'code' | 'createdAt'>): Promise<Inspection> {
    const count = this.inspections.length + 1;
    const code = `INS-2026-${String(count).padStart(3, '0')}`;
    const id = `ins_${Date.now()}`;
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

    // Check if any item failed to automatically trigger PICA
    const failedItems = inspection.items.filter((item) => item.result === 'FAIL');
    let picaCreated: PICA | null = null;

    if (failedItems.length > 0) {
      const picaCount = this.picas.length + 1;
      const picaCode = `PICA-2026-${String(picaCount).padStart(3, '0')}`;
      const firstFail = failedItems[0];

      picaCreated = {
        id: `pica_${Date.now()}`,
        code: picaCode,
        source: 'INSPECTION',
        sourceRefCode: code,
        findingDescription: `Temuan ketidaksesuaian: ${firstFail.question}. ${firstFail.notes || ''}`,
        correctiveAction: `Perbaiki dan penuhi standar ${firstFail.standardRef}`,
        preventiveAction: 'Lakukan re-evaluasi kepatuhan prosedur kerja pada shift berikutnya.',
        picDepartment: inspection.location === 'Workshop' ? 'Maintenance' : 'Mining Operations',
        picName: 'PIC Terkait',
        targetDate: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
        status: 'OPEN',
        daysAging: 0,
        approvalStages: { foreman: false, spvHse: false, ktt: false },
        createdAt: now,
      };

      firstFail.picaId = picaCreated.id;
      this.picas.unshift(picaCreated);
      await hdosDB.put('pica', picaCreated);
      await hdosSync.enqueue({
        action: 'CREATE',
        entity: 'pica',
        payload: picaCreated,
      });
      hdosEvents.emit('pica:created', picaCreated);
    }

    const newInspection: Inspection = {
      ...inspection,
      id,
      code,
      createdAt: now,
      status: failedItems.length > 0 ? 'PICA_TRIGGERED' : 'COMPLETED',
    };

    this.inspections.unshift(newInspection);
    await hdosDB.put('inspection', newInspection);
    await hdosSync.enqueue({
      action: 'CREATE',
      entity: 'inspection',
      payload: newInspection,
    });

    this.liveFeed.unshift({
      id: `f_${Date.now()}`,
      time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      category: 'Inspection',
      text: `${code} selesai di ${newInspection.location} (Skor ${newInspection.scorePercent}%)`,
      level: failedItems.length > 0 ? 'warning' : 'normal',
    });

    this.notify();
    hdosEvents.emit('inspection:created', newInspection);
    return newInspection;
  }

  // Business Action: Add Hazard + Risk Matrix Assessment (Section 13)
  async addHazard(hazard: Omit<Hazard, 'id' | 'code' | 'createdAt'>): Promise<Hazard> {
    const count = this.hazards.length + 1;
    const code = `HAZ-2026-${String(count).padStart(3, '0')}`;
    const id = `haz_${Date.now()}`;
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

    let picaCreated: PICA | null = null;
    let picaId: string | undefined = undefined;

    // If High or Critical risk, automatically trigger PICA
    if (hazard.riskMatrix.level === 'CRITICAL' || hazard.riskMatrix.level === 'HIGH') {
      const picaCount = this.picas.length + 1;
      const picaCode = `PICA-2026-${String(picaCount).padStart(3, '0')}`;
      picaCreated = {
        id: `pica_${Date.now()}`,
        code: picaCode,
        source: 'HAZARD',
        sourceRefCode: code,
        findingDescription: `Bahaya tingkat ${hazard.riskMatrix.level}: ${hazard.title} di ${hazard.location} (${hazard.specificLocation})`,
        correctiveAction: hazard.actionTaken || 'Lakukan mitigasi langsung di lapangan dan pasang barikade.',
        preventiveAction: 'Sosialisasi JSA / Risk Assessment ulang sebelum aktivitas dilanjutkan.',
        picDepartment: 'Mining Operations',
        picName: hazard.reporter,
        targetDate: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
        status: 'OPEN',
        daysAging: 0,
        approvalStages: { foreman: false, spvHse: false, ktt: false },
        createdAt: now,
      };
      picaId = picaCreated.id;
      this.picas.unshift(picaCreated);
      await hdosDB.put('pica', picaCreated);
      await hdosSync.enqueue({ action: 'CREATE', entity: 'pica', payload: picaCreated });
      hdosEvents.emit('pica:created', picaCreated);
    }

    const newHazard: Hazard = {
      ...hazard,
      id,
      code,
      createdAt: now,
      picaId,
      status: picaId ? 'PICA_ISSUED' : 'OPEN',
    };

    this.hazards.unshift(newHazard);
    await hdosDB.put('hazard', newHazard);
    await hdosSync.enqueue({ action: 'CREATE', entity: 'hazard', payload: newHazard });

    // Update location hazard count
    const loc = this.locations.find((l) => l.name === hazard.location);
    if (loc) {
      loc.activeHazards += 1;
      if (hazard.riskMatrix.level === 'CRITICAL') loc.safetyStatus = 'ALERT';
    }

    this.liveFeed.unshift({
      id: `f_${Date.now()}`,
      time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      category: 'Hazard',
      text: `${code} dilaporkan di ${hazard.location}: ${hazard.title}`,
      level: hazard.riskMatrix.level === 'CRITICAL' || hazard.riskMatrix.level === 'HIGH' ? 'danger' : 'warning',
    });

    this.notify();
    hdosEvents.emit('hazard:created', newHazard);
    return newHazard;
  }

  // Business Action: Incident & 5-Why (Section 14)
  async addIncident(incident: Omit<Incident, 'id' | 'code' | 'createdAt'>): Promise<Incident> {
    const count = this.incidents.length + 1;
    const code = `INC-2026-${String(count).padStart(3, '0')}`;
    const id = `inc_${Date.now()}`;
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

    const newInc: Incident = {
      ...incident,
      id,
      code,
      createdAt: now,
    };

    this.incidents.unshift(newInc);
    await hdosDB.put('incident', newInc);
    await hdosSync.enqueue({ action: 'CREATE', entity: 'incident', payload: newInc });

    this.liveFeed.unshift({
      id: `f_${Date.now()}`,
      time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      category: 'Incident',
      text: `${code} [${newInc.type}] di ${newInc.location}: ${newInc.title}`,
      level: 'danger',
    });

    this.notify();
    hdosEvents.emit('incident:created', newInc);
    return newInc;
  }

  // Business Action: Update PICA & Approvals (Section 15)
  async updatePICAStatus(
    id: string,
    updates: Partial<PICA>
  ): Promise<PICA | null> {
    const index = this.picas.findIndex((p) => p.id === id);
    if (index === -1) return null;

    const current = this.picas[index];
    const updated = { ...current, ...updates };

    // Auto close if all three sign-offs completed
    if (
      updated.approvalStages.foreman &&
      updated.approvalStages.spvHse &&
      updated.approvalStages.ktt
    ) {
      updated.status = 'CLOSED';
      updated.completionDate = new Date().toISOString().split('T')[0];
    }

    this.picas[index] = updated;
    await hdosDB.put('pica', updated);
    await hdosSync.enqueue({ action: 'UPDATE', entity: 'pica', payload: updated });

    this.notify();
    hdosEvents.emit('pica:updated', updated);
    return updated;
  }

  // Business Action: Repository Document Control (Section 16 & 17)
  async addDocument(doc: Omit<DocumentItem, 'id' | 'docNumber' | 'revision'>): Promise<DocumentItem> {
    const count = this.documents.filter((d) => d.category === doc.category).length + 1;
    const docNumber = `CGG-HSE-${doc.category.toUpperCase()}-${String(count).padStart(3, '0')}`;
    const id = `doc_${Date.now()}`;

    const newDoc: DocumentItem = {
      ...doc,
      id,
      docNumber,
      revision: 0,
      downloadCount: 1,
    };

    this.documents.unshift(newDoc);
    await hdosDB.put('repository', newDoc);
    await hdosSync.enqueue({ action: 'CREATE', entity: 'repository', payload: newDoc });

    this.notify();
    hdosEvents.emit('repository:document_created', newDoc);
    return newDoc;
  }
}

export const hdosStore = new HDOSCentralStore();

// React hook for components
export function useHDOSStore() {
  const [, setTick] = useState(0);

  useEffect(() => {
    return hdosStore.subscribe(() => setTick((t) => t + 1));
  }, []);

  return hdosStore;
}

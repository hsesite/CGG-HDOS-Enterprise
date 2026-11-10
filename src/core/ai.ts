/**
 * HDOS AI System (Section 18 of Blueprint)
 * AI Assist - Human Approval
 * Features:
 * 1. AI Document Parser (Docx/PDF -> Digital Form & Checklist)
 * 2. AI Photo Hazard Scanner (YOLOv8 Nano / Vision simulation with Bounding Boxes & Confidence)
 * 3. AI SMKP Compliance Advisor
 */

export interface BoundingBox {
  id: string;
  label: string;
  confidence: number;
  color: string;
  box: [number, number, number, number]; // [ymin, xmin, ymax, xmax] in percentages 0-100
  hazardType: string;
  recommendation: string;
}

export interface AIParsedFormTemplate {
  title: string;
  category: string;
  smkpElement: string;
  checklistItems: {
    question: string;
    standardRef: string;
    criticality: 'CRITICAL' | 'MAJOR' | 'MINOR';
  }[];
}

export class HDOSAIEngine {
  async analyzeMiningHazardPhoto(imageUrl: string): Promise<{
    hazardDetected: boolean;
    findings: string[];
    suggestedRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    suggestedAction: string;
    boundingBoxes: BoundingBox[];
  }> {
    // DEMO ONLY: this deterministic sample does not inspect imageUrl or run a vision model.
    await new Promise((r) => setTimeout(r, 600));

    // Fixed illustrative detections for UI demonstration; never treat as field evidence.
    const detections: BoundingBox[] = [
      {
        id: 'box_1',
        label: 'Truk Tanpa Wheel Chock (Ganjal Roda)',
        confidence: 0.94,
        color: '#FF5252',
        box: [45, 20, 85, 55],
        hazardType: 'Unsafe Condition',
        recommendation: 'Pasang ganjal ban standar di turunan/area parkir unit sesuai IK-CGG-SAF-021',
      },
      {
        id: 'box_2',
        label: 'Pekerja Tanpa Rompi Reflektif / High-Vis',
        confidence: 0.88,
        color: '#FFC107',
        box: [25, 62, 70, 82],
        hazardType: 'Unsafe Action',
        recommendation: 'Instruksikan pemakaian Rompi Reflektor Kelas 2 sebelum memasuki Pit Jaja',
      },
    ];

    return {
      hazardDetected: true,
      findings: [
        'Unit Haul Truck diparkir pada elevasi lereng tanpa pemasangan wheel chock aktif.',
        'Satu operator/helper terdeteksi di blind spot tanpa APD rompi reflektor standar pertambangan.',
      ],
      suggestedRiskLevel: 'HIGH',
      suggestedAction: 'Hentikan aktivitas sementara, pasang ganjal ban, dan verifikasi APD crew sebelum unit dioperasikan kembali.',
      boundingBoxes: detections,
    };
  }

  async parseDocumentToDigitalForm(filename: string, contentSummary: string): Promise<AIParsedFormTemplate> {
    await new Promise((r) => setTimeout(r, 700));

    if (filename.toLowerCase().includes('apar') || contentSummary.toLowerCase().includes('apar')) {
      return {
        title: 'Formulir Inspeksi Kelayakan APAR & Sistem Proteksi Kebakaran',
        category: 'Inspection',
        smkpElement: 'Elemen II & IV: Pengelolaan Operasional K3',
        checklistItems: [
          { question: 'Pin pengaman & segel APAR masih utuh dan terkunci sempurna', standardRef: 'Kepdirjen Minerba 185 K Lampiran I', criticality: 'CRITICAL' },
          { question: 'Jarum penunjuk pressure gauge berada di area hijau (tekanan normal)', standardRef: 'SNI 03-3987-1995', criticality: 'CRITICAL' },
          { question: 'Selang (hose) dan corong (nozzle) bersih tanpa keretakan/sumbatan', standardRef: 'SOP-CGG-HSE-019', criticality: 'MAJOR' },
          { question: 'Tinggi pemasangan APAR 120 cm dari permukaan tanah & rambu jelas', standardRef: 'Permenaker 04/MEN/1980', criticality: 'MINOR' },
          { question: 'Kartu riwayat pemeriksaan bulanan ditandatangani petugas', standardRef: 'SMKP Elemen IV.4', criticality: 'MINOR' },
        ],
      };
    }

    if (filename.toLowerCase().includes('haul') || filename.toLowerCase().includes('truck') || filename.toLowerCase().includes('hd')) {
      return {
        title: 'Formulir Pemeriksaan Pra-Operasi (P2H) Haul Truck & Dump Truck',
        category: 'Inspection',
        smkpElement: 'Elemen IV: Pelaksanaan Pengelolaan Keselamatan Pertambangan',
        checklistItems: [
          { question: 'Fungsi sistem rem utama (Service brake) dan rem darurat (Emergency brake)', standardRef: 'Kepdirjen 185 K Sub-elemen 4.3', criticality: 'CRITICAL' },
          { question: 'Kondisi steering system, tie rod, dan hydraulic hose tanpa kebocoran', standardRef: 'SOP-CGG-MTC-004', criticality: 'CRITICAL' },
          { question: 'Kondisi ban (tire pressure, retak, batuan terselip di dual tire)', standardRef: 'IK-CGG-SAF-011', criticality: 'MAJOR' },
          { question: 'Lampu kerja, rotary lamp (hazard), klakson, dan radio komunikasi 2-way', standardRef: 'SOP-CGG-OPS-002', criticality: 'CRITICAL' },
          { question: 'Seatbelt 3-titik dan fungsi seat sensor interlock', standardRef: 'Kepmen ESDM 1827 K', criticality: 'MAJOR' },
        ],
      };
    }

    // Default template generator
    return {
      title: `Formulir Digital: ${filename.replace(/\.[^/.]+$/, '')}`,
      category: 'Inspection',
      smkpElement: 'Elemen III & IV: Perencanaan & Pengendalian Operasional',
      checklistItems: [
        { question: 'Kesesuaian area kerja terhadap SOP keselamatan pertambangan', standardRef: 'SOP-CGG-HSE-GEN', criticality: 'CRITICAL' },
        { question: 'Kelayakan peralatan kerja dan ketiadaan indikasi bahaya struktural', standardRef: 'SMKP ESDM 1827', criticality: 'MAJOR' },
        { question: 'Kelengkapan APD standar wajib (Helm, Kacamata, Rompi, Safety Shoes)', standardRef: 'SOP-CGG-APD-001', criticality: 'CRITICAL' },
        { question: 'Housekeeping area bersih dari tumpahan oli dan limbah B3', standardRef: 'PP 101/2014 & SMKP', criticality: 'MAJOR' },
      ],
    };
  }

  askSMKPAdvisor(query: string): string {
    const q = query.toLowerCase();
    if (q.includes('apar') || q.includes('kebakaran')) {
      return 'Pastikan APAR diperiksa dan dipelihara oleh petugas berkompeten sesuai ketentuan K3, standar teknis, instruksi pabrikan, dan prosedur perusahaan yang berlaku. Catat hasil pemeriksaan, kondisi segel, tekanan, aksesibilitas, serta tindak lanjut ketidaksesuaian. Verifikasi interval pemeriksaan pada dokumen regulasi dan prosedur terkendali sebelum menetapkannya sebagai kewajiban.';
    }
    if (q.includes('pica') || q.includes('tindakan perbaikan')) {
      return 'Untuk temuan Critical, lakukan pengendalian segera sesuai tingkat risiko, tetapkan PIC dan target waktu berdasarkan prosedur perusahaan, lalu verifikasi efektivitas tindakan oleh pejabat HSE berwenang. Alur PICA HDOS berakhir pada persetujuan SPV HSE; KTT bukan tahap persetujuan penutupan PICA.';
    }
    if (q.includes('lereng') || q.includes('slope') || q.includes('pit')) {
      return 'Kestabilan lereng harus dievaluasi oleh tenaga teknis geoteknik berdasarkan desain lereng yang disetujui, data geologi-geoteknik, kondisi air, hasil pemantauan deformasi, dan kriteria Faktor Keamanan yang berlaku untuk desain serta kondisi tambang. Jangan menggunakan angka FK generik sebagai pengganti kajian geoteknik yang disahkan.';
    }
    return 'Berdasarkan regulasi SMKP Pertambangan (Kepmen ESDM 1827 K/30/MEM/2018), seluruh modul HDOS memastikan kepatuhan 7 Elemen SMKP: Kebijakan, Perencanaan, Organisasi & Personil, Implementasi, Evaluasi, Dokumentasi, serta Tinjauan Manajemen.';
  }
}

export const hdosAI = new HDOSAIEngine();

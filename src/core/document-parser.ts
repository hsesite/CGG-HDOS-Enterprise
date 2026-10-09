import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import mammoth from 'mammoth/mammoth.browser';
import * as XLSX from 'xlsx';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface ExtractedChecklistItem {
  question: string;
  standardRef: string;
  criticality: 'CRITICAL' | 'MAJOR' | 'MINOR';
}

export interface ExtractedDocumentContent {
  text: string;
  pageOrSheetCount: number;
  sourceType: 'PDF' | 'DOCX' | 'XLSX';
}

const normalizeText = (value: string): string =>
  value
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export async function extractDocumentText(
  file: Blob,
  fileName: string
): Promise<ExtractedDocumentContent> {
  const extension = fileName.split('.').pop()?.toLowerCase();
  const buffer = await file.arrayBuffer();

  if (extension === 'pdf') {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      isEvalSupported: false,
    });
    const pdf = await loadingTask.promise;
    const pages: string[] = [];

    try {
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item) => ('str' in item ? item.str : ''))
          .filter(Boolean)
          .join(' ');
        pages.push(`Halaman ${pageNumber}\n${pageText}`);
      }
    } finally {
      await pdf.destroy();
    }

    const text = normalizeText(pages.join('\n\n'));
    if (!text) {
      throw new Error(
        'PDF tidak memiliki teks yang dapat dibaca. Jika PDF berupa hasil scan/gambar, OCR belum tersedia; gunakan PDF yang memiliki teks atau konversi ke DOCX/XLSX.'
      );
    }
    return { text, pageOrSheetCount: pages.length, sourceType: 'PDF' };
  }

  if (extension === 'docx') {
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    const text = normalizeText(result.value || '');
    if (!text) {
      throw new Error('Teks DOCX tidak berhasil diekstrak atau dokumen kosong.');
    }
    return { text, pageOrSheetCount: 1, sourceType: 'DOCX' };
  }

  if (extension === 'xlsx') {
    const workbook = XLSX.read(buffer, { type: 'array', cellText: true });
    const sections = workbook.SheetNames.map((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        raw: false,
        defval: '',
        blankrows: false,
      });

      const lines = rows
        .map((row) =>
          row
            .map((cell) => String(cell ?? '').trim())
            .filter(Boolean)
            .join(' | ')
        )
        .filter(Boolean);

      return `Sheet: ${sheetName}\n${lines.join('\n')}`;
    });

    const text = normalizeText(sections.join('\n\n'));
    if (!text) {
      throw new Error('Tidak ada isi sel yang dapat dibaca pada berkas XLSX.');
    }
    return {
      text,
      pageOrSheetCount: workbook.SheetNames.length,
      sourceType: 'XLSX',
    };
  }

  throw new Error('Format ekstraksi tidak didukung. Gunakan PDF, DOCX, atau XLSX.');
}

const cleanCandidate = (line: string): string =>
  line
    .replace(/^\s*(?:[-*•▪◦]+|\d{1,3}\s*[.)、]|[a-zA-Z]\s*[.)])\s*/, '')
    .replace(/^\s*\[[ xX✓✔]?\]\s*/, '')
    .replace(/\s+/g, ' ')
    .replace(/[|;:,.\s]+$/g, '')
    .trim();

const isNoiseLine = (line: string): boolean => {
  const value = line.trim().toLowerCase();
  if (value.length < 12 || value.length > 260) return true;
  if (/^(halaman|page|sheet|lembar)\s*[:#]?\s*\d*/i.test(value)) return true;
  if (/^(no\.?|nomor|tanggal|date|nama|name|jabatan|departemen|lokasi|location|paraf|tanda tangan)\s*[:|]/i.test(value)) return true;
  if (/^(cgg[-/]|sop[-/]|ik[-/]|wi[-/]|form[-/])[\w./-]{2,}$/i.test(value)) return true;
  return false;
};

const looksLikeChecklistItem = (rawLine: string): boolean => {
  const line = rawLine.trim();
  const cleaned = cleanCandidate(line);
  if (isNoiseLine(cleaned)) return false;

  const hasListPrefix =
    /^\s*(?:[-*•▪◦]+|\d{1,3}\s*[.)、]|[a-zA-Z]\s*[.)])\s+/.test(line) ||
    /^\s*\[[ xX✓✔]?\]\s*/.test(line);
  const hasQuestionMark = /[?？]\s*$/.test(cleaned);
  const hasCheckLanguage =
    /\b(apakah|pastikan|periksa|periksa(?:an)?|cek|diperiksa|memastikan|terpasang|berfungsi|tersedia|sesuai|lengkap|aman|layak|utuh|bebas|tanpa|kondisi|fungsi|inspeksi|pemeriksaan|verifikasi|wajib|check|inspect|ensure|verify|condition|function|available|complete|safe)\b/i.test(cleaned);

  return hasListPrefix || hasQuestionMark || hasCheckLanguage;
};

const inferCriticality = (
  text: string
): ExtractedChecklistItem['criticality'] => {
  if (/\b(kritis|critical|fatal|fatality|rem darurat|emergency brake|interlock|gas beracun|ledakan|kebakaran|jatuh dari ketinggian)\b/i.test(text)) {
    return 'CRITICAL';
  }
  if (/\b(major|tinggi|high risk|risiko tinggi|kebocoran|kerusakan|pengaman|proteksi|alat pelindung)\b/i.test(text)) {
    return 'MAJOR';
  }
  return 'MINOR';
};

const inferStandardRef = (line: string): string => {
  const match = line.match(
    /\b(?:Kepmen|Kepdirjen|Permen(?:aker| ESDM)?|SNI|ISO|SMKP|SOP|IK|WI|UU|PP)\s*[-./A-Za-z0-9 ]{0,48}\d[A-Za-z0-9./-]*/i
  );
  return match?.[0]?.trim() || 'Perlu diverifikasi saat review';
};

/**
 * Prefer actual numbered inspection rows in DOCX tables over headings,
 * risk matrices, instructions, and other text that merely looks like a checklist.
 */
export async function extractChecklistItemsFromDocument(
  file: Blob,
  fileName: string,
  fallbackText: string
): Promise<ExtractedChecklistItem[]> {
  const extension = fileName.split('.').pop()?.toLowerCase();

  if (extension === 'docx') {
    const buffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
    if (typeof DOMParser !== 'undefined') {
      const parsed = new DOMParser().parseFromString(result.value || '', 'text/html');
      const tables = Array.from(parsed.querySelectorAll('table'));
      let bestRows: ExtractedChecklistItem[] = [];
      let bestScore = 0;

      for (const table of tables) {
        const rows = Array.from(table.querySelectorAll('tr')).map((row) =>
          Array.from(row.querySelectorAll('th, td')).map((cell) =>
            normalizeText(cell.textContent || '')
          )
        );
        const headerIndex = rows.findIndex((row) => {
          const header = row.join(' ').toLocaleLowerCase('id-ID');
          return /hal yang diperiksa|item yang diperiksa|checklist pemeriksaan/.test(header)
            && /tingkat risiko|tingkat resiko|kondisi aktual|keterangan/.test(header);
        });
        if (headerIndex < 0) continue;

        const header = rows[headerIndex].join(' ').toLocaleLowerCase('id-ID');
        const questionIndex = rows[headerIndex].findIndex((cell) =>
          /hal yang diperiksa|item yang diperiksa|checklist pemeriksaan/i.test(cell)
        );
        const numberIndex = rows[headerIndex].findIndex((cell) =>
          /^(no\.?|nomor)$/i.test(cell.trim())
        );
        const extractedRows: ExtractedChecklistItem[] = [];

        for (const row of rows.slice(headerIndex + 1)) {
          const question = row[questionIndex]?.trim() || '';
          const numberCell = numberIndex >= 0 ? row[numberIndex]?.trim() || '' : '';
          if (!question || question.length < 12 || question.length > 500) continue;
          if (numberIndex >= 0 && !/^\d{1,3}$/.test(numberCell)) continue;
          if (/^(hal yang diperiksa|kondisi aktual|tingkat risiko|tingkat resiko|keterangan)$/i.test(question)) continue;
          const riskCell = row.find((cell) => /^(extreme|high|medium|moderate|low|h|m|l|e)$/i.test(cell.trim()));
          const riskText = riskCell || question;
          const criticality: ExtractedChecklistItem['criticality'] =
            /^(extreme|e)$/i.test(riskText) ? 'CRITICAL'
              : /^(high|h)$/i.test(riskText) ? 'MAJOR'
                : inferCriticality(riskText);
          extractedRows.push({
            question: cleanCandidate(question),
            standardRef: inferStandardRef(question),
            criticality,
          });
        }

        const score = extractedRows.length * 10 + (header.includes('kondisi aktual') ? 3 : 0) + (numberIndex >= 0 ? 5 : 0);
        if (score > bestScore) {
          bestScore = score;
          bestRows = extractedRows;
        }
      }

      if (bestRows.length > 0) {
        const seen = new Set<string>();
        return bestRows.filter((item) => {
          const key = item.question.toLocaleLowerCase('id-ID');
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }).slice(0, 100);
      }
    }
  }

  return extractChecklistItems(fallbackText);
}

/**
 * Extracts checklist candidates from actual document text.
 * This is deterministic parsing, not an AI judgment: all generated items
 * must be reviewed and edited by an authorized person before publication.
 */
export function extractChecklistItems(
  extractedText: string
): ExtractedChecklistItem[] {
  const lines = normalizeText(extractedText)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const candidates: string[] = [];
  for (const line of lines) {
    // Excel rows are joined with pipes. Split only where cells are clearly
    // separated; preserve the complete row if it reads as one checklist item.
    const possibleCells = line.includes(' | ')
      ? line.split(' | ').map((cell) => cell.trim()).filter(Boolean)
      : [line];

    for (const cell of possibleCells) {
      if (looksLikeChecklistItem(cell)) candidates.push(cleanCandidate(cell));
    }
  }

  const seen = new Set<string>();
  const unique = candidates
    .filter((item) => {
      const key = item.toLocaleLowerCase('id-ID');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 100);

  return unique.map((question) => ({
    question,
    standardRef: inferStandardRef(question),
    criticality: inferCriticality(question),
  }));
}

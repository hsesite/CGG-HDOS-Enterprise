import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import mammoth from 'mammoth/mammoth.browser';
import * as XLSX from 'xlsx';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface ExtractedChecklistItem {
  question: string;
  standardRef: string;
  criticality: 'CRITICAL' | 'MAJOR' | 'MINOR';
  section?: 'GENERAL' | 'HD_CMT' | 'FUEL_LUBE' | 'WATER_TRUCK';
  hazardCode?: string;
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
      const allRows: ExtractedChecklistItem[] = [];
      let currentSection: ExtractedChecklistItem['section'] = 'GENERAL';

      for (const table of tables) {
        // Mammoth preserves section titles as paragraphs immediately before tables.
        let previous = table.previousElementSibling;
        const nearbyHeadings: string[] = [];
        for (let step = 0; previous && step < 5; step += 1) {
          const text = normalizeText(previous.textContent || '');
          if (text) nearbyHeadings.unshift(text);
          previous = previous.previousElementSibling;
        }
        const context = nearbyHeadings.join(' ').toLocaleLowerCase('id-ID');
        if (/tambahan khusus heavy dump truck|heavy dump truck/.test(context)) currentSection = 'HD_CMT';
        else if (/tambahan khusus fuel truck|fuel truck|lube truck/.test(context)) currentSection = 'FUEL_LUBE';
        else if (/tambahan khusus water truck|water truck/.test(context)) currentSection = 'WATER_TRUCK';

        const rows = Array.from(table.querySelectorAll('tr')).map((row) =>
          Array.from(row.querySelectorAll('th, td')).map((cell) =>
            normalizeText(cell.textContent || '')
          )
        );
        // The source has two-row merged headers ("Kondisi"/"Hasil" then OK/Not OK).
        const headerIndex = rows.findIndex((row, index) => {
          const header = row.join(' ').toLocaleLowerCase('id-ID');
          const combinedHeader = (header + ' ' + (rows[index + 1] || []).join(' ')).toLocaleLowerCase('id-ID');
          return /hal[- ]?hal yang diperiksa|hal yang diperiksa|item yang diperiksa|checklist pemeriksaan/.test(combinedHeader)
            && /kode bahaya|tingkat risiko|tingkat resiko|kondisi|hasil|keterangan/.test(combinedHeader);
        });
        if (headerIndex < 0) continue;

        const header = rows[headerIndex].join(' ').toLocaleLowerCase('id-ID');
        const questionIndex = rows[headerIndex].findIndex((cell) =>
          /hal[- ]?hal yang diperiksa|hal yang diperiksa|item yang diperiksa|checklist pemeriksaan/i.test(cell)
        );
        const numberIndex = rows[headerIndex].findIndex((cell) =>
          /^(no\.?|nomor)$/i.test(cell.trim())
        );
        const hazardIndex = rows[headerIndex].findIndex((cell) =>
          /kode bahaya|tingkat risiko|tingkat resiko/i.test(cell)
        );
        if (questionIndex < 0) continue;

        for (const row of rows.slice(headerIndex + 1)) {
          const question = row[questionIndex]?.trim() || '';
          const numberCell = numberIndex >= 0 ? row[numberIndex]?.trim() || '' : '';
          if (!question || question.length < 8 || question.length > 1500) continue;
          if (/^(hal[- ]?hal yang diperiksa|item yang diperiksa|checklist pemeriksaan|kondisi aktual|tingkat risiko|tingkat resiko|kode bahaya|keterangan|hasil)$/i.test(question)) continue;
          if (/^(no\.?|nomor)$/i.test(numberCell)) continue;

          const hazardCode = hazardIndex >= 0 ? (row[hazardIndex] || '').trim() : '';
          const criticality: ExtractedChecklistItem['criticality'] =
            /^(extreme|e)$/i.test(hazardCode) ? 'CRITICAL'
              : /^(high|h|aa)$/i.test(hazardCode) ? 'MAJOR'
                : /^(moderate|medium|m|a|b)$/i.test(hazardCode) ? 'MINOR'
                  : inferCriticality(question);
          allRows.push({
            question: cleanCandidate(question),
            standardRef: inferStandardRef(question),
            criticality,
            section: currentSection || 'GENERAL',
            hazardCode: /^[a-z]{1,3}$/i.test(hazardCode) ? hazardCode : undefined,
          });
        }
      }

      if (allRows.length > 0) {
        const seen = new Set<string>();
        return allRows.filter((item) => {
          const key = `${item.section || 'GENERAL'}:${item.question.toLocaleLowerCase('id-ID').replace(/\s+/g, ' ').trim()}`;
          if (!item.question || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
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

/** Render original office documents for an in-app preview; source files remain unchanged. */
export async function renderDocumentPreviewHtml(file: Blob, fileName: string): Promise<string> {
  const extension = fileName.split('.').pop()?.toLowerCase();
  const buffer = await file.arrayBuffer();

  if (extension === 'docx') {
    const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
    if (!result.value.trim()) throw new Error('Isi DOCX tidak dapat ditampilkan.');
    return result.value;
  }

  if (extension === 'xlsx') {
    const workbook = XLSX.read(buffer, { type: 'array', cellText: true });
    return workbook.SheetNames.map((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      return `<section><h2>${sheetName.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char] || char))}</h2>${XLSX.utils.sheet_to_html(sheet)}</section>`;
    }).join('<hr />');
  }

  throw new Error('Pratinjau langsung hanya mendukung DOCX dan XLSX. PDF dibuka menggunakan penampil PDF.');
}


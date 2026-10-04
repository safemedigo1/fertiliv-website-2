export type ExternalReportV2Fixture = { id: string; sourceLanguage: "en" | "ar" | "tr" | "und"; sourceText: string };
export const externalReportV2Fixtures: ExternalReportV2Fixture[] = [
  { id: "semen-tr", sourceLanguage: "tr", sourceText: "SEMEN ANALİZİ\nHacim: 2,5 mL\nKonsantrasyon: 87 MİLYON/ML\nToplam motilite: 52 %\nMorfoloji: 6 %\nLökosit: <1 MİLYON/ML\nSonuç: Normal" },
  { id: "cbc-en", sourceLanguage: "en", sourceText: "COMPLETE BLOOD COUNT\nHemoglobin: 13.8 g/dL\nWBC: 6.2 x10^3/uL\nPlatelets: 245 x10^3/uL\nStatus: Normal" },
  { id: "hormones-tr", sourceLanguage: "tr", sourceText: "HORMON PANELİ\nFSH: 7,2 IU/L\nLH: 5,4 IU/L\nAMH: 2,8 ng/mL\nSonuç: Normal" },
  { id: "biochemistry-en", sourceLanguage: "en", sourceText: "BIOCHEMISTRY\nGlucose: 92 mg/dL\nCreatinine: 0.8 mg/dL\nALT: 21 U/L\nReference range: 0-35 U/L" },
  { id: "infection-ar", sourceLanguage: "ar", sourceText: "فحص الأمراض المعدية\nHBsAg: سلبي\nHIV: سلبي\nHCV: سلبي\nتاريخ الفحص: 2026-08-30" },
  { id: "genetics-en", sourceLanguage: "en", sourceText: "GENETIC REPORT\nCollection date: 2026-08-30\nThe narrative interpretation should be reviewed by the treating physician before any clinical decision." },
  { id: "narrative-tr", sourceLanguage: "tr", sourceText: "RADYOLOJİ RAPORU\nİnceleme tarihi: 2026-08-30\nBulgular anlatı biçimindedir ve sonuç klinik değerlendirme ile birlikte yorumlanmalıdır." },
  { id: "ambiguous-und", sourceLanguage: "und", sourceText: "External narrative report. The extraction is incomplete and the original document must remain visible for manual verification." },
];


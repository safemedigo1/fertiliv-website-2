/**
 * Fertiliv Brand Constants
 * Single source of truth for all branding, company info, and asset URLs.
 * Used in invoices, PDFs, emails, and UI components.
 */

export const BRAND = {
  name: "Fertiliv",
  legalName: "Fertiliv IVF Center",
  tagline: "Fertility Care & IVF Support",

  address: {
    street: "Halaskargazi, Vali Konağı Cd. No:73",
    district: "Şişli",
    city: "İstanbul",
    country: "Turkey",
    postalCode: "34371",
    full: "Halaskargazi, Vali Konağı Cd. No:73, 34371 Şişli/İstanbul, Turkey",
    googleMapsUrl: "https://share.google/ox0llxQGtJb5O7tNP",
  },

  contact: {
    phone: "+90 501 114 70 60",
    whatsapp: "+905011147060",
    whatsappLink: "https://wa.me/905011147060",
    whatsappCatalog: "https://wa.me/c/905011147060",
    email: "info@fertiliv.com",
    website: "https://fertiliv.com",
  },

  social: {
    instagram: "https://www.instagram.com/fertiliv/",
    facebook: "https://www.facebook.com/profile.php?id=100089693390459",
    youtube: "https://www.youtube.com/watch?v=UjYjYdB-XNk",
  },

  hours: {
    weekdays: "Mon–Fri  09:00–18:00",
    saturday: "Sat  09:00–14:00",
    sunday: "Closed",
    display: "Mon–Fri 09:00–18:00 | Sat 09:00–14:00",
  },

  colors: {
    primary: "#FECFB3",   // peach — backgrounds, highlights
    brand: "#140063",     // deep navy — buttons, text, headings
    accent: "#140063",
  },

  /** Storage paths — use directly in <img src="..."> or PDF templates */
  assets: {
    logoHorizontal: "/manus-storage/logo-horizontal_473c1b94.png",       // dark navy, horizontal (for PDFs/invoices)
    logoVerticalDark: "/manus-storage/logo-vertical-dark_262ff0e7.png",  // dark navy, vertical
    logoVerticalPeach: "/manus-storage/logo-vertical-peach_c604daaf.png",// peach, vertical
    logoHorizontalPeach: "/manus-storage/logo-horizontal-peach_f930a76a.png", // peach, horizontal
    logoSquare: "/manus-storage/logo-square_c30b5df9.png",               // compact square (sidebar/favicon)
    stampDrNilay: "/manus-storage/stamp-dr-nilay_66ce10c9.png",          // Dr. Nilay Karaca e-stamp
    stampBills: "/manus-storage/stamp-bills_23e4f414.png",               // Safemedigo/bills official stamp
  },
} as const;

export type Brand = typeof BRAND;

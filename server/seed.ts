/**
 * Fertiliv – Full Reset & Reseed Script (v3)
 * Clears all tables in safe dependency order, then inserts comprehensive demo data
 * covering every section and scenario in the application.
 * Run: npx tsx server/seed.ts
 */
import dotenv from "dotenv";
dotenv.config();

import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "../drizzle/schema";

const DB_URL = process.env.DATABASE_URL!;

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const setTime = (d: Date, h: number, m: number) => {
  const r = new Date(d);
  r.setHours(h, m, 0, 0);
  return r;
};

async function main() {
  const connection = await mysql.createConnection(DB_URL);
  const db = drizzle(connection, { schema, mode: "default" } as any);
  const now = new Date();

  console.log("🗑️  Clearing all tables...");
  await connection.execute("SET FOREIGN_KEY_CHECKS = 0");
  const tables = [
    "staff_permissions", "treatment_proposals", "treatment_packages",
    "medical_intake", "lead_documents", "lead_communications", "leads",
    "messages", "notifications", "lab_results", "lab_orders",
    "sales_tasks", "sales_notes", "offers",
    "invoice_items", "invoices",
    "appointment_activity_log", "appointments",
    "medical_notes", "services", "partner_clinics",
    "system_settings",
    "patients", "doctors", "users",
  ];
  for (const t of tables) {
    await connection.execute(`TRUNCATE TABLE \`${t}\``);
  }
  await connection.execute("SET FOREIGN_KEY_CHECKS = 1");
  console.log("   ✓ All tables cleared.");

  // ── 1. Users ──────────────────────────────────────────────────────────────────
  console.log("  → Seeding users...");
  const adminHash  = await bcrypt.hash("Admin@1234",  12);
  const doctorHash = await bcrypt.hash("Doctor@1234", 12);
  const staffHash  = await bcrypt.hash("Staff@1234",  12);
  const patHash    = await bcrypt.hash("Patient@1234", 12);

  await db.insert(schema.users).values([
    { openId: "u-admin-01", name: "Nadia Al-Rashid",     email: "nadia.alrashid@fertiliv.com", passwordHash: adminHash,  loginMethod: "password", role: "admin",   lastSignedIn: now },
    { openId: "u-doc-01",   name: "Dr. Khalid Mansour",  email: "k.mansour@fertiliv.com",      passwordHash: doctorHash, loginMethod: "password", role: "doctor",  lastSignedIn: now },
    { openId: "u-doc-02",   name: "Dr. Amira Saleh",     email: "a.saleh@fertiliv.com",        passwordHash: doctorHash, loginMethod: "password", role: "doctor",  lastSignedIn: now },
    { openId: "u-doc-03",   name: "Dr. Tariq Al-Farsi",  email: "t.alfarsi@fertiliv.com",      passwordHash: doctorHash, loginMethod: "password", role: "doctor",  lastSignedIn: now },
    { openId: "u-doc-04",   name: "Dr. Lena Hoffmann",   email: "l.hoffmann@fertiliv.com",     passwordHash: doctorHash, loginMethod: "password", role: "doctor",  lastSignedIn: now },
    { openId: "u-staff-01", name: "Sara Qassem",         email: "s.qassem@fertiliv.com",       passwordHash: staffHash,  loginMethod: "password", role: "staff",   lastSignedIn: now },
    { openId: "u-staff-02", name: "Omar Haddad",         email: "o.haddad@fertiliv.com",       passwordHash: staffHash,  loginMethod: "password", role: "staff",   lastSignedIn: now },
    { openId: "u-pat-01",   name: "Rania Yousef",        email: "rania.yousef@gmail.com",      passwordHash: patHash,    loginMethod: "password", role: "patient", lastSignedIn: now },
    { openId: "u-pat-02",   name: "Hana Al-Khatib",      email: "hana.alkhatib@gmail.com",     passwordHash: patHash,    loginMethod: "password", role: "patient", lastSignedIn: now },
    { openId: "u-pat-03",   name: "Dina Farouk",         email: "dina.farouk@gmail.com",       passwordHash: patHash,    loginMethod: "password", role: "patient", lastSignedIn: now },
  ]);

  const allUsers = await db.select().from(schema.users);
  const uAdmin   = allUsers.find(u => u.openId === "u-admin-01")!;
  const uDoc1    = allUsers.find(u => u.openId === "u-doc-01")!;
  const uDoc2    = allUsers.find(u => u.openId === "u-doc-02")!;
  const uDoc3    = allUsers.find(u => u.openId === "u-doc-03")!;
  const uDoc4    = allUsers.find(u => u.openId === "u-doc-04")!;
  const uStaff1  = allUsers.find(u => u.openId === "u-staff-01")!;
  const uStaff2  = allUsers.find(u => u.openId === "u-staff-02")!;
  const uPat1    = allUsers.find(u => u.openId === "u-pat-01")!;
  const uPat2    = allUsers.find(u => u.openId === "u-pat-02")!;
  const uPat3    = allUsers.find(u => u.openId === "u-pat-03")!;

  // ── 2. Staff Permissions ──────────────────────────────────────────────────────
  console.log("  → Seeding staff permissions...");
  await db.insert(schema.staffPermissions).values([
    { userId: uStaff1.id, module: "patients",     canView: true,  canCreate: true,  canEdit: true,  canDelete: false },
    { userId: uStaff1.id, module: "calendar", canView: true,  canCreate: true,  canEdit: true,  canDelete: false },
    { userId: uStaff1.id, module: "finance",     canView: true,  canCreate: true,  canEdit: true,  canDelete: false },
    { userId: uStaff1.id, module: "leads",        canView: true,  canCreate: true,  canEdit: true,  canDelete: false },
    { userId: uStaff1.id, module: "lab",   canView: true,  canCreate: false, canEdit: false, canDelete: false },
    { userId: uStaff2.id, module: "patients",     canView: true,  canCreate: true,  canEdit: true,  canDelete: false },
    { userId: uStaff2.id, module: "calendar", canView: true,  canCreate: true,  canEdit: true,  canDelete: false },
    { userId: uStaff2.id, module: "finance",     canView: true,  canCreate: true,  canEdit: false, canDelete: false },
    { userId: uStaff2.id, module: "leads",        canView: true,  canCreate: true,  canEdit: true,  canDelete: false },
    { userId: uStaff2.id, module: "lab",   canView: true,  canCreate: false, canEdit: false, canDelete: false },
  ]);

  // ── 3. Doctors ────────────────────────────────────────────────────────────────
  console.log("  → Seeding doctors...");
  await db.insert(schema.doctors).values([
    { userId: uDoc1.id, specialty: "Reproductive Endocrinology,IVF,ICSI,Ovarian Stimulation", licenseNumber: "LIC-RE-2019-001", bio: "Board-certified reproductive endocrinologist with 14 years of experience in IVF, ICSI, and ovarian stimulation protocols. Published author in fertility research.", consultationFee: "380.00" },
    { userId: uDoc2.id, specialty: "Gynecology,Reproductive Surgery,Endometriosis,Laparoscopy", licenseNumber: "LIC-GY-2017-002", bio: "Specialist in minimally invasive reproductive surgery, endometriosis management, and uterine factor infertility.", consultationFee: "320.00" },
    { userId: uDoc3.id, specialty: "Obstetrics,Maternal-Fetal Medicine,Recurrent Pregnancy Loss,PGT", licenseNumber: "LIC-OB-2015-003", bio: "High-risk obstetrics expert with a focus on recurrent pregnancy loss and preimplantation genetic testing.", consultationFee: "350.00" },
    { userId: uDoc4.id, specialty: "Andrology,Male Infertility,Semen Analysis,Micro-TESE", licenseNumber: "LIC-AN-2020-004", bio: "Dedicated andrology specialist experienced in semen analysis, sperm retrieval techniques, and male hormonal therapy.", consultationFee: "290.00" },
  ]);

  const allDoctors = await db.select().from(schema.doctors);
  const doc1 = allDoctors.find(d => d.userId === uDoc1.id)!;
  const doc2 = allDoctors.find(d => d.userId === uDoc2.id)!;
  const doc3 = allDoctors.find(d => d.userId === uDoc3.id)!;
  const doc4 = allDoctors.find(d => d.userId === uDoc4.id)!;

  // ── 4. System Settings (Exchange Rates) ───────────────────────────────────────
  console.log("  → Seeding system settings...");
  await db.insert(schema.systemSettings).values([
    { key: "exchange_rate_USD", value: "3.67",  description: "USD to AED exchange rate" },
    { key: "exchange_rate_EUR", value: "4.02",  description: "EUR to AED exchange rate" },
    { key: "exchange_rate_GBP", value: "4.68",  description: "GBP to AED exchange rate" },
    { key: "exchange_rate_SAR", value: "0.98",  description: "SAR to AED exchange rate" },
    { key: "exchange_rate_AED", value: "1.00",  description: "AED to AED (base currency)" },
    { key: "foreign_price_markup_pct", value: "30", description: "Markup % added to local TRY price for foreign patients" },
    { key: "card_surcharge_pct",        value: "23", description: "Surcharge % applied when paying by card or bank transfer" },
    { key: "clinic_name",               value: "Fertiliv Fertility Clinic", description: "Clinic display name" },
    { key: "clinic_currency",           value: "AED", description: "Primary billing currency" },
  ]);

  // ── 5. Services ───────────────────────────────────────────────────────────────
  console.log("  → Seeding services...");
  await db.insert(schema.services).values([
    // Lab Tests
    { name: "Complete Blood Count (CBC)",              category: "lab_test",      code: "LAB-001", price: "90.00",    localPriceTRY: "90.00",   duration: 20, description: "Full haematology panel including RBC, WBC, haemoglobin, and platelets.",                   preparationInstructions: "Fasting for 8 hours required.", status: "active" },
    { name: "Hormonal Panel (FSH, LH, E2, AMH)",      category: "lab_test",      code: "LAB-002", price: "240.00",   localPriceTRY: "240.00",  duration: 30, description: "Core fertility hormone assessment for ovarian reserve and cycle evaluation.",               preparationInstructions: "Blood draw on cycle day 2 or 3.", status: "active" },
    { name: "AMH (Anti-Müllerian Hormone)",            category: "lab_test",      code: "LAB-003", price: "190.00",   localPriceTRY: "190.00",  duration: 20, description: "Single marker for ovarian reserve; can be drawn on any cycle day.",                        preparationInstructions: "No special preparation required.", status: "active" },
    { name: "Thyroid Function Panel (TSH, FT3, FT4)", category: "lab_test",      code: "LAB-004", price: "130.00",   localPriceTRY: "130.00",  duration: 20, description: "Thyroid hormone panel to rule out thyroid-related fertility issues.",                       preparationInstructions: "Morning sample preferred.", status: "active" },
    { name: "Prolactin Level",                         category: "lab_test",      code: "LAB-005", price: "100.00",   localPriceTRY: "100.00",  duration: 20, description: "Serum prolactin measurement to evaluate hyperprolactinaemia.",                             preparationInstructions: "Avoid stress and exercise before the test.", status: "active" },
    { name: "Semen Analysis (Standard)",               category: "lab_test",      code: "LAB-006", price: "160.00",   localPriceTRY: "160.00",  duration: 60, description: "WHO-criteria sperm count, motility, morphology, and volume analysis.",                     preparationInstructions: "2–5 days of sexual abstinence required.", status: "active" },
    { name: "Advanced Semen Analysis + DNA Frag.",     category: "lab_test",      code: "LAB-007", price: "280.00",   localPriceTRY: "280.00",  duration: 60, description: "Standard semen analysis plus sperm DNA fragmentation index (DFI).",                        preparationInstructions: "2–5 days of sexual abstinence required.", status: "active" },
    { name: "Karyotyping (Chromosomal Analysis)",      category: "lab_test",      code: "LAB-008", price: "520.00",   localPriceTRY: "520.00",  duration: 30, description: "Peripheral blood karyotype for chromosomal abnormality screening.",                        preparationInstructions: "No special preparation required.", status: "active" },
    { name: "Thrombophilia Screen",                    category: "lab_test",      code: "LAB-009", price: "310.00",   localPriceTRY: "310.00",  duration: 30, description: "Factor V Leiden, Prothrombin G20210A, MTHFR, antiphospholipid antibodies.",               preparationInstructions: "No special preparation required.", status: "active" },
    // Radiology
    { name: "Pelvic Ultrasound",                       category: "radiology_test", code: "RAD-001", price: "290.00",  localPriceTRY: "290.00",  duration: 45, description: "Transvaginal or transabdominal pelvic ultrasound for uterine and ovarian assessment.",      preparationInstructions: "Full bladder required for transabdominal approach.", status: "active" },
    { name: "Antral Follicle Count (AFC)",             category: "radiology_test", code: "RAD-002", price: "330.00",  localPriceTRY: "330.00",  duration: 30, description: "Transvaginal ultrasound to count resting follicles as an ovarian reserve marker.",          preparationInstructions: "Perform on cycle day 2 or 3.", status: "active" },
    { name: "Follicle Monitoring Scan",                category: "radiology_test", code: "RAD-003", price: "180.00",  localPriceTRY: "180.00",  duration: 20, description: "Serial transvaginal ultrasound to monitor follicle growth during stimulation.",             preparationInstructions: "No special preparation required.", status: "active" },
    { name: "Hysterosalpingography (HSG)",             category: "radiology_test", code: "RAD-004", price: "680.00",  localPriceTRY: "680.00",  duration: 60, description: "Fluoroscopic evaluation of uterine cavity and fallopian tube patency.",                    preparationInstructions: "Schedule on cycle days 7–10. Antibiotic prophylaxis.", status: "active" },
    { name: "3D Saline Sonohysterography",             category: "radiology_test", code: "RAD-005", price: "440.00",  localPriceTRY: "440.00",  duration: 45, description: "3D ultrasound with saline infusion for detailed uterine cavity assessment.",               preparationInstructions: "Perform in follicular phase.", status: "active" },
    // Pathology
    { name: "Endometrial Biopsy",                      category: "pathology_test", code: "PATH-001", price: "400.00", localPriceTRY: "400.00",  duration: 30, description: "Endometrial tissue sampling for histological evaluation and receptivity assessment.",       preparationInstructions: "Perform on cycle day 21–23.", status: "active" },
    { name: "Cervical Cytology (Pap Smear)",           category: "pathology_test", code: "PATH-002", price: "130.00", localPriceTRY: "130.00",  duration: 20, description: "Cervical cancer screening and HPV co-testing.",                                            preparationInstructions: "Avoid intercourse and vaginal products 48 hours prior.", status: "active" },
    // Procedures
    { name: "IUI (Intrauterine Insemination)",         category: "procedure",     code: "PROC-001", price: "1300.00", localPriceTRY: "1300.00", duration: 30, description: "Prepared sperm placed directly into the uterine cavity around ovulation.",                preparationInstructions: "Abstinence 2–5 days. Full bladder for procedure.", status: "active" },
    { name: "IVF Full Cycle",                          category: "procedure",     code: "PROC-002", price: "9200.00", localPriceTRY: "9200.00", duration: 60, description: "Complete IVF cycle including stimulation monitoring, egg retrieval, fertilisation, and embryo culture.", preparationInstructions: "Baseline scan on day 2 of cycle.", status: "active" },
    { name: "Egg Retrieval (OPU)",                     category: "procedure",     code: "PROC-003", price: "2950.00", localPriceTRY: "2950.00", duration: 60, description: "Transvaginal oocyte pick-up under IV sedation.",                                          preparationInstructions: "Nil by mouth from midnight. Trigger 36 hours prior.", status: "active" },
    { name: "Embryo Transfer (Fresh or Frozen)",       category: "procedure",     code: "PROC-004", price: "1600.00", localPriceTRY: "1600.00", duration: 30, description: "Ultrasound-guided transfer of fresh or vitrified embryo into uterine cavity.",             preparationInstructions: "Full bladder required. Continue progesterone support.", status: "active" },
    { name: "ICSI (Intracytoplasmic Sperm Injection)", category: "procedure",     code: "PROC-005", price: "800.00",  localPriceTRY: "800.00",  duration: 30, description: "Single sperm injected directly into each mature oocyte.",                                  preparationInstructions: "Performed in the embryology lab on the day of retrieval.", status: "active" },
    { name: "Laparoscopy & Adhesiolysis",              category: "procedure",     code: "PROC-006", price: "3800.00", localPriceTRY: "3800.00", duration: 90, description: "Diagnostic and operative laparoscopy for endometriosis, adhesions, or tubal pathology.",   preparationInstructions: "Nil by mouth from midnight. Pre-op assessment required.", status: "active" },
    { name: "Micro-TESE (Sperm Retrieval)",            category: "procedure",     code: "PROC-007", price: "4500.00", localPriceTRY: "4500.00", duration: 120, description: "Microsurgical testicular sperm extraction for non-obstructive azoospermia.",              preparationInstructions: "Nil by mouth from midnight. Genetic workup required first.", status: "active" },
    // Consultations
    { name: "Initial Fertility Consultation",          category: "other_test",    code: "CONS-001", price: "380.00",  localPriceTRY: "380.00",  duration: 60, description: "Comprehensive new-patient fertility assessment including history, examination, and investigation planning.", status: "active" },
    { name: "Follow-up Consultation",                  category: "other_test",    code: "CONS-002", price: "190.00",  localPriceTRY: "190.00",  duration: 30, description: "Review of investigation results and treatment progress.", status: "active" },
    { name: "Andrology Consultation",                  category: "other_test",    code: "CONS-003", price: "290.00",  localPriceTRY: "290.00",  duration: 45, description: "Specialist male fertility assessment including semen analysis review and hormonal evaluation.", status: "active" },
    { name: "PGT-A Biopsy & Culture (per embryo)",    category: "lab_test",      code: "LAB-010",  price: "160.00",  localPriceTRY: "160.00",  duration: 30, description: "Trophectoderm biopsy and next-generation sequencing for chromosomal screening.", status: "active" },
  ]);

  // ── 6. Partner Clinics ────────────────────────────────────────────────────────
  console.log("  → Seeding partner clinics...");
  await db.insert(schema.partnerClinics).values([
    { name: "Gulf Genetics Laboratory",    specialty: "Preimplantation Genetic Testing (PGT-A, PGT-M, PGT-SR)", phone: "+971-4-555-0101", address: "Dubai Healthcare City, Building 64, Dubai, UAE",  notes: "Preferred PGT partner. 3–5 day turnaround for NGS results. FISH available for urgent cases." },
    { name: "Al-Noor Radiology Centre",   specialty: "Advanced Reproductive Imaging (HSG, 3D Sonohysterography)", phone: "+971-2-555-0202", address: "Khalifa City A, Abu Dhabi, UAE",                  notes: "HSG and 3D sonohysterography referrals. Appointments available within 48 hours." },
    { name: "Cryo-Life Storage Facility", specialty: "Gamete & Embryo Cryostorage (Long-term)",                   phone: "+971-6-555-0303", address: "Sharjah Medical City, Sharjah, UAE",              notes: "Long-term embryo and oocyte storage. Annual renewal required. Liquid nitrogen tanks." },
    { name: "Sunrise Oncofertility Unit", specialty: "Oncofertility & Urgent Fertility Preservation",             phone: "+971-4-555-0404", address: "Jumeirah Beach Road, Dubai, UAE",                 notes: "Urgent fertility preservation for cancer patients. Accepts same-day referrals." },
  ]);

  const allPartnerClinics = await db.select().from(schema.partnerClinics);
  const pc1 = allPartnerClinics[0]!;

  // ── 7. Patients ───────────────────────────────────────────────────────────────
  console.log("  → Seeding patients...");
  await db.insert(schema.patients).values([
    {
      mrn: "FLV-2025-001", userId: uPat1.id,
      firstName: "Rania", lastName: "Yousef",
      dateOfBirth: new Date("1989-04-12"), gender: "female",
      phone: "+971-50-111-2001", email: "rania.yousef@gmail.com",
      address: "Villa 14, Al-Barsha 2, Dubai, UAE",
      nationality: "Emirati", isLocalPatient: true,
      bloodType: "A+", allergies: "Penicillin",
      emergencyContactName: "Tariq Yousef", emergencyContactPhone: "+971-50-111-2002",
      insuranceProvider: "Daman National Health Insurance", insuranceNumber: "DN-884521-A",
      assignedDoctorId: doc1.id, status: "active_patient", interestLevel: "hot",
      tags: JSON.stringify(["IVF Candidate", "PCOS", "Diminished Ovarian Reserve"]),
      leadSource: "Doctor Referral",
      notes: "35-year-old presenting with 4 years of primary infertility. PCOS confirmed on ultrasound. AMH 0.9 ng/mL. Husband semen analysis normal.",
    },
    {
      mrn: "FLV-2025-002", userId: uPat2.id,
      firstName: "Hana", lastName: "Al-Khatib",
      dateOfBirth: new Date("1993-08-27"), gender: "female",
      phone: "+971-55-222-3001", email: "hana.alkhatib@gmail.com",
      address: "Apartment 7B, Jumeirah Village Circle, Dubai, UAE",
      nationality: "Lebanese", isLocalPatient: false,
      bloodType: "O+", allergies: "None known",
      emergencyContactName: "Bilal Al-Khatib", emergencyContactPhone: "+971-55-222-3002",
      insuranceProvider: "AXA Gulf Insurance", insuranceNumber: "AXA-221847-B",
      assignedDoctorId: doc2.id, status: "active_patient", interestLevel: "warm",
      tags: JSON.stringify(["IUI", "Secondary Infertility", "Endometriosis Stage I"]),
      leadSource: "Website",
      notes: "31-year-old with secondary infertility. One previous natural conception. HSG showed mild left-tube adhesion. Endometriosis stage I on laparoscopy.",
    },
    {
      mrn: "FLV-2025-003", userId: uPat3.id,
      firstName: "Dina", lastName: "Farouk",
      dateOfBirth: new Date("1986-01-19"), gender: "female",
      phone: "+971-52-333-4001", email: "dina.farouk@gmail.com",
      address: "Tower 3, Marina Residences, Dubai Marina, UAE",
      nationality: "Egyptian", isLocalPatient: false,
      bloodType: "B+", allergies: "Latex",
      emergencyContactName: "Khaled Farouk", emergencyContactPhone: "+971-52-333-4002",
      insuranceProvider: "Cigna Global Health", insuranceNumber: "CIG-334892-C",
      assignedDoctorId: doc1.id, status: "active_patient", interestLevel: "hot",
      tags: JSON.stringify(["IVF Cycle 2", "Recurrent Pregnancy Loss", "PGT-A"]),
      leadSource: "Referral – Al-Noor Radiology",
      notes: "38-year-old with two previous IVF cycles resulting in biochemical pregnancies. PGT-A recommended. Karyotype normal.",
    },
    {
      mrn: "FLV-2025-004",
      firstName: "Mariam", lastName: "Al-Suwaidi",
      dateOfBirth: new Date("1991-11-03"), gender: "female",
      phone: "+971-56-444-5001", email: "mariam.alsuwaidi@outlook.com",
      address: "Corniche Road, Abu Dhabi, UAE",
      nationality: "Emirati", isLocalPatient: true,
      bloodType: "AB+", allergies: "Ibuprofen",
      emergencyContactName: "Saeed Al-Suwaidi", emergencyContactPhone: "+971-56-444-5002",
      insuranceProvider: "Thiqa (HAAD)", insuranceNumber: "THQ-556123-D",
      assignedDoctorId: doc3.id, status: "active_patient", interestLevel: "warm",
      tags: JSON.stringify(["Unexplained Infertility", "Recurrent Loss", "RPL Workup"]),
      leadSource: "Social Media",
      notes: "33-year-old with unexplained infertility. Two early miscarriages. All standard investigations normal. Referred for RPL workup.",
    },
    {
      mrn: "FLV-2025-005",
      firstName: "Yasmine", lastName: "Benali",
      dateOfBirth: new Date("1988-06-30"), gender: "female",
      phone: "+971-54-555-6001", email: "yasmine.benali@icloud.com",
      address: "Al-Reem Island, Abu Dhabi, UAE",
      nationality: "Algerian", isLocalPatient: false,
      bloodType: "A-", allergies: "None",
      emergencyContactName: "Karim Benali", emergencyContactPhone: "+971-54-555-6002",
      insuranceProvider: "MetLife UAE", insuranceNumber: "ML-778234-E",
      assignedDoctorId: doc2.id, status: "active_patient", interestLevel: "hot",
      tags: JSON.stringify(["Egg Freezing", "Elective", "Good Reserve"]),
      leadSource: "Referral",
      notes: "36-year-old requesting elective egg freezing. AMH 3.4 ng/mL. AFC 20. No fertility concerns. Career-planning motivation.",
    },
    {
      mrn: "FLV-2025-006",
      firstName: "Noura", lastName: "Al-Hamdan",
      dateOfBirth: new Date("1994-09-15"), gender: "female",
      phone: "+971-50-666-7001", email: "noura.alhamdan@gmail.com",
      address: "Khalifa City B, Abu Dhabi, UAE",
      nationality: "Emirati", isLocalPatient: true,
      bloodType: "O-", allergies: "Aspirin",
      emergencyContactName: "Faisal Al-Hamdan", emergencyContactPhone: "+971-50-666-7002",
      insuranceProvider: "Daman Enhanced", insuranceNumber: "DE-991234-F",
      assignedDoctorId: doc3.id, status: "active_patient", interestLevel: "warm",
      tags: JSON.stringify(["POI", "Donor Egg Consideration", "HRT"]),
      leadSource: "Website",
      notes: "30-year-old with premature ovarian insufficiency (POI). FSH > 40 IU/L. Considering donor egg programme. Currently on HRT.",
    },
    {
      mrn: "FLV-2025-007",
      firstName: "Lara", lastName: "Nassar",
      dateOfBirth: new Date("1990-03-22"), gender: "female",
      phone: "+971-55-777-8001", email: "lara.nassar@gmail.com",
      address: "Mirdif, Dubai, UAE",
      nationality: "Syrian", isLocalPatient: false,
      bloodType: "B-", allergies: "None",
      emergencyContactName: "Ziad Nassar", emergencyContactPhone: "+971-55-777-8002",
      insuranceProvider: "AXA Gulf Insurance", insuranceNumber: "AXA-112233-G",
      assignedDoctorId: doc4.id, status: "active_patient", interestLevel: "cold",
      tags: JSON.stringify(["Male Factor", "Azoospermia", "TESA Candidate"]),
      leadSource: "Walk-in",
      notes: "Couple presenting with male factor infertility. Husband diagnosed with non-obstructive azoospermia. Micro-TESE evaluation planned.",
    },
    {
      mrn: "FLV-2025-008",
      firstName: "Fatima", lastName: "Al-Zaabi",
      dateOfBirth: new Date("1992-12-07"), gender: "female",
      phone: "+971-52-888-9001", email: "fatima.alzaabi@gmail.com",
      address: "Yas Island, Abu Dhabi, UAE",
      nationality: "Emirati", isLocalPatient: true,
      bloodType: "A+", allergies: "Sulfa drugs",
      emergencyContactName: "Mohammed Al-Zaabi", emergencyContactPhone: "+971-52-888-9002",
      insuranceProvider: "Daman National Health Insurance", insuranceNumber: "DN-445566-H",
      assignedDoctorId: doc1.id, status: "inactive", interestLevel: "cold",
      tags: JSON.stringify(["On Hold", "Insurance Pending"]),
      leadSource: "Referral",
      notes: "Treatment on hold pending insurance pre-authorisation for IVF. Patient will resume once approved.",
    },
  ]);

  const allPatients = await db.select().from(schema.patients);
  const p1 = allPatients.find(p => p.mrn === "FLV-2025-001")!;
  const p2 = allPatients.find(p => p.mrn === "FLV-2025-002")!;
  const p3 = allPatients.find(p => p.mrn === "FLV-2025-003")!;
  const p4 = allPatients.find(p => p.mrn === "FLV-2025-004")!;
  const p5 = allPatients.find(p => p.mrn === "FLV-2025-005")!;
  const p6 = allPatients.find(p => p.mrn === "FLV-2025-006")!;
  const p7 = allPatients.find(p => p.mrn === "FLV-2025-007")!;
  const p8 = allPatients.find(p => p.mrn === "FLV-2025-008")!;

  // ── 9. Treatment Packages ─────────────────────────────────────────────────────
  console.log("  → Seeding treatment packages...");
  await db.insert(schema.treatmentPackages).values([
    {
      name: "IVF Standard Package",
      description: "Complete IVF cycle including stimulation monitoring (up to 5 scans), egg retrieval under sedation, ICSI fertilisation, embryo culture to blastocyst, and one fresh or frozen embryo transfer.",
      localPriceTRY: "350000.00",
      intlPriceUSD: "12500.00",
      isActive: true,
    },
    {
      name: "IVF + PGT-A Package",
      description: "IVF Standard Package plus preimplantation genetic testing for aneuploidies (PGT-A) for up to 5 embryos. Includes biopsy, NGS analysis, and results consultation.",
      localPriceTRY: "470400.00",
      intlPriceUSD: "16800.00",
      isActive: true,
    },
    {
      name: "IUI 3-Cycle Bundle",
      description: "Three IUI cycles with letrozole stimulation, trigger injection, sperm preparation, and luteal phase support. Includes monitoring scans and post-IUI follow-up.",
      localPriceTRY: "100800.00",
      intlPriceUSD: "3600.00",
      isActive: true,
    },
    {
      name: "Egg Freezing Package",
      description: "Elective oocyte cryopreservation including stimulation monitoring (up to 5 scans), egg retrieval, vitrification of all mature oocytes, and first year of storage.",
      localPriceTRY: "249200.00",
      intlPriceUSD: "8900.00",
      isActive: true,
    },
    {
      name: "Fertility Assessment Package",
      description: "Comprehensive fertility workup for couples: hormonal panel (FSH, LH, E2, AMH), pelvic ultrasound with AFC, semen analysis, thyroid function, and a detailed consultation with treatment plan.",
      localPriceTRY: "33600.00",
      intlPriceUSD: "1200.00",
      isActive: true,
    },
    {
      name: "Donor Egg IVF Package",
      description: "IVF cycle using anonymous donor oocytes. Includes endometrial preparation, embryo transfer, and luteal phase support. Donor matching and legal consent included.",
      localPriceTRY: "518000.00",
      intlPriceUSD: "18500.00",
      isActive: true,
    },
  ]);

  const allPackages = await db.select().from(schema.treatmentPackages);
  const pkg1 = allPackages.find(p => p.name === "IVF Standard Package")!;
  const pkg2 = allPackages.find(p => p.name === "IVF + PGT-A Package")!;
  const pkg3 = allPackages.find(p => p.name === "IUI 3-Cycle Bundle")!;
  const pkg4 = allPackages.find(p => p.name === "Egg Freezing Package")!;
  const pkg6 = allPackages.find(p => p.name === "Donor Egg IVF Package")!;

  // ── 10. Treatment Proposals ───────────────────────────────────────────────────
  console.log("  → Seeding treatment proposals...");
  await db.insert(schema.treatmentProposals).values([
    {
      patientId: p1.id,
      packageId: pkg2.id,
      createdBy: uDoc1.id,
      totalAmount: "16800.00",
      currency: "USD" as const,
      appliedPriceType: "international" as const,
      status: "accepted" as const,
      staffNotes: "Patient accepted the proposal on first consultation. Signed consent forms on file. Cycle to begin next menstrual cycle.",
    },
    {
      patientId: p2.id,
      packageId: pkg3.id,
      createdBy: uDoc2.id,
      totalAmount: "3600.00",
      currency: "USD" as const,
      appliedPriceType: "international" as const,
      status: "accepted" as const,
      staffNotes: "Patient accepted. Currently in cycle 2 of 3.",
    },
    {
      patientId: p3.id,
      packageId: pkg2.id,
      createdBy: uDoc1.id,
      totalAmount: "16800.00",
      currency: "USD" as const,
      appliedPriceType: "international" as const,
      status: "accepted" as const,
      staffNotes: "Patient accepted. Egg retrieval completed. Awaiting PGT-A results. FET scheduled.",
    },
    {
      patientId: p5.id,
      packageId: pkg4.id,
      createdBy: uDoc2.id,
      totalAmount: "8900.00",
      currency: "USD" as const,
      appliedPriceType: "international" as const,
      status: "draft" as const,
      staffNotes: "Proposal sent to patient. Awaiting final confirmation before starting stimulation.",
    },
    {
      patientId: p6.id,
      packageId: pkg6.id,
      createdBy: uDoc3.id,
      totalAmount: "18500.00",
      currency: "USD" as const,
      appliedPriceType: "international" as const,
      status: "draft" as const,
      staffNotes: "Draft proposal prepared for counselling session. Patient is still considering options.",
    },
  ]);

  // ── 11. Appointments ──────────────────────────────────────────────────────────
  console.log("  → Seeding appointments...");
  await db.insert(schema.appointments).values([
    // Today
    { patientId: p1.id, doctorId: doc1.id, title: "Follicle Monitoring Scan – Day 8",         appointmentDate: setTime(now, 8, 30),  duration: 30, status: "confirmed",  type: "follow_up",    notes: "Day 8 stimulation monitoring. Check follicle sizes and E2 level." },
    { patientId: p3.id, doctorId: doc1.id, title: "Pre-Transfer Endometrial Check",            appointmentDate: setTime(now, 10, 0),  duration: 30, status: "upcoming",   type: "follow_up",    notes: "Endometrial thickness and pattern check before FET." },
    { patientId: p6.id, doctorId: doc3.id, title: "POI Hormone Monitoring",                    appointmentDate: setTime(now, 11, 30), duration: 30, status: "confirmed",  type: "follow_up",    notes: "Oestrogen and FSH monitoring for HRT dose adjustment." },
    // Tomorrow
    { patientId: p1.id, doctorId: doc1.id, title: "IVF Cycle Planning Consultation",           appointmentDate: setTime(addDays(now, 1), 9, 0),   duration: 60, status: "confirmed",  type: "consultation", notes: "Review stimulation protocol and consent forms for IVF cycle 1." },
    { patientId: p2.id, doctorId: doc2.id, title: "IUI Procedure – Cycle 2",                   appointmentDate: setTime(addDays(now, 1), 10, 30), duration: 30, status: "upcoming",   type: "procedure",    notes: "Second IUI attempt. Trigger administered 36 hours prior." },
    // This week
    { patientId: p3.id, doctorId: doc1.id, title: "Frozen Embryo Transfer (FET)",              appointmentDate: setTime(addDays(now, 2), 11, 0),  duration: 45, status: "confirmed",  type: "procedure",    notes: "Transfer of one euploid blastocyst (PGT-A normal, grade 4AA)." },
    { patientId: p4.id, doctorId: doc3.id, title: "Recurrent Pregnancy Loss Workup Review",    appointmentDate: setTime(addDays(now, 3), 14, 0),  duration: 60, status: "upcoming",   type: "consultation", notes: "Review thrombophilia panel, karyotype, and uterine anatomy results." },
    { patientId: p5.id, doctorId: doc2.id, title: "Egg Freezing – Baseline Scan",              appointmentDate: setTime(addDays(now, 4), 8, 0),   duration: 30, status: "upcoming",   type: "follow_up",    notes: "Day 2 baseline scan before starting stimulation protocol." },
    { patientId: p7.id, doctorId: doc4.id, title: "Micro-TESE Pre-op Counselling",             appointmentDate: setTime(addDays(now, 5), 13, 0),  duration: 60, status: "upcoming",   type: "consultation", notes: "Review genetic results and discuss micro-TESE candidacy and donor sperm alternative." },
    { patientId: p4.id, doctorId: doc3.id, title: "Hysteroscopy Pre-op Assessment",            appointmentDate: setTime(addDays(now, 6), 15, 0),  duration: 45, status: "upcoming",   type: "consultation", notes: "Pre-operative assessment for diagnostic hysteroscopy." },
    // Next 2 weeks
    { patientId: p1.id, doctorId: doc1.id, title: "Egg Retrieval (OPU)",                       appointmentDate: setTime(addDays(now, 8), 8, 0),   duration: 60, status: "upcoming",   type: "procedure",    notes: "Oocyte pick-up under IV sedation. Target 8–12 follicles." },
    { patientId: p2.id, doctorId: doc2.id, title: "Post-IUI Follow-up",                        appointmentDate: setTime(addDays(now, 9), 9, 30),  duration: 30, status: "upcoming",   type: "follow_up",    notes: "Review luteal phase support and schedule beta hCG." },
    { patientId: p5.id, doctorId: doc2.id, title: "Egg Freezing – Monitoring Scan Day 6",      appointmentDate: setTime(addDays(now, 10), 8, 30), duration: 30, status: "upcoming",   type: "follow_up",    notes: "Follicle growth monitoring during stimulation." },
    { patientId: p6.id, doctorId: doc3.id, title: "Donor Egg Programme Counselling",           appointmentDate: setTime(addDays(now, 12), 14, 0), duration: 60, status: "upcoming",   type: "consultation", notes: "Discuss donor selection criteria, legal aspects, and timeline." },
    // Past – completed
    { patientId: p1.id, doctorId: doc1.id, title: "Initial Fertility Consultation",            appointmentDate: setTime(addDays(now, -35), 10, 0), duration: 60, status: "completed", type: "consultation", notes: "Comprehensive fertility workup initiated. PCOS features noted." },
    { patientId: p1.id, doctorId: doc1.id, title: "Hormonal Panel Review",                     appointmentDate: setTime(addDays(now, -20), 9, 0),  duration: 30, status: "completed", type: "follow_up",    notes: "AMH 0.9 ng/mL, FSH 11.8 IU/L. IVF recommended." },
    { patientId: p2.id, doctorId: doc2.id, title: "Laparoscopy & Adhesiolysis",                appointmentDate: setTime(addDays(now, -45), 8, 0),  duration: 90, status: "completed", type: "procedure",    notes: "Diagnostic laparoscopy confirmed endometriosis stage I. Adhesiolysis performed." },
    { patientId: p3.id, doctorId: doc1.id, title: "Egg Retrieval – IVF Cycle 2",              appointmentDate: setTime(addDays(now, -10), 8, 0),  duration: 60, status: "completed", type: "procedure",    notes: "10 oocytes retrieved, 8 mature. ICSI performed. 5 blastocysts biopsied for PGT-A." },
    { patientId: p5.id, doctorId: doc2.id, title: "Initial Egg Freezing Consultation",         appointmentDate: setTime(addDays(now, -15), 15, 0), duration: 60, status: "completed", type: "consultation", notes: "AMH 3.4 ng/mL. AFC 20. Excellent candidate. Protocol explained." },
    { patientId: p7.id, doctorId: doc4.id, title: "Semen Analysis Results Review",             appointmentDate: setTime(addDays(now, -8), 11, 0),  duration: 30, status: "completed", type: "follow_up",    notes: "Azoospermia confirmed on repeat analysis. Genetic testing ordered." },
    // Past – cancelled
    { patientId: p8.id, doctorId: doc1.id, title: "IVF Initial Consultation",                  appointmentDate: setTime(addDays(now, -5), 10, 0),  duration: 60, status: "cancelled", type: "consultation", notes: "Cancelled pending insurance pre-authorisation.", cancellationReason: "Insurance pre-authorisation not yet received." },
    { patientId: p4.id, doctorId: doc3.id, title: "Hysteroscopy Procedure",                    appointmentDate: setTime(addDays(now, -3), 9, 0),   duration: 60, status: "cancelled", type: "procedure",    notes: "Patient unwell on the day.", cancellationReason: "Patient reported fever and was advised to reschedule." },
    // Past – no show
    { patientId: p7.id, doctorId: doc4.id, title: "Andrology Follow-up",                       appointmentDate: setTime(addDays(now, -12), 14, 0), duration: 30, status: "no_show",   type: "follow_up",    notes: "Patient did not attend. No prior notice given." },
  ]);

  const allAppts = await db.select().from(schema.appointments);

  // ── 12. Appointment Activity Log ──────────────────────────────────────────────
  console.log("  → Seeding appointment activity logs...");
  const apptCompleted = allAppts.filter(a => a.status === "completed");
  const apptCancelled = allAppts.filter(a => a.status === "cancelled");
  const apptNoShow    = allAppts.filter(a => a.status === "no_show");
  if (apptCompleted.length > 0) {
    await db.insert(schema.appointmentActivityLog).values(
      apptCompleted.map(a => ({ appointmentId: a.id, userId: uAdmin.id, action: "status_changed_to_completed" as const }))
    );
  }
  if (apptCancelled.length > 0) {
    await db.insert(schema.appointmentActivityLog).values(
      apptCancelled.map(a => ({ appointmentId: a.id, userId: uAdmin.id, action: "status_changed_to_cancelled" as const }))
    );
  }
  if (apptNoShow.length > 0) {
    await db.insert(schema.appointmentActivityLog).values(
      apptNoShow.map(a => ({ appointmentId: a.id, userId: uStaff1.id, action: "status_changed_to_no_show" as const }))
    );
  }

  // ── 13. Medical Notes ─────────────────────────────────────────────────────────
  console.log("  → Seeding medical notes...");
  await db.insert(schema.medicalNotes).values([
    {
      patientId: p1.id, doctorId: doc1.id, authorId: uDoc1.id,
      noteType: "consultation", visitDate: addDays(now, -35),
      chiefComplaint: "Primary infertility for 4 years",
      historyOfPresentIllness: "35-year-old female presenting with 4 years of primary infertility. Menstrual cycles every 30–45 days (irregular). Husband's semen analysis normal. Previous workup at a general hospital showed borderline FSH. No prior fertility treatment.",
      physicalExamination: "BMI 26.1. Abdomen soft and non-tender. Pelvic examination: normal external genitalia, cervix healthy. Transvaginal ultrasound shows polycystic ovarian morphology bilaterally.",
      assessment: "Primary infertility with PCOS features and probable diminished ovarian reserve. Irregular cycles consistent with anovulation.",
      plan: "Order comprehensive hormonal panel (FSH, LH, AMH, E2, TSH, Prolactin) on cycle day 2–3. Antral follicle count. Repeat semen analysis for husband. Lifestyle counselling: weight management and regular exercise.",
      diagnosis: "Primary infertility (N97.0), PCOS (E28.2)",
      medications: "Folic acid 5 mg daily, Vitamin D 2000 IU daily",
      isAiGenerated: false,
    },
    {
      patientId: p1.id, doctorId: doc1.id, authorId: uDoc1.id,
      noteType: "follow_up", visitDate: addDays(now, -20),
      chiefComplaint: "Review of hormonal panel and ultrasound results",
      historyOfPresentIllness: "Results: AMH 0.9 ng/mL (low-normal), FSH 11.8 IU/L (borderline elevated), AFC 5 right + 4 left = 9 total. Husband semen analysis: 24 M/mL, 48% progressive motility, normal morphology (4%). Thyroid and prolactin normal.",
      assessment: "Diminished ovarian reserve confirmed. Male factor excluded. Anovulatory cycles secondary to PCOS. IVF with antagonist protocol recommended given low reserve.",
      plan: "Proceed with IVF cycle 1. Antagonist protocol: Gonal-F 300 IU SC daily from day 2. Cetrotide 0.25 mg SC from day 6. Monitoring scans every 2–3 days. Trigger with Decapeptyl 0.2 mg when lead follicle ≥ 18 mm.",
      diagnosis: "Diminished ovarian reserve (N97.0), PCOS (E28.2)",
      medications: "Gonal-F 300 IU SC daily, Cetrotide 0.25 mg SC (from day 6), Folic acid 5 mg daily",
      isAiGenerated: false,
    },
    {
      patientId: p2.id, doctorId: doc2.id, authorId: uDoc2.id,
      noteType: "consultation", visitDate: addDays(now, -50),
      chiefComplaint: "Secondary infertility for 20 months",
      historyOfPresentIllness: "31-year-old female with one previous natural conception (child aged 5). Trying for a second child for 20 months. Cycles regular at 28 days. HSG at outside clinic showed mild left-tube adhesion. Husband semen analysis normal.",
      physicalExamination: "BMI 22.8. Pelvic examination normal. Transvaginal ultrasound: uterus normal, ovaries normal morphology, AFC 14.",
      assessment: "Secondary infertility with mild tubal factor (left). Good ovarian reserve. Endometriosis stage I confirmed on laparoscopy. IUI with ovarian stimulation appropriate first-line.",
      plan: "Three IUI cycles with letrozole stimulation. Letrozole 5 mg days 3–7. Trigger with Ovidrel 250 mcg when lead follicle ≥ 18 mm. IUI 36 hours post-trigger. Reassess after 3 cycles.",
      diagnosis: "Secondary infertility (N97.1), Endometriosis stage I (N80.0)",
      medications: "Letrozole 5 mg days 3–7, Ovidrel 250 mcg SC (trigger), Progesterone pessaries 200 mg BD (luteal support)",
      isAiGenerated: false,
    },
    {
      patientId: p3.id, doctorId: doc1.id, authorId: uDoc1.id,
      noteType: "procedure", visitDate: addDays(now, -10),
      chiefComplaint: "Egg retrieval – IVF cycle 2",
      historyOfPresentIllness: "38-year-old female undergoing IVF cycle 2 following two previous biochemical pregnancies. Stimulated with Menopur 225 IU for 12 days. Peak E2 3,480 pg/mL. 10 follicles ≥ 14 mm on trigger day.",
      physicalExamination: "10 follicles aspirated under IV sedation with propofol. Procedure well-tolerated. No immediate complications.",
      assessment: "Successful egg retrieval. 10 oocytes retrieved, 8 mature (MII). ICSI performed. 5 blastocysts developed to day 5 and biopsied for PGT-A. Results expected in 5–7 days.",
      plan: "Freeze-all strategy. Await PGT-A results. Schedule FET in next cycle with endometrial preparation. Progesterone support to commence after retrieval.",
      diagnosis: "IVF egg retrieval (Z31.83), Recurrent pregnancy loss (N96)",
      medications: "Progesterone pessaries 400 mg BD, Aspirin 75 mg daily, Prednisolone 10 mg daily, Clexane 40 mg SC daily",
      isAiGenerated: true,
      aiSummary: "AI-assisted procedural note generated from intra-operative dictation. Reviewed, edited, and approved by Dr. Khalid Mansour.",
    },
    {
      patientId: p5.id, doctorId: doc2.id, authorId: uDoc2.id,
      noteType: "consultation", visitDate: addDays(now, -15),
      chiefComplaint: "Elective egg freezing – career planning",
      historyOfPresentIllness: "36-year-old female requesting elective oocyte cryopreservation. No fertility concerns. AMH 3.4 ng/mL (excellent). AFC 20. Regular 28-day cycles. No significant medical history. Non-smoker.",
      physicalExamination: "BMI 21.4. Pelvic examination normal. Ultrasound: uterus normal, both ovaries with good antral follicle count.",
      assessment: "Excellent candidate for elective egg freezing. Good ovarian reserve for age. Low risk of OHSS.",
      plan: "Commence stimulation on next cycle day 2. Gonal-F 225 IU SC daily. Cetrotide 0.25 mg from day 6. Target 15–20 mature oocytes. Trigger with Decapeptyl 0.2 mg to minimise OHSS risk.",
      diagnosis: "Elective oocyte cryopreservation (Z31.84)",
      medications: "Gonal-F 225 IU SC daily, Cetrotide 0.25 mg SC (from day 6), Folic acid 5 mg daily",
      isAiGenerated: false,
    },
    {
      patientId: p4.id, doctorId: doc3.id, authorId: uDoc3.id,
      noteType: "consultation", visitDate: addDays(now, -12),
      chiefComplaint: "Two early miscarriages – recurrent pregnancy loss workup",
      historyOfPresentIllness: "33-year-old female with unexplained infertility and two early miscarriages (6 weeks and 8 weeks). All standard fertility investigations normal. Referred for RPL workup.",
      physicalExamination: "BMI 23.5. Pelvic examination normal. 3D ultrasound: uterine cavity normal, no septum or polyp.",
      assessment: "Recurrent pregnancy loss, unexplained. Thrombophilia panel and karyotype ordered. Uterine anatomy normal. Antiphospholipid syndrome to be excluded.",
      plan: "Thrombophilia screen: Factor V Leiden, Prothrombin gene mutation, MTHFR, antiphospholipid antibodies. Peripheral blood karyotype for both partners. Hysteroscopy to exclude intrauterine pathology. Review in 4 weeks.",
      diagnosis: "Recurrent pregnancy loss (N96), Unexplained infertility (N97.9)",
      medications: "Folic acid 5 mg daily, Low-dose aspirin 75 mg daily (empirical)",
      isAiGenerated: false,
    },
    {
      patientId: p7.id, doctorId: doc4.id, authorId: uDoc4.id,
      noteType: "follow_up", visitDate: addDays(now, -8),
      chiefComplaint: "Review of semen analysis – azoospermia",
      historyOfPresentIllness: "Husband of Lara Nassar (FLV-2025-007). Repeat semen analysis confirms non-obstructive azoospermia (NOA). FSH 28 IU/L (elevated), LH 14 IU/L (elevated), testosterone low-normal. Testicular volume reduced bilaterally on ultrasound.",
      physicalExamination: "Testicular examination: bilateral small testes (8 mL each). No varicocele. Vas deferens palpable bilaterally.",
      assessment: "Non-obstructive azoospermia. Genetic testing ordered: karyotype and Y-chromosome microdeletion analysis. Micro-TESE candidacy to be determined after genetic results.",
      plan: "Karyotype and Y-chromosome microdeletion analysis. Refer to urology for micro-TESE evaluation if genetics favourable. Discuss donor sperm as alternative. Couple counselling recommended.",
      diagnosis: "Non-obstructive azoospermia (N46.11)",
      medications: "Clomiphene citrate 25 mg daily (empirical trial for 3 months)",
      isAiGenerated: false,
    },
    // Additional note by a different doctor on the same patient (multi-doctor scenario)
    {
      patientId: p1.id, doctorId: doc3.id, authorId: uDoc3.id,
      noteType: "general", visitDate: addDays(now, -18),
      chiefComplaint: "Second opinion on recurrent implantation failure risk",
      historyOfPresentIllness: "Referred by Dr. Khalid Mansour for assessment of recurrent implantation failure risk prior to IVF. Patient has no prior IVF cycles but has diminished ovarian reserve and PCOS.",
      assessment: "No evidence of uterine anomaly or thrombophilia on current workup. Recommend ERA (Endometrial Receptivity Analysis) test before first embryo transfer to personalise the transfer window.",
      plan: "ERA test to be ordered. Results will guide timing of embryo transfer. No additional thrombophilia treatment indicated at this stage.",
      diagnosis: "Pre-IVF assessment (Z31.83)",
      medications: "Continue current medications as prescribed by Dr. Mansour.",
      isAiGenerated: false,
    },
  ]);

  // ── 14. Lab Orders ────────────────────────────────────────────────────────────
  console.log("  → Seeding lab orders...");
  await db.insert(schema.labOrders).values([
    { patientId: p1.id, doctorId: doc1.id, orderNumber: "LO-2025-001", testName: "Hormonal Panel (FSH, LH, E2, AMH)",        category: "lab",       priority: "routine", status: "completed",        orderedDate: addDays(now, -35), collectedDate: addDays(now, -34), resultDate: addDays(now, -32), notes: "Day 3 cycle hormonal baseline", location: "in-clinic" },
    { patientId: p1.id, doctorId: doc1.id, orderNumber: "LO-2025-002", testName: "Thyroid Function Panel (TSH, FT3, FT4)",   category: "lab",       priority: "routine", status: "completed",        orderedDate: addDays(now, -35), collectedDate: addDays(now, -34), resultDate: addDays(now, -32), location: "in-clinic" },
    { patientId: p1.id, doctorId: doc1.id, orderNumber: "LO-2025-003", testName: "Antral Follicle Count (AFC)",               category: "radiology", priority: "routine", status: "completed",        orderedDate: addDays(now, -33), collectedDate: addDays(now, -33), resultDate: addDays(now, -33), location: "in-clinic" },
    { patientId: p1.id, doctorId: doc1.id, orderNumber: "LO-2025-004", testName: "Follicle Monitoring Scan – Day 8",          category: "radiology", priority: "urgent",  status: "ordered",          orderedDate: now, notes: "Stimulation monitoring during IVF cycle", location: "in-clinic" },
    { patientId: p2.id, doctorId: doc2.id, orderNumber: "LO-2025-005", testName: "Semen Analysis (Standard)",                 category: "lab",       priority: "routine", status: "completed",        orderedDate: addDays(now, -52), collectedDate: addDays(now, -51), resultDate: addDays(now, -49), location: "in-clinic" },
    { patientId: p2.id, doctorId: doc2.id, orderNumber: "LO-2025-006", testName: "Hysterosalpingography (HSG)",               category: "radiology", priority: "routine", status: "completed",        orderedDate: addDays(now, -48), collectedDate: addDays(now, -43), resultDate: addDays(now, -43), location: "partner-clinic", partnerClinicId: pc1.id, notes: "Referred to Al-Noor Radiology" },
    { patientId: p3.id, doctorId: doc1.id, orderNumber: "LO-2025-007", testName: "Karyotyping (Chromosomal Analysis)",        category: "lab",       priority: "routine", status: "completed",        orderedDate: addDays(now, -25), collectedDate: addDays(now, -24), resultDate: addDays(now, -18), location: "partner-clinic", partnerClinicId: pc1.id, notes: "PGT-A via Gulf Genetics Laboratory" },
    { patientId: p3.id, doctorId: doc1.id, orderNumber: "LO-2025-008", testName: "Pre-Transfer Endometrial Biopsy",           category: "pathology", priority: "routine", status: "completed",        orderedDate: addDays(now, -22), collectedDate: addDays(now, -20), resultDate: addDays(now, -16), location: "in-clinic" },
    { patientId: p3.id, doctorId: doc1.id, orderNumber: "LO-2025-009", testName: "Pre-Transfer Pelvic Ultrasound",            category: "radiology", priority: "urgent",  status: "ordered",          orderedDate: now, notes: "Endometrial thickness check before FET", location: "in-clinic" },
    { patientId: p4.id, doctorId: doc3.id, orderNumber: "LO-2025-010", testName: "Thrombophilia Screen",                      category: "lab",       priority: "routine", status: "processing",       orderedDate: addDays(now, -5), collectedDate: addDays(now, -4), location: "in-clinic" },
    { patientId: p4.id, doctorId: doc3.id, orderNumber: "LO-2025-011", testName: "Karyotyping (Both Partners)",               category: "lab",       priority: "routine", status: "sample_collected", orderedDate: addDays(now, -5), collectedDate: addDays(now, -4), location: "partner-clinic", partnerClinicId: pc1.id },
    { patientId: p5.id, doctorId: doc2.id, orderNumber: "LO-2025-012", testName: "AMH (Anti-Müllerian Hormone)",              category: "lab",       priority: "routine", status: "completed",        orderedDate: addDays(now, -18), collectedDate: addDays(now, -17), resultDate: addDays(now, -15), location: "in-clinic" },
    { patientId: p6.id, doctorId: doc3.id, orderNumber: "LO-2025-013", testName: "Hormonal Panel (FSH, LH, E2, AMH)",        category: "lab",       priority: "urgent",  status: "sample_collected", orderedDate: addDays(now, -1), collectedDate: now, notes: "POI monitoring – HRT adjustment", location: "in-clinic" },
    { patientId: p7.id, doctorId: doc4.id, orderNumber: "LO-2025-014", testName: "Advanced Semen Analysis + DNA Frag.",      category: "lab",       priority: "routine", status: "completed",        orderedDate: addDays(now, -12), collectedDate: addDays(now, -11), resultDate: addDays(now, -9), location: "in-clinic" },
    { patientId: p7.id, doctorId: doc4.id, orderNumber: "LO-2025-015", testName: "Karyotyping + Y-Chromosome Microdeletion", category: "lab",       priority: "routine", status: "processing",       orderedDate: addDays(now, -8), collectedDate: addDays(now, -7), location: "patient-country", notes: "Patient's home country lab – results to be uploaded when received" },
  ]);

  const allOrders = await db.select().from(schema.labOrders);
  const lo1  = allOrders.find(o => o.orderNumber === "LO-2025-001")!;
  const lo2  = allOrders.find(o => o.orderNumber === "LO-2025-002")!;
  const lo5  = allOrders.find(o => o.orderNumber === "LO-2025-005")!;
  const lo12 = allOrders.find(o => o.orderNumber === "LO-2025-012")!;
  const lo14 = allOrders.find(o => o.orderNumber === "LO-2025-014")!;

  // ── 15. Lab Results ───────────────────────────────────────────────────────────
  console.log("  → Seeding lab results...");
  await db.insert(schema.labResults).values([
    // Rania – hormonal panel
    { labOrderId: lo1.id, patientId: p1.id, parameter: "FSH",              value: "11.8", unit: "IU/L",  referenceRange: "3.0–10.0",  flag: "high",   interpretation: "Borderline elevated; consistent with diminished ovarian reserve.", isVisibleToPatient: true },
    { labOrderId: lo1.id, patientId: p1.id, parameter: "LH",               value: "7.2",  unit: "IU/L",  referenceRange: "2.0–15.0",  flag: "normal", interpretation: "Within normal range.", isVisibleToPatient: true },
    { labOrderId: lo1.id, patientId: p1.id, parameter: "Estradiol (E2)",   value: "38",   unit: "pg/mL", referenceRange: "25–75",     flag: "normal", interpretation: "Normal day 3 oestradiol.", isVisibleToPatient: true },
    { labOrderId: lo1.id, patientId: p1.id, parameter: "AMH",              value: "0.9",  unit: "ng/mL", referenceRange: "1.0–3.5",   flag: "low",    interpretation: "Low AMH; diminished ovarian reserve confirmed.", isVisibleToPatient: true },
    // Rania – thyroid
    { labOrderId: lo2.id, patientId: p1.id, parameter: "TSH",              value: "2.3",  unit: "mIU/L", referenceRange: "0.4–4.0",   flag: "normal", interpretation: "Normal thyroid function.", isVisibleToPatient: true },
    { labOrderId: lo2.id, patientId: p1.id, parameter: "Free T4",          value: "1.3",  unit: "ng/dL", referenceRange: "0.8–1.8",   flag: "normal", interpretation: "Normal.", isVisibleToPatient: true },
    { labOrderId: lo2.id, patientId: p1.id, parameter: "Free T3",          value: "3.1",  unit: "pg/mL", referenceRange: "2.3–4.2",   flag: "normal", interpretation: "Normal.", isVisibleToPatient: true },
    // Hana – semen analysis (husband)
    { labOrderId: lo5.id, patientId: p2.id, parameter: "Sperm Concentration",  value: "26", unit: "M/mL", referenceRange: "≥16",    flag: "normal", interpretation: "Normal sperm concentration.", isVisibleToPatient: false },
    { labOrderId: lo5.id, patientId: p2.id, parameter: "Progressive Motility", value: "52", unit: "%",    referenceRange: "≥42",    flag: "normal", interpretation: "Normal progressive motility.", isVisibleToPatient: false },
    { labOrderId: lo5.id, patientId: p2.id, parameter: "Normal Morphology",    value: "5",  unit: "%",    referenceRange: "≥4",     flag: "normal", interpretation: "Normal morphology (Kruger strict criteria).", isVisibleToPatient: false },
    // Yasmine – AMH
    { labOrderId: lo12.id, patientId: p5.id, parameter: "AMH",            value: "3.4",  unit: "ng/mL", referenceRange: "1.0–3.5",   flag: "normal", interpretation: "Excellent ovarian reserve for age 36.", isVisibleToPatient: true },
    // Lara's husband – advanced semen analysis
    { labOrderId: lo14.id, patientId: p7.id, parameter: "Sperm Concentration",    value: "0",   unit: "M/mL", referenceRange: "≥16", flag: "low",    interpretation: "Azoospermia confirmed on repeat analysis.", isVisibleToPatient: false },
    { labOrderId: lo14.id, patientId: p7.id, parameter: "DNA Fragmentation Index", value: "N/A", unit: "%",    referenceRange: "<15", flag: "normal", interpretation: "DFI not applicable in azoospermia.", isVisibleToPatient: false },
  ]);

  // ── 16. Invoices ──────────────────────────────────────────────────────────────
  console.log("  → Seeding invoices...");
  await db.insert(schema.invoices).values([
    { patientId: p1.id, invoiceNumber: "INV-2025-001", issueDate: addDays(now, -35), dueDate: addDays(now, -20), subtotal: "620.00",  discountAmount: "0.00",   totalAmount: "620.00",  paidAmount: "620.00",  status: "paid",    currency: "USD" as const, paymentMethod: "credit_card",  paymentDate: addDays(now, -25), notes: "Initial consultation + hormonal panel + thyroid function", createdById: uAdmin.id },
    { patientId: p1.id, invoiceNumber: "INV-2025-002", issueDate: addDays(now, -20), dueDate: addDays(now, 10),  subtotal: "9200.00", discountAmount: "500.00", totalAmount: "8700.00", paidAmount: "4350.00", status: "partial", currency: "USD" as const, paymentMethod: "bank_transfer",                                notes: "IVF Full Cycle – 50% deposit received. Balance due at egg retrieval.", createdById: uAdmin.id },
    { patientId: p2.id, invoiceNumber: "INV-2025-003", issueDate: addDays(now, -50), dueDate: addDays(now, -35), subtotal: "1490.00", discountAmount: "0.00",   totalAmount: "1490.00", paidAmount: "1490.00", status: "paid",    currency: "USD" as const, paymentMethod: "insurance",    paymentDate: addDays(now, -40), notes: "Laparoscopy + initial consultation", createdById: uAdmin.id },
    { patientId: p2.id, invoiceNumber: "INV-2025-004", issueDate: addDays(now, -3),  dueDate: addDays(now, 12),  subtotal: "1300.00", discountAmount: "0.00",   totalAmount: "1300.00", paidAmount: "0.00",    status: "issued",  currency: "USD" as const, notes: "IUI Cycle 2 procedure", createdById: uAdmin.id },
    { patientId: p3.id, invoiceNumber: "INV-2025-005", issueDate: addDays(now, -10), dueDate: addDays(now, 5),   subtotal: "4550.00", discountAmount: "0.00",   totalAmount: "4550.00", paidAmount: "4550.00", status: "paid",    currency: "USD" as const, paymentMethod: "credit_card",  paymentDate: addDays(now, -8),  notes: "Egg retrieval + ICSI + PGT-A biopsy + embryo culture", createdById: uAdmin.id },
    { patientId: p3.id, invoiceNumber: "INV-2025-006", issueDate: now,              dueDate: addDays(now, 15),  subtotal: "1600.00", discountAmount: "0.00",   totalAmount: "1600.00", paidAmount: "0.00",    status: "issued",  currency: "USD" as const, notes: "Frozen embryo transfer (FET)", createdById: uAdmin.id },
    { patientId: p5.id, invoiceNumber: "INV-2025-007", issueDate: addDays(now, -18), dueDate: addDays(now, -3),  subtotal: "3070.00", discountAmount: "370.00", totalAmount: "2700.00", paidAmount: "0.00",    status: "overdue", currency: "USD" as const, notes: "Egg freezing consultation + AMH + AFC + monitoring scans", createdById: uAdmin.id },
    { patientId: p4.id, invoiceNumber: "INV-2025-008", issueDate: addDays(now, -2),  dueDate: addDays(now, 13),  subtotal: "380.00",  discountAmount: "0.00",   totalAmount: "380.00",  paidAmount: "0.00",    status: "draft",   currency: "USD" as const, notes: "Initial fertility consultation", createdById: uAdmin.id },
    { patientId: p7.id, invoiceNumber: "INV-2025-009", issueDate: addDays(now, -8),  dueDate: addDays(now, 7),   subtotal: "440.00",  discountAmount: "0.00",   totalAmount: "440.00",  paidAmount: "440.00",  status: "paid",    currency: "USD" as const, paymentMethod: "cash",         paymentDate: addDays(now, -6),  notes: "Advanced semen analysis + DNA fragmentation", createdById: uAdmin.id },
    { patientId: p6.id, invoiceNumber: "INV-2025-010", issueDate: addDays(now, -5),  dueDate: addDays(now, 10),  subtotal: "510.00",  discountAmount: "0.00",   totalAmount: "510.00",  paidAmount: "0.00",    status: "issued",  currency: "USD" as const, notes: "Hormonal panel + follow-up consultation", createdById: uAdmin.id },
  ]);

  const allInvoices = await db.select().from(schema.invoices);
  const inv1 = allInvoices.find(i => i.invoiceNumber === "INV-2025-001")!;
  const inv2 = allInvoices.find(i => i.invoiceNumber === "INV-2025-002")!;
  const inv3 = allInvoices.find(i => i.invoiceNumber === "INV-2025-003")!;
  const inv5 = allInvoices.find(i => i.invoiceNumber === "INV-2025-005")!;
  const inv6 = allInvoices.find(i => i.invoiceNumber === "INV-2025-006")!;
  const inv9 = allInvoices.find(i => i.invoiceNumber === "INV-2025-009")!;

  // ── 17. Invoice Items ─────────────────────────────────────────────────────────
  console.log("  → Seeding invoice items...");
  await db.insert(schema.invoiceItems).values([
    { invoiceId: inv1.id, description: "Initial Fertility Consultation",          quantity: 1, unitPrice: "380.00",  totalPrice: "380.00"  },
    { invoiceId: inv1.id, description: "Hormonal Panel (FSH, LH, E2, AMH)",      quantity: 1, unitPrice: "240.00",  totalPrice: "240.00"  },
    { invoiceId: inv2.id, description: "IVF Full Cycle (Protocol + Monitoring)",  quantity: 1, unitPrice: "9200.00", totalPrice: "9200.00" },
    { invoiceId: inv2.id, description: "Returning Patient Loyalty Discount",      quantity: 1, unitPrice: "-500.00", totalPrice: "-500.00" },
    { invoiceId: inv3.id, description: "Laparoscopy & Adhesiolysis",              quantity: 1, unitPrice: "1300.00", totalPrice: "1300.00" },
    { invoiceId: inv3.id, description: "Initial Fertility Consultation",          quantity: 1, unitPrice: "190.00",  totalPrice: "190.00"  },
    { invoiceId: inv5.id, description: "Egg Retrieval (OPU)",                     quantity: 1, unitPrice: "2950.00", totalPrice: "2950.00" },
    { invoiceId: inv5.id, description: "ICSI Fertilisation",                      quantity: 1, unitPrice: "800.00",  totalPrice: "800.00"  },
    { invoiceId: inv5.id, description: "PGT-A Biopsy & Culture (per embryo)",     quantity: 5, unitPrice: "160.00",  totalPrice: "800.00"  },
    { invoiceId: inv6.id, description: "Frozen Embryo Transfer (FET)",            quantity: 1, unitPrice: "1600.00", totalPrice: "1600.00" },
    { invoiceId: inv9.id, description: "Advanced Semen Analysis",                 quantity: 1, unitPrice: "280.00",  totalPrice: "280.00"  },
    { invoiceId: inv9.id, description: "Follow-up Consultation (Andrology)",      quantity: 1, unitPrice: "160.00",  totalPrice: "160.00"  },
  ]);

  // ── 18. Offers ────────────────────────────────────────────────────────────────
  console.log("  → Seeding offers...");
  await db.insert(schema.offers).values([
    { patientId: p1.id, title: "IVF Returning Patient Discount",    code: "IVF-RETURN-500",  description: "AED 500 discount for returning IVF patients on their second cycle.",           discountType: "fixed",      discountValue: "500.00", validFrom: addDays(now, -60), validUntil: addDays(now, 90),  status: "active" },
    { patientId: p2.id, title: "3-Cycle IUI Bundle Saving",         code: "IUI-3CYCLE-300",  description: "AED 300 saving when booking a 3-cycle IUI bundle upfront.",                    discountType: "fixed",      discountValue: "300.00", validFrom: addDays(now, -30), validUntil: addDays(now, 60),  status: "active" },
    { patientId: p5.id, title: "Egg Freezing Early-Bird Offer",     code: "EGGFREEZE-EB",    description: "AED 370 discount on egg freezing package for new patients booking this month.", discountType: "fixed",      discountValue: "370.00", validFrom: addDays(now, -15), validUntil: addDays(now, 45),  status: "active" },
    {                   title: "New Patient Welcome Offer",          code: "WELCOME-NEW-50",  description: "AED 50 welcome discount on the first consultation for new patients.",           discountType: "fixed",      discountValue: "50.00",  validFrom: addDays(now, -90), validUntil: addDays(now, 90),  status: "active" },
    {                   title: "Ramadan Fertility Package",          code: "RAMADAN-2025",    description: "10% discount on all IVF packages during Ramadan 2025.",                        discountType: "percentage", discountValue: "10.00",  validFrom: addDays(now, -10), validUntil: addDays(now, 20),  status: "active" },
  ]);

  // ── 19. Sales Notes ───────────────────────────────────────────────────────────
  console.log("  → Seeding sales notes...");
  await db.insert(schema.salesNotes).values([
    { patientId: p1.id, authorId: uStaff1.id, content: "Patient is highly motivated to proceed with IVF. Discussed instalment payment plan — she is interested in splitting the balance into 3 monthly payments." },
    { patientId: p1.id, authorId: uStaff1.id, content: "Follow-up call completed. Patient confirmed she will start the IVF cycle next month. Husband is fully supportive and will attend the consent signing appointment." },
    { patientId: p2.id, authorId: uStaff1.id, content: "Patient asked about IVF costs if the third IUI cycle is unsuccessful. Provided detailed cost breakdown and financing options brochure." },
    { patientId: p3.id, authorId: uStaff2.id, content: "Patient enquired about embryo storage fees beyond the first year. Sent annual storage pricing sheet and renewal process information via email." },
    { patientId: p3.id, authorId: uStaff2.id, content: "PGT-A results received: 2 euploid embryos out of 5 biopsied. Patient informed and very relieved. FET scheduled for next cycle." },
    { patientId: p5.id, authorId: uStaff1.id, content: "Patient considering egg freezing for 2–3 years. Discussed long-term storage costs and annual renewal fees. Sent information packet." },
    { patientId: p5.id, authorId: uStaff1.id, content: "Overdue invoice INV-2025-007 discussed. Patient requested a 2-week extension. Agreed and updated due date in the system." },
    { patientId: p7.id, authorId: uStaff2.id, content: "Couple attended joint consultation. Both partners engaged and asking detailed questions about micro-TESE and donor sperm options. Counselling referral made." },
    { patientId: p4.id, authorId: uStaff1.id, content: "Patient called to enquire about RPL workup timeline. Explained that karyotype results take 3–4 weeks. Patient satisfied with explanation." },
  ]);

  // ── 20. Sales Tasks ───────────────────────────────────────────────────────────
  console.log("  → Seeding sales tasks...");
  await db.insert(schema.salesTasks).values([
    { patientId: p1.id, assignedToId: uStaff1.id, title: "Send IVF protocol and medication guide via email",          priority: "high",   status: "completed", dueDate: addDays(now, -15) },
    { patientId: p1.id, assignedToId: uStaff1.id, title: "Confirm insurance pre-authorisation for IVF cycle",         priority: "high",   status: "pending",   dueDate: addDays(now, 3)  },
    { patientId: p1.id, assignedToId: uStaff1.id, title: "Schedule pre-cycle blood work appointment",                  priority: "medium", status: "pending",   dueDate: addDays(now, 5)  },
    { patientId: p2.id, assignedToId: uStaff1.id, title: "Call patient after IUI Cycle 2 procedure",                  priority: "high",   status: "pending",   dueDate: addDays(now, 2)  },
    { patientId: p2.id, assignedToId: uStaff2.id, title: "Send IVF cost breakdown if IUI Cycle 3 is unsuccessful",    priority: "medium", status: "pending",   dueDate: addDays(now, 14) },
    { patientId: p3.id, assignedToId: uStaff2.id, title: "Prepare FET consent forms and patient checklist",            priority: "high",   status: "completed", dueDate: addDays(now, -2) },
    { patientId: p3.id, assignedToId: uStaff2.id, title: "Schedule post-FET beta hCG blood test (day 14)",             priority: "high",   status: "pending",   dueDate: addDays(now, 16) },
    { patientId: p5.id, assignedToId: uStaff1.id, title: "Follow up on overdue invoice INV-2025-007",                  priority: "high",   status: "pending",   dueDate: addDays(now, 1)  },
    { patientId: p5.id, assignedToId: uStaff1.id, title: "Send egg freezing storage agreement for signature",          priority: "medium", status: "pending",   dueDate: addDays(now, 7)  },
    { patientId: p7.id, assignedToId: uStaff2.id, title: "Arrange couple counselling session referral",                priority: "high",   status: "pending",   dueDate: addDays(now, 5)  },
    { patientId: p4.id, assignedToId: uStaff1.id, title: "Chase karyotype results from Gulf Genetics Laboratory",      priority: "medium", status: "pending",   dueDate: addDays(now, 10) },
    { patientId: p8.id, assignedToId: uStaff1.id, title: "Follow up on insurance pre-authorisation for Fatima",        priority: "high",   status: "pending",   dueDate: addDays(now, 2)  },
  ]);

  // ── 21. Leads ─────────────────────────────────────────────────────────────────
  console.log("  → Seeding leads...");
  await db.insert(schema.leads).values([
    {
      firstName: "Salma", lastName: "Al-Rashidi",
      email: "salma.rashidi@gmail.com", phone: "+971-50-901-1001",
      leadSource: "website" as any, leadStatus: "contacted-awaiting-info", rating: "⭐⭐⭐⭐⭐ Excellent Candidate",
      assignedStaffId: uStaff1.id,
      salesNote: "Submitted enquiry form asking about IVF costs and success rates. Mentioned 3 years of trying. Wants a callback this week.",
      lastContactDate: addDays(now, -1),
    },
    {
      firstName: "Nour", lastName: "Hamdan",
      email: "nour.hamdan@outlook.com", phone: "+971-55-902-2002",
      leadSource: "external-referral" as any, leadStatus: "attempted-to-contact", rating: "⭐⭐⭐ Good Candidate",
      assignedStaffId: uStaff1.id,
      salesNote: "Referred by Dr. Amira Saleh. 34 years old, interested in egg freezing before starting a family. Initial call made — appointment not yet booked.",
      lastContactDate: addDays(now, -3),
    },
    {
      firstName: "Mona", lastName: "Khalil",
      email: "mona.khalil@icloud.com", phone: "+971-52-903-3003",
      leadSource: "instagram" as any, leadStatus: "doctor-feedback-shared", rating: "⭐⭐⭐⭐⭐ Excellent Candidate",
      assignedStaffId: uStaff2.id,
      salesNote: "Found clinic via Instagram. 29 years old, PCOS diagnosis. Husband semen analysis normal. Very interested in IUI. Consultation booked.",
      lastContactDate: addDays(now, -2),
    },
    {
      firstName: "Hessa", lastName: "Al-Nuaimi",
      email: "hessa.nuaimi@gmail.com", phone: "+971-56-904-4004",
      leadSource: "organic" as any, leadStatus: "follow-up-negotiation", rating: "⭐⭐⭐ Good Candidate",
      assignedStaffId: uStaff2.id,
      salesNote: "Walked in requesting information about IVF. 37 years old, one previous failed IVF at another clinic. Treatment proposal sent.",
      lastContactDate: addDays(now, -5),
    },
    {
      firstName: "Reem", lastName: "Saif",
      email: "reem.saif@gmail.com", phone: "+971-54-905-5005",
      leadSource: "external-referral" as any, leadStatus: "lost", rating: "⭐ Requires Further Evaluation",
      assignedStaffId: uStaff1.id,
      salesNote: "Referred by a friend. Contacted twice but no response. Marked as lost after 2 weeks of no reply.",
      lastContactDate: addDays(now, -14),
    },
    {
      firstName: "Amal", lastName: "Bin Saeed",
      email: "amal.binsaeed@hotmail.com", phone: "+971-50-906-6006",
      leadSource: "website" as any, leadStatus: "converted", rating: "⭐⭐⭐⭐⭐ Excellent Candidate",
      assignedStaffId: uStaff1.id,
      salesNote: "Converted to patient FLV-2025-001 (Rania Yousef). Originally enquired via website. Successfully onboarded.",
      lastContactDate: addDays(now, -36),
    },
  ]);

  const allLeads = await db.select().from(schema.leads);
  const lead1 = allLeads.find(l => l.email === "salma.rashidi@gmail.com")!;
  const lead2 = allLeads.find(l => l.email === "nour.hamdan@outlook.com")!;
  const lead3 = allLeads.find(l => l.email === "mona.khalil@icloud.com")!;
  const lead4 = allLeads.find(l => l.email === "hessa.nuaimi@gmail.com")!;
  const lead5 = allLeads.find(l => l.email === "reem.saif@gmail.com")!;
  // ── 8. Medical Intake (Lead → Patient onboarding forms) ───────────────────────
  console.log("  → Seeding medical intake...");
  await db.insert(schema.medicalIntake).values([
    {
      leadId: lead1.id,
      infertilityType: "primary",
      infertilityDuration: "4 years",
      profession: "Teacher",
      marriageDate: new Date("2019-06-15"),
      isFirstMarriage: true,
      partnerIsFirstMarriage: true,
      hasCivilMarriageCertificate: true,
      heightCm: "163.0",
      weightKg: "69.0",
      bmi: "26.2",
      gravida: 0, para: 0, abortus: 0, livingChildren: 0,
      cycleRegularity: "irregular",
      cycleLengthDays: 45,
      systemicDiseases: JSON.stringify({ diabetes: false, hypertension: false, thyroid: false, heartDisease: false, kidneyDisease: false, liverDisease: false, epilepsy: false, asthma: false, anemia: false, coagulationDisorder: false, autoimmune: false, cancer: false, other: "PCOS (diagnosed 2018)" }),
      smoking: "never",
      alcohol: "never",
      currentMedications: "Folic acid 5 mg daily, Vitamin D 2000 IU daily",
      previousTests: JSON.stringify([{ name: "AMH", date: "2023-01", result: "1.2 ng/mL" }, { name: "TSH", date: "2023-01", result: "2.1 mIU/L" }, { name: "Prolactin", date: "2023-01", result: "18 ng/mL" }]),
      additionalNotes: "Patient is anxious but motivated. Partner's SA normal at external lab.",
    },
    {
      leadId: lead2.id,
      infertilityType: "secondary",
      infertilityDuration: "20 months",
      profession: "Marketing Manager",
      marriageDate: new Date("2017-09-20"),
      isFirstMarriage: true,
      partnerIsFirstMarriage: true,
      hasCivilMarriageCertificate: true,
      heightCm: "168.0",
      weightKg: "61.0",
      bmi: "21.6",
      gravida: 1, para: 1, abortus: 0, livingChildren: 1,
      cycleRegularity: "regular",
      cycleLengthDays: 28,
      surgicalHistory: JSON.stringify([{ procedure: "Adhesiolysis", date: "2021", notes: "External hospital" }]),
      artHistory: JSON.stringify([{ type: "Other", date: "2021", clinic: "City Hospital", protocol: "Laparoscopy", result: "Adhesiolysis performed", notes: "" }]),
      systemicDiseases: JSON.stringify({ diabetes: false, hypertension: false, thyroid: false, heartDisease: false, kidneyDisease: false, liverDisease: false, epilepsy: false, asthma: false, anemia: false, coagulationDisorder: false, autoimmune: false, cancer: false, other: "Endometriosis Stage I" }),
      smoking: "never",
      alcohol: "never",
      previousTests: JSON.stringify([{ name: "AMH", date: "2023-06", result: "2.8 ng/mL" }, { name: "TSH", date: "2023-06", result: "1.9 mIU/L" }]),
      additionalNotes: "One child aged 5. Secondary infertility workup.",
    },
    {
      leadId: lead3.id,
      infertilityType: "primary",
      infertilityDuration: "3 years",
      profession: "Pharmacist",
      marriageDate: new Date("2020-03-10"),
      isFirstMarriage: true,
      partnerIsFirstMarriage: true,
      hasCivilMarriageCertificate: true,
      heightCm: "160.0",
      weightKg: "58.0",
      bmi: "22.7",
      gravida: 2, para: 0, abortus: 2, livingChildren: 0,
      miscarriageHistory: JSON.stringify([{ date: "2022-04", gestationalAge: "6 weeks", notes: "Biochemical" }, { date: "2023-09", gestationalAge: "5 weeks", notes: "Biochemical" }]),
      surgicalHistory: JSON.stringify([{ procedure: "Hysteroscopy", date: "2023", notes: "Normal" }]),
      artHistory: JSON.stringify([
        { type: "IVF", date: "2023", clinic: "External Clinic A", protocol: "Antagonist", eggsCollected: 8, embryosFertilized: 5, embryosTransferred: 2, embryoQuality: "Grade B", result: "Biochemical pregnancy", notes: "" },
        { type: "IVF", date: "2024", clinic: "External Clinic A", protocol: "Antagonist", eggsCollected: 6, embryosFertilized: 4, embryosTransferred: 2, embryoQuality: "Grade B", result: "Biochemical pregnancy", notes: "" },
      ]),
      systemicDiseases: JSON.stringify({ diabetes: false, hypertension: false, thyroid: false, heartDisease: false, kidneyDisease: false, liverDisease: false, epilepsy: false, asthma: false, anemia: false, coagulationDisorder: false, autoimmune: false, cancer: false, other: "" }),
      smoking: "never",
      alcohol: "never",
      currentMedications: "Aspirin 75 mg daily, Folic acid 5 mg daily",
      previousTests: JSON.stringify([{ name: "AMH", date: "2024-01", result: "3.1 ng/mL" }, { name: "TSH", date: "2024-01", result: "2.4 mIU/L" }, { name: "Karyotype", date: "2023-11", result: "Normal 46XX" }]),
      additionalNotes: "Two biochemical pregnancies. Seeking second opinion. PGT-A recommended.",
    },
    {
      leadId: lead4.id,
      infertilityType: "primary",
      infertilityDuration: "5 years",
      profession: "Businesswoman",
      marriageDate: new Date("2015-11-05"),
      isFirstMarriage: true,
      partnerIsFirstMarriage: true,
      hasCivilMarriageCertificate: true,
      heightCm: "165.0",
      weightKg: "72.0",
      bmi: "26.4",
      gravida: 0, para: 0, abortus: 0, livingChildren: 0,
      artHistory: JSON.stringify([{ type: "IVF", date: "2022", clinic: "External Clinic B", protocol: "Long protocol", eggsCollected: 3, embryosFertilized: 1, embryosTransferred: 1, embryoQuality: "Grade C", result: "Failed – no blastocysts", notes: "" }]),
      systemicDiseases: JSON.stringify({ diabetes: false, hypertension: false, thyroid: false, heartDisease: false, kidneyDisease: false, liverDisease: false, epilepsy: false, asthma: false, anemia: false, coagulationDisorder: false, autoimmune: false, cancer: false, other: "Diminished ovarian reserve" }),
      smoking: "never",
      alcohol: "never",
      currentMedications: "DHEA 75 mg daily (self-prescribed)",
      previousTests: JSON.stringify([{ name: "AMH", date: "2024-01", result: "0.4 ng/mL" }, { name: "AFC", date: "2024-01", result: "3" }, { name: "TSH", date: "2024-01", result: "3.2 mIU/L" }]),
      additionalNotes: "DOR. Considering donor egg if own-egg IVF fails.",
    },
  ]);


  // ── 22. Lead Communications ───────────────────────────────────────────────────
  console.log("  → Seeding lead communications...");
  await db.insert(schema.leadCommunications).values([
    { leadId: lead1.id, note: "[Email – Inbound] IVF Enquiry: 'Hi, I would like to know more about IVF treatment costs and success rates at your clinic. We have been trying for 3 years.'", createdBy: uStaff1.id },
    { leadId: lead1.id, note: "[Call – Outbound] Initial Callback: Called Salma. Explained IVF process, costs, and success rates. She is very interested. Recommended booking an initial consultation. Will call back tomorrow to confirm.", createdBy: uStaff1.id },
    { leadId: lead2.id, note: "[Call – Outbound] Egg Freezing Follow-up: Called Nour regarding egg freezing consultation. She is interested but wants to discuss with her husband first. Will follow up next week.", createdBy: uStaff1.id },
    { leadId: lead3.id, note: "[WhatsApp – Inbound] IUI Request: 'Hi, I saw your Instagram post about IUI. I have PCOS and my husband's tests are normal. Can I book a consultation?'", createdBy: uStaff2.id },
    { leadId: lead3.id, note: "[Email – Outbound] Consultation Confirmation: Dear Mona, thank you for reaching out. We are pleased to confirm your consultation appointment with Dr. Amira Saleh. Please bring any previous test results.", createdBy: uStaff2.id },
    { leadId: lead4.id, note: "[Walk-in – Inbound] Patient walked in requesting IVF information. Provided clinic brochure and treatment package pricing. Expressed interest in a second opinion after failed IVF at another clinic.", createdBy: uStaff2.id },
    { leadId: lead4.id, note: "[Email – Outbound] Treatment Proposal Sent: Dear Hessa, please find attached the IVF Standard Package proposal tailored to your case. We look forward to hearing from you.", createdBy: uStaff2.id },
  ]);

  // ── 23. Lead Documents ────────────────────────────────────────────────────────
  console.log("  → Seeding lead documents...");
  await db.insert(schema.leadDocuments).values([
    { leadId: lead1.id, fileKey: "leads/ivf-brochure-2025.pdf",          fileUrl: "https://example.com/docs/ivf-brochure-2025.pdf",          fileName: "IVF Information Brochure 2025",          mimeType: "application/pdf", uploadedBy: uStaff1.id },
    { leadId: lead1.id, fileKey: "leads/ivf-pricing-2025.pdf",           fileUrl: "https://example.com/docs/ivf-pricing-2025.pdf",           fileName: "IVF Package Pricing Sheet",              mimeType: "application/pdf", uploadedBy: uStaff1.id },
    { leadId: lead3.id, fileKey: "leads/iui-overview.pdf",               fileUrl: "https://example.com/docs/iui-overview.pdf",               fileName: "IUI Treatment Overview",                 mimeType: "application/pdf", uploadedBy: uStaff2.id },
    { leadId: lead4.id, fileKey: "leads/proposal-hessa-nuaimi.pdf",      fileUrl: "https://example.com/docs/proposal-hessa-nuaimi.pdf",      fileName: "IVF Standard Package Proposal – Hessa", mimeType: "application/pdf", uploadedBy: uStaff2.id },
  ]);

  // ── 24. Notifications ─────────────────────────────────────────────────────────
  console.log("  → Seeding notifications...");
  await db.insert(schema.notifications).values([
    // Admin
    { userId: uAdmin.id, type: "appointment_reminder",    title: "3 Appointments Today",              message: "Today: Rania Yousef – Follicle Monitoring at 8:30 AM, Dina Farouk – Pre-Transfer Check at 10:00 AM, Noura Al-Hamdan – POI Monitoring at 11:30 AM.", isRead: false },
    { userId: uAdmin.id, type: "invoice_issued",           title: "New Invoice Issued",                message: "Invoice INV-2025-006 for AED 1,600 issued to Dina Farouk for Frozen Embryo Transfer.", isRead: false },
    { userId: uAdmin.id, type: "payment_confirmed",        title: "Payment Received",                  message: "Payment of AED 4,550 confirmed from Dina Farouk for Invoice INV-2025-005 (Egg Retrieval + ICSI + PGT-A).", isRead: true },
    { userId: uAdmin.id, type: "lab_result_ready",         title: "Lab Results Ready for Review",      message: "Hormonal panel results ready for Rania Yousef. FSH 11.8 IU/L (borderline elevated). Please review.", isRead: false },
    { userId: uAdmin.id, type: "appointment_cancellation", title: "Appointment Cancelled",             message: "Fatima Al-Zaabi's IVF consultation was cancelled. Reason: Insurance pre-authorisation not yet received.", isRead: true },
    { userId: uAdmin.id, type: "general",                  title: "Overdue Invoice Alert",             message: "Invoice INV-2025-007 for Yasmine Benali (AED 2,700) is overdue. Please follow up.", isRead: false },
    { userId: uAdmin.id, type: "general",                  title: "New Lead Received",                 message: "New lead: Salma Al-Rashidi submitted an IVF enquiry via the website. Assigned to Sara Qassem.", isRead: false },
    // Staff
    { userId: uStaff1.id, type: "appointment_reminder",   title: "Task Due Today",                    message: "Task 'Call patient after IUI Cycle 2 procedure' for Hana Al-Khatib is due today.", isRead: false },
    { userId: uStaff1.id, type: "general",                 title: "Follow Up: Overdue Invoice",        message: "Invoice INV-2025-007 for Yasmine Benali is overdue. Please contact the patient to arrange payment.", isRead: false },
    // Doctors
    { userId: uDoc1.id,   type: "appointment_reminder",   title: "IVF Consultation Tomorrow",         message: "You have an IVF Cycle Planning Consultation with Rania Yousef tomorrow at 9:00 AM.", isRead: false },
    { userId: uDoc1.id,   type: "lab_result_ready",        title: "Lab Results for Review",            message: "Hormonal panel results for Rania Yousef are ready for your review. AMH 0.9 ng/mL (low).", isRead: false },
    { userId: uDoc2.id,   type: "appointment_reminder",   title: "IUI Procedure Tomorrow",            message: "IUI Cycle 2 procedure for Hana Al-Khatib is scheduled for tomorrow at 10:30 AM.", isRead: false },
    // Patients
    { userId: uPat1.id,   type: "appointment_reminder",   title: "Appointment Reminder",              message: "Your IVF Cycle Planning Consultation is tomorrow at 9:00 AM with Dr. Khalid Mansour. Please arrive 15 minutes early.", isRead: false },
    { userId: uPat1.id,   type: "invoice_issued",          title: "Invoice Balance Due",               message: "Your invoice INV-2025-002 has a balance of AED 4,350 due. Please contact the billing team to arrange payment.", isRead: false },
    { userId: uPat2.id,   type: "appointment_reminder",   title: "IUI Procedure Tomorrow",            message: "Your IUI Cycle 2 procedure is scheduled for tomorrow at 10:30 AM. Please follow the preparation instructions provided.", isRead: false },
    { userId: uPat3.id,   type: "appointment_reminder",   title: "Embryo Transfer in 2 Days",         message: "Your Frozen Embryo Transfer is scheduled in 2 days. Please continue all prescribed medications and maintain a full bladder on the day.", isRead: false },
  ]);

  console.log("\n✅ Fertiliv database fully reset and reseeded with comprehensive fresh data!");
  console.log(`   Users: ${allUsers.length} | Doctors: ${allDoctors.length} | Patients: ${allPatients.length}`);
  console.log(`   Appointments: ${allAppts.length} | Lab Orders: ${allOrders.length} | Invoices: ${allInvoices.length}`);
  console.log(`   Leads: ${allLeads.length} | Packages: ${allPackages.length}`);
  await connection.end();
}

main().catch(e => {
  console.error("❌ Seed failed:", e);
  process.exit(1);
});

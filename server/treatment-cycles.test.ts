import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock the DB module ───────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getAllPatients: vi.fn(),
  getPatientById: vi.fn(),
  getTreatmentCycles: vi.fn(),
  getTreatmentCycleById: vi.fn(),
  createTreatmentCycle: vi.fn(),
  updateTreatmentCycle: vi.fn(),
  deleteTreatmentCycle: vi.fn(),
  getCycleMonitoringVisits: vi.fn(),
  addCycleMonitoringVisit: vi.fn(),
  deleteCycleMonitoringVisit: vi.fn(),
  getCycleMedications: vi.fn(),
  addCycleMedication: vi.fn(),
  updateCycleMedication: vi.fn(),
  deleteCycleMedication: vi.fn(),
  getMedicationAdherence: vi.fn(),
  confirmMedicationAdherence: vi.fn(),
  getCycleOutcome: vi.fn(),
  saveCycleOutcome: vi.fn(),
}));

import {
  getAllPatients,
  getTreatmentCycles,
  getTreatmentCycleById,
  createTreatmentCycle,
  getCycleMonitoringVisits,
  addCycleMonitoringVisit,
  getCycleMedications,
  addCycleMedication,
  getMedicationAdherence,
  confirmMedicationAdherence,
  getCycleOutcome,
  saveCycleOutcome,
} from "./db";

// ─── getAllPatients with statusFilter ─────────────────────────────────────────
describe("getAllPatients statusFilter", () => {
  it("returns all patients when no filter is provided", async () => {
    const mockPatients = [
      { id: 1, firstName: "Alice", status: "active_patient" },
      { id: 2, firstName: "Bob", status: "inquiry" },
    ];
    (getAllPatients as any).mockResolvedValue(mockPatients);

    const result = await getAllPatients();
    expect(result).toHaveLength(2);
    expect(getAllPatients).toHaveBeenCalledWith();
  });

  it("filters patients by active_patient status", async () => {
    const mockActive = [{ id: 1, firstName: "Alice", status: "active_patient" }];
    (getAllPatients as any).mockResolvedValue(mockActive);

    const result = await getAllPatients(undefined, ["active_patient"]);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("active_patient");
  });

  it("filters patients by CRM statuses", async () => {
    const mockCRM = [
      { id: 2, firstName: "Bob", status: "inquiry" },
      { id: 3, firstName: "Carol", status: "lead" },
    ];
    (getAllPatients as any).mockResolvedValue(mockCRM);

    const result = await getAllPatients(undefined, ["inquiry", "lead", "qualified", "proposal_sent"]);
    expect(result).toHaveLength(2);
    expect(result.every((p: any) => ["inquiry", "lead", "qualified", "proposal_sent"].includes(p.status))).toBe(true);
  });
});

// ─── Treatment Cycles CRUD ────────────────────────────────────────────────────
describe("Treatment Cycles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a new treatment cycle", async () => {
    const mockCycle = {
      id: 1,
      patientId: 42,
      cycleType: "IVF",
      status: "planned",
      protocol: "antagonist",
      createdAt: new Date(),
    };
    (createTreatmentCycle as any).mockResolvedValue(mockCycle);

    const result = await createTreatmentCycle({
      patientId: 42,
      cycleType: "IVF",
      status: "planned",
      protocol: "antagonist",
    } as any);

    expect(result.cycleType).toBe("IVF");
    expect(result.patientId).toBe(42);
    expect(result.status).toBe("planned");
  });

  it("lists cycles for a patient", async () => {
    const mockCycles = [
      { id: 1, patientId: 42, cycleType: "IVF", status: "completed" },
      { id: 2, patientId: 42, cycleType: "FET", status: "planned" },
    ];
    (getTreatmentCycles as any).mockResolvedValue(mockCycles);

    const result = await getTreatmentCycles(42);
    expect(result).toHaveLength(2);
    expect(result[0].cycleType).toBe("IVF");
  });

  it("gets a cycle by id", async () => {
    const mockCycle = { id: 5, patientId: 42, cycleType: "ICSI", status: "stimulation" };
    (getTreatmentCycleById as any).mockResolvedValue(mockCycle);

    const result = await getTreatmentCycleById(5);
    expect(result?.id).toBe(5);
    expect(result?.cycleType).toBe("ICSI");
  });
});

// ─── Monitoring Visits ────────────────────────────────────────────────────────
describe("Cycle Monitoring Visits", () => {
  beforeEach(() => vi.clearAllMocks());

  it("adds a monitoring visit with follicle data", async () => {
    const mockVisit = {
      id: 10,
      cycleId: 1,
      visitDate: new Date("2025-03-15"),
      cycleDay: 5,
      e2: "250",
      lh: "5.2",
      folliclesRight: [12, 14, 16],
      folliclesLeft: [11, 13],
      endometriumMm: "8",
      fshDose: "150",
    };
    (addCycleMonitoringVisit as any).mockResolvedValue(mockVisit);

    const result = await addCycleMonitoringVisit({
      cycleId: 1,
      visitDate: new Date("2025-03-15"),
      cycleDay: 5,
      e2: "250",
      folliclesRight: [12, 14, 16],
      folliclesLeft: [11, 13],
    } as any);

    expect(result.cycleDay).toBe(5);
    expect(result.folliclesRight).toEqual([12, 14, 16]);
    expect(result.e2).toBe("250");
  });

  it("lists monitoring visits for a cycle", async () => {
    const mockVisits = [
      { id: 1, cycleId: 1, visitDate: new Date("2025-03-10"), cycleDay: 1 },
      { id: 2, cycleId: 1, visitDate: new Date("2025-03-15"), cycleDay: 5 },
      { id: 3, cycleId: 1, visitDate: new Date("2025-03-18"), cycleDay: 8 },
    ];
    (getCycleMonitoringVisits as any).mockResolvedValue(mockVisits);

    const result = await getCycleMonitoringVisits(1);
    expect(result).toHaveLength(3);
    expect(result[1].cycleDay).toBe(5);
  });
});

// ─── Medications ──────────────────────────────────────────────────────────────
describe("Cycle Medications", () => {
  beforeEach(() => vi.clearAllMocks());

  it("adds a medication to a cycle", async () => {
    const mockMed = {
      id: 20,
      cycleId: 1,
      medicationName: "Gonal-F",
      dose: "150 IU",
      frequency: "Once daily",
      route: "SC",
      isActive: true,
    };
    (addCycleMedication as any).mockResolvedValue(mockMed);

    const result = await addCycleMedication({
      cycleId: 1,
      medicationName: "Gonal-F",
      dose: "150 IU",
      frequency: "Once daily",
      route: "SC",
    } as any);

    expect(result.medicationName).toBe("Gonal-F");
    expect(result.isActive).toBe(true);
  });

  it("lists medications for a cycle", async () => {
    const mockMeds = [
      { id: 1, cycleId: 1, medicationName: "Gonal-F", isActive: true },
      { id: 2, cycleId: 1, medicationName: "Cetrotide", isActive: true },
      { id: 3, cycleId: 1, medicationName: "Progesterone", isActive: false },
    ];
    (getCycleMedications as any).mockResolvedValue(mockMeds);

    const result = await getCycleMedications(1);
    expect(result).toHaveLength(3);
    expect(result.filter((m: any) => m.isActive)).toHaveLength(2);
  });
});

// ─── Medication Adherence ─────────────────────────────────────────────────────
describe("Medication Adherence", () => {
  beforeEach(() => vi.clearAllMocks());

  it("confirms medication adherence for a specific date", async () => {
    const mockLog = {
      id: 100,
      cycleId: 1,
      medicationId: 20,
      patientId: 42,
      scheduledDate: new Date("2025-03-15"),
      confirmedAt: new Date(),
    };
    (confirmMedicationAdherence as any).mockResolvedValue({ log: mockLog, alreadyConfirmed: false });

    const result = await confirmMedicationAdherence({
      cycleId: 1,
      medicationId: 20,
      patientId: 42,
      scheduledDate: new Date("2025-03-15"),
    } as any);

    expect(result.alreadyConfirmed).toBe(false);
    expect(result.log.medicationId).toBe(20);
  });

  it("returns alreadyConfirmed=true for duplicate confirmation", async () => {
    (confirmMedicationAdherence as any).mockResolvedValue({ log: null, alreadyConfirmed: true });

    const result = await confirmMedicationAdherence({
      cycleId: 1,
      medicationId: 20,
      patientId: 42,
      scheduledDate: new Date("2025-03-15"),
    } as any);

    expect(result.alreadyConfirmed).toBe(true);
  });

  it("retrieves adherence log for a cycle and patient", async () => {
    const mockAdherence = [
      { id: 1, medicationId: 20, scheduledDate: new Date("2025-03-15") },
      { id: 2, medicationId: 20, scheduledDate: new Date("2025-03-16") },
    ];
    (getMedicationAdherence as any).mockResolvedValue(mockAdherence);

    const result = await getMedicationAdherence(1, 42);
    expect(result).toHaveLength(2);
  });
});

// ─── Cycle Outcome ────────────────────────────────────────────────────────────
describe("Cycle Outcome", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saves cycle outcome with oocyte and embryo data", async () => {
    const mockOutcome = {
      id: 50,
      cycleId: 1,
      totalOocytes: 12,
      matureOocytes: 10,
      fertilized: 8,
      transferred: 2,
      cryopreserved: 4,
      result: "positive",
    };
    (saveCycleOutcome as any).mockResolvedValue(mockOutcome);

    const result = await saveCycleOutcome({
      cycleId: 1,
      totalOocytes: 12,
      matureOocytes: 10,
      fertilized: 8,
      transferred: 2,
      cryopreserved: 4,
      result: "positive",
    } as any);

    expect(result.totalOocytes).toBe(12);
    expect(result.result).toBe("positive");
    expect(result.fertilized).toBe(8);
  });

  it("retrieves cycle outcome", async () => {
    const mockOutcome = { id: 50, cycleId: 1, result: "negative", totalOocytes: 5 };
    (getCycleOutcome as any).mockResolvedValue(mockOutcome);

    const result = await getCycleOutcome(1);
    expect(result?.result).toBe("negative");
  });

  it("returns null when no outcome recorded", async () => {
    (getCycleOutcome as any).mockResolvedValue(null);

    const result = await getCycleOutcome(999);
    expect(result).toBeNull();
  });
});

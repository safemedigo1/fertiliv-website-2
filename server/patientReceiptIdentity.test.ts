import { describe, expect, it } from "vitest";
import { resolvePatientReceiptIdentity } from "../shared/patientReceiptIdentity";

describe("Patient Credit Payout receipt identity", () => {
  it("uses the authoritative current Patient display name and MRN explicitly", () => {
    expect(resolvePatientReceiptIdentity({
      firstName: "LinkTest",
      lastName: "Patient",
      mrn: "LTP-1786199620955-882",
    })).toEqual({
      displayName: "LinkTest Patient",
      mrn: "LTP-1786199620955-882",
    });
  });

  it("never renders the misleading generic Patient fallback when identity is unavailable", () => {
    expect(resolvePatientReceiptIdentity(undefined)).toEqual({
      displayName: "Patient identity unavailable",
      mrn: undefined,
    });
  });
});

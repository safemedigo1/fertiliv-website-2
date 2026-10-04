import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Phone, User, Calendar, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { useLocation } from "wouter";
import { format } from "date-fns";

const PATIENT_STATUS_COLORS: Record<string, string> = {
  inquiry: "bg-blue-100 text-blue-700",
  lead: "bg-indigo-100 text-indigo-700",
  qualified: "bg-violet-100 text-violet-700",
  proposal_sent: "bg-amber-100 text-amber-700",
  active_patient: "bg-emerald-100 text-emerald-700",
  inactive_patient: "bg-gray-100 text-gray-600",
  inactive: "bg-gray-100 text-gray-600",
  archived: "bg-red-100 text-red-600",
};

const LEAD_STATUS_COLORS: Record<string, string> = {
  intake: "bg-blue-100 text-blue-700",
  "attempted-to-contact": "bg-orange-100 text-orange-700",
  "contacted-awaiting-info": "bg-yellow-100 text-yellow-700",
  "medical-reports-received": "bg-teal-100 text-teal-700",
  "doctor-feedback-shared": "bg-cyan-100 text-cyan-700",
  "follow-up-negotiation": "bg-purple-100 text-purple-700",
  "ready-to-travel": "bg-green-100 text-green-700",
  converted: "bg-emerald-100 text-emerald-700",
  cold: "bg-slate-100 text-slate-600",
  lost: "bg-red-100 text-red-600",
  "not-qualified": "bg-red-100 text-red-500",
  junk: "bg-gray-100 text-gray-500",
};

export default function CheckNumberPage() {
  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [, setLocation] = useLocation();

  const { data: results, isLoading, isFetching } = trpc.patients.checkNumber.useQuery(
    { search: searchTerm },
    { enabled: searchTerm.length >= 3 }
  );

  const handleResultClick = (record: { id: number; recordType: "patient" | "lead" }) => {
    if (record.recordType === "lead") {
      setLocation(`/crm/${record.id}`);
    } else {
      setLocation(`/patients/${record.id}`);
    }
  };

  const handleSearch = () => {
    if (query.trim().length < 3) return;
    setSearchTerm(query.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const loading = isLoading || isFetching;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Search className="h-6 w-6 text-teal-600" />
          Check Number
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Quickly look up a patient or lead by phone number, name, or email.
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Enter phone number, name, or email..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          className="text-base h-11"
          autoFocus
        />
        <Button onClick={handleSearch} disabled={query.trim().length < 3 || loading} className="h-11 px-5 gap-2">
          <Search className="h-4 w-4" />
          {loading ? "Searching..." : "Search"}
        </Button>
      </div>

      {searchTerm && !loading && results !== undefined && (
        <div className="space-y-3">
          {results.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <XCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-medium text-muted-foreground">No records found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  No patient or lead matches "<strong>{searchTerm}</strong>"
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                {results.length} result{results.length !== 1 ? "s" : ""} found
              </div>
              {results.map((r) => {
                const statusColorMap = r.recordType === "lead" ? LEAD_STATUS_COLORS : PATIENT_STATUS_COLORS;
                const statusLabel = (r.status ?? "").replace(/-/g, " ").replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
                return (
                <Card key={`${r.recordType}-${r.id}`} className="cursor-pointer hover:border-teal-400 transition-colors"
                  onClick={() => handleResultClick(r)}>
                  <CardContent className="p-4 flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">
                          {[r.firstName, r.middleName, r.lastName].filter(Boolean).join(" ")}
                        </p>
                        {r.mrn && (
                          <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">{r.mrn}</span>
                        )}
                        {r.status && (
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${statusColorMap[r.status] ?? "bg-gray-100 text-gray-600"}`}>
                            {statusLabel}
                          </span>
                        )}
                        <Badge
                          variant="outline"
                          className={`text-[10px] h-4 ${r.recordType === "lead" ? "border-indigo-300 text-indigo-600" : "border-teal-300 text-teal-600"}`}
                        >
                          {r.recordType === "lead" ? "CRM Lead" : "Patient"}
                        </Badge>
                        {r.patientType && (
                          <Badge variant="outline" className="text-[10px] h-4">
                            {r.patientType}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                        {r.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />{r.phone}
                          </span>
                        )}
                        {r.email && <span>{r.email}</span>}
                        {r.nationality && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />{r.nationality}
                          </span>
                        )}
                        {r.createdAt && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Registered {format(new Date(r.createdAt), "MMM d, yyyy")}
                          </span>
                        )}
                      </div>
                      {r.interestLevel && (
                        <div className="mt-1.5">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                            r.interestLevel === "hot" ? "bg-red-50 text-red-600 border-red-200" :
                            r.interestLevel === "warm" ? "bg-orange-50 text-orange-600 border-orange-200" :
                            "bg-blue-50 text-blue-600 border-blue-200"
                          }`}>
                            {r.interestLevel.toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="text-right text-xs text-muted-foreground shrink-0">
                      <p className={`font-medium hover:underline ${r.recordType === "lead" ? "text-indigo-600" : "text-teal-600"}`}>
                        View Profile →
                      </p>
                    </div>
                  </CardContent>
                </Card>
                );
              })}
            </>
          )}
        </div>
      )}

      {!searchTerm && (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center">
            <AlertCircle className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              Enter at least 3 characters to search for a patient or lead.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

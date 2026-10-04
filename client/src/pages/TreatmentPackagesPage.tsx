import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { DollarSign, Edit, Package, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const CURRENCIES = ["USD", "EUR", "GBP", "TRY"] as const;

export default function TreatmentPackagesPage() {
  const { data: packages, refetch } = trpc.treatmentPackages.list.useQuery();
  const [showCreate, setShowCreate] = useState(false);
  const [editPkg, setEditPkg] = useState<any>(null);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Treatment Packages</h1>
          <p className="text-sm text-muted-foreground">Manage pricing packages for local and international patients</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New Package
        </Button>
      </div>

      {!packages?.length ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          No treatment packages yet. Create your first package.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {packages.map(pkg => (
            <Card key={pkg.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-teal-50 rounded-lg">
                      <Package className="h-4 w-4 text-teal-600" />
                    </div>
                    <CardTitle className="text-base">{pkg.name}</CardTitle>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditPkg(pkg)}>
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {pkg.description && (
                  <p className="text-sm text-muted-foreground mt-1">{pkg.description}</p>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Local Pricing (Turkey)</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {CURRENCIES.map(c => {
                        const val = pkg[`localPrice${c}` as keyof typeof pkg] as string | null | undefined;
                        return val ? (
                          <div key={c} className="flex items-center justify-between bg-muted/30 rounded px-2 py-1">
                            <span className="text-xs text-muted-foreground">{c}</span>
                            <span className="text-xs font-medium">{String(val)}</span>
                          </div>
                        ) : null;
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">International Pricing</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {CURRENCIES.map(c => {
                        const val = pkg[`intlPrice${c}` as keyof typeof pkg] as string | null | undefined;
                        return val ? (
                          <div key={c} className="flex items-center justify-between bg-muted/30 rounded px-2 py-1">
                            <span className="text-xs text-muted-foreground">{c}</span>
                            <span className="text-xs font-medium">{String(val)}</span>
                          </div>
                        ) : null;
                      })}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <PackageModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSuccess={() => { refetch(); setShowCreate(false); }}
      />
      {editPkg && (
        <PackageModal
          open={!!editPkg}
          pkg={editPkg}
          onClose={() => setEditPkg(null)}
          onSuccess={() => { refetch(); setEditPkg(null); }}
        />
      )}
    </div>
  );
}

function PackageModal({ open, pkg, onClose, onSuccess }: {
  open: boolean;
  pkg?: any;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEdit = !!pkg;
  const [form, setForm] = useState({
    name: "", description: "",
    localPriceUSD: "", localPriceEUR: "", localPriceGBP: "", localPriceTRY: "",
    intlPriceUSD: "", intlPriceEUR: "", intlPriceGBP: "", intlPriceTRY: "",
  });

  useEffect(() => {
    if (pkg) {
      setForm({
        name: pkg.name ?? "",
        description: pkg.description ?? "",
        localPriceUSD: pkg.localPriceUSD ?? "",
        localPriceEUR: pkg.localPriceEUR ?? "",
        localPriceGBP: pkg.localPriceGBP ?? "",
        localPriceTRY: pkg.localPriceTRY ?? "",
        intlPriceUSD: pkg.intlPriceUSD ?? "",
        intlPriceEUR: pkg.intlPriceEUR ?? "",
        intlPriceGBP: pkg.intlPriceGBP ?? "",
        intlPriceTRY: pkg.intlPriceTRY ?? "",
      });
    }
  }, [pkg]);

  const create = trpc.treatmentPackages.create.useMutation({
    onSuccess: () => { toast.success("Package created"); onSuccess(); },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });
  const update = trpc.treatmentPackages.update.useMutation({
    onSuccess: () => { toast.success("Package updated"); onSuccess(); },
    onError: (e) => { const _msg = (e as any)?.data?.zodError ? "Please check the form fields and try again." : (e.message || "Something went wrong. Please try again."); toast.error(_msg); },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return toast.error("Package name is required");
    const data = {
      name: form.name,
      description: form.description || undefined,
      localPriceUSD: form.localPriceUSD || undefined,
      localPriceEUR: form.localPriceEUR || undefined,
      localPriceGBP: form.localPriceGBP || undefined,
      localPriceTRY: form.localPriceTRY || undefined,
      intlPriceUSD: form.intlPriceUSD || undefined,
      intlPriceEUR: form.intlPriceEUR || undefined,
      intlPriceGBP: form.intlPriceGBP || undefined,
      intlPriceTRY: form.intlPriceTRY || undefined,
    };
    if (isEdit) update.mutate({ id: pkg.id, data });
    else create.mutate(data);
  };

  const f = (key: keyof typeof form) => form[key];
  const set = (key: keyof typeof form, val: string) => setForm(prev => ({ ...prev, [key]: val }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Package" : "New Treatment Package"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Package Name *</Label>
            <Input value={f("name")} onChange={e => set("name", e.target.value)} placeholder="e.g. IVF Standard Package" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={f("description")} onChange={e => set("description", e.target.value)} rows={2} />
          </div>

          <div>
            <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              Local Pricing (Turkey)
            </p>
            <div className="grid grid-cols-2 gap-2">
              {CURRENCIES.map(c => (
                <div key={c} className="space-y-1">
                  <Label className="text-xs">{c}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={f(`localPrice${c}` as keyof typeof form)}
                    onChange={e => set(`localPrice${c}` as keyof typeof form, e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              International Pricing
            </p>
            <div className="grid grid-cols-2 gap-2">
              {CURRENCIES.map(c => (
                <div key={c} className="space-y-1">
                  <Label className="text-xs">{c}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={f(`intlPrice${c}` as keyof typeof form)}
                    onChange={e => set(`intlPrice${c}` as keyof typeof form, e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={create.isPending || update.isPending}>
              {create.isPending || update.isPending ? "Saving..." : isEdit ? "Save Changes" : "Create Package"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { useBranch } from "@/hooks/useBranch";
import { PageHeader, Panel, EmptyState } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtDate } from "@/lib/format";
import { ScanLine, Image, FileText, PenLine, Upload, Download, ZoomIn } from "lucide-react";
import { toast } from "sonner";

const kindConfig: Record<string, { label: string; icon: any; tint: string }> = {
  xray: { label: "X-Ray", icon: ScanLine, tint: "bg-slate-900" },
  cbct: { label: "CBCT", icon: ScanLine, tint: "bg-indigo-950" },
  opg: { label: "OPG", icon: ScanLine, tint: "bg-slate-800" },
  photo: { label: "Clinical Photo", icon: Image, tint: "bg-teal-900" },
  before_after: { label: "Before & After", icon: Image, tint: "bg-emerald-900" },
  consent: { label: "Consent Form", icon: PenLine, tint: "bg-amber-900" },
  document: { label: "Document", icon: FileText, tint: "bg-slate-700" },
};

// Stylised placeholder render for imaging kinds (real files plug in later via WAHA/PMS integration)
function ImagingPreview({ kind, title }: { kind: string; title: string }) {
  if (["xray", "cbct", "opg"].includes(kind)) {
    return (
      <svg viewBox="0 0 200 120" className="w-full h-full">
        <rect width="200" height="120" fill="#0f172a" />
        {Array.from({ length: 8 }).map((_, i) => (
          <ellipse key={i} cx={45 + i * 16} cy={kind === "opg" ? 60 + Math.sin(i / 7 * Math.PI) * -18 : 55 + (i % 2) * 10}
            rx="6" ry={kind === "cbct" ? 14 : 10} fill="none" stroke="#94a3b8" strokeWidth="1.5" opacity={0.5 + (i % 3) * 0.15} />
        ))}
        <text x="10" y="112" fill="#475569" fontSize="8" fontFamily="monospace">{title.slice(0, 26)}</text>
      </svg>
    );
  }
  if (kind === "photo" || kind === "before_after") {
    return (
      <svg viewBox="0 0 200 120" className="w-full h-full">
        <rect width="200" height="120" fill="#134e4a" />
        <ellipse cx="100" cy="60" rx="55" ry="32" fill="#fda4af" opacity="0.85" />
        {Array.from({ length: 6 }).map((_, i) => (
          <rect key={i} x={62 + i * 13} y={44 + (i % 2) * 4} width="9" height={kind === "before_after" && i < 3 ? 18 : 24} rx="3" fill={kind === "before_after" && i < 3 ? "#fef3c7" : "#ffffff"} />
        ))}
        {kind === "before_after" && <text x="10" y="18" fill="#a7f3d0" fontSize="9" fontFamily="sans-serif">AFTER</text>}
      </svg>
    );
  }
  return (
    <div className="w-full h-full flex items-center justify-center bg-slate-100">
      <FileText className="h-8 w-8 text-slate-400" />
    </div>
  );
}

function UploadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [q, setQ] = useState("");
  const [patientId, setPatientId] = useState<number | null>(null);
  const [kind, setKind] = useState("xray");
  const [title, setTitle] = useState("");
  const res = trpc.patients.list.useQuery({ search: q || undefined, pageSize: 8 }, { enabled: q.length >= 2 && !patientId });
  const upload = trpc.documents.create.useMutation({
    onSuccess: async () => { toast.success("Document added to patient record"); await utils.documents.list.invalidate(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Upload Document / Imaging</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!patientId) return toast.error("Select a patient"); upload.mutate({ patientId, kind: kind as any, title }); }}>
          <div className="space-y-1.5 relative">
            <Label>Patient *</Label>
            <Input value={q} onChange={(e) => { setQ(e.target.value); setPatientId(null); }} placeholder="Search patient…" />
            {q.length >= 2 && !patientId && (
              <div className="absolute z-50 top-full mt-1 w-full rounded-lg border bg-white shadow-lg max-h-48 overflow-y-auto">
                {(res.data?.rows ?? []).map((r: any) => (
                  <button key={r.patient.id} type="button" className="w-full px-3 py-2 text-left hover:bg-emerald-50 text-sm"
                    onClick={() => { setPatientId(r.patient.id); setQ(r.patient.name); }}>
                    {r.patient.name} <span className="text-xs text-slate-400">{r.patient.mrn}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(kindConfig).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Title *</Label><Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. OPG Panoramic — upper molars" /></div>
          <div className="rounded-lg border-2 border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
            <Upload className="h-5 w-5 mx-auto mb-1.5 text-slate-300" />
            File upload connects to clinic storage in production — metadata is saved now.
          </div>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button className="bg-emerald-600 hover:bg-emerald-700" disabled={upload.isPending}>Save Document</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Documents() {
  const { branchId } = useBranch();
  const [kind, setKind] = useState("all");
  const [showUpload, setShowUpload] = useState(false);
  const [preview, setPreview] = useState<any | null>(null);
  const docs = trpc.documents.list.useQuery({ branchId, kind: kind === "all" ? undefined : kind });

  return (
    <div className="space-y-5 -mt-6">
      <PageHeader
        title="X-Ray & Documents"
        description="Imaging, clinical photos, consent forms and attachments"
        actions={<Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setShowUpload(true)}><Upload className="h-4 w-4 mr-1.5" /> Upload</Button>}
      />

      <div className="flex gap-1.5 flex-wrap">
        {["all", ...Object.keys(kindConfig)].map((k) => (
          <button key={k} onClick={() => setKind(k)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${kind === k ? "bg-emerald-600 text-white" : "bg-white border text-slate-500 hover:border-emerald-300"}`}>
            {k === "all" ? "All" : kindConfig[k].label}
          </button>
        ))}
      </div>

      {docs.isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-3">{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}</div>
      ) : docs.data?.length ? (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-3">
          {docs.data.map((r: any) => {
            const cfg = kindConfig[r.doc.kind] ?? kindConfig.document;
            return (
              <button key={r.doc.id} onClick={() => setPreview(r)} className="text-left rounded-xl border border-slate-200 bg-white overflow-hidden hover:shadow-md hover:border-emerald-300 transition group">
                <div className="h-32 relative">
                  <ImagingPreview kind={r.doc.kind} title={r.doc.title} />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition flex items-center justify-center">
                    <ZoomIn className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition" />
                  </div>
                </div>
                <div className="p-2.5">
                  <p className="text-xs font-medium text-slate-800 truncate">{r.doc.title}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    <Link to={`/patients/${r.doc.patientId}`} className="hover:text-emerald-600" onClick={(e) => e.stopPropagation()}>{r.patientName}</Link>
                  </p>
                  <p className="text-[10px] text-slate-400">{cfg.label} · {fmtDate(r.doc.createdAt)}</p>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <Panel><EmptyState title="No documents yet" description="Upload X-rays, photos or consent forms to see them here." /></Panel>
      )}

      {/* Preview modal */}
      <Dialog open={!!preview} onOpenChange={() => setPreview(null)}>
        <DialogContent className="max-w-2xl">
          {preview && (
            <>
              <DialogHeader><DialogTitle>{preview.doc.title}</DialogTitle></DialogHeader>
              <div className="rounded-xl overflow-hidden aspect-video"><ImagingPreview kind={preview.doc.kind} title={preview.doc.title} /></div>
              <div className="flex items-center justify-between text-sm text-slate-500">
                <span>{preview.patientName} · {kindConfig[preview.doc.kind]?.label} · {fmtDate(preview.doc.createdAt)}</span>
                <Button variant="outline" size="sm" onClick={() => toast.success("Download started")}><Download className="h-4 w-4 mr-1.5" /> Download</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <UploadDialog open={showUpload} onClose={() => setShowUpload(false)} />
    </div>
  );
}

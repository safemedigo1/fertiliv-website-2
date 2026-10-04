import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { Plus, X, Pencil, Trash2, Check, Tag } from "lucide-react";

const TAG_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#14b8a6", "#06b6d4",
  "#3b82f6", "#64748b",
];

interface TaskTagManagerProps {
  selectedTags: string[];
  onChange: (tags: string[]) => void;
  readOnly?: boolean;
}

export default function TaskTagManager({ selectedTags, onChange, readOnly = false }: TaskTagManagerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(TAG_COLORS[0]);
  const [showCreate, setShowCreate] = useState(false);

  const { data: allTags = [], refetch } = (trpc as any).taskTags.list.useQuery();
  const createTag = (trpc as any).taskTags.create.useMutation({ onSuccess: () => { refetch(); setNewName(""); setShowCreate(false); } });
  const updateTag = (trpc as any).taskTags.update.useMutation({ onSuccess: () => { refetch(); setEditingId(null); } });
  const deleteTag = (trpc as any).taskTags.delete.useMutation({ onSuccess: () => refetch() });

  const filtered = allTags.filter((t: any) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  const toggleTag = (name: string) => {
    if (selectedTags.includes(name)) {
      onChange(selectedTags.filter(t => t !== name));
    } else {
      onChange([...selectedTags, name]);
    }
  };

  const handleCreate = () => {
    if (!newName.trim()) return;
    createTag.mutate({ name: newName.trim(), color: newColor });
  };

  const startEdit = (tag: any) => {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color ?? TAG_COLORS[0]);
  };

  const saveEdit = () => {
    if (!editingId || !editName.trim()) return;
    updateTag.mutate({ id: editingId, name: editName.trim(), color: editColor });
  };

  const handleDelete = (tag: any) => {
    if (!confirm(`Delete task tag "${tag.name}"?`)) return;
    deleteTag.mutate({ id: tag.id }, {
      onSuccess: () => {
        if (selectedTags.includes(tag.name)) {
          onChange(selectedTags.filter(t => t !== tag.name));
        }
        toast.success("Tag deleted");
      },
    });
  };

  return (
    <div className="flex flex-wrap gap-1 items-center">
      {selectedTags.map(name => {
        const tag = allTags.find((t: any) => t.name === name);
        return (
          <Badge
            key={name}
            variant="secondary"
            className="gap-1 pr-1 text-xs"
            style={tag ? { backgroundColor: tag.color + "22", color: tag.color, borderColor: tag.color + "44" } : {}}
          >
            {name}
            {!readOnly && (
              <button
                onClick={() => toggleTag(name)}
                className="hover:opacity-70 ml-0.5"
                type="button"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </Badge>
        );
      })}

      {!readOnly && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-dashed rounded-full px-2 py-0.5 transition-colors"
            >
              <Tag className="w-3 h-3" />
              Add tag
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="start">
            <div className="p-2 border-b">
              <Input
                placeholder="Search tags..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-7 text-sm"
              />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {filtered.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No tags found</p>
              )}
              {filtered.map((tag: any) => (
                <div key={tag.id} className="flex items-center gap-1 px-2 py-1 hover:bg-muted/50 group">
                  {editingId === tag.id ? (
                    <div className="flex items-center gap-1 flex-1">
                      <Input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="h-6 text-xs flex-1"
                        onKeyDown={e => e.key === "Enter" && saveEdit()}
                        autoFocus
                      />
                      <div className="flex gap-0.5">
                        {TAG_COLORS.map(c => (
                          <button
                            key={c}
                            type="button"
                            className="w-4 h-4 rounded-full border-2 transition-transform hover:scale-110"
                            style={{ backgroundColor: c, borderColor: editColor === c ? "#000" : "transparent" }}
                            onClick={() => setEditColor(c)}
                          />
                        ))}
                      </div>
                      <button type="button" onClick={saveEdit} className="text-green-600 hover:text-green-700">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="flex items-center gap-2 flex-1 text-left"
                        onClick={() => toggleTag(tag.name)}
                      >
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                        <span className="text-sm">{tag.name}</span>
                        {selectedTags.includes(tag.name) && (
                          <Check className="w-3.5 h-3.5 ml-auto text-primary" />
                        )}
                      </button>
                      <div className="flex gap-1 transition-opacity">
                        <button type="button" onClick={() => startEdit(tag)} className="text-muted-foreground hover:text-foreground" title="Edit">
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button type="button" onClick={() => handleDelete(tag)} className="text-muted-foreground hover:text-destructive" title="Delete">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="border-t p-2">
              {showCreate ? (
                <div className="space-y-2">
                  <Input
                    placeholder="Tag name"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    className="h-7 text-sm"
                    onKeyDown={e => e.key === "Enter" && handleCreate()}
                    autoFocus
                  />
                  <div className="flex flex-wrap gap-1">
                    {TAG_COLORS.map(c => (
                      <button
                        key={c}
                        type="button"
                        className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
                        style={{ backgroundColor: c, borderColor: newColor === c ? "#000" : "transparent" }}
                        onClick={() => setNewColor(c)}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7 text-xs flex-1" onClick={handleCreate} disabled={createTag.isPending} type="button">
                      {createTag.isPending ? "Creating..." : "Create"}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowCreate(false)} type="button">
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-xs text-primary hover:underline w-full"
                  onClick={() => { setShowCreate(true); setSearch(""); }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Create new tag
                </button>
              )}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

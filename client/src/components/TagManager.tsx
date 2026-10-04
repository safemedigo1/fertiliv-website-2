import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { Plus, X, Pencil, Trash2, Check, Tag, ChevronDown } from "lucide-react";

const TAG_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#14b8a6", "#06b6d4",
  "#3b82f6", "#64748b",
];

interface TagManagerProps {
  /** Current tag names on the patient */
  selectedTags: string[];
  /** Called when tags change */
  onChange: (tags: string[]) => void;
  readOnly?: boolean;
}

export default function TagManager({ selectedTags, onChange, readOnly = false }: TagManagerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(TAG_COLORS[0]);
  const [showCreate, setShowCreate] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: allTags = [], refetch } = trpc.clinicTags.list.useQuery();
  const createTag = trpc.clinicTags.create.useMutation({ onSuccess: () => { refetch(); setNewName(""); setShowCreate(false); } });
  const updateTag = trpc.clinicTags.update.useMutation({ onSuccess: () => { refetch(); setEditingId(null); } });
  const deleteTag = trpc.clinicTags.delete.useMutation({ onSuccess: () => refetch() });

  const filtered = allTags.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  function toggleTag(name: string) {
    if (selectedTags.includes(name)) {
      onChange(selectedTags.filter(t => t !== name));
    } else {
      onChange([...selectedTags, name]);
    }
  }

  function removeTag(name: string) {
    onChange(selectedTags.filter(t => t !== name));
  }

  function startEdit(tag: { id: number; name: string; color: string }) {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color);
  }

  function saveEdit() {
    if (!editName.trim()) return;
    updateTag.mutate({ id: editingId!, name: editName, color: editColor });
    // If the old name was in selectedTags, update it
    const oldTag = allTags.find(t => t.id === editingId);
    if (oldTag && selectedTags.includes(oldTag.name)) {
      onChange(selectedTags.map(t => t === oldTag.name ? editName : t));
    }
  }

  function handleCreate() {
    if (!newName.trim()) { toast.error("Tag name is required"); return; }
    createTag.mutate({ name: newName, color: newColor });
  }

  function handleDelete(tag: { id: number; name: string }) {
    deleteTag.mutate({ id: tag.id });
    // Remove from selected if present
    if (selectedTags.includes(tag.name)) {
      onChange(selectedTags.filter(t => t !== tag.name));
    }
  }

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {/* Selected tags */}
      {selectedTags.map(name => {
        const tag = allTags.find(t => t.name === name);
        return (
          <Badge
            key={name}
            style={{ backgroundColor: tag?.color ?? "#6366f1", color: "#fff" }}
            className="text-xs px-2 py-0.5 flex items-center gap-1 border-0"
          >
            {name}
            {!readOnly && (
              <button
                onClick={() => removeTag(name)}
                className="ml-0.5 hover:opacity-70 transition-opacity"
                aria-label={`Remove tag ${name}`}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </Badge>
        );
      })}

      {/* Add tag button */}
      {!readOnly && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-6 px-2 text-xs gap-1 border-dashed">
              <Tag className="w-3 h-3" />
              Add tag
              <ChevronDown className="w-3 h-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="start">
            {/* Search */}
            <div className="p-2 border-b">
              <Input
                ref={inputRef}
                placeholder="Search or create tag..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-8 text-sm"
              />
            </div>

            {/* Tag list */}
            <div className="max-h-52 overflow-y-auto">
              {filtered.length === 0 && (
                <p className="text-xs text-muted-foreground px-3 py-2">No tags found</p>
              )}
              {filtered.map(tag => (
                <div key={tag.id} className="flex items-center gap-2 px-2 py-1 hover:bg-muted/50 group">
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
                            className="w-4 h-4 rounded-full border-2 transition-transform hover:scale-110"
                            style={{ backgroundColor: c, borderColor: editColor === c ? "#000" : "transparent" }}
                            onClick={() => setEditColor(c)}
                          />
                        ))}
                      </div>
                      <button onClick={saveEdit} className="text-green-600 hover:text-green-700">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        className="flex items-center gap-2 flex-1 text-left"
                        onClick={() => { toggleTag(tag.name); }}
                      >
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span className="text-sm">{tag.name}</span>
                        {selectedTags.includes(tag.name) && (
                          <Check className="w-3.5 h-3.5 ml-auto text-primary" />
                        )}
                      </button>
                      <div className="flex gap-1 transition-opacity">
                        <button
                          onClick={() => startEdit(tag)}
                          className="text-muted-foreground hover:text-foreground"
                          title="Edit tag"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleDelete(tag)}
                          className="text-muted-foreground hover:text-destructive"
                          title="Delete tag"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* Create new tag */}
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
                        className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
                        style={{ backgroundColor: c, borderColor: newColor === c ? "#000" : "transparent" }}
                        onClick={() => setNewColor(c)}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7 text-xs flex-1" onClick={handleCreate} disabled={createTag.isPending}>
                      {createTag.isPending ? "Creating..." : "Create"}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowCreate(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <button
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

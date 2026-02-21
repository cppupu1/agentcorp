import { useState, useEffect, useCallback } from 'react';
import {
  knowledgeApi,
  type KnowledgeBase,
  type KnowledgeBaseDetail,
  type KnowledgeSearchResult,
} from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import {
  Plus, Trash2, Search, Loader2, ChevronDown, ChevronRight,
  FileText, X, Pencil,
} from 'lucide-react';

export default function KnowledgeBasesPage() {
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<KnowledgeBaseDetail | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editTarget, setEditTarget] = useState<KnowledgeBase | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeBase | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showDocDialog, setShowDocDialog] = useState(false);
  const [docKbId, setDocKbId] = useState('');
  const [deleteDocTarget, setDeleteDocTarget] = useState<{ kbId: string; docId: string; title: string } | null>(null);
  const [deletingDoc, setDeletingDoc] = useState(false);
  const [searchKbId, setSearchKbId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<KnowledgeSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const { toast } = useToast();
  const { t } = useI18n();

  const load = useCallback(async () => {
    try {
      const res = await knowledgeApi.list();
      setKbs(res.data);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.loadFailed'), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedDetail(null);
      setSearchQuery('');
      setSearchResults([]);
      setSearchKbId('');
      return;
    }
    setExpandedId(id);
    try {
      const res = await knowledgeApi.get(id);
      setExpandedDetail(res.data);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.loadFailed'), 'error');
    }
  };

  const handleDeleteKb = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await knowledgeApi.delete(deleteTarget.id);
      toast(t('kb.kbDeleted'), 'success');
      setDeleteTarget(null);
      if (expandedId === deleteTarget.id) { setExpandedId(null); setExpandedDetail(null); }
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.deleteFailed'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteDoc = async () => {
    if (!deleteDocTarget) return;
    setDeletingDoc(true);
    try {
      await knowledgeApi.deleteDocument(deleteDocTarget.kbId, deleteDocTarget.docId);
      toast(t('kb.docDeleted'), 'success');
      setDeleteDocTarget(null);
      // Refresh expanded detail
      if (expandedId) {
        const res = await knowledgeApi.get(expandedId);
        setExpandedDetail(res.data);
      }
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.deleteFailed'), 'error');
    } finally {
      setDeletingDoc(false);
    }
  };

  const handleSearch = async (kbId: string) => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchKbId(kbId);
    try {
      const res = await knowledgeApi.search(kbId, searchQuery.trim());
      setSearchResults(res.data);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.operationFailed'), 'error');
    } finally {
      setSearching(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold">{t('kb.title')}</h2>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4" /> {t('kb.create')}
        </Button>
      </div>

      {kbs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">{t('kb.empty')}</div>
      ) : (
        <div className="space-y-3">
          {kbs.map(kb => (
            <div key={kb.id} className="border rounded-lg">
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50"
                onClick={() => toggleExpand(kb.id)}
              >
                {expandedId === kb.id ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{kb.name}</div>
                  {kb.description && <div className="text-sm text-muted-foreground truncate">{kb.description}</div>}
                </div>
                <Badge variant="secondary">{t('kb.docCount', { count: kb.documentCount })}</Badge>
                <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); setEditTarget(kb); }}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); setDeleteTarget(kb); }}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>

              {expandedId === kb.id && expandedDetail && (
                <div className="border-t px-4 py-3 space-y-3">
                  {/* Search bar */}
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        className="pl-9"
                        placeholder={t('kb.searchPlaceholder')}
                        value={searchKbId === kb.id ? searchQuery : ''}
                        onChange={e => { setSearchQuery(e.target.value); setSearchKbId(kb.id); }}
                        onKeyDown={e => { if (e.key === 'Enter') handleSearch(kb.id); }}
                      />
                    </div>
                    <Button variant="outline" onClick={() => handleSearch(kb.id)} disabled={searching}>
                      {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : t('common.search')}
                    </Button>
                    <Button onClick={() => { setDocKbId(kb.id); setShowDocDialog(true); }}>
                      <Plus className="h-4 w-4" /> {t('kb.addDoc')}
                    </Button>
                  </div>

                  {/* Search results */}
                  {searchKbId === kb.id && searchResults.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{t('kb.searchResults', { count: searchResults.length })}</span>
                        <Button variant="ghost" size="sm" onClick={() => { setSearchResults([]); setSearchQuery(''); }}>
                          <X className="h-3 w-3" /> {t('kb.clearSearch')}
                        </Button>
                      </div>
                      {searchResults.map(r => (
                        <div key={r.chunkId} className="border rounded p-3 text-sm">
                          <div className="font-medium text-xs text-muted-foreground mb-1">{r.documentTitle}</div>
                          <div className="whitespace-pre-wrap">{r.chunkContent}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Documents list */}
                  {expandedDetail.documents.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-2">{t('kb.noDocs')}</div>
                  ) : (
                    <div className="space-y-1">
                      {expandedDetail.documents.map(doc => (
                        <div key={doc.id} className="flex items-center gap-3 px-3 py-2 rounded hover:bg-muted/50">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">{doc.title}</div>
                            <div className="text-xs text-muted-foreground">{t('kb.chunkCount', { count: doc.chunkCount ?? 0 })}</div>
                          </div>
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => setDeleteDocTarget({ kbId: kb.id, docId: doc.id, title: doc.title })}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit KB Dialog */}
      <KBFormDialog
        open={showCreateDialog || !!editTarget}
        onClose={() => { setShowCreateDialog(false); setEditTarget(null); }}
        editTarget={editTarget}
        onSuccess={() => {
          setShowCreateDialog(false);
          setEditTarget(null);
          load();
          if (expandedId) {
            knowledgeApi.get(expandedId).then(res => setExpandedDetail(res.data)).catch(() => {});
          }
        }}
      />

      {/* Add Document Dialog */}
      <AddDocumentDialog
        open={showDocDialog}
        kbId={docKbId}
        onClose={() => setShowDocDialog(false)}
        onSuccess={() => {
          setShowDocDialog(false);
          load();
          if (expandedId) {
            knowledgeApi.get(expandedId).then(res => setExpandedDetail(res.data)).catch(() => {});
          }
        }}
      />

      {/* Delete KB Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title={t('kb.deleteKb')}
        description={`${deleteTarget?.name}`}
        onConfirm={handleDeleteKb}
        loading={deleting}
      />

      {/* Delete Document Confirm */}
      <ConfirmDialog
        open={!!deleteDocTarget}
        onOpenChange={() => setDeleteDocTarget(null)}
        title={t('kb.deleteDoc')}
        description={`${deleteDocTarget?.title}`}
        onConfirm={handleDeleteDoc}
        loading={deletingDoc}
      />
    </div>
  );
}

// ---- KB Create/Edit Dialog ----

function KBFormDialog({ open, onClose, editTarget, onSuccess }: {
  open: boolean;
  onClose: () => void;
  editTarget: KnowledgeBase | null;
  onSuccess: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { t } = useI18n();

  useEffect(() => {
    if (editTarget) {
      setName(editTarget.name);
      setDescription(editTarget.description || '');
    } else {
      setName('');
      setDescription('');
    }
  }, [editTarget, open]);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editTarget) {
        await knowledgeApi.update(editTarget.id, { name: name.trim(), description: description.trim() || undefined });
        toast(t('kb.kbUpdated'), 'success');
      } else {
        await knowledgeApi.create({ name: name.trim(), description: description.trim() || undefined });
        toast(t('kb.kbCreated'), 'success');
      }
      onSuccess();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogHeader>
        <DialogTitle>{editTarget ? t('kb.editKb') : t('kb.createKb')}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>{t('kb.kbName')}</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder={t('kb.kbNamePlaceholder')} />
        </div>
        <div className="space-y-2">
          <Label>{t('kb.kbDesc')}</Label>
          <Input value={description} onChange={e => setDescription(e.target.value)} placeholder={t('kb.kbDescPlaceholder')} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
        <Button onClick={handleSubmit} disabled={saving || !name.trim()}>
          {saving ? t('common.saving') : t('common.save')}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

// ---- Add Document Dialog ----

function AddDocumentDialog({ open, kbId, onClose, onSuccess }: {
  open: boolean;
  kbId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { t } = useI18n();

  useEffect(() => {
    if (open) { setTitle(''); setContent(''); }
  }, [open]);

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    try {
      await knowledgeApi.addDocument(kbId, { title: title.trim(), content: content.trim() });
      toast(t('kb.docAdded'), 'success');
      onSuccess();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('common.operationFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogHeader>
        <DialogTitle>{t('kb.addDocDialog')}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>{t('kb.docTitle')}</Label>
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder={t('kb.docTitlePlaceholder')} />
        </div>
        <div className="space-y-2">
          <Label>{t('kb.docContent')}</Label>
          <Textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder={t('kb.docContentPlaceholder')}
            rows={10}
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
        <Button onClick={handleSubmit} disabled={saving || !title.trim() || !content.trim()}>
          {saving ? t('kb.adding') : t('common.add')}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

import { useState, useRef } from 'react';
import { modelsApi, employeesApi, type Model, type ExportedEmployee } from '@/api/client';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { Loader2, Upload, X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ImportEmployeeDialog({ open, onClose, onSuccess }: Props) {
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [employees, setEmployees] = useState<ExportedEmployee[]>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { t } = useI18n();

  const loadModels = async () => {
    setLoadingModels(true);
    try {
      const res = await modelsApi.list();
      const available = res.data.filter(m => m.status === 'available');
      setModels(available);
      if (available.length > 0) setSelectedModel(available[0].id);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('import.modelLoadFailed'), 'error');
    } finally {
      setLoadingModels(false);
    }
  };

  const handleOpen = () => {
    loadModels();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (Array.isArray(data)) {
          setEmployees(data);
        } else {
          toast(t('import.formatError'), 'error');
        }
      } catch {
        toast(t('import.parseFailed'), 'error');
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!selectedModel || employees.length === 0) return;
    setImporting(true);
    try {
      const res = await employeesApi.import(employees, selectedModel);
      const { created, warnings } = res.data;
      if (warnings.length > 0) {
        toast(t('import.successWithWarnings', { created: created.length, warnings: warnings.length }), 'success');
      } else {
        toast(t('import.success', { count: created.length }), 'success');
      }
      onSuccess();
      onClose();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : t('import.failed'), 'error');
    } finally {
      setImporting(false);
    }
  };

  if (!open) return null;

  // Load models on first open
  if (models.length === 0 && !loadingModels) {
    handleOpen();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-background rounded-[28px] shadow-lg w-full max-w-lg mx-4 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{t('import.title')}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t('import.selectFile')}</label>
            <input ref={fileRef} type="file" accept=".json" onChange={handleFileChange} className="hidden" />
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4 mr-1" /> {fileName || t('import.chooseFile')}
            </Button>
          </div>

          {employees.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1">{t('import.preview', { count: employees.length })}</label>
              <div className="rounded-xl bg-muted/30 max-h-40 overflow-auto p-2 text-sm space-y-1">
                {employees.map((emp, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="font-medium">{emp.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {emp.toolNames?.length || 0} {t('common.tools')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">{t('import.selectModel')}</label>
            {loadingModels ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : models.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('import.noModels')}</p>
            ) : (
              <select
                className="w-full h-12 rounded-2xl border border-transparent bg-muted/80 px-4 py-2 text-[15px] transition-all duration-200 ease-out hover:bg-muted focus-visible:outline-none focus-visible:bg-background focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20"
                value={selectedModel}
                onChange={e => setSelectedModel(e.target.value)}
              >
                {models.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            disabled={employees.length === 0 || !selectedModel || importing}
            onClick={handleImport}
          >
            {importing && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            {t('import.confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}

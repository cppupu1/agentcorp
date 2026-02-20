import { useState, useRef } from 'react';
import { modelsApi, employeesApi, type Model, type ExportedEmployee } from '@/api/client';
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

  const loadModels = async () => {
    setLoadingModels(true);
    try {
      const res = await modelsApi.list();
      const available = res.data.filter(m => m.status === 'available');
      setModels(available);
      if (available.length > 0) setSelectedModel(available[0].id);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '加载模型失败', 'error');
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
          toast('文件格式错误，需要 JSON 数组', 'error');
        }
      } catch {
        toast('JSON 解析失败', 'error');
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
        toast(`导入 ${created.length} 个员工，${warnings.length} 个警告`, 'success');
      } else {
        toast(`成功导入 ${created.length} 个员工`, 'success');
      }
      onSuccess();
      onClose();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '导入失败', 'error');
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
      <div className="bg-background rounded-lg shadow-lg w-full max-w-lg mx-4 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">导入员工</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">选择 JSON 文件</label>
            <input ref={fileRef} type="file" accept=".json" onChange={handleFileChange} className="hidden" />
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4 mr-1" /> {fileName || '选择文件'}
            </Button>
          </div>

          {employees.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1">预览 ({employees.length} 个员工)</label>
              <div className="border rounded-md max-h-40 overflow-auto p-2 text-sm space-y-1">
                {employees.map((emp, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="font-medium">{emp.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {emp.toolNames?.length || 0} 个工具
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">选择模型</label>
            {loadingModels ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : models.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无可用模型</p>
            ) : (
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
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
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button
            disabled={employees.length === 0 || !selectedModel || importing}
            onClick={handleImport}
          >
            {importing && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            确认导入
          </Button>
        </div>
      </div>
    </div>
  );
}

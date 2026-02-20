import { useState, useEffect, useCallback } from 'react';
import { costApi, type TaskCostBreakdown } from '@/api/client';
import { DollarSign, TrendingUp, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

function formatCost(cents: number | null): string {
  if (cents == null || cents === 0) return '$0.00';
  return `$${(cents / 100).toFixed(4)}`;
}

export default function CostPanel({ taskId }: { taskId: string }) {
  const [data, setData] = useState<TaskCostBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await costApi.getTaskCost(taskId);
      setData(res.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [taskId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading || !data) return null;

  const { estimatedCost, actualCost, budgetLimit, breakdown } = data;
  const hasData = (actualCost ?? 0) > 0 || (estimatedCost ?? 0) > 0;
  if (!hasData && breakdown.length === 0) return null;

  const progress = estimatedCost && estimatedCost > 0 && actualCost != null
    ? Math.min(100, Math.round((actualCost / estimatedCost) * 100))
    : 0;

  const overBudget = budgetLimit != null && actualCost != null && actualCost > budgetLimit;

  return (
    <details className="border rounded-lg" open>
      <summary className="flex items-center gap-2 p-4 cursor-pointer select-none">
        <DollarSign className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">费用估算</span>
        {actualCost != null && actualCost > 0 && (
          <span className="text-xs text-muted-foreground ml-auto mr-2">{formatCost(actualCost)}</span>
        )}
        <Button size="sm" variant="ghost" className={actualCost == null || actualCost <= 0 ? 'ml-auto' : ''} onClick={(e) => { e.preventDefault(); fetchData(true); }} disabled={refreshing}>
          <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </summary>
      <div className="px-4 pb-4 space-y-3">
        <div className="flex gap-4 text-sm">
          <div className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">预估:</span>
            <span>{formatCost(estimatedCost)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">实际:</span>
            <span className={overBudget ? ' text-destructive font-medium' : ''}> {formatCost(actualCost)}</span>
          </div>
          {budgetLimit != null && (
            <div>
              <span className="text-muted-foreground">预算:</span>
              <span> {formatCost(budgetLimit)}</span>
            </div>
          )}
        </div>

        {estimatedCost != null && estimatedCost > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-muted rounded-full h-2">
              <div
                className={`rounded-full h-2 transition-all ${overBudget ? 'bg-destructive' : 'bg-primary'}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">{progress}%</span>
          </div>
        )}

        {breakdown.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>成员</TableHead>
                  <TableHead>子任务</TableHead>
                  <TableHead className="text-right">输入Token</TableHead>
                  <TableHead className="text-right">输出Token</TableHead>
                  <TableHead className="text-right">费用</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {breakdown.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm">{row.employeeName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.subtaskTitle || '-'}</TableCell>
                    <TableCell className="text-right text-sm">{row.inputTokens.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-sm">{row.outputTokens.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-sm">{formatCost(row.cost)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </details>
  );
}

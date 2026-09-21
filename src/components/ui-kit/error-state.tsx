import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Ошибка загрузки на месте данных.
 *
 * Показывать вместо пустой таблицы обязательно: «заказов нет» и «бэкенд не
 * отвечает» — разные вещи, а выглядели бы одинаково.
 */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
      <div className="flex items-start gap-2.5">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div className="space-y-1">
          <div className="text-sm font-medium text-destructive">Не удалось загрузить данные</div>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Повторить
        </Button>
      )}
    </div>
  );
}

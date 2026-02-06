import { useState, useCallback, useRef } from 'react';

interface Toast {
  message: string;
  visible: boolean;
}

export const useToast = () => {
  const [toast, setToast] = useState<Toast | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    setToast({ message, visible: true });

    timerRef.current = setTimeout(() => {
      setToast(null);
      timerRef.current = null;
    }, 3000);
  }, []);

  return { toast, showToast };
};

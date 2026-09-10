import { useCallback, useEffect, useState } from 'react';
import { apiFetch, errorMessage } from './api.js';

/**
 * مورد واحد من الخادم بحالاته: loading · error · ready.
 * إعادة التحميل بعد عمل ناجح هادئة: تبقى البيانات الحالية معروضة (refreshing) حتى يصل الرد،
 * فلا تختفي رسالة الخادم ولا تقفز الشاشة إلى الهيكل.
 * isValid يتحقق من شكل الرد؛ الشكل غير المتوقع يُعامل خطأً برسالة عامة.
 * يجب أن تكون isValid ثابتة (معرّفة خارج المكوّن) وإلا أُعيد النداء في كل رسم.
 */
export function useResource(path, isValid) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null, refreshing: false });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let ignore = false;
    setState((current) =>
      current.status === 'ready'
        ? { ...current, refreshing: true }
        : { status: 'loading', data: null, error: null, refreshing: false }
    );
    apiFetch(path)
      .then((data) => {
        if (!isValid(data)) throw new Error('unexpected response shape');
        if (!ignore) setState({ status: 'ready', data, error: null, refreshing: false });
      })
      .catch((error) => {
        // 401: api.js أنهى الجلسة وحوّل إلى /login.
        if (ignore || error?.status === 401) return;
        setState({
          status: 'error',
          data: null,
          error: { code: error?.code ?? null, httpStatus: error?.status ?? null, message: errorMessage(error) },
          refreshing: false
        });
      });
    return () => {
      ignore = true;
    };
  }, [path, isValid, version]);

  // refreshing يُضبط هنا فوراً لا في المؤثّر، فلا يمر رسم تبدو فيه الأزرار متاحة على بيانات قديمة.
  const reload = useCallback(() => {
    setState((current) => (current.status === 'ready' ? { ...current, refreshing: true } : current));
    setVersion((current) => current + 1);
  }, []);

  return { ...state, reload };
}

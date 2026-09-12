// طبقة النداء الوحيدة إلى الواجهة البرمجية.
// رسالة الخطأ تصل عربية من الخادم في error.message وتُمرَّر كما هي — لا تُترجم ولا تُلطَّف.

const FALLBACK_MESSAGE = 'تعذّر تنفيذ الطلب.';
const NETWORK_MESSAGE = 'تعذّر الوصول إلى الخادم. تأكد أنه يعمل ثم أعد المحاولة.';
const CONFIG_MESSAGE = 'عنوان الخادم غير مضبوط: أضف VITE_API_URL إلى apps/web/.env ثم أعد تشغيل الواجهة.';

const baseUrl = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor({ status, code, message, details }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code ?? null;
    this.details = details ?? null;
  }
}

/** النص الذي يُعرض للمستخدم من أي خطأ: رسالة الخادم إن وُجدت، وإلا الرسالة العامة — لا نص إنجليزي أبداً. */
export function errorMessage(error) {
  return error instanceof ApiError && error.message ? error.message : FALLBACK_MESSAGE;
}

// session.js يسجّل هنا كيف يُقرأ الرمز وماذا يحدث عند انتهاء الجلسة،
// حتى لا يستورد كل ملف الآخر في حلقة.
let sessionBridge = { getToken: () => null, onExpired: () => {} };

export function connectSession(bridge) {
  sessionBridge = { ...sessionBridge, ...bridge };
}

export async function apiFetch(path, options = {}) {
  if (!baseUrl) throw new ApiError({ status: 0, code: 'config_error', message: CONFIG_MESSAGE });

  const { body, headers, ...rest } = options;
  const token = sessionBridge.getToken();

  const finalHeaders = { Accept: 'application/json', ...headers };
  if (body !== undefined) finalHeaders['Content-Type'] = 'application/json';
  if (token) finalHeaders.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...rest,
      headers: finalHeaders,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    // fetch نفسه رمى (الخادم مطفأ أو لا اتصال) ورسالته «Failed to fetch» بالإنجليزية.
    throw new ApiError({ status: 0, code: 'network_error', message: NETWORK_MESSAGE });
  }

  const data = await readJson(response);
  if (response.ok) return data;

  const envelope = data && typeof data.error === 'object' && data.error ? data.error : {};

  // 401 على نداء أرسل رمزاً = انتهت الجلسة. أما نداء الدخول فلا يرسل رمزاً،
  // و401 فيه يعني بيانات خاطئة يجب أن تظهر رسالتها لا أن نحوّل المستخدم.
  if (response.status === 401 && token) sessionBridge.onExpired();

  // 429 = تجاوز حد المعدل. رسالته عربية من الخادم وتمر كما هي أدناه،
  // ولا إعادة محاولة تلقائية هنا ولا في أي نداء — إعادة المحاولة عند الحد تزيد الطين بلة.

  throw new ApiError({
    status: response.status,
    code: envelope.code,
    message: envelope.message || FALLBACK_MESSAGE,
    details: envelope.details
  });
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

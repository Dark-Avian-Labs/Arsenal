export type ApiErrorBody = {
  error?: string;
  message?: string;
  code?: string;
  errorCode?: string;
  error_code?: string;
};

export async function readApiErrorMessage(
  response: Response,
  fallback = 'Request failed',
): Promise<string> {
  let body: ApiErrorBody | null = null;
  try {
    body = (await response.clone().json()) as ApiErrorBody;
  } catch {
    body = null;
  }
  return (
    (typeof body?.error === 'string' && body.error.trim()) ||
    (typeof body?.message === 'string' && body.message.trim()) ||
    fallback
  );
}

export async function getApiErrorDetails(response: Response): Promise<string> {
  const statusText = `${response.status} ${response.statusText}`.trim();
  try {
    const body = (await response.clone().json()) as {
      error?: unknown;
      message?: unknown;
    };
    if (typeof body.error === 'string' && body.error.length > 0) {
      return `${statusText}: ${body.error}`;
    }
    if (typeof body.message === 'string' && body.message.length > 0) {
      return `${statusText}: ${body.message}`;
    }
  } catch {
    // ignore
  }

  try {
    const text = await response.clone().text();
    if (text.trim().length > 0) {
      return `${statusText}: ${text.trim()}`;
    }
  } catch {
    // ignore
  }

  return statusText || 'Unknown API error';
}

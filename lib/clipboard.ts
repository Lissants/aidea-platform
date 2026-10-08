/**
 * Copies text to the clipboard, including on plain-HTTP origins.
 *
 * The async Clipboard API only exists in a secure context (HTTPS or
 * localhost), so on the LAN address (http://192.168.x.x) `navigator.clipboard`
 * is undefined. There we fall back to selecting a hidden textarea and running
 * the legacy `execCommand('copy')`.
 *
 * Pass `container` when calling from inside a modal: Radix dialogs trap focus,
 * so a textarea appended to <body> outside the dialog can't be selected and
 * the copy silently fails.
 */
export async function copyText(text: string, container?: HTMLElement | null): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied etc.: try the legacy path below.
    }
  }

  const host = container ?? document.body;
  const previousFocus = document.activeElement as HTMLElement | null;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '-9999px';
  textarea.style.opacity = '0';
  host.appendChild(textarea);
  try {
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    host.removeChild(textarea);
    previousFocus?.focus();
  }
}

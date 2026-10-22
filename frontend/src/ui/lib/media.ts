export const PICTURE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const PICTURE_MAX_BYTES = 5 * 1024 * 1024;

/** Why a chosen file cannot be used, or `null` when it can. The server checks again, by content. */
export function checkPicture(file: Pick<File, 'type' | 'size' | 'name'> | null): string | null {
  if (!file) return 'Choose a picture.';
  if (!PICTURE_TYPES.includes(file.type)) return 'Only PNG, JPEG and WebP pictures can be added.';
  if (file.size > PICTURE_MAX_BYTES) return 'That picture is larger than 5 MB.';
  if (file.size === 0) return 'That file is empty.';
  return null;
}

/** Why an address cannot be used for a link, or `null` when it can. */
export function checkWebAddress(value: string): string | null {
  const text = value.trim();
  if (text === '') return 'Paste the address of the page.';
  if (text.length > 2048) return 'That address is too long.';
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return 'That does not look like a web address. It starts with https://';
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return 'Only web addresses that start with https:// can be added.';
  }
  if (url.username || url.password)
    return 'An address with a name and password in it cannot be added.';
  return null;
}

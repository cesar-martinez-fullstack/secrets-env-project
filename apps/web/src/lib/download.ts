export function saveBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function saveTextFile(filename: string, text: string): void {
  saveBlob(filename, new Blob([text], { type: 'text/plain;charset=utf-8' }));
}

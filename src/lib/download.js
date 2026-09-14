import { isNativePlatform } from '@/lib/push';

// Save generated text (a CSV export) as a file the user gets to keep.
//
// Web: a blob link clicked in the page. The link has to be in the document and stay valid for a
// moment; revoking it straight after click() let Chrome, in installed app windows especially,
// start the download after the data was gone and save an empty file.
//
// Native app: the Android WebView ignores blob downloads entirely, so the button did nothing.
// Write the file to the app cache and open the share sheet, where it can be saved to Drive, sent
// by email or opened in a spreadsheet app.
export async function saveTextFile(filename, text, mime = 'text/csv') {
  if (isNativePlatform()) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const { uri } = await Filesystem.writeFile({
      path: filename,
      data: text,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    try {
      await Share.share({ title: filename, dialogTitle: `Save ${filename}`, files: [uri] });
    } catch (e) {
      if (!/cancel/i.test(e?.message || '')) throw e; // closing the share sheet is not an error
    }
    return;
  }

  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

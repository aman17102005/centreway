// Hands the chosen file from the Home screen to the scan screen (kept in memory only; the photo is never saved).
let pending = null;
export const setPendingFile = (file) => { pending = file; };
export const takePendingFile = () => { const f = pending; pending = null; return f; };

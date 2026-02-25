export const SITE_VERSION = "1.25";

document.addEventListener('DOMContentLoaded', () => {
    const versionEl = document.getElementById('app-version');
    if (versionEl) {
        versionEl.innerText = SITE_VERSION;
    }
});
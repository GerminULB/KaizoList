export const SITE_VERSION = "1.26";

document.addEventListener('DOMContentLoaded', () => {
    const versionEl = document.getElementById('app-version');
    if (versionEl) {
        versionEl.innerText = SITE_VERSION;
    }
});
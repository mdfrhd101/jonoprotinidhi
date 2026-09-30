import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => { cleanup(); document.cookie.split(';').forEach((c) => { document.cookie = c.replace(/=.*/, '=;expires=' + new Date(0).toUTCString() + ';path=/'); }); });

// jsdom has no <dialog>.showModal; the Dialog component falls back to the open attribute
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
}

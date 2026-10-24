// ==UserScript==
// @name         Anti Share-Wall & Video Source Guard (network) + Soft Preroll + Res
// @namespace    https://tampermonkey.net/
// @version      1.5.0
// @description  Share-wall removal, source protection, soft preroll skip, real resolution badge (low overhead).
// @author       you
// @match        *://sorrymother.to/*
// @match        *://*.sorrymother.to/*
// @match        *://forum.sorrymother.to/*
// @match        *://fig.to/*
// @match        *://*.fig.to/*
// @match        *://figfig.to/*
// @match        *://*.figfig.to/*
// @match        *://sexyegirls.to/*
// @match        *://*.sexyegirls.to/*
// @match        *://sexyforums.com/*
// @match        *://*.sexyforums.com/*
// @match        *://thotbook.co/*
// @match        *://*.thotbook.co/*
// @match        *://thotalert.com/*
// @match        *://*.thotalert.com/*
// @match        *://javpornvideos.xyz/*
// @match        *://*.javpornvideos.xyz/*
// @match        *://deepfakeporn.site/*
// @match        *://*.deepfakeporn.site/*
// @match        *://cartoonprn.com/*
// @match        *://*.cartoonprn.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const USER_INTENT_MS = 1500;
    const PAGE_HOST = location.hostname;
    const rootDomain = h => h.split('.').slice(-2).join('.');
    const allowedHosts = new Set([PAGE_HOST]);
    const PREROLL_RE = /vip-preroll|preroll\.mp4|\/preroll/i;

    let lastUserAction = 0;
    let video = null;
    let lockedSrc = null;
    let prerollSkipAttempted = false;
    let hudEl = null;
    let lastResText = '';

    ['pointerdown', 'mousedown', 'touchstart', 'keydown', 'click'].forEach(t =>
        window.addEventListener(t, e => { if (e.isTrusted) lastUserAction = Date.now(); }, true)
    );
    const userIntent = () => Date.now() - lastUserAction < USER_INTENT_MS;

    function isPrerollSrc(raw) {
        return !!raw && PREROLL_RE.test(raw);
    }

    function isSafeSrc(raw) {
        if (!raw) return true;
        if (isPrerollSrc(raw)) return false;
        let u;
        try { u = new URL(raw, location.href); } catch { return true; }
        if (u.protocol === 'blob:' || u.protocol === 'data:' || u.protocol === 'mediastream:') return true;
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return true;
        if (allowedHosts.has(u.hostname)) return true;
        if (rootDomain(u.hostname) === rootDomain(PAGE_HOST)) return true;
        if (/sorrymother\.video$/i.test(u.hostname)) return true;
        if (/fig\.to$|figfig\.|sexyegirls\.|javpornvideos\.|deepfakeporn\.|cartoonprn\./i.test(u.hostname)) return true;
        return false;
    }

    const nativePause = HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.pause = function () {
        if (this instanceof HTMLVideoElement && !this.ended && !userIntent()) return;
        return nativePause.apply(this, arguments);
    };

    function tryResume(v) {
        if (!v || v.ended || !v.paused) return;
        try {
            const p = v.play();
            if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch (_) {}
    }

    document.addEventListener('pause', e => {
        const v = e.target;
        if (!(v instanceof HTMLVideoElement) || v !== video) return;
        if (userIntent() || v.ended) return;
        setTimeout(() => tryResume(v), 250);
    }, true);

    function rememberSrc(raw) {
        if (!raw || isPrerollSrc(raw)) return;
        if (!lockedSrc) {
            lockedSrc = raw;
            try {
                const h = new URL(raw, location.href).hostname;
                if (h) allowedHosts.add(h);
            } catch (_) {}
            return;
        }
        if (!isSafeSrc(raw)) return;
        lockedSrc = raw;
        try {
            const h = new URL(raw, location.href).hostname;
            if (h) allowedHosts.add(h);
        } catch (_) {}
    }

    /* ── resolution badge only (updates rarely) ── */
    function ensureHud() {
        if (hudEl && document.contains(hudEl)) return;
        const style = document.createElement('style');
        style.textContent = `
            #vf-hud{position:fixed;bottom:14px;left:14px;z-index:2147483646;font:12px/1.3 ui-monospace,Menlo,Consolas,monospace;color:#e8eef7;background:rgba(10,12,16,.88);border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:7px 10px;box-shadow:0 8px 24px rgba(0,0,0,.4);pointer-events:none;user-select:none}
            #vf-hud b{color:#7dd3fc;font-weight:700}
        `;
        document.documentElement.appendChild(style);
        hudEl = document.createElement('div');
        hudEl.id = 'vf-hud';
        hudEl.innerHTML = 'Res <b id="vf-res">—</b>';
        document.documentElement.appendChild(hudEl);
    }

    function updateRes() {
        if (!video) return;
        ensureHud();
        const w = video.videoWidth | 0;
        const h = video.videoHeight | 0;
        let text = '—';
        if (w && h) {
            const tag = h >= 2160 ? ' 4K' : h >= 1440 ? ' 1440p' : h >= 1080 ? ' 1080p' : h >= 720 ? ' 720p' : h >= 480 ? ' 480p' : ' SD';
            text = w + '×' + h + tag;
        }
        if (text === lastResText) return;
        lastResText = text;
        const el = document.getElementById('vf-res');
        if (el) el.textContent = text;
    }

    /* ── soft preroll ── */
    function softSkipPreroll(v) {
        if (!v || prerollSkipAttempted) return;
        const cur = v.src || v.currentSrc || '';
        if (!isPrerollSrc(cur)) return;
        const player = v.closest('.bb-pimp-player');
        if (!player || !player.classList.contains('is-preroll')) return;

        prerollSkipAttempted = true;
        const doSkip = () => {
            try {
                const dur = v.duration;
                v.currentTime = (dur && isFinite(dur) && dur > 0) ? Math.max(0, dur - 0.05) : 9.9;
            } catch (_) {}
            setTimeout(() => {
                try { v.dispatchEvent(new Event('ended', { bubbles: true })); } catch (_) {}
                document.querySelectorAll('.bb-pimp-player__preroll-link').forEach(el => {
                    el.style.pointerEvents = 'none';
                    el.hidden = true;
                    el.removeAttribute('href');
                });
                setTimeout(() => {
                    if (v.paused && !userIntent()) tryResume(v);
                    setTimeout(() => { prerollSkipAttempted = false; }, 3000);
                    updateRes();
                }, 400);
            }, 80);
        };
        if (v.readyState >= 1 && v.duration && isFinite(v.duration)) doSkip();
        else {
            v.addEventListener('loadedmetadata', doSkip, { once: true });
            setTimeout(() => { if (isPrerollSrc(v.src || v.currentSrc || '')) doSkip(); }, 2000);
        }
    }

    const nativeSetAttribute = Element.prototype.setAttribute;

    function revertSrc(v) {
        if (!lockedSrc) return;
        try {
            nativeSetAttribute.call(v, 'src', lockedSrc);
            v.load();
        } catch (_) {}
        tryResume(v);
    }

    function protectVideo(v) {
        if (!v || v.__vfGuarded) return;
        v.__vfGuarded = true;
        video = v;

        const main = v.dataset.bbMainSrc || v.getAttribute('data-bb-main-src');
        if (main) rememberSrc(main);
        rememberSrc(v.getAttribute('src'));
        softSkipPreroll(v);

        // Resolution: only when metadata is ready (almost never after that)
        v.addEventListener('loadedmetadata', updateRes);
        v.addEventListener('loadeddata', updateRes);
        if (v.videoWidth) updateRes();

        v.addEventListener('play', () => softSkipPreroll(v));

        let srcDesc = null;
        for (let o = Object.getPrototypeOf(v); o && !srcDesc; o = Object.getPrototypeOf(o)) {
            const d = Object.getOwnPropertyDescriptor(o, 'src');
            if (d && d.set) srcDesc = d;
        }
        if (srcDesc) {
            try {
                Object.defineProperty(v, 'src', {
                    configurable: true,
                    enumerable: true,
                    get() { return srcDesc.get.call(v); },
                    set(val) {
                        if ((val === '' || val === null) && lockedSrc) return;
                        if (isPrerollSrc(val)) {
                            srcDesc.set.call(v, val);
                            setTimeout(() => softSkipPreroll(v), 50);
                            return;
                        }
                        if (lockedSrc && !isSafeSrc(val)) {
                            revertSrc(v);
                            return;
                        }
                        rememberSrc(val);
                        srcDesc.set.call(v, val);
                    }
                });
            } catch (_) {}
        }

        v.setAttribute = function (name, value) {
            if (String(name).toLowerCase() === 'src') {
                if (isPrerollSrc(value)) {
                    const r = nativeSetAttribute.call(this, name, value);
                    setTimeout(() => softSkipPreroll(v), 50);
                    return r;
                }
                if (lockedSrc && !isSafeSrc(value)) {
                    revertSrc(v);
                    return;
                }
                rememberSrc(value);
            }
            return nativeSetAttribute.call(this, name, value);
        };

        new MutationObserver(() => {
            const cur = v.getAttribute('src');
            if (isPrerollSrc(cur)) softSkipPreroll(v);
            else if (cur && lockedSrc && !isSafeSrc(cur)) revertSrc(v);
            else if (cur) rememberSrc(cur);
        }).observe(v, { attributes: true, attributeFilter: ['src'] });

        const player = v.closest('.bb-pimp-player');
        if (player) {
            new MutationObserver(() => {
                if (player.classList.contains('is-preroll')) softSkipPreroll(v);
            }).observe(player, { attributes: true, attributeFilter: ['class'] });
        }
    }

    const dead = new WeakSet();
    const SHARE_TEXT = /reddit|share (this|the) (video|link)|share to (continue|unlock|watch)|continue watching|to continue|unlock (the )?video/i;

    function kill(el) {
        if (!el || dead.has(el)) return;
        dead.add(el);
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('pointer-events', 'none', 'important');
        setTimeout(() => { try { el.remove(); } catch (_) {} }, 0);
        const b = document.body;
        if (b && b.style.overflow === 'hidden') b.style.removeProperty('overflow');
        tryResume(video);
    }

    function findVideo() {
        const vids = document.querySelectorAll('video');
        if (!vids.length) return null;
        let best = null, bestArea = 0;
        for (let i = 0; i < vids.length; i++) {
            const r = vids[i].getBoundingClientRect();
            const a = r.width * r.height;
            if (a > bestArea) { bestArea = a; best = vids[i]; }
        }
        return best;
    }

    function sweepLight() {
        if (!document.body) return;
        if (!video || !document.contains(video)) {
            const v = findVideo();
            if (v) protectVideo(v);
        } else {
            softSkipPreroll(video);
        }
        const gate = document.getElementById('tbrsg-gate');
        if (gate) kill(gate);
        document.querySelectorAll('[id*="tbrsg"]').forEach(kill);
        document.querySelectorAll('.bb-pimp-player__preroll-link').forEach(el => {
            el.style.pointerEvents = 'none';
            el.hidden = true;
            el.removeAttribute('href');
        });
    }

    let sweepTimer = 0;
    function scheduleSweep() {
        if (sweepTimer) return;
        sweepTimer = setTimeout(() => {
            sweepTimer = 0;
            sweepLight();
        }, 500);
    }

    new MutationObserver(muts => {
        for (const m of muts) {
            if (m.type !== 'childList' || !m.addedNodes.length) continue;
            for (const node of m.addedNodes) {
                if (node.nodeType === 1 && node.id && String(node.id).includes('tbrsg')) kill(node);
            }
            scheduleSweep();
            break;
        }
    }).observe(document.documentElement, { childList: true, subtree: true });

    // Rare safety net only
    setInterval(sweepLight, 5000);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', sweepLight);
    } else {
        sweepLight();
    }
    window.addEventListener('load', sweepLight);
})();

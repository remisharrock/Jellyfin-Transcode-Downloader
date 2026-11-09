const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

class Element {
    constructor(tagName) {
        this.tagName = tagName;
        this.children = [];
        this.attributes = {};
        this.style = {};
        this.listeners = {};
        this.dataset = {};
        this.parentNode = null;
        this.text = '';
    }

    setAttribute(name, value) {
        this.attributes[name] = String(value);
        if (name === 'id') this.id = String(value);
    }

    getAttribute(name) {
        return this.attributes[name] ?? null;
    }

    appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        this.notifyObservers();
        return child;
    }

    insertBefore(child, before) {
        child.parentNode = this;
        const index = this.children.indexOf(before);
        this.children.splice(index < 0 ? this.children.length : index, 0, child);
        this.notifyObservers();
        return child;
    }

    insertAdjacentElement(_position, child) {
        child.parentNode = this.parentNode;
        const index = this.parentNode.children.indexOf(this);
        this.parentNode.children.splice(index + 1, 0, child);
        this.parentNode.notifyObservers();
        return child;
    }

    removeChild(child) {
        this.children = this.children.filter(candidate => candidate !== child);
        child.parentNode = null;
        this.notifyObservers();
    }

    remove() {
        if (this.parentNode) this.parentNode.removeChild(this);
    }

    addEventListener(type, callback) {
        (this.listeners[type] ||= []).push(callback);
    }

    click() {
        (this.listeners.click || []).forEach(callback => callback({ target: this }));
    }

    querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
    }

    querySelectorAll(selector) {
        return this.children.flatMap(child => [
            ...(matches(child, selector) ? [child] : []),
            ...child.querySelectorAll(selector),
        ]);
    }

    notifyObservers() {
        observers.forEach(observer => {
            if (observer.target === this || observer.options?.subtree) {
                queueMicrotask(() => observer.callback());
            }
        });
    }

    set textContent(value) {
        this.text = String(value);
        this.children = [];
    }

    get textContent() {
        return this.text + this.children.map(child => child.textContent).join('');
    }
}

function matches(element, selector) {
    if (selector === '*') return true;
    if (selector === '.actionSheetMenuItem[data-id="download"]') {
        return element.className?.includes('actionSheetMenuItem')
            && element.getAttribute('data-id') === 'download';
    }
    const prefix = selector.match(/^\[data-id\^="([^"]+)"\]$/);
    if (prefix) return (element.getAttribute('data-id') || '').startsWith(prefix[1]);
    const exact = selector.match(/^\[data-id="([^"]+)"\]$/);
    return !!exact && element.getAttribute('data-id') === exact[1];
}

const observers = [];

test('shows codec options, handles Android downloads, and stops completed transcodes', async () => {
    const source = fs.readFileSync(path.join(__dirname, '../web/plugin.js'), 'utf8');
    const documentElement = new Element('html');
    documentElement.lang = 'en-us';
    const body = new Element('body');
    const menu = new Element('div');
    const downloadButton = new Element('button');
    downloadButton.className = 'actionSheetMenuItem';
    downloadButton.setAttribute('data-id', 'download');
    downloadButton.textContent = 'Download';
    menu.appendChild(downloadButton);
    body.appendChild(menu);

    const document = {
        body,
        documentElement,
        createElement: tagName => new Element(tagName),
        addEventListener() {},
        querySelector: selector => body.querySelector(selector),
        getElementById: id => [body, ...body.querySelectorAll('*')].find(element => element.id === id) || null,
    };
    class MutationObserver {
        constructor(callback) {
            this.callback = callback;
            observers.push(this);
        }

        observe(target, options) {
            this.target = target;
            this.options = options;
        }
    }

    const requests = [];
    const codecs = {
        VideoCodecs: ['h264', 'hevc', 'av1'].map(Codec => ({
            Codec, Encoder: 'encoder', IsSupported: true, IsAllowedByAdmin: true,
        })),
        AudioCodecs: ['aac', 'opus'].map(Codec => ({
            Codec, Encoder: 'encoder', IsSupported: true, IsAllowedByAdmin: true,
        })),
    };
    const fetch = async (input, init = {}) => {
        const url = String(input);
        requests.push({ url, init });
        if (url.includes('/strings/')) return { ok: true, json: async () => ({}) };

        if (url.includes('/TranscodeDownloader/Codecs') || url.includes('/TranscodeDownloader/Config')) {
            if (url.includes('api_key=')
                || init.headers?.Authorization !== 'MediaBrowser Token="test-token"') {
                return { ok: false, status: 401 };
            }
            return {
                ok: true,
                json: async () => url.includes('/Codecs') ? codecs : { MaxConcurrentDownloads: 1 },
            };
        }

        return { ok: false, status: 404 };
    };
    let browserUrl;
    const window = {
        location: {
            hash: '#/details?id=11111111111111111111111111111111',
            origin: 'http://jellyfin.test',
        },
        crypto: { getRandomValues: bytes => bytes.fill(1) },
        NativeShell: { openUrl: url => { browserUrl = url; } },
        NativeInterface: { openUrl() {} },
        ApiClient: {
            accessToken: () => 'test-token',
            getCurrentUserId: () => 'user',
            serverAddress: () => 'http://jellyfin.test',
            getItem: async (_userId, id) => ({
                Id: id,
                MediaType: 'Video',
                MediaSources: [{ Bitrate: 100_000_000 }],
            }),
        },
        localStorage: { getItem: () => null, setItem() {} },
        addEventListener() {},
    };
    const context = {
        window, document, MutationObserver, fetch, URL, URLSearchParams, Blob, AbortController,
        navigator: { userAgent: 'Android' },
        console: { log() {}, warn() {}, error() {} },
        setTimeout: (callback, delay) => delay >= 1000 ? 0 : setTimeout(callback, delay),
        clearTimeout, Promise, Date, Math, Number, String, Array, Object, RegExp, Error,
    };

    vm.runInNewContext(source, context, { filename: 'web/plugin.js' });
    await new Promise(resolve => setTimeout(resolve, 100));
    body.querySelector('[data-id^="qd-"]').click();
    await new Promise(resolve => setTimeout(resolve, 100));

    assert.ok(body.querySelector('[data-id="qd-codec-video-av1"]'));
    const tier = body.querySelector('[data-id^="qd-360p"]');
    assert.ok(tier);
    tier.click();
    assert.match(browserUrl, /PlaySessionId=/);
    assert.match(browserUrl, /DeviceId=transcode-downloader-/);

    window.NativeInterface = undefined;
    navigator.userAgent = '';
    body.querySelector('[data-id^="qd-download"]').click();
    await new Promise(resolve => setTimeout(resolve, 50));
    body.querySelector('[data-id^="qd-360p"]').click();
    await new Promise(resolve => setTimeout(resolve, 50));

    for (const endpoint of ['Codecs', 'Config']) {
        const request = requests.find(({ url }) => url.includes(`/TranscodeDownloader/${endpoint}`));
        assert.ok(request);
        assert.equal(request.init.headers.Authorization, 'MediaBrowser Token="test-token"');
        assert.equal(new URL(request.url).searchParams.has('api_key'), false);
    }
    const stopRequest = requests.find(({ url, init }) =>
        url.includes('/Videos/ActiveEncodings') && init.method === 'DELETE');
    assert.ok(stopRequest);
    assert.equal(stopRequest.init.headers.Authorization, 'MediaBrowser Token="test-token"');
    assert.equal(new URL(stopRequest.url).searchParams.has('api_key'), false);
});
